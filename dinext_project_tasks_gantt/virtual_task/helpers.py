"""Shared helpers for virtual Task ↔ Issue sync."""

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
	return bool(doc.get("type") == "Issue" and doc.get("custom_linked_issue"))
