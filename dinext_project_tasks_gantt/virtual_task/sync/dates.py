"""Date helpers shared by ITVT / TVTI (prod parity)."""

from __future__ import annotations

from dateutil.parser import parse as parse_date

import frappe
from frappe.utils import getdate, today

_UNSET = object()


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


def cap_completed_on(act_end_date, completed_on_date):
	"""ISS-2026-02662: completed_on = min(today(), act_end) or today(); never future.

	Без факта act_end: пустой → today(); уже валидный (не future) — оставить.
	"""
	today_d = getdate(today())
	today_v = today()
	if completed_on_date and getdate(completed_on_date) > today_d:
		completed_on_date = today_v
	if not act_end_date:
		return completed_on_date or today_v
	candidate_d = min(today_d, getdate(act_end_date))
	candidate_v = today_v if candidate_d == today_d else act_end_date
	if not completed_on_date:
		return candidate_v
	current = getdate(completed_on_date)
	if current < candidate_d:
		return candidate_v
	return completed_on_date


def apply_task_actual_dates_logic(
	target_data,
	act_start_date,
	act_end_date,
	completed_on_date,
	fact_act_end_date=_UNSET,
):
	"""ITVT: для Completed выставить completed_on/act_end; act расширяет exp (все статусы).

	`act_end_date` — эффективный конец (факт + resolution widen) для exp / 02315.
	`fact_act_end_date` — только факт Task; от него считается completed_on (ISS-2026-02662).
	"""
	gd = getdate
	completed_from = act_end_date if fact_act_end_date is _UNSET else fact_act_end_date

	if target_data.get("status") == "Completed":
		target_data["completed_on"] = cap_completed_on(completed_from, completed_on_date)

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
