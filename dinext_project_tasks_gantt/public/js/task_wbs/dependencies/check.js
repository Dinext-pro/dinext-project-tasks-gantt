// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { checkDependencies } from "../api.js";

function walkRows(rows, out) {
	for (const row of rows || []) {
		if (row?.id) {
			out.push(row);
		}
		if (row.children?.length) {
			walkRows(row.children, out);
		}
	}
	return out;
}

/** All loaded tree rows (roots + expanded children in sourceData). */
export function collectLoadedRows(table) {
	const source = table?.sourceData || table?.options?.data || [];
	return walkRows(source, []);
}

function clearConflict(row) {
	row.dep_conflict = 0;
	row.dep_conflict_start = "";
	row.dep_conflict_end = "";
}

function applyResults(rowsById, results) {
	for (const row of Object.values(rowsById)) {
		clearConflict(row);
	}
	for (const item of results || []) {
		const row = rowsById[item.checked_task];
		if (!row || !item.violations?.length) {
			continue;
		}
		row.dep_conflict = 1;
		for (const v of item.violations) {
			if (v.violated_field === "start") {
				row.dep_conflict_start = v.message || __("Conflict");
			} else if (v.violated_field === "end") {
				row.dep_conflict_end = v.message || __("Conflict");
			}
		}
	}
}

function refreshCells(table, rowIds) {
	if (!table?.api?.refreshCells) {
		return;
	}
	const nodes = [];
	for (const id of rowIds) {
		const node = table.api.getRowNode?.(String(id));
		if (node) {
			nodes.push(node);
		}
	}
	table.api.refreshCells({
		rowNodes: nodes.length ? nodes : undefined,
		columns: ["subject", "exp_start_date", "exp_end_date"],
		force: true,
	});
}

/**
 * Call SS check_dependencies_for_tasks and stamp conflict flags on rows.
 * @param {object} state
 * @param {object[]} [rows] subset; default all loaded
 */
export async function refreshDependencies(state, rows) {
	if (!state?.project || !state.table) {
		return;
	}
	const list = rows?.length ? rows : collectLoadedRows(state.table);
	if (!list.length) {
		return;
	}

	const rowsById = {};
	for (const row of list) {
		rowsById[row.id] = row;
		clearConflict(row);
	}

	const results = await checkDependencies({
		project: state.project,
		tasks: list.map((row) => ({
			name: row.id,
			project: state.project,
			subject: row.subject,
			exp_start_date: row.exp_start_date,
			exp_end_date: row.exp_end_date,
		})),
	});

	applyResults(rowsById, results);
	refreshCells(state.table, Object.keys(rowsById));
}

export function dateConflictClass(params) {
	const row = params.data;
	const field = params.colDef?.field;
	if (!row || !field) {
		return "";
	}
	if (field === "exp_start_date" && row.dep_conflict_start) {
		return "task-wbs-dep-conflict";
	}
	if (field === "exp_end_date" && row.dep_conflict_end) {
		return "task-wbs-dep-conflict";
	}
	return "";
}

export function subjectConflictClass(params) {
	return params.data?.dep_conflict ? "task-wbs-dep-conflict" : "";
}
