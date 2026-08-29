/**
 * Toolbar bulk assign: checked rows.
 * N=1 → existing start_pwa_dialog. N>1 → start_pwa_multi_dialog (not ToDo pills).
 */
import { ensureAssignUserInfo } from "../../../api.js";
import { getColumnsPage } from "../context.js";
import { openAssignDialog } from "./dialog.js";
import { openBulkAssignDialog } from "./bulk-dialog.js";
import { normalizeUsers, sameUsers, stampAssignMetaAfterPwa } from "./persist.js";

function editSource() {
	return typeof DinextTable?.CELL_CHANGE_SOURCES?.EDIT === "string"
		? DinextTable.CELL_CHANGE_SOURCES.EDIT
		: "edit";
}

function projectFromPage() {
	return getColumnsPage()?.fields_dict?.project?.get_value?.() || null;
}

function writableChecked(table) {
	const checkedIds = table?.getCheckedRowIds?.() || [];
	const out = [];
	for (const rowId of checkedIds) {
		const node = table.api?.getRowNode?.(String(rowId));
		const row = node?.data || table.findSourceRow?.(rowId);
		if (!row?.id || !row.can_write || !node) {
			continue;
		}
		out.push({ rowId, node, row });
	}
	return out;
}

function commitAssignReplace(table, node, row, users) {
	const oldValue = normalizeUsers(row?.assign);
	const newValue = normalizeUsers(users);
	stampAssignMetaAfterPwa(row, newValue);
	if (node.data && node.data !== row) {
		stampAssignMetaAfterPwa(node.data, newValue);
	}
	if (sameUsers(oldValue, newValue)) {
		table.api?.refreshCells?.({
			rowNodes: [node],
			columns: ["assign"],
			force: true,
		});
		return 0;
	}
	const { applied } = table.commitCellChanges({
		source: editSource(),
		changes: [
			{
				node,
				field: "assign",
				oldValue,
				newValue,
				rowIndex: node.rowIndex,
				colId: "assign",
			},
		],
	});
	return applied;
}

/**
 * Merge add / strip remove on writable checked rows via one commit batch.
 * @param {object} table
 * @param {{ add?: string[], remove?: string[] }} delta
 */
export function commitBulkAssignDelta(table, delta) {
	const add = normalizeUsers(delta?.add);
	const removeSet = new Set(normalizeUsers(delta?.remove));
	if (
		(!add.length && !removeSet.size) ||
		typeof table?.commitCellChanges !== "function"
	) {
		return 0;
	}

	const checkedIds = table.getCheckedRowIds?.() || [];
	const changes = [];

	for (const rowId of checkedIds) {
		const node = table.api?.getRowNode?.(String(rowId));
		const row = node?.data || table.findSourceRow?.(rowId);
		if (!row?.id || !row.can_write || !node) {
			continue;
		}
		const oldValue = normalizeUsers(row.assign);
		const kept = oldValue.filter((u) => !removeSet.has(u));
		const newValue = normalizeUsers([...kept, ...add]);
		stampAssignMetaAfterPwa(row, newValue);
		if (node.data && node.data !== row) {
			stampAssignMetaAfterPwa(node.data, newValue);
		}
		if (sameUsers(oldValue, newValue)) {
			table.api?.refreshCells?.({
				rowNodes: [node],
				columns: ["assign"],
				force: true,
			});
			continue;
		}
		changes.push({
			node,
			field: "assign",
			oldValue,
			newValue,
			rowIndex: node.rowIndex,
			colId: "assign",
		});
	}

	if (!changes.length) {
		return 0;
	}

	const { applied } = table.commitCellChanges({
		source: editSource(),
		changes,
	});
	return applied;
}

/**
 * Merge `addUsers` into each writable checked row via one commit batch.
 * @param {object} table
 * @param {string[]} addUsers
 */
export function commitBulkAssign(table, addUsers) {
	return commitBulkAssignDelta(table, { add: addUsers, remove: [] });
}

/** @deprecated alias */
export const commitBulkTodoAssign = commitBulkAssign;

function openSinglePwa(table, item, project) {
	openAssignDialog({
		row: item.row,
		project,
		onSaved: (users) => {
			void ensureAssignUserInfo(users).then(() => {
				commitAssignReplace(table, item.node, item.row, users);
			});
		},
	});
}

function openMultiPwa(table, items, project) {
	const tasks = items.map(({ row }) => ({
		name: row.id,
		project: project || undefined,
		subject: row.subject || undefined,
		exp_start_date: row.exp_start_date || undefined,
		exp_end_date: row.exp_end_date || undefined,
		assign: Array.isArray(row.assign) ? row.assign : [],
	}));
	window.start_pwa_multi_dialog(
		(result) => {
			const added = Array.isArray(result) ? result : result?.added || [];
			const removed = Array.isArray(result) ? [] : result?.removed || [];
			const infoUsers = Array.isArray(result)
				? result
				: [...(result?.users || []), ...removed];
			void ensureAssignUserInfo(normalizeUsers(infoUsers)).then(() => {
				commitBulkAssignDelta(table, { add: added, remove: removed });
				table.clearRowCheck?.();
			});
		},
		tasks,
		{ project }
	);
}

/** Toolbar item for DinextTable. */
export function bulkAssignToolbarItem() {
	return {
		id: "tree-gantt-bulk-assign",
		label: __("Assign"),
		title: __("Assign users to checked tasks (workload)"),
		iconSvg:
			'<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 9.5a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M2.5 13.5c.6-2 2.4-3 5.5-3s4.9 1 5.5 3"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M12.5 3.5v4M10.5 5.5h4"/></svg>',
		disabled: ({ table }) => {
			const rows = table?.getCheckedRows?.() || [];
			return !rows.some((r) => r?.can_write);
		},
		onClick: ({ table }) => {
			const items = writableChecked(table);
			if (!items.length) {
				frappe.show_alert({
					message: __("No writable tasks selected"),
					indicator: "orange",
				});
				return;
			}
			const project = projectFromPage();
			if (items.length === 1) {
				openSinglePwa(table, items[0], project);
				return;
			}
			if (typeof window.start_pwa_multi_dialog === "function") {
				openMultiPwa(table, items, project);
				return;
			}
			void openBulkAssignDialog({
				rows: items.map((it) => it.row),
				project,
				onConfirm: (users) => {
					void ensureAssignUserInfo(users).then(() => {
						const applied = commitBulkAssign(table, users);
						if (applied > 0) {
							table.clearRowCheck?.();
						}
					});
				},
			});
		},
	};
}
