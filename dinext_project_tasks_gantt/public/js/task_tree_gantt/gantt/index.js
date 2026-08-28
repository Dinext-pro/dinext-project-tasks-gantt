import {
	GANTT_ASSETS,
	GANTT_BAR_HEIGHT,
	GANTT_LOWER_HEADER,
	GANTT_PADDING,
	GANTT_UPPER_HEADER,
} from "../constants.js";
import { expandAllRows } from "../table/index.js";
import { collectVisibleRows, rowsToGanttTasks } from "./tasks.js";
import { setupScrollSync, setupToolbarOffsetSync } from "./sync.js";
import { clearGanttDateTimers, createGanttDateChangeHandler } from "./dates.js";
import { applyRelatedGanttPaint, setupHoverSync, taskIdFromAgRow } from "./hover.js";
import {
	applyRelationArrowGeometry,
	bindRelationArrowGeometry,
} from "./arrows.js";

async function ensureAssets() {
	await frappe.require([...GANTT_ASSETS]);
	if (typeof window.Gantt !== "function") {
		throw new Error("frappe-gantt (window.Gantt) not loaded");
	}
}

async function loadHolidays(project) {
	if (!project) {
		return [];
	}
	try {
		const r = await frappe.db.get_value("Project", project, [
			"holiday_list",
			"company",
		]);
		const values = r?.message || {};
		let listName = values.holiday_list;
		if (!listName && values.company) {
			const c = await frappe.db.get_value("Company", values.company, [
				"default_holiday_list",
			]);
			listName = c?.message?.default_holiday_list;
		}
		if (!listName) {
			return [];
		}
		const doc = await frappe.db.get_doc("Holiday List", listName);
		return (doc?.holidays || []).map((d) => ({
			date: d.holiday_date,
			name: d.description,
			weekly_off: !!d.weekly_off,
		}));
	} catch (e) {
		console.warn("[task_tree_gantt] holidays", e);
		return [];
	}
}

function showPopup(ctx) {
	ctx.set_title(ctx.task.name);
	const start = moment(ctx.task.start).format("MMM D");
	const end = moment(ctx.task.end).format("MMM D");
	const progress = Math.floor((Number(ctx.task.progress) || 0) * 100) / 100;
	ctx.set_subtitle(`${start} - ${end}<br/>${__("Progress")}: ${progress}%`);

	const assign = ctx.task.row?.assign;
	if (Array.isArray(assign) && assign.length) {
		try {
			const group = frappe.avatar_group(assign, 5, { filterable: false });
			const node = Array.isArray(group) ? group[0] : group;
			ctx.set_details(
				`<div class="gantt-assign-avatars">${node?.outerHTML || ""}</div>`
			);
		} catch (e) {
			ctx.set_details(`<div class="gantt-assign-avatars"></div>`);
		}
	} else {
		ctx.set_details(
			`<div class="gantt-assign-avatars">${frappe.utils.icon("assign", "md")}</div>`
		);
	}
}

function viewModeName(gantt, mode) {
	if (mode && typeof mode === "object") {
		return mode.name || "";
	}
	if (typeof mode === "string" && mode) {
		return mode;
	}
	const current = gantt?.config?.view_mode || gantt?.options?.view_mode;
	if (current && typeof current === "object") {
		return current.name || "";
	}
	return String(current || "");
}

/** Week: keep upper dates, drop lower period labels. Day keeps both rows. */
function applyLowerHeaderForMode(gantt, mode) {
	if (!gantt?.options) {
		return;
	}
	const isWeek = viewModeName(gantt, mode) === "Week";
	const lower = isWeek ? 0 : GANTT_LOWER_HEADER;
	gantt.options.lower_header_height = lower;
	gantt.$container?.style.setProperty("--gv-lower-header-height", `${lower}px`);
	gantt.$container?.classList.toggle("gantt-view--week", isWeek);
}

function patchWeekHeader(gantt) {
	if (!gantt || gantt._weekHeaderPatched) {
		return;
	}
	gantt._weekHeaderPatched = true;
	const orig = gantt.change_view_mode.bind(gantt);
	gantt.change_view_mode = (mode, preserveScroll) => {
		applyLowerHeaderForMode(gantt, mode);
		return orig(mode, preserveScroll);
	};
	applyLowerHeaderForMode(gantt, gantt.config?.view_mode);
	if (viewModeName(gantt, gantt.config?.view_mode) === "Week") {
		gantt.change_view_mode(gantt.config.view_mode, true);
	}
}

