/**
 * Sync Task assignees via Open ToDo only (fill / paste / bulk toolbar).
 * Single-cell PWA dialog stays on start_pwa_dialog — not this module.
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

/**
 * After ToDo sync: keep prior PWA users marked; new assignees → todo-only.
 * @param {object} row
 * @param {string[]} users
 */
export function stampAssignMetaAfterTodoSync(row, users) {
	if (!row) {
		return;
	}
	const next = normalizeUsers(users);
	const pwaPrev = new Set(normalizeUsers(row.assign_pwa));
	row.assign = next;
	row.assign_pwa = next.filter((u) => pwaPrev.has(u));
	row.assign_todo_only = next.filter((u) => !pwaPrev.has(u));
}

/**
 * After PWA dialog: all listed users are PWA-backed.
 * @param {object} row
 * @param {string[]} users
 */
export function stampAssignMetaAfterPwa(row, users) {
	if (!row) {
		return;
	}
	const next = normalizeUsers(users);
	row.assign = next;
	row.assign_pwa = [...next];
	row.assign_todo_only = [];
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

/** Align Open ToDos to desired users. */
export async function syncTodosToUsers(taskId, users) {
	const desired = normalizeUsers(users);
	const desiredSet = new Set(desired);
	const current = await listOpenAssignees(taskId);
	const currentSet = new Set(current);
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

/**
 * @param {string} taskId
 * @param {string[] | string | null} users
 */
export async function syncTaskAssign(taskId, users) {
	if (!taskId) {
		return;
	}
	await syncTodosToUsers(taskId, users);
}

/**
 * Batch fill/paste/bulk — ToDo only.
 * @param {Array<{ taskId: string, users: string[] | string | null }>} ops
 */
export async function syncTaskAssignMany(ops) {
	const list = (ops || []).filter((op) => op?.taskId);
	for (const op of list) {
		await syncTodosToUsers(op.taskId, op.users);
	}
}

export { normalizeUsers, sameUsers };
