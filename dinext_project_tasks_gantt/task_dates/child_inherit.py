"""Forecast dates for a new child Task from the parent window.

Colleague rule (subtask create, empty dates only):
- end = parent end
- start = today by default
- parent start in the future → child start = parent start
- parent start and end both in the past → child dates = parent dates
- parent start in the past, parent end today or future → child start = today
"""

from __future__ import annotations

import frappe
from frappe.utils import getdate


def inherit_child_forecast_dates(parent_start, parent_end, today):
	"""Return (start, end) for an empty child. end may be None."""
	today_d = getdate(today)
	p_start = getdate(parent_start) if parent_start else None
	p_end = getdate(parent_end) if parent_end else None

	if p_start and p_end and p_start < today_d and p_end < today_d:
		return p_start, p_end
	if p_start and p_start > today_d:
		return p_start, p_end
	return today_d, p_end


def apply_child_forecast_defaults(doc) -> None:
	"""Fill empty child exp_* from parent. Does not overwrite user-set dates."""
	parent_name = doc.get("parent_task")
	if not parent_name:
		return
	if doc.get("exp_start_date") and doc.get("exp_end_date"):
		return

	parent = frappe.db.get_value(
		"Task",
		parent_name,
		["exp_start_date", "exp_end_date"],
		as_dict=True,
	)
	if not parent:
		return

	start, end = inherit_child_forecast_dates(
		parent.exp_start_date,
		parent.exp_end_date,
		frappe.utils.today(),
	)
	if not doc.get("exp_start_date"):
		doc.exp_start_date = start
	if not doc.get("exp_end_date") and end:
		doc.exp_end_date = end
