"""Forecast dates for a new child Task from the parent window.

Colleague rule (subtask create, empty dates only):
- end = parent end
- start = today by default
- parent start in the future → child start = parent start
- parent start and end both in the past → child dates = parent dates
- parent start in the past, parent end today or future → child start = today

On insert, a 1:1 copy of the parent window is treated as empty (UI/defaults),
not as a user-chosen period.
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


def _is_new_doc(doc) -> bool:
	is_new = getattr(doc, "is_new", None)
	if callable(is_new):
		return bool(is_new())
	return not doc.get("name")


def _copied_parent_window(doc, parent) -> bool:
	if not (doc.get("exp_start_date") and doc.get("exp_end_date")):
		return False
	if not (parent.exp_start_date and parent.exp_end_date):
		return False
	return getdate(doc.exp_start_date) == getdate(parent.exp_start_date) and getdate(
		doc.exp_end_date
	) == getdate(parent.exp_end_date)


def apply_child_forecast_defaults(doc) -> None:
	"""Fill child exp_* from parent. Empty dates, or insert with parent window copied 1:1."""
	parent_name = doc.get("parent_task")
	if not parent_name:
		return

	is_new = _is_new_doc(doc)
	has_both = bool(doc.get("exp_start_date") and doc.get("exp_end_date"))
	if has_both and not is_new:
		return

	parent = frappe.db.get_value(
		"Task",
		parent_name,
		["exp_start_date", "exp_end_date"],
		as_dict=True,
	)
	if not parent:
		return

	copied = is_new and _copied_parent_window(doc, parent)
	if has_both and not copied:
		return

	start, end = inherit_child_forecast_dates(
		parent.exp_start_date,
		parent.exp_end_date,
		frappe.utils.today(),
	)
	if not doc.get("exp_start_date") or copied:
		doc.exp_start_date = start
	if (not doc.get("exp_end_date") or copied) and end:
		doc.exp_end_date = end
