// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

/**
 * Wire boundary for task_wbs. All frappe.call method strings live here.
 * SS deps are temporary until ported to task_wbs/*.py.
 */

const GET_CHILDREN = "dinext_project_tasks_gantt.task_wbs.api.get_children";
const SAVE_CELLS = "dinext_project_tasks_gantt.task_wbs.api.save_cells";
const CHECK_DEPENDENCIES = "check_dependencies_for_tasks";
const PREVIEW_PROPAGATION = "preview_propagation";
const APPLY_PROPAGATION = "apply_propagation";
const TIMESHEET_LIMITS = "project_workload_assignment.project_workload_api.calculate_timesheet_limits";

/** @param {object} args */
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
	return r.message || [];
}

/** @param {object[]} changes */
export async function saveCells(changes) {
	const r = await frappe.call({
		method: SAVE_CELLS,
		args: { changes },
	});
	return r.message;
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

/** @param {{ timesheet_name?: string, positions: string }} args */
export async function calculateTimesheetLimits(args) {
	const r = await frappe.call({
		method: TIMESHEET_LIMITS,
		args: {
			timesheet_name: args.timesheet_name || "",
			positions: args.positions,
		},
	});
	return r.message || [];
}
