"""Date helpers shared by ITVT / TVTI (prod parity)."""

from __future__ import annotations

from dateutil.parser import parse as parse_date

import frappe
from frappe.utils import getdate, today


def resolve_completed_on(act_end_date, completed_on_date):
	"""Completed: fill empty completed_on; never return a future date.

	If act_end exists: pull completed_on up to it, then cap at today.
	If not: today when empty. act_end itself is not moved (ISS-2026-02662).
	"""
	gd = getdate
	today_s = today()
	act_end = act_end_date or None
	completed = completed_on_date or None
	if act_end == "":
		act_end = None
	if completed == "":
		completed = None
	out = completed
	if act_end:
		if not out or gd(out) < gd(act_end):
			out = act_end
	elif not out:
		out = today_s
	if out and gd(out) > gd(today_s):
		out = today_s
	return out


def date_cmp_value(value) -> str:
	"""Нормализовать дату к YYYY-MM-DD для сравнения в TVTI."""
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
	"""ITVT: для Completed выставить completed_on/act_end; act расширяет exp (все статусы)."""
	gd = getdate

	if target_data.get("status") == "Completed":
		target_data["completed_on"] = resolve_completed_on(
			act_end_date, completed_on_date
		)

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
	"""Взять дату закрытия Issue: resolution_date или sla_resolution_date."""
	raw = issue_doc.get("resolution_date") or issue_doc.get("sla_resolution_date")
	return getdate(raw) if raw else None


def issue_resolution_fieldname(issue_doc) -> str | None:
	"""Имя поля даты закрытия на Issue (resolution_date / sla_resolution_date) или None."""
	if issue_doc.meta.has_field("resolution_date"):
		return "resolution_date"
	if issue_doc.meta.has_field("sla_resolution_date"):
		return "sla_resolution_date"
	return None
