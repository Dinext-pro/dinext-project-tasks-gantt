/**
 * Subject row-toolbar actions — Tree V6 + treeview.get_toolbar parity.
 */
import { previewPropagation } from "../../../dependencies/preview.js";
import { getColumnsPage, getOnTreeMutate } from "../context.js";

function projectFromPage() {
	const page = getColumnsPage();
	return page?.fields_dict?.project?.get_value?.() || null;
}

function mutateTree() {
	getOnTreeMutate()?.();
}

export function openTaskForm(taskId) {
	if (!taskId) return;
	frappe.set_route("Form", "Task", taskId);
}

export function renameTask(taskId) {
	if (!taskId) return;
	frappe.model.rename_doc("Task", taskId, () => mutateTree());
}

export function deleteTask(taskId) {
	if (!taskId) return;
	frappe.model.delete_doc("Task", taskId, () => mutateTree());
}

/** Tree addNodeDecorator + treeview.new_node (dialog → add_node). */
export async function addChildTask(row) {
	const parentId = row?.id;
	const project = projectFromPage();
	if (!parentId || !project) {
		frappe.show_alert({ message: __("Select a project"), indicator: "orange" });
		return;
	}
	if (!frappe.model.can_create("Task") || !row.can_write) frappe.throw(__("Not permitted"));

	// Tree: leaf can become group before add child.
	if (!row.hasChildren) {
		try {
			await frappe.db.set_value("Task", parentId, "is_group", 1);
			row.hasChildren = true;
		} catch (e) {
			console.error("[task_tree_gantt] set is_group", e);
		}
	}

	const d = new frappe.ui.Dialog({
		title: __("New {0}", [__("Task")]),
		fields: [
			{
				fieldname: "subject",
				fieldtype: "Data",
				label: __("Subject"),
				reqd: 1,
			},
			{
				fieldname: "is_group",
				fieldtype: "Check",
				label: __("Is Group"),
				description: __(
					"Further sub-groups can only be created under records marked as 'Group'"
				),
			},
		],
		primary_action_label: __("Create New"),
		primary_action(values) {
			if (!values?.subject) {
				return;
			}
			d.hide();
			frappe.dom.freeze(__("Creating {0}", [__("Task")]));
			frappe.call({
				method: "erpnext.projects.doctype.task.task.add_node",
				args: {
					doctype: "Task",
					subject: values.subject,
					is_group: values.is_group ? 1 : 0,
					// treeview.new_node uses parent; make_tree_args → parent_task
					parent: parentId,
					parent_task: parentId,
					project,
					is_root: false,
				},
				callback(r) {
					if (!r.exc) {
						mutateTree();
					}
				},
				always() {
					frappe.dom.unfreeze();
				},
			});
		},
	});
	d.set_value("is_group", 0);
	d.show();
}

/** Tree custom fa-tasks → add_multiple_tasks. */
export function addMultipleTasks(row) {
	const parentId = row?.id;
	if (!parentId) return;
	if (!frappe.model.can_create("Task") || !row.can_write) frappe.throw(__("Not permitted"));

	const data = [];
	const dialog = new frappe.ui.Dialog({
		title: __("Add Multiple Tasks"),
		fields: [
			{
				fieldname: "multiple_tasks",
				fieldtype: "Table",
				in_place_edit: true,
				data,
				get_data: () => data,
				fields: [
					{
						fieldtype: "Data",
						fieldname: "subject",
						in_list_view: 1,
						reqd: 1,
						label: __("Subject"),
					},
				],
			},
		],
		primary_action_label: __("Create"),
		primary_action() {
			const rows = dialog.get_values()?.multiple_tasks || [];
			const payload = rows.filter((r) => r.subject);
			if (!payload.length) {
				frappe.msgprint(__("Add at least one subject"));
				return;
			}
			dialog.hide();
			frappe.call({
				method: "erpnext.projects.doctype.task.task.add_multiple_tasks",
				args: {
					data: JSON.stringify(payload),
					parent: parentId,
				},
				callback(r) {
					if (!r.exc) {
						frappe.show_alert(__("Tasks created"));
						mutateTree();
					}
				},
			});
		},
	});
	dialog.show();
}

/** Tree fa-level-down → _tds_preview_tree / try1 previewPropagation. */
export function previewDownstream(row) {
	const taskId = row?.id;
	if (!taskId || !row.can_write) return;

	if (typeof _tds_preview_tree === "function") {
		_tds_preview_tree(taskId, "downstream", (mode, changes) => {
			if (mode === "async") {
				frappe.show_alert(__("Обновите дерево задач после выполнения изменений"));
				return;
			}
			void changes;
			mutateTree();
		});
		return;
	}

	previewPropagation(taskId, "downstream")
		.then(() => {})
		.catch((e) => {
			console.error("[task_tree_gantt] previewDownstream", e);
			frappe.msgprint(e.message || String(e));
		});
}

export function taskAllowRename() {
	try {
		const meta = frappe.get_meta?.("Task");
		if (meta && meta.allow_rename === 0) {
			return false;
		}
	} catch (e) {
		/* ignore */
	}
	return true;
}
