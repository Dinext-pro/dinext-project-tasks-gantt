/**
 * Task tree DnD domain — wire DinextTable onRowReorder.
 */
import { getOnTreeMutate } from "../table/columns/context.js";
import { persistTaskRowReorder } from "./persist.js";

/**
 * @returns {(ctx: { move: object }) => Promise<boolean>}
 */
export function createOnRowReorder() {
	return async (ctx) => {
		try {
			await persistTaskRowReorder(ctx);
			getOnTreeMutate()?.();
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
