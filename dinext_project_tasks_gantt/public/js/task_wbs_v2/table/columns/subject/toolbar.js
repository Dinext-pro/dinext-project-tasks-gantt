/**
 * Hover toolbar on subject cell — Tree `.tree-node-toolbar.btn-group`.
 */
import {
	addChildTask,
	addMultipleTasks,
	deleteTask,
	openTaskForm,
	previewDownstream,
	renameTask,
	taskAllowRename,
} from "./actions.js";

function el(tag, className) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	return node;
}

function makeBtn({ iconClass, title, onClick }) {
	const btn = el("button", `btn btn-default btn-xs tree-toolbar-button ${iconClass}`);
	btn.type = "button";
	btn.title = title;
	btn.setAttribute("aria-label", title);
	btn.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		onClick();
	});
	btn.addEventListener("mousedown", (ev) => {
		// Keep AG Grid from starting cell edit / selection steal.
		ev.stopPropagation();
	});
	return btn;
}

/**
 * @param {object} row table row
 * @returns {HTMLElement|null}
 */
export function buildSubjectToolbar(row) {
	if (!row?.id) return null;

	const canRead = frappe.model.can_read("Task");
	const canWrite = !!row.can_write;
	const canCreate = frappe.model.can_create("Task");
	const canDelete =
		frappe.model.can_delete("Task") &&
		frappe.perm.has_perm("Task", 0, "delete", row.id);

	const bar = el("span", "twb-v2-subject-toolbar tree-node-toolbar btn-group");

	// Edit / Details (treeview + toolbarRedesign → fa-pencil-square-o)
	if (canRead) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-pencil-square-o",
				title: canWrite ? __("Edit") : __("Details"),
				onClick: () => openTaskForm(row.id),
			})
		);
	}

	// Add Child (CS: can_create && can_write — not only expandable)
	if (canCreate && canWrite) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-plus-square-o",
				title: __("Add Child"),
				onClick: () => void addChildTask(row),
			})
		);
	}

	// Rename (standard treeview)
	if (canWrite && taskAllowRename()) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-font",
				title: __("Rename"),
				onClick: () => renameTask(row.id),
			})
		);
	}

	// Delete (CS condition: can_delete + perm on doc)
	if (canDelete) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-trash-o",
				title: __("Delete"),
				onClick: () => deleteTask(row.id),
			})
		);
	}

	// Add Multiple (CS fa-tasks)
	if (canCreate && canWrite) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-tasks",
				title: __("Add Multiple"),
				onClick: () => addMultipleTasks(row),
			})
		);
	}

	// Downstream deps preview (CS fa-level-down)
	if (canWrite) {
		bar.appendChild(
			makeBtn({
				iconClass: "fa fa-level-down",
				title: __("Fix Dependencies"),
				onClick: () => previewDownstream(row),
			})
		);
	}

	return bar.childNodes.length ? bar : null;
}
