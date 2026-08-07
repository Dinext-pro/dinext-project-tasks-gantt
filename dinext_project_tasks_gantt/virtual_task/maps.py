"""Status / priority maps Issue ↔ Task (prod ITVT / TVTI)."""

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


def issue_status_to_task(status):
	return ISSUE_TO_TASK_STATUS.get(status, status)


def task_status_to_issue(status):
	return TASK_TO_ISSUE_STATUS.get(status, status)


def issue_priority_to_task(priority):
	return ISSUE_TO_TASK_PRIORITY.get(priority, priority)


def task_priority_to_issue(priority):
	return TASK_TO_ISSUE_PRIORITY.get(priority, priority)
