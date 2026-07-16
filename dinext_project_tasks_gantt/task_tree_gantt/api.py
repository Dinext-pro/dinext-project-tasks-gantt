import frappe

from dinext_project_tasks_gantt.task_tree_gantt.get_children import get_children as _get_children
from dinext_project_tasks_gantt.task_tree_gantt.save_cells import save_cells as _save_cells


@frappe.whitelist()
def get_children(**kwargs):
	return _get_children(**kwargs)


@frappe.whitelist()
def save_cells(changes=None):
	return _save_cells(changes=changes)
