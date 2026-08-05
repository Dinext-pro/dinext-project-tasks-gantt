/**
 * Persist Task tree DnD:
 * - sibling reorder within same parent → custom_tree_order (no date changes)
 * - reparent blocked at this stage (ISS-2026-02536 #5.1 only)
 *
 * Relies on server for reparent later:
 * - Parent_Task_Is_Group_Check / Task_Actual_Dates_Sync / ERPNext validate
 */

/** Path id → Task name (last segment). */
export function taskNameFromRowId(rowId) {
	if (rowId == null || rowId === "") {
		return null;
	}
	return String(rowId).split(":").pop() || null;
}

function fail(message) {
	throw new Error(message);
}

/**
 * @param {{ move: object }} ctx DinextTable onRowReorder payload
 * @returns {Promise<true>}
 */
export async function persistTaskRowReorder({ move }) {
	if (!move) {
		fail(__("Task reorder: missing move payload"));
	}

	const {
		fromParentRowId,
		toParentRowId,
		rowId,
		blockSize = 1,
		orderedLocalRowIds,
	} = move;

	if (cint(blockSize) > 1) {
		fail(__("Moving multiple tasks at once is not supported"));
	}

	const taskName = taskNameFromRowId(rowId);
	if (!taskName) {
		fail(__("Task reorder: invalid task id"));
	}

	if (!frappe.model.can_write("Task")) {
		fail(__("Not permitted"));
	}

	// Stage 1: only siblings under the same parent.
	if (fromParentRowId !== toParentRowId) {
		fail(
			__(
				"Moving a task to another parent is not enabled yet. Reorder within the same branch only."
			)
		);
	}

	const orderedIds = (orderedLocalRowIds || [])
		.map((id) => taskNameFromRowId(id) || String(id))
		.filter(Boolean);

	if (!orderedIds.length || !orderedIds.includes(taskName)) {
		fail(__("Task reorder: missing sibling order"));
	}

	const parentTask = taskNameFromRowId(toParentRowId) || null;

	frappe.dom.freeze(__("Updating {0}", [__("Task")]));
	try {
		await frappe.xcall(
			"dinext_project_tasks_gantt.task_tree_order.reorder_siblings",
			{
				task: taskName,
				parent_task: parentTask || "",
				ordered_ids: orderedIds,
			}
		);
	} finally {
		frappe.dom.unfreeze();
	}

	return true;
}
