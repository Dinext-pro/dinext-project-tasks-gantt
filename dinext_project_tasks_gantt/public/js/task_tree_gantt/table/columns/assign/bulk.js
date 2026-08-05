/**
 * Toolbar bulk assign: checked rows → dialog → commitCellChanges → silent PWA.
 */
import { ensureAssignUserInfo } from "../../../api.js";
import { getColumnsPage } from "../context.js";
import { openBulkAssignDialog } from "./bulk-dialog.js";
import { normalizeUsers, sameUsers } from "./persist.js";

function editSource() {
	return typeof DinextTable?.CELL_CHANGE_SOURCES?.EDIT === "string"
		? DinextTable.CELL_CHANGE_SOURCES.EDIT
		: "edit";
}

/**
 * Merge `addUsers` into each writable checked row via one commit batch.
 * @param {object} table
 * @param {string[]} addUsers
 */
export function commitBulkAssign(table, addUsers) {
	const add = normalizeUsers(addUsers);
	if (!add.length || typeof table?.commitCellChanges !== "function") {
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
		const newValue = normalizeUsers([...oldValue, ...add]);
		if (sameUsers(oldValue, newValue)) {
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
		frappe.show_alert({
			message: __("Nothing to update"),
			indicator: "blue",
		});
		return 0;
	}

	const { applied } = table.commitCellChanges({
		source: editSource(),
		changes,
	});
	return applied;
}

/** @deprecated alias */
export const commitBulkTodoAssign = commitBulkAssign;

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
			const rows = table?.getCheckedRows?.() || [];
			const project =
				getColumnsPage()?.fields_dict?.project?.get_value?.() || null;
			void openBulkAssignDialog({
				rows,
				project,
				onConfirm: (users) => {
					void ensureAssignUserInfo(users).then(() => {
						commitBulkAssign(table, users);
					});
				},
			});
		},
	};
}
