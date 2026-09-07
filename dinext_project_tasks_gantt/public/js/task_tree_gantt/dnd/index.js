/**
 * Task tree DnD domain — wire DinextTable onRowReorder.
 */
import { getOnGanttRefresh } from "../table/columns/context.js";
import { rowCanRead, rowCanWrite } from "../table/save.js";
import { persistTaskRowReorder } from "./persist.js";

/** Per-row drag start. Not a Task field — can_write + can_read only. */
export function canReorderTaskRow({ row }) {
	return rowCanRead(row) && rowCanWrite(row);
}

/** Reparent onto unreadable stub parent stays blocked. */
export function validateTaskRowReorder({ move, table }) {
	const row = table?.findSourceRow?.(move?.rowId);
	if (!rowCanRead(row) || !rowCanWrite(row)) {
		return false;
	}
	if (move?.fromParentRowId !== move?.toParentRowId && move?.toParentRowId) {
		const parent = table?.findSourceRow?.(move.toParentRowId);
		if (parent && !rowCanRead(parent)) {
			return false;
		}
	}
	return true;
}

/**
 * Sibling reorder / reparent already updates the in-memory tree.
 * Do NOT full-reload (onTreeMutate) — that collapses expanded branches.
 * Only refresh gantt bars to match new row order / nesting.
 *
 * @returns {(ctx: { move: object }) => Promise<boolean>}
 */
export function createOnRowReorder() {
	return async (ctx) => {
		try {
			await persistTaskRowReorder(ctx);
			getOnGanttRefresh()?.();
			return true;
		} catch (err) {
			const msg =
				err?.message ||
				err?.exc ||
				(typeof err === "string" ? err : null) ||
				__("Could not move task");
			frappe.show_alert({ message: msg, indicator: "red" });
			console.error("[task_tree_gantt] row reorder persist", err);
			return false;
		}
	};
}
