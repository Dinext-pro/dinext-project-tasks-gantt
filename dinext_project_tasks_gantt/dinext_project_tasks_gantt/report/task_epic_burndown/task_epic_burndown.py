# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from dinext_project_tasks_gantt.burndown import get_burndown_series


def execute(filters=None):
	"""Script Report: summary table; chart loads from get_burndown_series via JS."""
	filters = filters or {}
	if not filters.get("project"):
		return [], [], None, None

	try:
		payload = get_burndown_series(
			project=filters.get("project"),
			from_date=filters.get("from_date"),
			to_date=filters.get("to_date"),
			group_by=filters.get("group_by") or "month",
			measure=filters.get("measure") or "hours",
			exclude_group_tasks=0 if filters.get("exclude_group_tasks") in (0, "0", False) else 1,
			task_type_filters=filters.get("task_types") or filters.get("task_type_filter") or None,
			issue_type_filters=filters.get("issue_types") or None,
			forecast_periods=int(filters.get("forecast_periods") or 6),
		)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Task Epic Burndown execute")
		return _columns(), [], None, None

	rows = []
	cat = payload.get("categories") or []
	for i, name in enumerate(cat):
		rows.append(
			{
				"category": name,
				"remaining": payload.get("remaining", [None] * len(cat))[i],
				"added": payload.get("added", [None] * len(cat))[i],
				"completed": payload.get("completed", [None] * len(cat))[i],
			}
		)
	for j, name in enumerate(payload.get("forecast_categories") or []):
		rows.append(
			{
				"category": name,
				"remaining": payload.get("forecast_remaining", [])[j],
				"added": payload.get("forecast_added", [])[j],
				"completed": payload.get("forecast_completed", [])[j],
			}
		)

	return _columns(), rows, None, None


def _columns():
	return [
		{"fieldname": "category", "label": _("Bucket"), "fieldtype": "Data", "width": 200},
		{"fieldname": "remaining", "label": _("Remaining"), "fieldtype": "Float", "width": 120},
		{"fieldname": "added", "label": _("Added / Plan delta"), "fieldtype": "Float", "width": 120},
		{"fieldname": "completed", "label": _("Completed / Actual"), "fieldtype": "Float", "width": 120},
	]
