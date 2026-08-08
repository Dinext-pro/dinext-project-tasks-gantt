"""Delete pair: Issue ↔ virtual Task (prod Issue_Delete / Task_Virtual_Delete)."""

from __future__ import annotations

import frappe

from dinext_project_tasks_gantt.virtual_task.helpers import is_virtual_task


def delete_virtual_task_for_issue(doc) -> None:
	"""При удалении Issue — снять virtual Task из depends_on родителя и удалить Task."""
	task_name = frappe.db.get_value("Task", {"custom_linked_issue": doc.name}, "name")
	if not task_name:
		return

	parent_task = frappe.db.get_value("Task", task_name, "parent_task")

	if parent_task and frappe.db.exists("Task", parent_task):
		parent_task_doc = frappe.get_doc("Task", parent_task)
		if parent_task_doc.get("depends_on"):
			updated = [row for row in parent_task_doc.get("depends_on") if row.get("task") != task_name]
			if len(updated) != len(parent_task_doc.get("depends_on")):
				parent_task_doc.depends_on = updated
				parent_task_doc.save(ignore_permissions=True)

	if frappe.db.exists("Task", task_name):
		frappe.delete_doc("Task", task_name, ignore_permissions=True)


def delete_issue_for_virtual_task(doc) -> None:
	"""При удалении virtual Task — удалить связанный Issue."""
	if not is_virtual_task(doc):
		return
	issue_name = doc.get("custom_linked_issue")
	if frappe.db.exists("Issue", issue_name):
		frappe.delete_doc("Issue", issue_name, ignore_permissions=False)
