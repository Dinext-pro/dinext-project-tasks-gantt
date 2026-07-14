// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import {
	GANTT_ASSETS,
	GANTT_BAR_HEIGHT,
	GANTT_PADDING,
	ROW_HEIGHT,
} from "../constants.js";
import { collectVisibleRows, rowsToGanttTasks } from "./tasks.js";
import { setupScrollSync } from "./sync.js";
import { setupHoverSync } from "./hover.js";
import { onGanttDateChange } from "./dates.js";
import { refreshSideData } from "../side_data.js";

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
		console.warn("task_wbs holidays", e);
		return [];
	}
}

function buildOptions(state, holidays) {
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
		on_date_change: (task, start, end) => {
			onGanttDateChange(task, start, end, {
				onSaved: () => {
					refreshGantt(state);
					refreshSideData(state, task.row ? [task.row] : undefined).catch(
						console.error
					);
				},
			});
		},
		on_double_click: (task) => {
			if (task?.id) {
				frappe.set_route("Form", "Task", task.id);
			}
		},
		language: frappe.boot.lang,
		upper_header_height: 40,
		lower_header_height: 26,
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
	};
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

function bindSync(state) {
	if (typeof state.ganttSyncCleanup === "function") {
		state.ganttSyncCleanup();
		state.ganttSyncCleanup = null;
	}
	if (typeof state.ganttHoverCleanup === "function") {
		state.ganttHoverCleanup();
		state.ganttHoverCleanup = null;
	}
	if (state.container && state.ganttEl) {
		state.ganttSyncCleanup = setupScrollSync(state.container, state.ganttEl);
		state.ganttHoverCleanup = setupHoverSync(
			state.container,
			state.ganttEl,
			state.table
		);
	}
}

/**
 * Create or refresh Gantt from current table visible rows.
 * @param {object} state page._task_wbs
 */
export async function ensureGantt(state) {
	if (!state?.ganttEl) {
		return null;
	}
	if (!state.project || !state.table) {
		destroyGantt(state);
		return null;
	}

	await ensureAssets();

	const tasks = rowsToGanttTasks(collectVisibleRows(state.table));
	if (!tasks.length) {
		state.ganttEl.innerHTML = "";
		state.gantt = null;
		return null;
	}

	if (!state.holidays) {
		state.holidays = await loadHolidays(state.project);
	}

	if (state.gantt?.refresh) {
		state.gantt.refresh(tasks);
		bindSync(state);
		return state.gantt;
	}

	state.ganttEl.innerHTML = "";
	// Prefer CSS selector — vendored Gantt expects mount target like legacy #task-gantt
	const mountTarget = state.ganttEl.id ? `#${state.ganttEl.id}` : state.ganttEl;
	state.gantt = new Gantt(mountTarget, tasks, buildOptions(state, state.holidays));
	bindSync(state);
	return state.gantt;
}

export function refreshGantt(state) {
	if (!state?.table || !state.gantt) {
		return ensureGantt(state);
	}
	const tasks = rowsToGanttTasks(collectVisibleRows(state.table));
	if (!tasks.length) {
		destroyGantt(state);
		return null;
	}
	state.gantt.refresh(tasks);
	bindSync(state);
	return state.gantt;
}

export function destroyGantt(state) {
	if (!state) {
		return;
	}
	if (typeof state.ganttSyncCleanup === "function") {
		state.ganttSyncCleanup();
		state.ganttSyncCleanup = null;
	}
	if (typeof state.ganttHoverCleanup === "function") {
		state.ganttHoverCleanup();
		state.ganttHoverCleanup = null;
	}
	state.gantt = null;
	state.holidays = null;
	if (state.ganttEl) {
		state.ganttEl.innerHTML = "";
	}
}

/** After expand/collapse — next frame so AG Grid updated displayed nodes. */
export function scheduleGanttRefresh(state) {
	requestAnimationFrame(() => {
		Promise.resolve(refreshGantt(state)).catch((e) =>
			console.error("task_wbs gantt refresh", e)
		);
	});
}

export { ROW_HEIGHT };
