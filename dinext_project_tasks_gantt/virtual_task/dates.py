"""Date helpers shared by ITVT / TVTI (prod parity)."""

from __future__ import annotations

from dateutil.parser import parse as parse_date

import frappe
from frappe.utils import getdate, today


def date_cmp_value(value) -> str:
	"""Normalize date-like values for equality checks (TVTI)."""
	if value in (None, ""):
		return ""
	try:
		return value.strftime("%Y-%m-%d")
	except Exception:
		try:
			return str(parse_date(str(value)).date())
		except Exception:
			return str(value)


def apply_task_actual_dates_logic(target_data, act_start_date, act_end_date, completed_on_date):
	"""Prod ITVT helper: Completed completed_on/act_end; act expands exp (all statuses)."""
	gd = getdate

	if target_data.get("status") == "Completed":
		if act_end_date:
			if not completed_on_date or gd(completed_on_date) < gd(act_end_date):
				target_data["completed_on"] = act_end_date
		elif not completed_on_date or gd(completed_on_date) < gd(today()):
			target_data["completed_on"] = today()

		# ISS-2025-02315: without act_end, completion fact = completed_on
		if not act_end_date and target_data.get("completed_on"):
			target_data["act_end_date"] = target_data["completed_on"]

	if act_start_date and (
		not target_data.get("exp_start_date")
		or gd(act_start_date) < gd(target_data["exp_start_date"])
	):
		target_data["exp_start_date"] = act_start_date

	if act_end_date and (
		not target_data.get("exp_end_date") or gd(act_end_date) > gd(target_data["exp_end_date"])
	):
		target_data["exp_end_date"] = act_end_date


def resolution_date_from_issue(issue_doc):
	raw = issue_doc.get("resolution_date") or issue_doc.get("sla_resolution_date")
	return getdate(raw) if raw else None


def issue_resolution_fieldname(issue_doc) -> str | None:
	if issue_doc.meta.has_field("resolution_date"):
		return "resolution_date"
	if issue_doc.meta.has_field("sla_resolution_date"):
		return "sla_resolution_date"
	return None
