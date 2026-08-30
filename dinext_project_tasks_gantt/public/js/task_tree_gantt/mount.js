import { DEFAULT_TITLE } from "./constants.js";
import { setupFilters } from "./filters/index.js";
import {
	destroyGantt,
	ensureGantt,
	scheduleGanttRefresh,
	wireTreeGanttHooks,
} from "./gantt/index.js";
import { applyRelatedGanttPaint, paintRelatedRows, scrollGanttToTask } from "./gantt/hover.js";
import { buildShell, setupResize } from "./shell/layout.js";
import { setColumnContext } from "./table/columns/context.js";
import { loadTable, revealRelatedTasks } from "./table/index.js";
import { relatedHighlightIds } from "./table/related.js";

/** After this window a click is not part of a dblclick — safe to expand/fetch. */
const RELATED_REVEAL_MS = 400;

function stripRelatedRowClass(state) {
	state.tableHost
		?.querySelectorAll?.(".ag-row.tree-gantt-row--related")
		.forEach((el) => el.classList.remove("tree-gantt-row--related"));
}

function cancelRelatedReveal(state) {
	if (state.relatedRevealTimer) {
		clearTimeout(state.relatedRevealTimer);
		state.relatedRevealTimer = 0;
	}
	state.relatedFocusGen = (state.relatedFocusGen || 0) + 1;
}

// Related highlight is CSS only. redrawRows remounts cells and kills click/edit.
function clearRelatedIds(state) {
	cancelRelatedReveal(state);
	state.relatedTaskIds = [];
	state.relatedOriginId = "";
	const host = state.tableHost?._treeGanttTable;
	if (host) {
		host.relatedTaskIds = new Set();
	}
	stripRelatedRowClass(state);
	applyRelatedGanttPaint(state.ganttEl, [], "");
}

function setRelatedIds(state, ids, originId) {
	const next = [...new Set((ids || []).map(String).filter(Boolean))];
	state.relatedTaskIds = next;
	state.relatedOriginId = originId ? String(originId) : "";
	const host = state.tableHost?._treeGanttTable;
	if (host) {
		host.relatedTaskIds = new Set(next);
	}
	paintRelatedRows(state.tableHost, state.table, next);
	applyRelatedGanttPaint(state.ganttEl, next, state.relatedOriginId);
}

function paintLoadedRelated(state, originId) {
	const nested = state.table?.sourceData;
	const ids =
		Array.isArray(nested) && nested.length
			? relatedHighlightIds(nested, originId)
			: [];
	if (!ids.length) {
		return false;
	}
	setRelatedIds(state, ids, originId);
	return true;
}

function scheduleRelatedReveal(state, row) {
	cancelRelatedReveal(state);
	state.relatedRevealTimer = window.setTimeout(() => {
		state.relatedRevealTimer = 0;
		void revealHiddenRelated(state, row);
	}, RELATED_REVEAL_MS);
}

async function revealHiddenRelated(state, row) {
	const originId = String(row?.id || "");
	if (!originId || !state.table) {
		return;
	}
	const gen = ++state.relatedFocusGen;
	try {
		const result = await revealRelatedTasks(
			state.table,
			state.getArgs,
			state.tableHost,
			row.id
		);
		if (gen !== state.relatedFocusGen) {
			return;
		}
		if (!result) {
			return;
		}
		const origin = String(row.id);
		const ids = (result.related || []).filter(Boolean).map(String);
		if (!ids.some((id) => id !== origin)) {
			clearRelatedIds(state);
			return;
		}
		setRelatedIds(state, ids, row.id);
		if (result.treeChanged) {
			await ensureGantt(state);
		}
		if (gen !== state.relatedFocusGen) {
			return;
		}
		scrollGanttToTask(state.gantt, state.ganttEl, state.table, originId);
	} catch (e) {
		console.error("[task_tree_gantt] relations focus", e);
		frappe.msgprint(e.message || String(e));
	}
}

