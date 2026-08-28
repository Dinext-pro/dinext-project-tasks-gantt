/**
 * Subject row-toolbar actions — Tree V6 + treeview.get_toolbar parity.
 */
import { previewPropagation } from "../../../dependencies/preview.js";
import { getColumnsPage, getOnTreeMutate } from "../context.js";

function projectFromPage() {
	const page = getColumnsPage();
	return page?.fields_dict?.project?.get_value?.() || null;
}

function mutateTree(opts) {
	getOnTreeMutate()?.(opts);
}

function rowTreeId(row) {
	return row?._rowId || row?.id || null;
}

function taskFilterFromPage() {
	const page = getColumnsPage();
	return page?.fields_dict?.task?.get_value?.() || null;
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

/**
 * V6 root Add Child: frappe.new_doc / quick entry (Type + Edit Full Form).
 * after_insert: reload tree after Save; Edit Full Form still shown (no force).
 */
function openRootTaskQuickEntry({ project, parentTask }) {
	frappe.model.with_doctype("Task", () => {
		const doc = frappe.model.get_new_doc("Task");
		doc.project = project;
		doc.is_group = 0;
		if (parentTask) {
			doc.parent_task = parentTask;
		}
		frappe.ui.form.make_quick_entry("Task", () => mutateTree(), null, doc);
	});
}

/** treeview.new_node → erpnext Task.add_node (row hover, under existing parent). */
function openNewTaskDialog({ parentId, project, expandRowId }) {
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
					parent: parentId,
					parent_task: parentId,
					project,
					is_root: false,
				},
				callback(r) {
					if (!r.exc) {
						mutateTree({
							expandRowIds: expandRowId ? [expandRowId] : undefined,
						});
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

	openNewTaskDialog({
		parentId,
		project,
		expandRowId: rowTreeId(row),
	});
}

/** Original tree root "Add Child" — project root, or Task filter group. */
export function addRootTask() {
	const project = projectFromPage();
	if (!project) {
		frappe.show_alert({ message: __("Select a project"), indicator: "orange" });
		return;
	}
	if (!frappe.model.can_create("Task")) frappe.throw(__("Not permitted"));

	openRootTaskQuickEntry({
		project,
		parentTask: taskFilterFromPage() || null,
	});
}

/** Toolbar Add Child: 0 check → root; 1 check → child of that task; multi → disabled. */
export function addRootTaskToolbarItem() {
	return {
		id: "tree-gantt-add-root",
		label: __("Add Child"),
		title: __("Add Child"),
		iconSvg:
			'<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 3.2h8.5M2 6h8.5M2 9h4.2M2 12h4.2"/><path d="M11.2 9v5M8.7 11.5h5"/></g></svg>',
		disabled: ({ table }) => {
			if (!frappe.model.can_create("Task") || !projectFromPage()) {
				return true;
			}
			const rows = table?.getCheckedRows?.() || [];
			if (rows.length > 1) {
				return true;
			}
			if (rows.length === 1 && !rows[0]?.can_write) {
				return true;
			}
			return false;
		},
		onClick: ({ table }) => {
			const rows = table?.getCheckedRows?.() || [];
			if (rows.length === 1) {
				void addChildTask(rows[0]);
				return;
			}
			addRootTask();
		},
	};
}

/** Tree custom fa-tasks → add_multiple_tasks. */
export async function addMultipleTasks(row) {
	const parentId = row?.id;
	if (!parentId) return;
	if (!frappe.model.can_create("Task") || !row.can_write) frappe.throw(__("Not permitted"));

	if (!row.hasChildren) {
		try {
			await frappe.db.set_value("Task", parentId, "is_group", 1);
			row.hasChildren = true;
		} catch (e) {
			console.error("[task_tree_gantt] set is_group", e);
		}
	}

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
						mutateTree({
							expandRowIds: [rowTreeId(row)].filter(Boolean),
						});
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
				frappe.show_alert(__("Refresh the task tree after applying changes"));
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
