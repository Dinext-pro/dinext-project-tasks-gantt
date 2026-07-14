// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

/**
 * Page-scoped state (WE uses frm.we_v2; here page._task_wbs).
 * @param {object} page frappe app page
 */
export function initState(page) {
	if (!page._task_wbs) {
		page._task_wbs = {
			table: null,
			rows: [],
			project: null,
			container: null,
			shell: null,
			ganttEl: null,
			resizeCleanup: null,
			statusEl: null,
			/** @type {{ status?: string, priority?: string, assign?: string, tag?: string, limit?: number }} */
			filters: {},
			/** @type {{ field?: string, order?: 'asc'|'desc' }} */
			sort: {},
		};
	}
	return page._task_wbs;
}

export function destroyTable(page) {
	const state = page._task_wbs;
	if (state?.table?.destroy) {
		state.table.destroy();
	}
	if (state) {
		state.table = null;
		state.rows = [];
	}
}

export function destroyShell(page) {
	const state = page._task_wbs;
	if (typeof state?.resizeCleanup === "function") {
		state.resizeCleanup();
		state.resizeCleanup = null;
	}
	if (typeof state?.ganttSyncCleanup === "function") {
		state.ganttSyncCleanup();
		state.ganttSyncCleanup = null;
	}
	if (typeof state?.ganttHoverCleanup === "function") {
		state.ganttHoverCleanup();
		state.ganttHoverCleanup = null;
	}
	destroyTable(page);
	if (state) {
		state.gantt = null;
		state.holidays = null;
		if (state.ganttEl) {
			state.ganttEl.innerHTML = "";
		}
		state.container = null;
		state.shell = null;
		state.ganttEl = null;
		state.statusEl = null;
	}
}

/** Args shared by root load and lazy expand. */
export function queryArgsFromState(state, extra = {}) {
	return {
		project: state.project,
		status: state.filters?.status || null,
		priority: state.filters?.priority || null,
		assign: state.filters?.assign || null,
		tag: state.filters?.tag || null,
		limit: state.filters?.limit || null,
		sort_field: state.sort?.field || null,
		sort_order: state.sort?.order || null,
		...extra,
	};
}
