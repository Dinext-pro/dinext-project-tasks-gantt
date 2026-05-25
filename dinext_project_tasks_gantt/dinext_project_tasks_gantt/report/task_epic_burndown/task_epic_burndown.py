# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from dinext_project_tasks_gantt.burndown import get_burndown_series


def execute(filters=None):
	"""Script Report: detail table; chart loads from get_burndown_series via JS."""
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
			hours_source=filters.get("hours_source") or "pwea_plan",
			project_role_filters=filters.get("project_role_filters") or None,
			exclude_group_tasks=0 if filters.get("exclude_group_tasks") in (0, "0", False) else 1,
			task_type_filters=filters.get("task_types") or filters.get("task_type_filter") or None,
			issue_type_filters=filters.get("issue_types") or None,
			forecast_periods=int(filters.get("forecast_periods") or 6),
		)
	except Exception:
		frappe.log_error(frappe.get_traceback(), "Task Epic Burndown execute")
		return _columns(), [], None, None

	rows = [
		{
			"period": row.get("period_label"),
			"segment": row.get("segment_label"),
			"volume": row.get("volume"),
			"task": row.get("task_subject") or row.get("task"),
			"task_name": row.get("task"),
		}
		for row in (payload.get("detail_rows") or [])
	]

	return _columns(), rows, None, None


def _columns():
	return [
		{"fieldname": "period", "label": _("Period"), "fieldtype": "Data", "width": 180},
		{"fieldname": "segment", "label": _("Segment"), "fieldtype": "Data", "width": 180},
		{"fieldname": "volume", "label": _("Volume"), "fieldtype": "Float", "width": 120},
		{"fieldname": "task", "label": _("Task"), "fieldtype": "Data", "width": 260},
	]
