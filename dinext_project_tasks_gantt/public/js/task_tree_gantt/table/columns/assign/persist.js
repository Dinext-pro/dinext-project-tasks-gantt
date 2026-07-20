/**
 * Sync Task assignees (ToDo / _assign) for fill/paste mass edit.
 * Click path still uses PWA dialog; this is scalar assign list only.
 */

function normalizeUsers(value) {
	if (Array.isArray(value)) {
		return [...new Set(value.map(String).map((s) => s.trim()).filter(Boolean))];
	}
	if (value == null || value === "") {
		return [];
	}
	if (typeof value === "string") {
		return [
			...new Set(
				value
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			),
		];
	}
	return [];
}

function sameUsers(a, b) {
	const left = normalizeUsers(a).slice().sort();
	const right = normalizeUsers(b).slice().sort();
	if (left.length !== right.length) {
		return false;
	}
	return left.every((u, i) => u === right[i]);
}

async function listOpenAssignees(taskId) {
	const rows = await frappe.db.get_list("ToDo", {
		fields: ["allocated_to"],
		filters: {
			status: "Open",
			reference_type: "Task",
			reference_name: taskId,
		},
		limit: 0,
	});
	return normalizeUsers((rows || []).map((r) => r.allocated_to));
}

/**
 * Make Open ToDo assignees for Task match `users`.
 * @param {string} taskId
 * @param {string[] | string | null} users
 */
export async function syncTaskAssign(taskId, users) {
	if (!taskId) {
		return;
	}
	const desired = normalizeUsers(users);
	const current = await listOpenAssignees(taskId);
	if (sameUsers(current, desired)) {
		return;
	}

	const currentSet = new Set(current);
	const desiredSet = new Set(desired);
	const toAdd = desired.filter((u) => !currentSet.has(u));
	const toRemove = current.filter((u) => !desiredSet.has(u));

	if (toAdd.length) {
		await frappe.xcall("frappe.desk.form.assign_to.add", {
			doctype: "Task",
			name: taskId,
			assign_to: toAdd,
		});
	}

	for (const user of toRemove) {
		await frappe.xcall("frappe.desk.form.assign_to.remove", {
			doctype: "Task",
			name: taskId,
			assign_to: user,
		});
	}
}

export { normalizeUsers, sameUsers };
