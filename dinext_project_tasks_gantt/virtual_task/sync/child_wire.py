"""Task_Child_To_Issue — wire ordinary Task.parent_task / issue to virtual (prod parity)."""

from __future__ import annotations

import frappe
from frappe import _


def wire_task_child_to_issue(doc) -> None:
	"""Связать обычную Task с virtual: issue→parent_task=virtual; parent virtual→issue=.

	Virtual с заполненным issue — ошибка (нельзя).
	"""
	if doc.get("type") == "Issue" and doc.get("issue"):
		frappe.throw(_("Virtual task cannot be linked to an Issue"))

	if doc.get("issue"):
		issue_name = doc.get("issue")
		virtual_task = frappe.db.get_value("Task", {"custom_linked_issue": issue_name}, "name")
		if virtual_task:
			frappe.db.set_value("Task", doc.name, {"parent_task": virtual_task})
			frappe.db.set_value("Task", virtual_task, {"is_group": True})
	elif doc.get("parent_task"):
		parent_task_doc = frappe.get_doc("Task", doc.get("parent_task"))
		if parent_task_doc.get("type") == "Issue" and parent_task_doc.get("custom_linked_issue"):
			if not doc.get("issue"):
				frappe.db.set_value(
					"Task",
					doc.name,
					{"issue": parent_task_doc.get("custom_linked_issue")},
				)