function buildOptions(holidays, state) {
	const weekend = holidays.filter((d) => d.weekly_off);
	const fest = holidays.filter((d) => !d.weekly_off);

	return {
		lines: "both ",
		today_button: true,
		scroll_to: "today",
		view_mode: "Day",
		view_mode_select: true,
		view_modes: [Gantt.VIEW_MODE.DAY, Gantt.VIEW_MODE.WEEK],
		infinite_padding: false,
		arrow_curve: 3,
		move_dependencies: false,
		popup_on: "click",
		popup: showPopup,
		on_double_click: (task) => {
			if (task?.id) {
				frappe.set_route("Form", "Task", task.id);
			}
		},
		language: frappe.boot.lang,
		upper_header_height: GANTT_UPPER_HEADER,
		lower_header_height: GANTT_LOWER_HEADER,
		bar_corner_radius: 1,
		padding: GANTT_PADDING,
		bar_height: GANTT_BAR_HEIGHT,
		column_width: 25,
		holidays: {
			"var(--g-weekend-highlight-color)": weekend,
			"var(--g-holiday-highlight-color)": fest,
		},
		readonly: !frappe.model.can_write("Task"),
		readonly_progress: true,
		readonly_dates: false,
		on_date_change: createGanttDateChangeHandler(state, () =>
			scheduleGanttRefresh(state)
		),
		on_view_change: () => {
			reapplyGanttArrows(state);
			requestAnimationFrame(() => state.applyGanttOffset?.());
		},
	};
}

function reapplyGanttArrows(state) {
	if (!state?.ganttEl) {
		return;
	}
	const run = () => {
		applyRelationArrowGeometry(state.ganttEl, state.table);
		applyRelatedGanttPaint(
			state.ganttEl,
			state.relatedTaskIds || [],
			state.relatedOriginId
		);
	};
	run();
	requestAnimationFrame(run);
}

function bindSync(state) {
	const selectedRow = state.tableHost?.querySelector?.(
		".ag-row.tree-gantt-row--select"
	);
	const selectedId = taskIdFromAgRow(state.table, selectedRow);
	if (typeof state.ganttSyncCleanup === "function") {
		state.ganttSyncCleanup();
		state.ganttSyncCleanup = null;
	}
	if (typeof state.ganttHoverCleanup === "function") {
		state.ganttHoverCleanup();
		state.ganttHoverCleanup = null;
	}
	if (typeof state.ganttToolbarSyncCleanup === "function") {
		state.ganttToolbarSyncCleanup();
		state.ganttToolbarSyncCleanup = null;
	}
	if (typeof state.ganttArrowGeomCleanup === "function") {
		state.ganttArrowGeomCleanup();
		state.ganttArrowGeomCleanup = null;
	}
	state.applyGanttOffset = null;
	if (state.tableHost && state.ganttEl) {
		state.ganttSyncCleanup = setupScrollSync(state.tableHost, state.ganttEl);
		state.ganttHoverCleanup = setupHoverSync(
			state.tableHost,
			state.ganttEl,
			state.table,
			state.gantt,
			selectedId,
			state
		);
		const offsetSync = setupToolbarOffsetSync(
			state.tableHost,
			state.ganttEl,
			state.ganttHScroll
		);
		state.ganttToolbarSyncCleanup = offsetSync;
		state.applyGanttOffset = offsetSync.apply;
		state.ganttArrowGeomCleanup = bindRelationArrowGeometry(
			state.ganttEl,
			() => reapplyGanttArrows(state)
		);
	}
}

/** Rows currently shown in the table (expanded tree order). */
function collectGanttTasks(table) {
	return rowsToGanttTasks(collectVisibleRows(table));
}

/**
 * Mount or refresh gantt from current table. No gen-cancel mid-flight —
 * callers use dirty-loop so the latest table state is applied after await.
 */
async function runGanttUpdate(state) {
	if (!state?.ganttEl) {
		return null;
	}
	const project = state.getArgs?.()?.project;
	if (!project || !state.table) {
		destroyGantt(state);
		return null;
	}

	await ensureAssets();

	const tasks = collectGanttTasks(state.table);
	if (!tasks.length) {
		destroyGantt(state);
		return null;
	}

	if (!state.holidays || state.holidaysProject !== project) {
		state.holidays = await loadHolidays(project);
		state.holidaysProject = project;
	}

	// Project may have changed while holidays loaded.
	if (state.getArgs?.()?.project !== project || !state.table) {
		return null;
	}

	if (state.gantt?.refresh && state.ganttEl.querySelector?.(".gantt")) {
		patchWeekHeader(state.gantt);
		state.gantt.refresh(tasks);
		bindSync(state);
		return state.gantt;
	}

	state.gantt = null;
	state.ganttEl.innerHTML = "";
	state.gantt = new Gantt(
		state.ganttEl,
		tasks,
		buildOptions(state.holidays || [], state)
	);
	patchWeekHeader(state.gantt);
	bindSync(state);
	return state.gantt;
}

