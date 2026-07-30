/**
 * Persist Task tree DnD — only known product paths:
 * - reparent / outdent via Task.parent_task (Form / set_value semantics)
 * - leaf → group via is_group=1 (Add Child toolbar path)
 *
 * Relies on server hooks (do not reimplement):
 * - Parent_Task_Is_Group_Check (After Save safety net; validate still needs is_group first)
 * - Task_Actual_Dates_Sync (Before Validate: expand parent exp_* when child exceeds)
 * - ERPNext Task validate / update_nsm / populate_depends_on / progress rollup
 *
 * Dark spots → throw (caller reverts UI):
 * - sibling-only reorder (no Task order field; list sorted by exp_*)
 * - multi-row move
 */

/** Path id → Task name (last segment). */
export function taskNameFromRowId(rowId) {
	if (rowId == null || rowId === "") {
		return null;
	}
	return String(rowId).split(":").pop() || null;
}

/**
 * Ensure destination parent is a group before child save.
 * ERPNext validate_parent_is_group runs before After Save hook.
 * Mirrors subject/actions.js addChildTask.
 */
async function ensureParentIsGroup(parentName) {
	if (!parentName) {
		return;
	}
	const isGroup = await frappe.db.get_value("Task", parentName, "is_group");
	if (cint(isGroup)) {
		return;
	}
	await frappe.db.set_value("Task", parentName, "is_group", 1);
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
	} = move;

	if (cint(blockSize) > 1) {
		fail(__("Moving multiple tasks at once is not supported"));
	}

	if (fromParentRowId === toParentRowId) {
		fail(
			__(
				"Sibling order is not saved for Task tree (no order field; reload sorts by dates)"
			)
		);
	}

	const taskName = taskNameFromRowId(rowId);
	if (!taskName) {
		fail(__("Task reorder: invalid task id"));
	}

	if (!frappe.model.can_write("Task")) {
		fail(__("Not permitted"));
	}

	const newParent = taskNameFromRowId(toParentRowId);

	if (newParent === taskName) {
		fail(__("Task cannot be its own parent"));
	}

	frappe.dom.freeze(__("Updating {0}", [__("Task")]));
	try {
		if (newParent) {
			await ensureParentIsGroup(newParent);
		}

		// Same as Form parent_task change: triggers validate + nsm + date sync hooks.
		await frappe.db.set_value(
			"Task",
			taskName,
			"parent_task",
			newParent || ""
		);
	} finally {
		frappe.dom.unfreeze();
	}

	return true;
}
