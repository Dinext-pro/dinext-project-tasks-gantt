"""Общие хелперы sync Issue ↔ virtual Task."""

import frappe

# Флаг глубины вложенного save ITVT (TVTI пропускает при depth != 0).
ITVT_DEPTH = "itvt_save_depth"

ISSUE_TO_TASK_STATUS = {
	"Open": "Open",
	"Replied": "Working",
	"On Hold": "Cancelled",
	"Resolved": "Pending Review",
	"Closed": "Completed",
}

TASK_TO_ISSUE_STATUS = {
	"Open": "Open",
	"Overdue": "Open",
	"Working": "Replied",
	"Cancelled": "On Hold",
	"Pending Review": "Resolved",
	"Completed": "Closed",
}

ISSUE_TO_TASK_PRIORITY = {
	"Высокий": "High",
	"Средний": "Medium",
	"Низкий": "Low",
}

TASK_TO_ISSUE_PRIORITY = {
	"High": "Высокий",
	"Urgent": "Высокий",
	"Medium": "Средний",
	"Low": "Низкий",
}


def is_virtual_task(doc) -> bool:
	"""True, если Task — virtual (type=Issue и заполнен custom_linked_issue)."""
	return bool(doc.get("type") == "Issue" and doc.get("custom_linked_issue"))


def mirror_target_for_issue_or_task(doctype: str, name: str):
	"""Найти парный документ Issue ↔ virtual Task.

	Issue → Task с custom_linked_issue; Task → Issue из custom_linked_issue.
	Возвращает (doctype, name) или (None, None), если пары нет.
	"""
	if doctype == "Issue":
		virtual_task = frappe.db.get_value("Task", {"custom_linked_issue": name}, "name")
		if virtual_task:
			return "Task", virtual_task
	elif doctype == "Task":
		issue_name = frappe.db.get_value("Task", name, "custom_linked_issue")
		if issue_name:
			return "Issue", issue_name
	return None, None
