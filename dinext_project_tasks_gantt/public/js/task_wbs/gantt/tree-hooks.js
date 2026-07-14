// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { scheduleGanttRefresh } from "./index.js";

/**
 * Temporary: DinextTable has no onCollapseRow. Patch collapse to refresh gantt.
 * @param {object} table DinextTable instance
 * @param {object} state page._task_wbs
 */
export function wireTreeGanttHooks(table, state) {
	if (!table || table._task_wbs_gantt_hooks) {
		return;
	}
	table._task_wbs_gantt_hooks = true;

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
}
