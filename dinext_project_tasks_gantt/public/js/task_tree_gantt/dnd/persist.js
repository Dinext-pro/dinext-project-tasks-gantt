/**
 * Persist Task tree DnD:
 * - sibling reorder → custom_tree_order
 * - reparent → Task.parent_task via Document.save + sibling orders
 *   (destination + former parent lists from DinextTable move payload)
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

function toTaskNames(ids) {
	return (ids || [])
		.map((id) => taskNameFromRowId(id) || String(id))
		.filter(Boolean);
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
		toParentRowId,
		rowId,
		blockSize = 1,
		orderedLocalRowIds,
		fromOrderedLocalRowIds,
		fromParentRowId,
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

	const orderedIds = toTaskNames(orderedLocalRowIds);
	if (!orderedIds.length || !orderedIds.includes(taskName)) {
		fail(__("Task reorder: missing sibling order"));
	}

	const parentTask = taskNameFromRowId(toParentRowId) || "";
	const reparent = fromParentRowId !== toParentRowId;
	const fromOrderedIds = reparent ? toTaskNames(fromOrderedLocalRowIds) : [];

	frappe.dom.freeze(__("Updating {0}", [__("Task")]));
	try {
		await frappe.xcall(
			"dinext_project_tasks_gantt.api.reorder_siblings",
			{
				task: taskName,
				parent_task: parentTask,
				ordered_ids: orderedIds,
				from_ordered_ids: fromOrderedIds,
			}
		);
	} finally {
		frappe.dom.unfreeze();
	}

	return true;
}
