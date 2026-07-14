// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { initState, destroyTable, queryArgsFromState } from "../state.js";
import { getColumns } from "./columns.js";
import { fetchChildren, loadRootRows } from "./data.js";
import { onSaveCells, onValidateCells } from "./save.js";
import { ROW_HEIGHT } from "../constants.js";
import { ensureGantt, destroyGantt, scheduleGanttRefresh } from "../gantt/index.js";
import { wireTreeGanttHooks } from "../gantt/tree-hooks.js";
import { refreshSideData } from "../side_data.js";

function applySortFromGrid(state, api) {
	if (!api?.getColumnState) {
		return false;
	}
	const sorted = api.getColumnState().filter((c) => c.sort);
	const next = sorted[0]
		? { field: sorted[0].colId, order: sorted[0].sort }
		: {};
	const prev = state.sort || {};
	if (prev.field === next.field && prev.order === next.order) {
		return false;
	}
	state.sort = next;
	return true;
}

function dateFieldsChanged(changes) {
	return (changes || []).some(
		(c) => c.field === "exp_start_date" || c.field === "exp_end_date"
	);
}

function buildTableOptions(page, state) {
	return {
		container: state.container,
		data: state.rows,
		columns: getColumns(state),
		edit: true,
		selection: { enabled: true },
		theme: {
			cellHorizontalPadding: 4,
			spacing: 4,
		},
		onValidateCells,
		onSaveCells: async (ctx) => {
			const result = await onSaveCells(ctx);
			if (result !== false) {
				scheduleGanttRefresh(state);
				if (dateFieldsChanged(ctx.changes)) {
					refreshSideData(
						state,
						ctx.changes.map((c) => c.row).filter(Boolean)
					).catch(console.error);
				}
			}
			return result;
		},
		gridOptions: {
			rowHeight: ROW_HEIGHT,
			headerHeight: 28,
			suppressMultiSort: true,
			tooltipShowDelay: 0,
			onSortChanged: () => {
				const api = state.table?.api;
				if (!applySortFromGrid(state, api)) {
					return;
				}
				reloadTable(page).catch((e) => {
					console.error("task_wbs sort reload", e);
					frappe.msgprint({
						title: __("Error"),
						indicator: "red",
						message: e.message || String(e),
					});
				});
			},
		},
		onExpandRow: async ({ rowId, table }) => {
			const children = await fetchChildren(
				queryArgsFromState(state, { parent_task: rowId })
			);
			table.setRowChildren(rowId, children);
			scheduleGanttRefresh(state);
			refreshSideData(state, children).catch(console.error);
		},
	};
}

export async function initTable(page) {
	const state = initState(page);
	if (!state.container) {
		return null;
	}
	if (state.table) {
		return state.table;
	}

	const gen = (state.loadGen = (state.loadGen || 0) + 1);

	await frappe.require(["dinext-table.bundle.js"]);
	await loadRootRows(state);
	if (gen !== state.loadGen) {
		return null;
	}

	const table = await DinextTable.create(buildTableOptions(page, state));
	if (gen !== state.loadGen) {
		table.destroy?.();
		return null;
	}

	state.table = table;
	wireTreeGanttHooks(table, state);
	await ensureGantt(state);
	if (gen !== state.loadGen) {
		return state.table;
	}
	refreshSideData(state).catch(console.error);
	return table;
}

export async function reloadTable(page) {
	const state = initState(page);
	if (!state.container) {
		return null;
	}

	const gen = (state.loadGen = (state.loadGen || 0) + 1);

	if (!state.project) {
		destroyGantt(state);
		destroyTable(page);
		state.container.innerHTML = "";
		const hint = document.createElement("div");
		hint.className = "task-wbs-placeholder text-muted";
		hint.textContent = __("Select a project");
		state.container.appendChild(hint);
		return null;
	}

	if (!state.table) {
		state.container.innerHTML = "";
		return initTable(page);
	}

	state.holidays = null;
	await loadRootRows(state);
	if (gen !== state.loadGen) {
		return null;
	}

	state.table.refresh?.(state.rows);
	await ensureGantt(state);
	if (gen !== state.loadGen) {
		return state.table;
	}
	refreshSideData(state).catch(console.error);
	return state.table;
}