/** Serial dirty-loop: coalesce bursts, never cancel an in-flight mount. */
async function pumpGanttUpdates(state) {
	if (state._ganttPumping) {
		return;
	}
	state._ganttPumping = true;
	try {
		while (state._ganttDirty) {
			state._ganttDirty = false;
			await runGanttUpdate(state);
		}
	} finally {
		state._ganttPumping = false;
		// Dirty set during finally window.
		if (state._ganttDirty) {
			void pumpGanttUpdates(state);
		}
	}
}

export async function ensureGantt(state) {
	if (!state) {
		return null;
	}
	state._ganttDirty = true;
	await pumpGanttUpdates(state);
	return state.gantt || null;
}

export function destroyGantt(state) {
	if (!state) {
		return;
	}
	state._ganttDirty = false;
	if (state._ganttRaf) {
		cancelAnimationFrame(state._ganttRaf);
		state._ganttRaf = 0;
	}
	if (typeof state.ganttSyncCleanup === "function") {
		state.ganttSyncCleanup();
		state.ganttSyncCleanup = null;
	}
	if (typeof state.ganttHoverCleanup === "function") {
		state.ganttHoverCleanup();
		state.ganttHoverCleanup = null;
	}
	if (typeof state.ganttToolbarSyncCleanup === "function") {
		state.ganttToolbarSyncCleanup();
		state.ganttToolbarSyncCleanup = null;
	}
	if (typeof state.ganttArrowGeomCleanup === "function") {
		state.ganttArrowGeomCleanup();
		state.ganttArrowGeomCleanup = null;
	}
	state.applyGanttOffset = null;
	clearGanttDateTimers(state);
	state.gantt = null;
	state.holidays = null;
	state.holidaysProject = null;
	state._ganttPumping = false;
	if (state.ganttEl) {
		state.ganttEl.innerHTML = "";
	}
}

/** Mark dirty + kick pump (rAF coalesce for sync callers). */
export function scheduleGanttRefresh(state) {
	if (!state) {
		return;
	}
	state._ganttDirty = true;
	if (state._ganttPumping) {
		return;
	}
	if (state._ganttRaf) {
		return;
	}
	state._ganttRaf = requestAnimationFrame(() => {
		state._ganttRaf = 0;
		Promise.resolve(pumpGanttUpdates(state)).catch((e) =>
			console.error("[task_tree_gantt] gantt refresh", e)
		);
	});
}

/**
 * Patch tree expand/collapse / DnD:
 * - expandAll → load full project tree (lazy roots alone are not enough)
 * - expandRow → refresh gantt (cached children skip onExpandRow / onTreeChange)
 * - collapse* → refresh gantt (DinextTable has no onCollapseRow)
 * - refreshAfterRowReorder → drop / undo / revert (persist still refreshes dates)
 */
export function wireTreeGanttHooks(table, state) {
	if (!table || table._treeGanttHooks) {
		return;
	}
	table._treeGanttHooks = true;

	const expandAll = table.expandAll?.bind(table);
	if (expandAll) {
		table.expandAll = () =>
			expandAllRows(table, state.getArgs, state.tableHost, expandAll)
				.then(() => scheduleGanttRefresh(state))
				.catch((e) => {
					console.error(e);
					frappe.msgprint(e.message || String(e));
				});
	}

	const expandRow = table.expandRow?.bind(table);
	if (expandRow) {
		table.expandRow = async (rowId) => {
			const result = await expandRow(rowId);
			scheduleGanttRefresh(state);
			return result;
		};
	}

	const collapse = table.collapseRow?.bind(table);
	if (collapse) {
		table.collapseRow = (rowId) => {
			collapse(rowId);
			scheduleGanttRefresh(state);
		};
	}

	const collapseAll = table.collapseAll?.bind(table);
	if (collapseAll) {
		table.collapseAll = () => {
			collapseAll();
			scheduleGanttRefresh(state);
		};
	}

	const refreshAfterReorder = table.refreshAfterRowReorder?.bind(table);
	if (refreshAfterReorder) {
		table.refreshAfterRowReorder = (section) => {
			refreshAfterReorder(section);
			if (section !== "summary") {
				scheduleGanttRefresh(state);
			}
		};
	}
}
