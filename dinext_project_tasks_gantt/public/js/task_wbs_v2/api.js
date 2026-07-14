const GET_CHILDREN = "dinext_project_tasks_gantt.task_wbs.api.get_children";
const SAVE_CELLS = "dinext_project_tasks_gantt.task_wbs.api.save_cells";

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

export async function saveCells(changes) {
	const r = await frappe.call({
		method: SAVE_CELLS,
		args: { changes },
	});
	return r.message;
}
