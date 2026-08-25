"""ISS-2024-02939 Task_treeview_preventive_validation — Before Validate (prod SS).

Остаток скрипта после child inherit:
- project с родителя;
- веха: start = end;
- пустые даты → duration (expected_time / 8 дней);
- Completed + confirm → Pending Review, если user не owner или не System Manager.
"""

from __future__ import annotations

import frappe
from frappe.utils import add_days, today

from dinext_common.dinext_common.permissions import get_users_with_role


def hours_to_days(hours, block=8):
	"""SS ceil(a, b): дни реализации из expected_time."""
	hours = hours if hours is not None else 0
	days = hours // block
	if hours % block != 0 or hours == 0:
		days = days + 1
	return days


def apply_project_from_parent(doc) -> None:
	parent_name = doc.get("parent_task")
	if not parent_name or doc.get("project"):
		return
	doc.project = frappe.db.get_value("Task", parent_name, "project")


def apply_milestone_dates(doc) -> None:
	if not doc.get("is_milestone"):
		return
	if not doc.get("exp_end_date"):
		doc.exp_end_date = today()
	doc.exp_start_date = doc.exp_end_date


def apply_duration_date_defaults(doc) -> None:
	"""Пустые exp_* после inherit/вехи: today / ± expected_time days."""
	expected_time = doc.expected_time if doc.expected_time is not None else 8
	span = hours_to_days(expected_time, 8)
	today_s = today()
	if not doc.get("exp_start_date") and not doc.get("exp_end_date"):
		doc.exp_start_date = today_s
		doc.exp_end_date = add_days(today_s, span)
		return
	if not doc.get("exp_start_date"):
		doc.exp_start_date = add_days(doc.exp_end_date, -1 * span)
	if not doc.get("exp_end_date"):
		doc.exp_end_date = add_days(doc.exp_start_date, span)


def apply_completed_confirm(doc) -> None:
	"""SS boolean as-is: reset unless owner AND System Manager."""
	if doc.get("status") != "Completed" or not doc.get("confirm"):
		return
	user = frappe.session.user
	managers = get_users_with_role("System Manager")
	if user != doc.get("owner") or user not in managers:
		doc.status = "Pending Review"


def apply_treeview_preventive(doc) -> None:
	"""SS order after inherit: project, milestone, duration, confirm."""
	apply_project_from_parent(doc)
	apply_milestone_dates(doc)
	apply_duration_date_defaults(doc)
	apply_completed_confirm(doc)
