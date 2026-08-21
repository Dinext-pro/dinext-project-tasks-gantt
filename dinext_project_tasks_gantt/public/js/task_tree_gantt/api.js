const GET_CHILDREN = "dinext_project_tasks_gantt.api.get_children";
const SAVE_CELLS = "dinext_project_tasks_gantt.api.save_cells";
const TIMESHEET_LIMITS =
	"project_workload_assignment.api.calculate_user_timesheet_limits";
const CHECK_DEPENDENCIES = "check_dependencies_for_tasks";
const PREVIEW_PROPAGATION = "preview_propagation";
const APPLY_PROPAGATION = "apply_propagation";
const GET_USER_INFO = "frappe.desk.form.load.get_user_info_for_viewers";

function applyUserInfo(userInfo) {
	if (!userInfo || typeof userInfo !== "object") {
		return;
	}
	if (typeof frappe.update_user_info === "function") {
		frappe.update_user_info(userInfo);
	} else {
		Object.assign(frappe.boot.user_info || (frappe.boot.user_info = {}), userInfo);
	}
}

/** Load missing assignee fullname/image into boot (avatar_group). */
export async function ensureAssignUserInfo(users) {
	const missing = [...new Set((users || []).filter(Boolean))].filter(
		(u) => !frappe.boot.user_info?.[u]?.fullname
	);
	if (!missing.length) {
		return;
	}
	const data = await frappe.xcall(GET_USER_INFO, {
		users: JSON.stringify(missing),
	});
	applyUserInfo(data);
}

export async function getChildren(args) {
	const r = await frappe.call({
		method: GET_CHILDREN,
		args: {
			project: args.project,
			parent_task: args.parent_task ?? null,
			all_tasks: args.all_tasks ? 1 : 0,
			status: args.status || null,
			priority: args.priority || null,
			assign: args.assign || null,
			tag: args.tag || null,
			sort_field: args.sort_field || null,
			sort_order: args.sort_order || null,
			limit: args.limit || null,
		},
	});
	applyUserInfo(r.user_info);
	return r.message || [];
}

export async function saveCells(changes) {
	const r = await frappe.call({
		method: SAVE_CELLS,
		args: { changes },
	});
	return r.message;
}

/**
 * @param {{ timesheet_name?: string, positions: string|object[] }} args
 * positions: array (preferred, Tree/WE) or JSON string
 *
 * Uses fetch (not frappe.call) so PWA server errors do not open Desk "Server Error" dialog.
 * Plan-fact is best-effort side data; failures → empty results.
 */
export async function calculateTimesheetLimits(args) {
	let positions = args.positions;
	if (positions != null && typeof positions !== "string") {
		positions = JSON.stringify(positions);
	}
	try {
		const res = await fetch(`/api/method/${TIMESHEET_LIMITS}`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"X-Frappe-CSRF-Token": frappe.csrf_token,
			},
			credentials: "same-origin",
			body: JSON.stringify({
				timesheet_name: args.timesheet_name || "",
				positions,
			}),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok || data.exc) {
			console.warn(
				"[task_tree_gantt] plan_fact limits",
				data.exc || data._server_messages || res.status
			);
			return [];
		}
		return data.message || [];
	} catch (e) {
		console.warn("[task_tree_gantt] plan_fact limits", e);
		return [];
	}
}

/** @param {{ project: string, tasks: object[] }} args */
export async function checkDependencies(args) {
	const r = await frappe.call({
		method: CHECK_DEPENDENCIES,
		args: {
			project: args.project,
			tasks: args.tasks,
		},
	});
	return r.message || [];
}

/** @param {{ changed_task: string, direction?: string }} args */
export async function previewPropagation(args) {
	const r = await frappe.call({
		method: PREVIEW_PROPAGATION,
		args: {
			changed_task: args.changed_task,
			direction: args.direction || "downstream",
		},
	});
	return r.message;
}

/** @param {{ changes: string|object[], mode?: string }} args */
export async function applyPropagation(args) {
	const r = await frappe.call({
		method: APPLY_PROPAGATION,
		args: {
			changes:
				typeof args.changes === "string"
					? args.changes
					: JSON.stringify(args.changes),
			mode: args.mode || "sync",
		},
	});
	return r.message;
}