function handleRelationsFocus(state, opts = {}) {
	if (opts.cancel) {
		cancelRelatedReveal(state);
		return;
	}
	if (!opts.row?.id) {
		return;
	}
	const rels = Array.isArray(opts.row.relations) ? opts.row.relations : [];
	const painted = paintLoadedRelated(state, String(opts.row.id));
	if (!painted && !rels.length) {
		clearRelatedIds(state);
		return;
	}
	scheduleRelatedReveal(state, opts.row);
}

export async function mount({ page }) {
	page.set_title(DEFAULT_TITLE);
	page.wrapper?.addClass?.("task-tree-gantt-page");

	const state = {
		getArgs: null,
		tableHost: null,
		ganttEl: null,
		table: null,
		gantt: null,
		fullscreenShell: null,
		relatedTaskIds: [],
		relatedOriginId: "",
		relatedFocusGen: 0,
		relatedRevealTimer: 0,
		mountGen: 0,
	};

	const reload = async (opts = {}) => {
		const gen = ++state.mountGen;
		clearRelatedIds(state);
		const table = await loadTable(state.tableHost, state.getArgs, {
			// Coalesced — avoid parallel ensureGantt with mount await below.
			onTreeChange: () => scheduleGanttRefresh(state),
			onCellsSaved: () => scheduleGanttRefresh(state),
			// Client sort reorders source — gantt bars must follow row order.
			onSortChange: () => scheduleGanttRefresh(state),
			onFilterChange: (ctx) => {
				clearRelatedIds(state);
				state.applyGanttOffset?.();
				const json = JSON.stringify(ctx?.filter || {});
				if (json !== state._ganttFilterJson) {
					state._ganttFilterJson = json;
					scheduleGanttRefresh(state);
				}
			},
			// page.main = page-form filters + Tree Gantt shell (WR fullscreen pattern).
			fullscreenShell: state.fullscreenShell,
			expandRowIds: opts.expandRowIds,
		});
		if (gen !== state.mountGen) {
			return;
		}
		state.table = table;
		if (state.table) {
			wireTreeGanttHooks(state.table, state);
			const merge = state.tableHost?._treeGanttTable?.lastMerge;
			if (!state.gantt || merge?.ganttChanged !== false) {
				await ensureGantt(state);
			}
		} else {
			destroyGantt(state);
		}
	};

	const filters = await setupFilters({
		page,
		onChange: () => {
			if (state.tableHost) {
				void reload();
			}
		},
	});
	state.getArgs = filters.getArgs;
	state.applyRouteProject = filters.applyRouteProject;

	const refreshGantt = () => scheduleGanttRefresh(state);
	setColumnContext({
		page,
		onAssignSaved: refreshGantt,
		onGanttRefresh: refreshGantt,
		onRelationsFocus: (opts) => {
			handleRelationsFocus(state, opts);
		},
		// Subject toolbar Add/Delete/Multiple → full reload.
		onTreeMutate: (opts) => {
			void reload(opts);
		},
	});
	const main = page.main.get(0);
	state.fullscreenShell = main;
	const zones = buildShell(main);
	state.tableHost = zones.tableHost;
	state.ganttEl = zones.gantt;
	state.ganttHScroll = zones.ganttHScroll;
	const disposeResize = setupResize(zones);

	await reload();

	const onShow = async () => {
		if (state.table) {
			await ensureGantt(state);
		}
		await reload();
	};
	const onHide = () => {
		state.mountGen += 1;
		destroyGantt(state);
	};

	const resetView = async () => {
		await filters.resetExceptProject?.();
		if (state.table) {
			state.table.clearSort?.({ silent: true });
			state.table.clearFilter?.({ silent: true });
			if (state.table.isFilterRowOpen?.()) {
				state.table.toggleFilterRow?.(false);
			}
		}
		await reload();
	};

	return { ...zones, state, disposeResize, onShow, onHide, resetView };
}
