import { collapseAllRows, expandAllRows } from "../table/index.js";
import { scheduleGanttRefresh } from "../gantt/index.js";

/**
 * Page toolbar: Expand / Collapse All (rest of Tree toolbar later).
 */
export function setupToolbar({ page, state }) {
	if (page.__task_wbs_v2_toolbar) {
		return;
	}
	page.__task_wbs_v2_toolbar = true;

	page.add_inner_button(__("Expand All"), () => {
		expandAllRows(state.table, state.getArgs, state.tableHost)
			.then(() => scheduleGanttRefresh(state))
			.catch((e) => {
				console.error(e);
				frappe.msgprint(e.message || String(e));
			});
	});

	page.add_inner_button(__("Collapse All"), () => {
		collapseAllRows(state.table);
		scheduleGanttRefresh(state);
	});
}
