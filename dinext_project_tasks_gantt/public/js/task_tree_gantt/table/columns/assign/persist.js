/**
 * Sync Task assignees for fill/paste via Project Workload Assignment
 * (same product path as start_pwa_dialog → bulk_process_pwa).
 *
 * Policy A: user must have exactly one project-team role; otherwise fail
 * and ask to use the assignment dialog.
 */

/** Canonical DB value — dialog.js / types.py (not translated). */
const PWR_WORKLOAD_PERCENT_TASK = "В % от трудоемкости задачи";

const PWA_FIELDS = [
	"name",
	"task",
	"role",
	"user",
	"user_full_name",
	"task_dates",
	"date_from",
	"date_to",
	"workload",
	"wl_value",
	"acc_separately",
];

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

/** Match assignment/dialog.js getMaxToDate. */
function maxToDate(date) {
	const today = frappe.datetime.now_date();
	if (!date) {
		return today;
	}
	return frappe.datetime.get_day_diff(today, date) > 0 ? today : date;
}

async function fetchProjectTeam(project, cache) {
	if (!project) {
		return [];
	}
	if (cache.team.has(project)) {
		return cache.team.get(project);
	}
	const users = (await frappe.xcall("project_team_assign_filter", { project })) || [];
	cache.team.set(project, users);
	return users;
}

async function fetchUserRoles(project, user, cache) {
	const key = `${project}\0${user}`;
	if (cache.roles.has(key)) {
		return cache.roles.get(key);
	}
	const roles =
		(await frappe.xcall("get_project_user_roles", { project, user })) || [];
	cache.roles.set(key, roles);
	return roles;
}

async function resolveTaskMeta(taskId, hint = {}) {
	let project = hint.project || null;
	let expStart = hint.exp_start_date ?? null;
	let expEnd = hint.exp_end_date ?? null;

	if (!project || expStart == null || expEnd == null) {
		const r = await frappe.db.get_value("Task", taskId, [
			"project",
			"exp_start_date",
			"exp_end_date",
		]);
		const msg = r?.message || r || {};
		project = project || msg.project || null;
		if (expStart == null) {
			expStart = msg.exp_start_date || null;
		}
		if (expEnd == null) {
			expEnd = msg.exp_end_date || null;
		}
	}

	return { project, exp_start_date: expStart, exp_end_date: expEnd };
}

/**
 * Build bulk_process_pwa rows for one task so sync_assignments sees full desired set.
 * @returns {Promise<object[]>}
 */
async function buildPwaRowsForTask(taskId, desiredUsers, hint, cache) {
	const desired = normalizeUsers(desiredUsers);
	const desiredSet = new Set(desired);
	const { project, exp_start_date, exp_end_date } = await resolveTaskMeta(
		taskId,
		hint
	);

	if (!project) {
		throw new Error(__("Task {0}: project is required for assignment", [taskId]));
	}

	const team = await fetchProjectTeam(project, cache);
	const teamSet = new Set(team);

	const existing =
		(await frappe.db.get_list("Project Workload Assignment", {
			fields: PWA_FIELDS,
			filters: { task: taskId },
			limit: 0,
		})) || [];

	const byUser = new Map(existing.map((p) => [p.user, p]));
	const rows = [];

	for (const pwa of existing) {
		if (desiredSet.has(pwa.user)) {
			// Keep in payload so bulk_process_pwa sync does not drop ToDo.
			rows.push({
				name: pwa.name,
				task: taskId,
				user: pwa.user,
				role: pwa.role,
				user_full_name: pwa.user_full_name,
				task_dates: pwa.task_dates,
				date_from: pwa.date_from,
				date_to: pwa.date_to,
				workload: pwa.workload,
				wl_value: pwa.wl_value,
				acc_separately: pwa.acc_separately,
			});
		} else {
			rows.push({
				name: pwa.name,
				task: taskId,
				user: pwa.user,
				__isRemove: true,
			});
		}
	}

	for (const user of desired) {
		if (byUser.has(user)) {
			continue;
		}
		if (!teamSet.has(user)) {
			throw new Error(
				__("User {0} is not in the project team. Use the assignment dialog.", [
					user,
				])
			);
		}
		const roles = await fetchUserRoles(project, user, cache);
		if (!roles.length) {
			throw new Error(
				__(
					"User {0} has no project role. Choose a role in the assignment dialog.",
					[user]
				)
			);
		}
		if (roles.length > 1) {
			throw new Error(
				__(
					"User {0} has multiple project roles. Choose a role in the assignment dialog.",
					[user]
				)
			);
		}
		rows.push({
			__islocal: true,
			task: taskId,
			user,
			role: roles[0],
			task_dates: 1,
			date_from: maxToDate(exp_start_date),
			date_to: maxToDate(exp_end_date),
			workload: PWR_WORKLOAD_PERCENT_TASK,
			wl_value: 100,
			acc_separately: 1,
		});
	}

	return rows;
}

async function callBulkProcessPwa(rows) {
	if (!rows.length) {
		return;
	}
	await new Promise((resolve, reject) => {
		frappe.call({
			method: "bulk_process_pwa",
			args: { rows },
			freeze: true,
			freeze_message: __("Updating assignments…"),
			callback: (r) => {
				if (r.exc) {
					reject(new Error(r.message || __("Assign failed")));
					return;
				}
				resolve(r);
			},
			error: (err) => {
				reject(err instanceof Error ? err : new Error(__("Assign failed")));
			},
		});
	});
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

/** Align Open ToDos to desired users (covers orphan ToDos without PWA). */
async function syncTodosToUsers(taskId, users) {
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
 * Make PWA (+ synced ToDo) for Task match `users`.
 * @param {string} taskId
 * @param {string[] | string | null} users
 * @param {{
 *   project?: string | null,
 *   exp_start_date?: string | null,
 *   exp_end_date?: string | null,
 * }} [hint]
 */
export async function syncTaskAssign(taskId, users, hint = {}) {
	if (!taskId) {
		return;
	}
	await syncTaskAssignMany([
		{
			taskId,
			users,
			project: hint.project,
			exp_start_date: hint.exp_start_date,
			exp_end_date: hint.exp_end_date,
		},
	]);
}

/**
 * Batch fill/paste: one bulk_process_pwa for many tasks.
 * @param {Array<{
 *   taskId: string,
 *   users: string[] | string | null,
 *   project?: string | null,
 *   exp_start_date?: string | null,
 *   exp_end_date?: string | null,
 * }>} ops
 */
export async function syncTaskAssignMany(ops) {
	const list = (ops || []).filter((op) => op?.taskId);
	if (!list.length) {
		return;
	}

	const cache = { team: new Map(), roles: new Map() };
	const allRows = [];
	for (const op of list) {
		const rows = await buildPwaRowsForTask(
			op.taskId,
			op.users,
			{
				project: op.project,
				exp_start_date: op.exp_start_date,
				exp_end_date: op.exp_end_date,
			},
			cache
		);
		allRows.push(...rows);
	}

	const hasPwaMutation = allRows.some((r) => r.__islocal || r.__isRemove);
	if (hasPwaMutation) {
		await callBulkProcessPwa(allRows);
	}

	// Safety net: orphan Open ToDos without PWA (e.g. clear assign).
	for (const op of list) {
		await syncTodosToUsers(op.taskId, op.users);
	}
}

export { normalizeUsers, sameUsers };
