# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""
Epic-style burndown data for Task Epic Burndown report.

Hours: plan from Project Work Efforts (pwea_plan), actual from approved User Timesheet Position.
Story points / task count: Task + Task Progress History.
"""

from __future__ import annotations

import calendar
import math
from datetime import date, timedelta
from typing import Any

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Date, IfNull, Min, Sum
from frappe.utils import add_months, flt, get_datetime, getdate

UTP_STATUS_APPROVED = "Согласовано"
TASK_PERIOD_TYPES = {"phase": "Phase", "stage": "Stage", "sprint": "Sprint"}
TASK_EPIC_BURNDOWN_TASK_TYPE_UNSET = "__not_set__"


def _fallback_company_holiday_list(company: str | None = None) -> str | None:
	if not company:
		try:
			from erpnext import get_default_company

			company = get_default_company() or frappe.get_all("Company", pluck="name", limit=1)[0]
		except Exception:
			companies = frappe.get_all("Company", pluck="name", limit=1)
			company = companies[0] if companies else None
	if not company:
		return None
	return frappe.get_cached_value("Company", company, "default_holiday_list")


def _resolve_project_holiday_list(project: str) -> str | None:
	project_row = frappe.db.get_value("Project", project, ["holiday_list", "company"], as_dict=True) or {}
	return project_row.get("holiday_list") or _fallback_company_holiday_list(project_row.get("company"))


def _holiday_dates_in_range(holiday_list: str | None, from_date: date, to_date: date) -> list[str]:
	if not holiday_list:
		return []
	rows = frappe.get_all(
		"Holiday",
		filters={
			"parent": holiday_list,
			"holiday_date": ["between", [from_date, to_date]],
		},
		fields=["holiday_date"],
		order_by="holiday_date asc",
	)
	return [getdate(row["holiday_date"]).isoformat() for row in rows if row.get("holiday_date")]


_WEEKDAY_NAME_TO_INDEX = {
	"sunday": 6,
	"monday": 0,
	"tuesday": 1,
	"wednesday": 2,
	"thursday": 3,
	"friday": 4,
	"saturday": 5,
}


def _nonworking_holiday_dates_in_range(holiday_list: str | None, from_date: date, to_date: date) -> list[str]:
	"""Explicit holidays from child table plus weekly off days from Holiday List header."""
	explicit = _holiday_dates_in_range(holiday_list, from_date, to_date)
	return sorted(set(explicit))


def _fact_end_index(buckets: list[tuple[str, date, date]]) -> int:
	today = getdate()
	fact_end_idx = len(buckets) - 1
	for index, (_label, bucket_start, bucket_end) in enumerate(buckets):
		if bucket_start <= today <= bucket_end:
			return index
		if bucket_start > today:
			return index - 1 if index > 0 else -1
	return fact_end_idx


_WEIGHTED_VELOCITY_WEIGHTS_DEFAULT = [1, 2, 3, 3, 3]
_WEIGHTED_VELOCITY_WEIGHTS_DAY = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]


def _weighted_velocity(values: list[float], group_by: str | None = None) -> float:
	if not values:
		return 0.0
	is_day = (group_by or "").strip().lower() == "day"
	if is_day:
		window = values[-10:]
		weights_full = _WEIGHTED_VELOCITY_WEIGHTS_DAY
	else:
		window = values[-5:]
		weights_full = _WEIGHTED_VELOCITY_WEIGHTS_DEFAULT
	weights = weights_full[-len(window) :]
	weighted_sum = sum(value * weight for value, weight in zip(window, weights, strict=False))
	weight_total = sum(weights)
	return weighted_sum / weight_total if weight_total else 0.0


def _velocity_window_values(
	buckets: list[tuple[str, date, date]],
	completed_total: list[float],
	fact_end_idx: int,
	group_by: str,
	holiday_dates: list[str],
) -> list[float]:
	if fact_end_idx < 0:
		return []
	holiday_set = set(holiday_dates)
	values: list[float] = []
	for index in range(fact_end_idx + 1):
		label, bucket_start, _bucket_end = buckets[index]
		value = flt(completed_total[index])
		if group_by == "day":
			is_nonworking_day = label in holiday_set or bucket_start.isoformat() in holiday_set
			if is_nonworking_day and value <= 0:
				continue
		values.append(value)
	return values


def _forecast_period_unit_labels(group_by: str | None) -> tuple[str, str]:
	"""Singular and plural period unit labels for completion forecast summary."""
	key = (group_by or "").strip().lower()
	mapping: dict[str, tuple[str, str]] = {
		"day": (_("day"), _("days")),
		"week": (_("week"), _("weeks")),
		"month": (_("month"), _("months")),
		"sprint": (_("sprint"), _("sprints")),
		"stage": (_("stage"), _("stages")),
		"phase": (_("phase"), _("phases")),
	}
	return mapping.get(key, (_("period"), _("periods")))


def fiscal_month_end_date(fiscal_year: str, month_number: int) -> date | None:
	"""Last calendar day of fiscal month index (1 = first month of FY)."""
	fm = fiscal_month_start_date(fiscal_year, month_number)
	if not fm:
		return None
	_, me = month_start_end(fm)
	return me


def fiscal_month_start_date(fiscal_year: str, month_number: int) -> date | None:
	start = frappe.db.get_value("Fiscal Year", fiscal_year, "year_start_date")
	if not start:
		return None
	return getdate(add_months(start, int(month_number) - 1))


def month_start_end(d: date) -> tuple[date, date]:
	last = calendar.monthrange(d.year, d.month)[1]
	return date(d.year, d.month, 1), date(d.year, d.month, last)


def iter_month_buckets(from_date: date, to_date: date) -> list[tuple[str, date, date]]:
	out: list[tuple[str, date, date]] = []
	cur = date(from_date.year, from_date.month, 1)
	end_month = date(to_date.year, to_date.month, 1)
	while cur <= end_month:
		ms, me = month_start_end(cur)
		bs = max(ms, from_date)
		be = min(me, to_date)
		if bs <= be:
			out.append((cur.strftime("%Y-%m"), bs, be))
		if cur.month == 12:
			cur = date(cur.year + 1, 1, 1)
		else:
			cur = date(cur.year, cur.month + 1, 1)
	return out


def iter_day_buckets(from_date: date, to_date: date) -> list[tuple[str, date, date]]:
	out: list[tuple[str, date, date]] = []
	cur = from_date
	while cur <= to_date:
		out.append((cur.isoformat(), cur, cur))
		cur += timedelta(days=1)
	return out


def iter_week_buckets(from_date: date, to_date: date) -> list[tuple[str, date, date]]:
	"""One row per ISO week overlapping [from_date, to_date]."""
	out: list[tuple[str, date, date]] = []
	d = from_date
	while d <= to_date:
		iy, iw, _ = d.isocalendar()
		monday = d - timedelta(days=d.weekday())
		ws = max(monday, from_date)
		we = min(monday + timedelta(days=6), to_date)
		label = f"{iy}-W{iw:02d}"
		if not out or out[-1][0] != label:
			out.append((label, ws, we))
		d = monday + timedelta(days=7)
	return out


def _planned_start_end(row: dict) -> tuple[date | None, date | None]:
	start = row.get("exp_start_date") or row.get("custom_planned_start_date")
	end = row.get("exp_end_date") or row.get("custom_planned_end_date")
	if not start and end:
		start = end
	if start and not end:
		end = start
	return (getdate(start) if start else None, getdate(end) if end else None)


def iter_task_type_period_buckets_from_rows(
	rows: list[dict], from_date: date, to_date: date
) -> list[tuple[str, date, date]]:
	"""Build time buckets from task rows whose forecast dates overlap the report range."""
	out: list[tuple[str, date, date]] = []
	for row in rows:
		start, end = _planned_start_end(row)
		if not start or not end:
			continue
		if end < from_date or start > to_date:
			continue
		label = row.get("subject") or row.get("name")
		out.append((label, max(start, from_date), min(end, to_date)))
	return sorted(out, key=lambda x: (x[1], x[2], x[0]))


def iter_task_type_period_buckets(
	project: str, from_date: date, to_date: date, task_type: str
) -> list[tuple[str, date, date]]:
	rows = frappe.get_all(
		"Task",
		filters={"project": project, "type": task_type},
		fields=[
			"name",
			"subject",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
		],
	)
	return iter_task_type_period_buckets_from_rows(rows, from_date, to_date)


def get_period_buckets(project: str, from_date: date, to_date: date, group_by: str):
	if group_by == "day":
		return iter_day_buckets(from_date, to_date)
	if group_by == "week":
		return iter_week_buckets(from_date, to_date)
	if task_type := TASK_PERIOD_TYPES.get(group_by):
		return iter_task_type_period_buckets(project, from_date, to_date, task_type)
	return iter_month_buckets(from_date, to_date)


def _cumulative_plan_through(plan_rows: list[dict], last_day: date) -> float:
	"""Sum pwea_plan for fiscal months whose calendar month ends on or before last_day."""
	total = 0.0
	for row in plan_rows:
		fy = row.get("pwea_year")
		mn = row.get("pwea_month")
		if not fy or not mn:
			continue
		me = fiscal_month_end_date(fy, int(mn))
		if not me or me > last_day:
			continue
		total += flt(row.get("pwea_plan"))
	return total


def _load_pwe_plan_rows(project: str, task_names: list[str] | None) -> list[dict]:
	pwe = frappe.qb.DocType("Project Work Efforts")
	amount = frappe.qb.DocType("Project Work Efforts Amount")
	query = (
		frappe.qb.from_(pwe)
		.inner_join(amount)
		.on(amount.parent == pwe.name)
		.select(
			pwe.pwe_task.as_("pwe_task"),
			amount.pwea_year.as_("pwea_year"),
			amount.pwea_month.as_("pwea_month"),
			IfNull(amount.pwea_plan, 0).as_("pwea_plan"),
		)
		.where(pwe.pwe_project == project)
	)
	if task_names is not None:
		if not task_names:
			return []
		query = query.where(pwe.pwe_task.isin(task_names))
	return query.run(as_dict=True)


def _normalize_text_list(value: Any) -> list[str]:
	if value is None:
		return []
	if isinstance(value, str):
		text = value.strip()
		if not text:
			return []
		if text.startswith("["):
			try:
				parsed = frappe.parse_json(text)
			except Exception:
				parsed = None
			if parsed is not None:
				return _normalize_text_list(parsed)
		return [item.strip() for item in text.split(",") if item and item.strip()]
	if isinstance(value, (list, tuple, set)):
		return [str(item).strip() for item in value if str(item).strip()]
	return [str(value).strip()]


def _task_issue_name(task: dict[str, Any]) -> str | None:
	return task.get("issue") or task.get("custom_linked_issue")


def _issue_type_by_issue_names(issue_names: list[str]) -> dict[str, str]:
	if not issue_names:
		return {}
	rows = frappe.get_all(
		"Issue",
		filters={"name": ["in", issue_names]},
		fields=["name", "issue_type"],
		limit_page_length=max(len(issue_names), 1),
	)
	return {
		row["name"]: row.get("issue_type")
		for row in rows
		if row.get("name") and row.get("issue_type")
	}


def _task_name_list(
	project: str,
	exclude_group: bool,
	task_type_filters: list[str] | None = None,
	issue_type_filters: list[str] | None = None,
) -> list[str]:
	task_type_filters = _normalize_text_list(task_type_filters)
	issue_type_filters = _normalize_text_list(issue_type_filters)
	include_unset = TASK_EPIC_BURNDOWN_TASK_TYPE_UNSET in task_type_filters
	named_types = [
		t
		for t in task_type_filters
		if t and t != TASK_EPIC_BURNDOWN_TASK_TYPE_UNSET and t != "Sprint"
	]
	if task_type_filters and not include_unset and not named_types:
		return []

	base_filters: list[list[Any]] = [["project", "=", project]]
	if exclude_group:
		base_filters.append(["is_group", "=", 0])

	fields = ["name", "type", "issue", "custom_linked_issue"] if issue_type_filters else ["name"]

	if not task_type_filters:
		tasks = frappe.get_all("Task", filters=base_filters, fields=fields, limit_page_length=0)
	elif include_unset and not named_types:
		base_filters.append(["type", "=", ""])
		tasks = frappe.get_all("Task", filters=base_filters, fields=fields, limit_page_length=0)
	elif include_unset and named_types:
		or_filters = [["type", "in", named_types], ["type", "=", ""]]
		tasks = frappe.get_all(
			"Task",
			filters=base_filters,
			or_filters=or_filters,
			fields=fields,
			limit_page_length=0,
		)
	else:
		type_filters: list[list[Any]] = (
			[["type", "=", named_types[0]]]
			if len(named_types) == 1
			else [["type", "in", named_types]]
		)
		tasks = frappe.get_all(
			"Task",
			filters=base_filters + type_filters,
			fields=fields,
			limit_page_length=0,
		)
	if not issue_type_filters:
		return [task["name"] for task in tasks if task.get("name")]
	issue_task_rows = [task for task in tasks if task.get("type") == "Issue"]
	issue_type_by_issue = _issue_type_by_issue_names(
		sorted({_task_issue_name(task) for task in issue_task_rows if _task_issue_name(task)})
	)
	allowed_issue_types = set(issue_type_filters)
	return [
		task["name"]
		for task in tasks
		if task.get("name")
		and (
			task.get("type") != "Issue"
			or issue_type_by_issue.get(_task_issue_name(task)) in allowed_issue_types
		)
	]


def _pwe_plan_by_task(project: str, task_names: list[str] | None = None) -> dict[str, float]:
	plan_by_task: dict[str, float] = {}
	for row in _load_pwe_plan_rows(project, task_names):
		task = row.get("pwe_task")
		if not task:
			continue
		plan_by_task[task] = plan_by_task.get(task, 0.0) + flt(row.get("pwea_plan"))
	return plan_by_task


def _load_task_volume_rows(
	project: str,
	exclude_group: bool,
	measure: str,
	use_task_weight: bool = False,
	task_type_filters: list[str] | None = None,
	issue_type_filters: list[str] | None = None,
) -> list[dict]:
	task_names = _task_name_list(project, exclude_group, task_type_filters, issue_type_filters)
	if not task_names:
		return []

	fields = [
		"name",
		"creation",
		"progress",
		"status",
		"completed_on",
		"closing_date",
		"story_point",
		"task_weight",
		"exp_start_date",
		"exp_end_date",
		"custom_planned_start_date",
		"custom_planned_end_date",
	]
	tasks = frappe.get_all("Task", filters={"name": ["in", task_names]}, fields=fields)
	sp_map = _story_point_map() if measure == "story_points" else {}
	pwe_by_task = _pwe_plan_by_task(project, task_names) if measure == "hours" else {}
	hours_creation_by_task = _utp_min_date_by_task(project, task_names) if measure == "hours" else {}

	for task in tasks:
		task["volume"] = _task_volume(task, measure, sp_map, pwe_by_task, use_task_weight)
		if measure == "hours":
			created_on = getdate(task.get("creation")) if task.get("creation") else None
			utp_created_on = hours_creation_by_task.get(task.get("name"))
			task["hours_creation"] = utp_created_on if utp_created_on and (
				not created_on or utp_created_on < created_on
			) else created_on
	return tasks


@frappe.whitelist()
def get_project_task_type_options(project: str | None = None) -> list[dict[str, str]]:
	if not project:
		return []
	if not frappe.has_permission("Project", "read", project):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	rows = frappe.get_all(
		"Task",
		filters={"project": project},
		fields=["type"],
		limit_page_length=0,
	)
	has_blank_type = any(not (row.get("type") or "").strip() for row in rows)
	values = sorted({row.get("type") for row in rows if row.get("type") and row.get("type") != "Sprint"})
	out = [{"label": _(value), "value": value, "description": ""} for value in values]
	if has_blank_type:
		out.insert(
			0,
			{
				"label": _("Task type not set"),
				"value": TASK_EPIC_BURNDOWN_TASK_TYPE_UNSET,
				"description": "",
			},
		)
	return out


@frappe.whitelist()
def get_project_issue_type_options(project: str | None = None) -> list[dict[str, str]]:
	if not project:
		return []
	if not frappe.has_permission("Project", "read", project):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	issue_task_rows = frappe.get_all(
		"Task",
		filters={"project": project, "type": "Issue"},
		fields=["issue", "custom_linked_issue"],
		limit_page_length=0,
	)
	issue_names = sorted(
		{
			row.get("issue") or row.get("custom_linked_issue")
			for row in issue_task_rows
			if row.get("issue") or row.get("custom_linked_issue")
		}
	)
	values = sorted(
		{
			issue_type
			for issue_type in _issue_type_by_issue_names(issue_names).values()
			if issue_type
		}
	)
	return [{"label": _(value), "value": value, "description": ""} for value in values]


def _task_volume(
	task: dict,
	measure: str,
	sp_map: dict[str, float] | None = None,
	pwe_by_task: dict[str, float] | None = None,
	use_task_weight: bool = False,
) -> float:
	if measure == "task_count":
		if use_task_weight:
			w = flt(task.get("task_weight"))
			return w if w > 0 else 0.0
		return 1.0
	if measure == "story_points":
		story_point = task.get("story_point")
		return (sp_map or {}).get(story_point, 0.0) if story_point else 0.0
	if measure == "hours":
		return (pwe_by_task or {}).get(task.get("name"), 0.0)
	return 0.0


def _scope_start(task: dict) -> date | None:
	return _creation_date(task)


def _creation_date(task: dict) -> date | None:
	value = task.get("hours_creation") or task.get("creation")
	return getdate(value) if value else None


def _scope_end(task: dict) -> date | None:
	value = task.get("completed_on")
	return getdate(value) if value else None


def _is_completed_by(task: dict, bucket_end: date) -> bool:
	if task.get("status") != "Completed":
		return False
	completed_on = _scope_end(task)
	return bool(completed_on and completed_on <= bucket_end)


def _measure_created_scope_from_rows(tasks: list[dict], bs: date, be: date) -> float:
	return sum(flt(task.get("volume")) for task in _tasks_created_from_rows(tasks, bs, be))


def _measure_open_scope_from_rows(
	tasks: list[dict],
	bucket_end: date,
	use_progress: bool = True,
	bucket_start: date | None = None,
	progress_rows: list[dict] | None = None,
) -> float:
	total = 0.0
	for task in _tasks_open_from_rows(
		tasks,
		bucket_end,
		use_progress=use_progress,
		bucket_start=bucket_start,
		progress_rows=progress_rows,
	):
		if use_progress:
			progress = (
				_task_progress_as_of(task, progress_rows, bucket_end)
				if progress_rows is not None
				else min(max(flt(task.get("progress")), 0.0), 100.0)
			)
			total += flt(task.get("volume")) * (1.0 - progress / 100.0)
		else:
			total += flt(task.get("volume"))
	return total


def _task_progress_as_of(task: dict, progress_rows: list[dict], bucket_end: date) -> float:
	"""Best-effort progress snapshot at end of `bucket_end` from Task progress history rows.

	If there is no history row on or before `bucket_end`, treated as 0% for that date
	(rather than falling back to the task's current `progress`, which can be from
	the future relative to the burndown bucket).
	"""
	task_name = task.get("name")
	best_key: tuple | None = None
	best_progress: float = 0.0
	for row in progress_rows:
		if row.get("parent") != task_name:
			continue
		changed_on = getdate(row.get("changed_on"))
		if changed_on > bucket_end:
			continue
		key = (changed_on, get_datetime(row.get("changed_on")))
		if best_key is None or key > best_key:
			best_key = key
			best_progress = flt(row.get("new_progress"))
	if best_key is None:
		return 0.0
	return min(max(best_progress, 0.0), 100.0)


def _measure_forecast_open_baseline_from_rows(
	tasks: list[dict],
	bucket_end: date,
	use_progress: bool = True,
	progress_rows: list[dict] | None = None,
) -> float:
	"""Remaining scope at bucket end for forecasting.

	Unlike display-side `open`, this includes tasks created inside the factual bucket
	if they are still unfinished by bucket end.
	"""
	return _measure_open_scope_from_rows(
		tasks,
		bucket_end,
		use_progress=use_progress,
		bucket_start=None,
		progress_rows=progress_rows,
	)


def _measure_completed_scope_from_rows(
	tasks: list[dict], progress_rows: list[dict], bs: date, be: date, use_progress: bool = True
) -> float:
	if not use_progress:
		return sum(flt(task.get("volume")) for task in _tasks_completed_by_status_from_rows(tasks, bs, be))

	volume_by_task = {task.get("name"): flt(task.get("volume")) for task in tasks}
	total = 0.0
	for row in progress_rows:
		changed_on = getdate(row.get("changed_on"))
		if changed_on < bs or changed_on > be:
			continue
		delta = flt(row.get("new_progress")) - flt(row.get("old_progress"))
		if delta <= 0:
			continue
		total += volume_by_task.get(row.get("parent"), 0.0) * delta / 100.0
	return total


def _measure_created_and_completed_scope_from_rows(
	tasks: list[dict], progress_rows: list[dict], bs: date, be: date, use_progress: bool = True
) -> float:
	created_tasks = _tasks_created_from_rows(tasks, bs, be)
	if not created_tasks:
		return 0.0
	return _measure_completed_scope_from_rows(created_tasks, progress_rows, bs, be, use_progress=use_progress)


def _tasks_created_from_rows(tasks: list[dict], bs: date, be: date) -> list[dict]:
	return [task for task in tasks if (created_on := _creation_date(task)) and bs <= created_on <= be]


def _tasks_open_from_rows(
	tasks: list[dict],
	bucket_end: date,
	use_progress: bool = True,
	bucket_start: date | None = None,
	progress_rows: list[dict] | None = None,
) -> list[dict]:
	out = []
	for task in tasks:
		created_on = _creation_date(task)
		if created_on:
			if created_on > bucket_end:
				continue
			if bucket_start and bucket_start <= created_on <= bucket_end:
				continue
		start = _scope_start(task)
		if not start or start > bucket_end:
			continue
		if use_progress:
			if progress_rows is not None:
				progress = _task_progress_as_of(task, progress_rows, bucket_end)
			else:
				progress = min(max(flt(task.get("progress")), 0.0), 100.0)
			if progress < 100.0:
				out.append(task)
		elif not _is_completed_by(task, bucket_end):
			out.append(task)
	return out


def _tasks_completed_by_status_from_rows(tasks: list[dict], bs: date, be: date) -> list[dict]:
	out = []
	for task in tasks:
		if task.get("status") != "Completed":
			continue
		completed_on = _scope_end(task)
		if completed_on and bs <= completed_on <= be:
			out.append(task)
	return out


def _tasks_created_and_completed_from_rows(tasks: list[dict], bs: date, be: date) -> list[dict]:
	created_task_names = {task.get("name") for task in _tasks_created_from_rows(tasks, bs, be)}
	if not created_task_names:
		return []
	return [
		task
		for task in _tasks_completed_by_status_from_rows(tasks, bs, be)
		if task.get("name") in created_task_names
	]


def _task_names_created_from_rows(tasks: list[dict], bs: date, be: date) -> list[str]:
	return [task["name"] for task in _tasks_created_from_rows(tasks, bs, be)]


def _task_names_open_from_rows(
	tasks: list[dict],
	bucket_end: date,
	use_progress: bool = True,
	bucket_start: date | None = None,
	progress_rows: list[dict] | None = None,
) -> list[str]:
	return [
		task["name"]
		for task in _tasks_open_from_rows(
			tasks,
			bucket_end,
			use_progress=use_progress,
			bucket_start=bucket_start,
			progress_rows=progress_rows,
		)
	]


def _discrete_forecast_bucket_completion(tasks: list[dict], capacity: float) -> tuple[list[dict], float]:
	if capacity <= 0 or not tasks:
		return list(tasks), 0.0
	remaining_capacity = flt(capacity)
	selected_names: set[str] = set()
	completed_total = 0.0
	ordered_tasks = sorted(
		tasks,
		key=lambda task: (
			flt(task.get("volume")),
			getdate(created_on) if (created_on := _creation_date(task)) else date.max,
			str(task.get("name") or ""),
		),
	)
	for task in ordered_tasks:
		volume = flt(task.get("volume"))
		if volume <= 0:
			continue
		if volume <= remaining_capacity + 1e-9:
			selected_names.add(task.get("name"))
			completed_total += volume
			remaining_capacity = max(0.0, remaining_capacity - volume)
	remaining_tasks = [task for task in tasks if task.get("name") not in selected_names]
	return remaining_tasks, completed_total


def _task_names_completed_from_rows(
	tasks: list[dict],
	progress_rows: list[dict],
	bs: date,
	be: date,
	use_progress: bool = True,
) -> list[str]:
	if not use_progress:
		return [task["name"] for task in _tasks_completed_by_status_from_rows(tasks, bs, be)]
	changed = []
	for row in progress_rows:
		changed_on = getdate(row.get("changed_on"))
		if bs <= changed_on <= be and flt(row.get("new_progress")) > flt(row.get("old_progress")):
			changed.append(row.get("parent"))
	return sorted({name for name in changed if name})


def _task_names_created_and_completed_from_rows(
	tasks: list[dict],
	progress_rows: list[dict],
	bs: date,
	be: date,
	use_progress: bool = True,
) -> list[str]:
	created_task_names = {task["name"] for task in _tasks_created_from_rows(tasks, bs, be)}
	if not created_task_names:
		return []
	if not use_progress:
		return [task["name"] for task in _tasks_created_and_completed_from_rows(tasks, bs, be)]

	changed = []
	for row in progress_rows:
		changed_on = getdate(row.get("changed_on"))
		parent = row.get("parent")
		if parent not in created_task_names:
			continue
		if bs <= changed_on <= be and flt(row.get("new_progress")) > flt(row.get("old_progress")):
			changed.append(parent)
	return sorted({name for name in changed if name})


def _load_progress_rows(task_names: list[str], fd: date, td: date) -> list[dict]:
	if not task_names:
		return []
	history = frappe.qb.DocType("Task Progress History")
	return (
		frappe.qb.from_(history)
		.select(
			history.parent,
			history.changed_on,
			IfNull(history.old_progress, 0).as_("old_progress"),
			IfNull(history.new_progress, 0).as_("new_progress"),
		)
		.where(history.parent.isin(task_names))
		.where(Date(history.changed_on).between(fd, td))
		.run(as_dict=True)
	)


def _task_earliest_progress_change_date(task_name: str | None) -> date | None:
	if not task_name:
		return None
	history = frappe.qb.DocType("Task Progress History")
	rows = (
		frappe.qb.from_(history)
		.select(Min(Date(history.changed_on)).as_("min_changed_on"))
		.where(history.parent == task_name)
		.run(as_dict=True)
	)
	value = rows[0].get("min_changed_on") if rows else None
	return getdate(value) if value else None


def _progress_history_start_for_tasks(tasks: list[dict], fallback_start: date) -> date:
	start_candidates = [getdate(created_on) for task in tasks if (created_on := _creation_date(task))]
	return min(start_candidates) if start_candidates else fallback_start


def _period_progress_series(
	buckets: list[tuple[str, date, date]], progress_rows: list[dict], current_progress: float | int | None
) -> list[float]:
	rows = sorted(progress_rows, key=lambda row: get_datetime(row.get("changed_on")))
	series: list[float] = []
	last_progress = 0.0
	row_index = 0
	for _label, _bs, bucket_end in buckets:
		progress_changed_in_bucket = False
		while row_index < len(rows) and getdate(rows[row_index].get("changed_on")) <= bucket_end:
			last_progress = min(max(flt(rows[row_index].get("new_progress")), 0.0), 100.0)
			progress_changed_in_bucket = True
			row_index += 1
		if row_index >= len(rows) and not progress_changed_in_bucket and current_progress is not None:
			last_progress = min(max(flt(current_progress), 0.0), 100.0)
		series.append(last_progress)
	return series


def _task_actual_progress_series(
	buckets: list[tuple[str, date, date]],
	progress_rows: list[dict],
	task_start: date | None,
	completed_on: date | None = None,
) -> list[float | None]:
	if not task_start:
		return []
	rows = sorted(progress_rows, key=lambda row: get_datetime(row.get("changed_on")))
	last_change_date = getdate(rows[-1].get("changed_on")) if rows else task_start
	series_end = max(last_change_date, getdate())
	completion = getdate(completed_on) if completed_on else None
	if completion and completion < task_start:
		completion = None
	factual_end = max(completion, last_change_date) if completion is not None else None
	last_progress = 0.0
	row_index = 0
	series: list[float | None] = []
	for _label, bucket_start, bucket_end in buckets:
		if bucket_end < task_start:
			series.append(None)
			continue
		if completion is not None:
			if bucket_start > factual_end:
				series.append(None)
				continue
			row_cutoff = min(bucket_end, factual_end)
		else:
			if bucket_end > series_end:
				series.append(None)
				continue
			row_cutoff = bucket_end
		while row_index < len(rows) and getdate(rows[row_index].get("changed_on")) <= row_cutoff:
			last_progress = min(max(flt(rows[row_index].get("new_progress")), 0.0), 100.0)
			row_index += 1
		series.append(last_progress)
	return series


def _planned_progress_series(
	buckets: list[tuple[str, date, date]], planned_start: date | None, planned_end: date | None
) -> list[float | None]:
	if not planned_start or not planned_end:
		return []
	if planned_end < planned_start:
		planned_start, planned_end = planned_end, planned_start
	total_days = max((planned_end - planned_start).days, 1)
	series: list[float | None] = []
	reached_completion = False
	for _label, _bs, bucket_end in buckets:
		if reached_completion:
			series.append(None)
			continue
		if bucket_end < planned_start:
			series.append(None)
			continue
		if bucket_end >= planned_end:
			series.append(100.0)
			reached_completion = True
			continue
		elapsed_days = (bucket_end - planned_start).days
		series.append(round(min(max(elapsed_days / total_days * 100.0, 0.0), 100.0), 1))
	return series


def _task_widget_planned_dates(row: dict) -> tuple[date | None, date | None]:
	start = row.get("custom_planned_start_date")
	end = row.get("custom_planned_end_date")
	return (getdate(start) if start else None, getdate(end) if end else None)


def _task_progress_history_start_date(row: dict) -> date | None:
	starts = [
		row.get("actual_start_date"),
		row.get("exp_start_date"),
		row.get("custom_planned_start_date"),
	]
	dates = [getdate(value) for value in starts if value]
	return min(dates) if dates else None


def _task_forecast_max_date(row: dict, planned_start: date | None, planned_end: date | None) -> date | None:
	starts = [
		planned_start,
		row.get("actual_start_date"),
		row.get("exp_start_date"),
	]
	ends = [
		planned_end,
		row.get("actual_end_date"),
		row.get("completed_on"),
		row.get("closing_date"),
		row.get("exp_end_date"),
	]
	start_dates = [getdate(value) for value in starts if value]
	end_dates = [getdate(value) for value in ends if value]
	if not start_dates or not end_dates:
		return None
	base_start = min(start_dates)
	base_end = max(end_dates)
	if base_end < base_start:
		base_start, base_end = base_end, base_start
	return base_end + timedelta(days=max((base_end - base_start).days, 0))


def _forecast_target_date(buckets: list[tuple[str, date, date]], target_index: int) -> date | None:
	if target_index < len(buckets):
		return buckets[target_index][2]
	if not buckets:
		return None
	if len(buckets) >= 2:
		period_days = max((buckets[-1][2] - buckets[-2][2]).days, 1)
	else:
		period_days = 7
	return buckets[-1][2] + timedelta(days=period_days * (target_index - len(buckets) + 1))


def _extended_forecast_bucket_label(
	group_by: str,
	buckets: list[tuple[str, date, date]],
	target_index: int,
	target_date: date | None,
) -> str:
	"""X-axis label for buckets past the original range (replaces generic Forecast N when possible)."""
	if target_date is None:
		return _("Forecast {0}").format(target_index - len(buckets) + 1)
	g = (group_by or "week").strip().lower()
	if g == "day":
		return target_date.isoformat()
	if g == "month":
		first = date(target_date.year, target_date.month, 1)
		return first.strftime("%Y-%m")
	if g == "week":
		iy, iw, _ = target_date.isocalendar()
		return f"{iy}-W{iw:02d}"
	return _("Forecast {0}").format(target_index - len(buckets) + 1)


def _forecast_progress_to_completion(
	buckets: list[tuple[str, date, date]],
	factual_progress: list[float | None],
	forecast_start_date: date | None = None,
	max_forecast_date: date | None = None,
	group_by: str = "week",
) -> dict[str, Any]:
	points = [
		(index, flt(value))
		for index, value in enumerate(factual_progress)
		if value is not None and 0.0 <= flt(value) < 100.0
	]
	if len(points) < 2:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}

	x_mean = sum(index for index, _value in points) / len(points)
	y_mean = sum(value for _index, value in points) / len(points)
	denominator = sum((index - x_mean) ** 2 for index, _value in points)
	if denominator <= 0:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}

	velocity = sum((index - x_mean) * (value - y_mean) for index, value in points) / denominator
	if velocity <= 0:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}
	intercept = y_mean - velocity * x_mean

	categories = [bucket[0] for bucket in buckets]
	baseline_index = points[0][0]
	if forecast_start_date:
		forecast_start = getdate(forecast_start_date)
		for index, (_label, bucket_start, bucket_end) in enumerate(buckets):
			if bucket_start <= forecast_start <= bucket_end:
				baseline_index = index
				break
	series: list[float | None] = [None] * max(baseline_index, 0)
	completion_date = None
	offset = 0
	while True:
		target_index = baseline_index + offset
		target_date = _forecast_target_date(buckets, target_index)
		if max_forecast_date and target_date and target_date > max_forecast_date:
			break
		if target_index >= len(categories):
			categories.append(_extended_forecast_bucket_label(group_by, buckets, target_index, target_date))
		current = min(max(intercept + velocity * target_index, 0.0), 100.0)
		series.append(round(current, 1))
		if current >= 100.0:
			completion_date = target_date
			break
		offset += 1

	if completion_date is None:
		completion_date = None
	return {"categories": categories[: len(series)], "series": series, "completion_date": completion_date}


def _hours_forecast_points(hours_by_role: list[dict[str, Any]], planned_hours: float) -> list[tuple[int, float]]:
	if planned_hours <= 0:
		return []
	length = max((len(row.get("values", [])) for row in hours_by_role), default=0)
	points: list[tuple[int, float]] = []
	cumulative = 0.0
	for index in range(length):
		bucket_hours = 0.0
		for row in hours_by_role:
			values = row.get("values") or []
			bucket_hours += flt(values[index] if index < len(values) else 0)
		cumulative += bucket_hours
		if bucket_hours > 0:
			value = min(cumulative / planned_hours * 100.0, 100.0)
			if value < 100.0:
				points.append((index, value))
	return points


def _forecast_hours_to_plan(
	buckets: list[tuple[str, date, date]],
	hours_by_role: list[dict[str, Any]],
	planned_hours: float,
	max_forecast_date: date | None = None,
	group_by: str = "week",
) -> dict[str, Any]:
	points = _hours_forecast_points(hours_by_role, planned_hours)
	if len(points) < 2:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}

	x_mean = sum(index for index, _value in points) / len(points)
	y_mean = sum(value for _index, value in points) / len(points)
	denominator = sum((index - x_mean) ** 2 for index, _value in points)
	if denominator <= 0:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}

	velocity = sum((index - x_mean) * (value - y_mean) for index, value in points) / denominator
	if velocity <= 0:
		return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}
	intercept = y_mean - velocity * x_mean

	categories = [bucket[0] for bucket in buckets]
	baseline_index = points[0][0]
	series: list[float | None] = [None] * max(baseline_index, 0)
	completion_date = None
	offset = 0
	while True:
		target_index = baseline_index + offset
		target_date = _forecast_target_date(buckets, target_index)
		if max_forecast_date and target_date and target_date > max_forecast_date:
			break
		if target_index >= len(categories):
			categories.append(_extended_forecast_bucket_label(group_by, buckets, target_index, target_date))
		current = min(max(intercept + velocity * target_index, 0.0), 100.0)
		series.append(round(current, 1))
		if current >= 100.0:
			completion_date = target_date
			break
		offset += 1
	return {"categories": categories[: len(series)], "series": series, "completion_date": completion_date}


def _timesheet_role_series_from_rows(
	buckets: list[tuple[str, date, date]], rows: list[dict]
) -> list[dict[str, Any]]:
	role_totals: dict[str, list[float]] = {}
	for row in rows:
		role = row.get("project_role") or _("No role")
		values = role_totals.setdefault(role, [0.0] * len(buckets))
		row_date = getdate(row.get("date"))
		for index, (_label, bucket_start, bucket_end) in enumerate(buckets):
			if bucket_start <= row_date <= bucket_end:
				values[index] += flt(row.get("hours"))
				break
	return [{"role": role, "values": values} for role, values in sorted(role_totals.items())]


def _task_tree_names_from_rows(task: str, rows: list[dict]) -> list[str]:
	children_by_parent: dict[str, list[str]] = {}
	for row in rows:
		parent = row.get("parent_task")
		name = row.get("name")
		if parent and name:
			children_by_parent.setdefault(parent, []).append(name)

	out = [task]

	def append_children(parent: str):
		for child in sorted(children_by_parent.get(parent, [])):
			out.append(child)
			append_children(child)

	append_children(task)
	return out


def _task_child_names(project: str | None, task: str) -> list[str]:
	if not project or not task:
		return []
	return frappe.db.get_all(
		"Task",
		filters={"project": project},
		fields=["name", "parent_task"],
		limit=0,
	)


def _task_tree_names(project: str | None, task: str) -> list[str]:
	return _task_tree_names_from_rows(task, _task_child_names(project, task))


def _project_limits(project: str | None) -> dict[str, float | None]:
	if not project:
		return {"warning": None, "block": None, "message": None}
	rows = frappe.db.get_all(
		"Limit Control",
		filters={"parent": project, "parenttype": "Project"},
		fields=["type", "limit"],
	)

	def parse(limit_type: str) -> float | None:
		for row in rows:
			if (row.get("type") or "").strip().lower() == limit_type:
				value = flt(row.get("limit"))
				return value if value > 0 else None
		return None

	return {
		"warning": parse("предупреждение"),
		"block": parse("блокировка"),
		"message": parse("уведомление"),
	}


def _planned_hours_by_role(project: str | None, task: str) -> dict[str, float]:
	if not project or not task:
		return {}
	pwe = frappe.qb.DocType("Project Work Efforts")
	amount = frappe.qb.DocType("Project Work Efforts Amount")
	out: dict[str, float] = {}
	current = task
	while current:
		out = _planned_hours_by_role_for_task(project, current, pwe, amount)
		if out:
			return out
		current = frappe.db.get_value("Task", current, "parent_task")
	return {}


def _planned_hours_by_role_for_task(
	project: str,
	task: str,
	pwe: Any | None = None,
	amount: Any | None = None,
) -> dict[str, float]:
	pwe = pwe or frappe.qb.DocType("Project Work Efforts")
	amount = amount or frappe.qb.DocType("Project Work Efforts Amount")
	rows = (
		frappe.qb.from_(pwe)
		.inner_join(amount)
		.on(amount.parent == pwe.name)
		.select(
			pwe.pwe_project_role.as_("role"),
			Sum(IfNull(amount.pwea_plan, 0)).as_("planned_hours"),
		)
		.where(pwe.pwe_project == project)
		.where(pwe.pwe_task == task)
		.groupby(pwe.pwe_project_role)
		.run(as_dict=True)
	)
	out: dict[str, float] = {}
	for row in rows:
		role = row.get("role") or _("No role")
		planned = flt(row.get("planned_hours"))
		if planned > 0:
			out[role] = planned
	return out


def _add_hours_by_role(target: dict[str, float], source: dict[str, float]) -> None:
	for role, planned in source.items():
		target[role] = target.get(role, 0.0) + flt(planned)


def _child_tree_planned_hours_by_role(project: str | None, task: str) -> dict[str, float]:
	if not project or not task:
		return {}
	rows = _task_child_names(project, task)
	children_by_parent: dict[str, list[str]] = {}
	for row in rows:
		parent = row.get("parent_task")
		name = row.get("name")
		if parent and name:
			children_by_parent.setdefault(parent, []).append(name)

	pwe = frappe.qb.DocType("Project Work Efforts")
	amount = frappe.qb.DocType("Project Work Efforts Amount")
	visited: set[str] = set()

	def planned_for_descendants(parent: str) -> dict[str, float]:
		if parent in visited:
			return {}
		visited.add(parent)
		out: dict[str, float] = {}
		for child in sorted(children_by_parent.get(parent, [])):
			child_plan = _planned_hours_by_role_for_task(project, child, pwe, amount)
			if child_plan:
				_add_hours_by_role(out, child_plan)
			else:
				_add_hours_by_role(out, planned_for_descendants(child))
		return out

	return planned_for_descendants(task)


def _total_hours(hours_by_role: list[dict[str, Any]]) -> float:
	return sum(sum(flt(value) for value in row.get("values", [])) for row in hours_by_role)


def _timesheet_limit_bands(
	planned_hours_by_role: dict[str, float],
	hours_by_role: list[dict[str, Any]],
	project_limits: dict[str, float | None],
	scale_planned_hours: float | None = None,
) -> dict[str, Any]:
	planned_hours = sum(flt(value) for value in planned_hours_by_role.values())
	actual_hours = _total_hours(hours_by_role)
	scale_hours = flt(scale_planned_hours) if scale_planned_hours else planned_hours
	if planned_hours <= 0:
		return {
			"planned_hours": 0.0,
			"actual_hours": round(actual_hours, 1),
			"scale_planned_hours": round(scale_hours, 1),
			"warning_limit_hours": None,
			"block_limit_hours": None,
			"axis_max": round(max(scale_hours * 1.1, actual_hours * 1.1), 1) if scale_hours > 0 else None,
			"bands": [],
		}

	warning = flt(project_limits.get("warning")) if project_limits.get("warning") else None
	block = flt(project_limits.get("block")) if project_limits.get("block") else None
	warning_hours = round(planned_hours * warning / 100.0, 1) if warning else None
	block_hours = round(planned_hours * block / 100.0, 1) if block else None
	bands: list[dict[str, Any]] = []

	if warning_hours and block_hours:
		axis_max = max(block_hours * 1.2, actual_hours * 1.1)
		bands = [
			{"name": _("Within warning limit"), "color": "green", "from": 0.0, "to": warning_hours},
			{"name": _("Warning limit"), "color": "yellow", "from": warning_hours, "to": block_hours},
			{"name": _("Block limit"), "color": "red", "from": block_hours, "to": round(axis_max, 1)},
		]
	elif warning_hours:
		axis_max = max(planned_hours * 1.2, actual_hours * 1.1)
		bands = [
			{"name": _("Within warning limit"), "color": "green", "from": 0.0, "to": warning_hours},
			{"name": _("Warning limit"), "color": "yellow", "from": warning_hours, "to": round(axis_max, 1)},
		]
	elif block_hours:
		axis_max = max(block_hours * 1.2, actual_hours * 1.1)
		bands = [
			{"name": _("Plan"), "color": "green", "from": 0.0, "to": planned_hours},
			{"name": _("Block limit"), "color": "red", "from": block_hours, "to": round(axis_max, 1)},
		]
	else:
		axis_max = max(planned_hours * 1.2, actual_hours * 1.1)
		bands = [
			{"name": _("Plan"), "color": "green", "from": 0.0, "to": planned_hours},
			{"name": _("Warning"), "color": "yellow", "from": planned_hours, "to": round(axis_max, 1)},
		]

	return {
		"planned_hours": round(planned_hours, 1),
		"actual_hours": round(actual_hours, 1),
		"scale_planned_hours": round(scale_hours, 1),
		"warning_limit_hours": warning_hours,
		"block_limit_hours": block_hours,
		"axis_max": round(axis_max, 1),
		"bands": bands,
		"planned_hours_by_role": planned_hours_by_role,
	}


def _load_task_timesheet_role_rows(task_names: list[str], date_from: date, date_to: date) -> list[dict]:
	if not task_names:
		return []
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	return (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(
			utp.project_role,
			detail.date,
			Sum(IfNull(detail.hours, 0)).as_("hours"),
		)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.where(utp.document_name.isin(task_names))
		.where(detail.date.between(date_from, date_to))
		.groupby(utp.project_role, detail.date)
		.orderby(utp.project_role)
		.orderby(detail.date)
		.run(as_dict=True)
	)


def _date_marker(label: str, value: Any, marker_type: str) -> dict[str, Any] | None:
	if not value:
		return None
	return {"label": label, "date": str(getdate(value)), "type": marker_type}


def _task_actual_or_forecast_date_markers(task_row: dict, forecast: dict[str, Any]) -> list[dict[str, Any]]:
	actual_start = task_row.get("actual_start_date")
	expected_start = task_row.get("exp_start_date")
	actual_end = task_row.get("actual_end_date") or task_row.get("completed_on") or task_row.get("closing_date")
	markers = [
		_date_marker(_("Actual start"), actual_start, "actual_start")
		if actual_start
		else _date_marker(_("Expected start"), expected_start, "expected_start"),
	]
	if actual_end:
		markers.append(_date_marker(_("Actual end"), actual_end, "actual_end"))
	else:
		markers.append(_date_marker(_("Expected end"), task_row.get("exp_end_date"), "expected_end"))
	markers.append(
		_date_marker(_("Progress forecast end"), forecast.get("completion_date"), "forecast_progress_end")
	)
	return [marker for marker in markers if marker]


def _current_date_marker(buckets: list[tuple[str, date, date]]) -> dict[str, Any] | None:
	today = getdate()
	bucket_label = _bucket_label_for_date(buckets, today)
	if not bucket_label:
		return None
	return {"label": _("Today"), "date": str(today), "type": "today", "bucket_label": bucket_label}


def _bucket_label_for_date(buckets: list[tuple[str, date, date]], value: Any) -> str | None:
	if not value:
		return None
	d = getdate(value)
	for label, bucket_start, bucket_end in buckets:
		if bucket_start <= d <= bucket_end:
			return label
	return None


def _add_marker_bucket_labels(markers: list[dict[str, Any]], buckets: list[tuple[str, date, date]]) -> list[dict[str, Any]]:
	out = []
	for marker in markers:
		bucket_label = _bucket_label_for_date(buckets, marker.get("date"))
		if not bucket_label:
			continue
		enriched = marker.copy()
		enriched["bucket_label"] = bucket_label
		out.append(enriched)
	return out


def _task_trend_fields() -> list[str]:
	meta = frappe.get_meta("Task")
	candidates = [
		"name",
		"subject",
		"project",
		"progress",
		"exp_start_date",
		"exp_end_date",
		"custom_planned_start_date",
		"custom_planned_end_date",
		"actual_start_date",
		"actual_end_date",
		"completed_on",
		"closing_date",
		"type",
		"is_group",
		"is_milestone",
	]
	return [field for field in candidates if field == "name" or meta.has_field(field)]


def _task_trend_forecasts_suppressed(task_row: dict) -> bool:
	"""When task is fully complete, progress and hours forecast lines are not meaningful."""
	return min(max(flt(task_row.get("progress")), 0.0), 100.0) >= 100.0


def _empty_axis_forecast_for_buckets(buckets: list[tuple[str, date, date]]) -> dict[str, Any]:
	"""Same shape as early exits from _forecast_progress_to_completion / _forecast_hours_to_plan."""
	return {"categories": [bucket[0] for bucket in buckets], "series": [], "completion_date": None}


def _day_category_date_range(*category_lists: list[str] | None, fallback: tuple[date, date]) -> tuple[date, date]:
	"""Daily trend can extend past `buckets`; derive the full rendered axis range from category labels."""
	parsed: list[date] = []
	for labels in category_lists:
		for label in labels or []:
			if not label:
				continue
			try:
				parsed.append(getdate(label))
			except Exception:
				continue
	if not parsed:
		return fallback
	return min(parsed), max(parsed)


def _iter_time_buckets(group_by: str, fd: date, td: date) -> list[tuple[str, date, date]]:
	if group_by == "day":
		return iter_day_buckets(fd, td)
	if group_by == "month":
		return iter_month_buckets(fd, td)
	return iter_week_buckets(fd, td)


def _trend_axis_end(
	candidate_dates: list[date | None],
	max_forecast_date: date | None = None,
) -> date:
	valid_dates = [getdate(value) for value in candidate_dates if value]
	if not valid_dates:
		base_end = getdate()
	else:
		base_end = max(valid_dates)
	return min(base_end, max_forecast_date) if max_forecast_date else base_end


@frappe.whitelist()
def get_task_progress_trend(task: str | None = None, group_by: str = "week") -> dict[str, Any]:
	if not task:
		frappe.throw(_("Task is required"))
	if not frappe.has_permission("Task", "read", task):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	task_row = frappe.db.get_value(
		"Task",
		task,
		_task_trend_fields(),
		as_dict=True,
	)
	if not task_row:
		frappe.throw(_("Task not found"))

	planned_start, planned_end = _task_widget_planned_dates(task_row)
	history_start = _task_progress_history_start_date(task_row)
	earliest_progress_change = _task_earliest_progress_change_date(task)
	group_by = (group_by or "week").lower()
	daily_zero_progress_baseline = (
		earliest_progress_change - timedelta(days=1)
		if group_by == "day" and earliest_progress_change
		else earliest_progress_change
	)
	progress_window_start_candidates = [value for value in (history_start, earliest_progress_change) if value]
	progress_window_start = (
		min(progress_window_start_candidates) if progress_window_start_candidates else add_months(getdate(), -6)
	)
	progress_rows = _load_progress_rows([task], progress_window_start, add_months(getdate(), 6))
	all_dates = [getdate(row.get("changed_on")) for row in progress_rows]
	for candidate in (
		daily_zero_progress_baseline,
		planned_start,
		planned_end,
		task_row.get("actual_start_date") or task_row.get("exp_start_date"),
		task_row.get("exp_end_date"),
		task_row.get("actual_end_date") or task_row.get("completed_on") or task_row.get("closing_date"),
	):
		if candidate:
			all_dates.append(getdate(candidate))
	if not all_dates:
		all_dates.append(getdate())
	fd = min(all_dates)
	max_forecast_date = _task_forecast_max_date(task_row, planned_start, planned_end)
	if group_by not in {"day", "month", "week"}:
		group_by = "week"
	td = _trend_axis_end(all_dates, max_forecast_date=max_forecast_date)
	buckets = _iter_time_buckets(group_by, fd, td)
	task_start_candidates = [value for value in (history_start, daily_zero_progress_baseline) if value]
	task_start = min(task_start_candidates) if task_start_candidates else None
	actual_progress_completion = getdate(task_row["completed_on"]) if task_row.get("completed_on") else None
	skip_forecasts = _task_trend_forecasts_suppressed(task_row)
	task_names_for_hours = _task_tree_names(task_row.get("project"), task)
	planned_hours_by_role = _planned_hours_by_role(task_row.get("project"), task)
	scale_planned_hours_by_role = (
		planned_hours_by_role
		if planned_hours_by_role
		else _child_tree_planned_hours_by_role(task_row.get("project"), task)
	)
	scale_planned_hours = sum(flt(value) for value in scale_planned_hours_by_role.values())
	project_limits = _project_limits(task_row.get("project"))
	def _build_trend_state(
		current_buckets: list[tuple[str, date, date]],
	) -> tuple[list[float | None], list[float | None], dict[str, Any], list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
		factual_state = _task_actual_progress_series(
			current_buckets, progress_rows, task_start, completed_on=actual_progress_completion
		)
		planned_state = _planned_progress_series(current_buckets, planned_start, planned_end)
		forecast_state = (
			_empty_axis_forecast_for_buckets(current_buckets)
			if skip_forecasts
			else _forecast_progress_to_completion(
				current_buckets,
				factual_state,
				max_forecast_date=max_forecast_date,
				group_by=group_by,
			)
		)
		hours_by_role_state = _timesheet_role_series_from_rows(
			current_buckets,
			_load_task_timesheet_role_rows(task_names_for_hours, current_buckets[0][1], current_buckets[-1][2])
			if current_buckets
			else [],
		)
		timesheet_limits_state = _timesheet_limit_bands(
			planned_hours_by_role,
			hours_by_role_state,
			project_limits,
			scale_planned_hours=scale_planned_hours,
		)
		hours_forecast_state = (
			_empty_axis_forecast_for_buckets(current_buckets)
			if skip_forecasts
			else _forecast_hours_to_plan(
				current_buckets,
				hours_by_role_state,
				flt(timesheet_limits_state.get("planned_hours")),
				max_forecast_date=max_forecast_date,
				group_by=group_by,
			)
		)
		return (
			factual_state,
			planned_state,
			forecast_state,
			hours_by_role_state,
			timesheet_limits_state,
			hours_forecast_state,
		)

	factual, planned, forecast, hours_by_role, timesheet_limits, hours_forecast = _build_trend_state(buckets)
	td_candidates: list[date | None] = [
		getdate(progress_rows[-1].get("changed_on")) if progress_rows else None,
		planned_end,
		task_row.get("actual_end_date"),
		task_row.get("exp_end_date"),
		task_row.get("completed_on"),
		task_row.get("closing_date"),
		forecast.get("completion_date"),
		hours_forecast.get("completion_date"),
	]
	final_td = _trend_axis_end(td_candidates, max_forecast_date=max_forecast_date)
	if final_td > td:
		td = final_td
		buckets = _iter_time_buckets(group_by, fd, td)
		factual, planned, forecast, hours_by_role, timesheet_limits, hours_forecast = _build_trend_state(buckets)

	raw_date_markers = [
		marker
		for marker in [
			_date_marker(_("Planned start"), planned_start, "planned_start"),
			_date_marker(_("Planned end"), planned_end, "planned_end"),
			*_task_actual_or_forecast_date_markers(task_row, forecast),
			_date_marker(_("Work hours forecast end"), hours_forecast.get("completion_date"), "forecast_work_hours_end"),
			_current_date_marker(buckets),
		]
		if marker
	]
	date_markers = _add_marker_bucket_labels(raw_date_markers, buckets)

	holiday_list_name: str | None = None
	holiday_dates: list[str] = []
	if group_by == "day" and buckets:
		bs0, be0 = _day_category_date_range(
			[bucket[0] for bucket in buckets],
			forecast.get("categories"),
			hours_forecast.get("categories"),
			fallback=(buckets[0][1], buckets[-1][2]),
		)
		project_name = task_row.get("project")
		if project_name:
			holiday_list_name = _resolve_project_holiday_list(project_name)
		else:
			holiday_list_name = _fallback_company_holiday_list(None)
		if holiday_list_name:
			holiday_dates = _nonworking_holiday_dates_in_range(holiday_list_name, bs0, be0)

	return {
		"task": task,
		"subject": task_row.get("subject"),
		"group_by": group_by,
		"categories": [bucket[0] for bucket in buckets],
		"bucket_dates": [{"label": label, "start": str(start), "end": str(end)} for label, start, end in buckets],
		"progress": {
			"series": [
				{
					"id": "actual_progress",
					"label": _("Actual progress"),
					"kind": "line",
					"line_style": "solid",
					"values": factual,
				},
				{
					"id": "planned_progress",
					"label": _("Planned progress"),
					"kind": "line",
					"line_style": "dashed",
					"values": planned,
				},
				{
					"id": "forecast_progress",
					"label": _("Forecast progress"),
					"kind": "line",
					"line_style": "dotted",
					"values": forecast.get("series"),
					"categories": forecast.get("categories"),
				},
			],
			# Backward-compatible aliases for the first widget implementation.
			"factual": factual,
			"planned": planned,
			"forecast_categories": forecast.get("categories"),
			"forecast": forecast.get("series"),
		},
		"hours_by_role": hours_by_role,
		"hours_forecast": {
			"id": "forecast_work_hours",
			"label": _("Forecast work hours"),
			"kind": "line",
			"line_style": "dotted",
			"values": hours_forecast.get("series"),
			"categories": hours_forecast.get("categories"),
			"completion_date": str(hours_forecast.get("completion_date"))
			if hours_forecast.get("completion_date")
			else None,
		},
		"timesheet_limits": timesheet_limits,
		"date_markers": date_markers,
		"holiday_list_name": holiday_list_name,
		"holiday_dates": holiday_dates,
		"is_milestone": bool(
			int(flt(task_row.get("is_group")))
			or int(flt(task_row.get("is_milestone")))
			or task_row.get("type") == "Milestone"
		),
	}


def _utp_sum_hours(
	project: str, date_from: date, date_to: date, task_names: list[str] | None
) -> float:
	if task_names is not None and not task_names:
		return 0.0
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	query = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(Sum(IfNull(detail.hours, 0)).as_("hours"))
		.where(utp.project == project)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.where(detail.date.between(date_from, date_to))
	)
	if task_names is not None:
		query = query.where(utp.document_name.isin(task_names))
	row = query.run(as_dict=True)
	return flt(row[0].hours) if row else 0.0


def _utp_hours_by_task(
	project: str, date_from: date, date_to: date, task_names: list[str] | None
) -> dict[str, float]:
	if task_names is not None and not task_names:
		return {}
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	query = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(
			utp.document_name.as_("task_name"),
			Sum(IfNull(detail.hours, 0)).as_("hours"),
		)
		.where(utp.project == project)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.where(detail.date.between(date_from, date_to))
		.groupby(utp.document_name)
	)
	if task_names is not None:
		query = query.where(utp.document_name.isin(task_names))
	rows = query.run(as_dict=True)
	return {row.task_name: flt(row.hours) for row in rows if row.get("task_name")}


def _utp_parent_names_in_bucket_for_tasks(
	project: str, date_from: date, date_to: date, task_document_names: list[str]
) -> list[str]:
	"""Distinct User Timesheet Position names with approved detail hours in the bucket for given tasks."""
	if not task_document_names:
		return []
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	rows = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(utp.name)
		.where(utp.project == project)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.where(utp.document_name.isin(task_document_names))
		.where(detail.date.between(date_from, date_to))
		.groupby(utp.name)
		.run(as_dict=True)
	)
	return sorted({row.get("name") for row in rows if row.get("name")})


def _utp_cumulative_hours_by_task(
	project: str, date_to: date, tasks: list[dict], task_names: list[str] | None = None
) -> dict[str, float]:
	if task_names is not None and not task_names:
		return {}
	task_start_dates = {
		task["name"]: getdate(created_on)
		for task in tasks
		if task.get("name") and (created_on := _creation_date(task)) and getdate(created_on) <= date_to
	}
	if not task_start_dates:
		return {}
	query_start = min(task_start_dates.values())
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	query = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(
			utp.document_name.as_("task_name"),
			detail.date.as_("work_date"),
			IfNull(detail.hours, 0).as_("hours"),
		)
		.where(utp.project == project)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.where(detail.date.between(query_start, date_to))
	)
	if task_names is not None:
		query = query.where(utp.document_name.isin(task_names))
	rows = query.run(as_dict=True)
	hours_by_task: dict[str, float] = {}
	for row in rows:
		task_name = row.get("task_name")
		if not task_name:
			continue
		task_start = task_start_dates.get(task_name)
		work_date = row.get("work_date")
		if not task_start or not work_date or getdate(work_date) < task_start:
			continue
		hours_by_task[task_name] = flt(hours_by_task.get(task_name)) + flt(row.get("hours"))
	return hours_by_task


def _utp_min_date_by_task(project: str, task_names: list[str] | None = None) -> dict[str, date]:
	if task_names is not None and not task_names:
		return {}
	utp = frappe.qb.DocType("User Timesheet Position")
	detail = frappe.qb.DocType("User Timesheet Position Details")
	query = (
		frappe.qb.from_(utp)
		.inner_join(detail)
		.on(detail.parent == utp.name)
		.select(
			utp.document_name.as_("task_name"),
			Min(detail.date).as_("min_date"),
		)
		.where(utp.project == project)
		.where(utp.status == UTP_STATUS_APPROVED)
		.where(IfNull(utp.document_type, "") == "Task")
		.groupby(utp.document_name)
	)
	if task_names is not None:
		query = query.where(utp.document_name.isin(task_names))
	rows = query.run(as_dict=True)
	return {
		row.task_name: getdate(row.min_date)
		for row in rows
		if row.get("task_name") and row.get("min_date")
	}


def _as_bool(value: Any, default: bool = True) -> bool:
	if value is None:
		return default
	if isinstance(value, str):
		return value.strip().lower() not in {"", "0", "false", "no", "off"}
	return bool(value)


@frappe.whitelist()
def get_burndown_series(
	project: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	group_by: str = "month",
	measure: str = "hours",
	exclude_group_tasks: int | str = 1,
	task_type_filter: str | None = None,
	task_type_filters: list[str] | str | None = None,
	forecast_periods: int = 6,
	use_progress: int | str = 1,
	show_completion_forecast: int | str = 0,
	use_task_weight: int | str = 0,
	issue_type_filters: list[str] | str | None = None,
) -> dict[str, Any]:
	if not project:
		frappe.throw(_("Project is required"))
	if not frappe.has_permission("Project", "read", project):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	fd = getdate(from_date) if from_date else add_months(getdate(), -6)
	td = getdate(to_date) if to_date else getdate()
	if fd > td:
		fd, td = td, fd

	exclude_group = _as_bool(exclude_group_tasks)
	show_completion_forecast = _as_bool(show_completion_forecast, default=False)
	use_task_weight_flag = _as_bool(use_task_weight, default=False)
	measure = (measure or "hours").lower()
	group_by = (group_by or "month").lower()
	task_type_values = _normalize_text_list(task_type_filters or task_type_filter)
	issue_type_values = _normalize_text_list(issue_type_filters)
	if measure == "hours":
		return _period_volume_burndown(
			project,
			fd,
			td,
			group_by,
			"hours",
			exclude_group,
			False,
			show_completion_forecast,
			use_task_weight=False,
			task_type_filters=task_type_values,
			issue_type_filters=issue_type_values,
		)
	progress_enabled = _as_bool(use_progress)
	if measure in ("story_points", "story_point", "sp"):
		return _period_volume_burndown(
			project,
			fd,
			td,
			group_by,
			"story_points",
			exclude_group,
			progress_enabled,
			show_completion_forecast,
			use_task_weight=False,
			task_type_filters=task_type_values,
			issue_type_filters=issue_type_values,
		)
	return _period_volume_burndown(
		project,
		fd,
		td,
		group_by,
		"task_count",
		exclude_group,
		progress_enabled,
		show_completion_forecast,
		use_task_weight=use_task_weight_flag,
		task_type_filters=task_type_values,
		issue_type_filters=issue_type_values,
	)


def _task_epic_burndown_chart_summary(
	tasks: list[dict],
	measure: str,
	use_task_weight: bool,
	completed_total: list[float],
	total_forecast_volume: float,
) -> dict[str, Any]:
	"""Summary metrics for Task Epic Burndown header (same task scope as the chart)."""
	total_task_count = len(tasks)
	total_volume = flt(total_forecast_volume)
	completed_volume = sum(flt(x) for x in completed_total)
	completed_percent = (100.0 * completed_volume / total_volume) if total_volume > 1e-9 else 0.0

	show_unestimated = False
	unestimated_count = 0
	unestimated_task_names: list[str] = []
	if measure == "hours" or measure == "story_points":
		show_unestimated = total_task_count > 0
		unestimated_task_names = sorted(
			n
			for t in tasks
			if (n := (t.get("name") or "").strip())
			and flt(t.get("volume")) <= 0.0
		)
		unestimated_count = len(unestimated_task_names)
	elif measure == "task_count" and use_task_weight:
		show_unestimated = total_task_count > 0
		unestimated_task_names = sorted(
			n
			for t in tasks
			if (n := (t.get("name") or "").strip())
			and flt(t.get("task_weight")) <= 0.0
		)
		unestimated_count = len(unestimated_task_names)

	unestimated_percent = (
		(100.0 * float(unestimated_count) / float(total_task_count))
		if show_unestimated and total_task_count
		else 0.0
	)

	return {
		"show_unestimated": bool(show_unestimated),
		"unestimated_count": int(unestimated_count),
		"unestimated_task_names": unestimated_task_names,
		"total_task_count": int(total_task_count),
		"unestimated_percent": round(unestimated_percent, 2),
		"completed_volume": round(completed_volume, 6),
		"total_volume": round(total_volume, 6),
		"completed_percent": round(completed_percent, 2),
	}


def _period_volume_burndown(
	project: str,
	fd: date,
	td: date,
	group_by: str,
	measure: str,
	exclude_group: bool,
	use_progress: bool,
	show_completion_forecast: bool = False,
	use_task_weight: bool = False,
	task_type_filters: list[str] | None = None,
	issue_type_filters: list[str] | None = None,
) -> dict[str, Any]:
	buckets = get_period_buckets(project, fd, td, group_by)
	tasks = _load_task_volume_rows(
		project,
		exclude_group,
		measure,
		use_task_weight,
		task_type_filters=task_type_filters,
		issue_type_filters=issue_type_filters,
	)
	task_names = [task["name"] for task in tasks]
	progress_rows = _load_progress_rows(task_names, _progress_history_start_for_tasks(tasks, fd), td)
	holiday_list_name = _resolve_project_holiday_list(project)
	holiday_dates = _holiday_dates_in_range(holiday_list_name, fd, td)

	created: list[float] = []
	open_volume: list[float] = []
	completed: list[float] = []
	created_completed: list[float] = []
	forecast_completed_total: list[float] = []
	task_filters = {"created": [], "open": [], "completed": [], "created_completed": []}
	total_forecast_volume = sum(flt(task.get("volume")) for task in tasks)
	for _label, bs, be in buckets:
		created_tasks = _tasks_created_from_rows(tasks, bs, be)
		created_task_names = [task["name"] for task in created_tasks]
		created_raw = sum(flt(task.get("volume")) for task in created_tasks)
		if measure == "hours":
			bucket_hours_by_task = _utp_hours_by_task(project, bs, be, task_names)
			cumulative_hours_by_task = _utp_cumulative_hours_by_task(project, be, tasks, task_names)
			eligible_open_tasks = []
			for task in tasks:
				created_on = _creation_date(task)
				if created_on and created_on > be:
					continue
				eligible_open_tasks.append(task)
			eligible_forecast_volume = sum(flt(task.get("volume")) for task in eligible_open_tasks)
			created_completed_names = sorted(
				name for name in created_task_names if flt(bucket_hours_by_task.get(name)) > 0
			)
			created_completed_names_set = set(created_completed_names)
			created_completed_value = sum(
				flt(bucket_hours_by_task.get(name)) for name in created_completed_names
			)
			created_value = max(0.0, created_raw - created_completed_value)
			completed_total_in_bucket = sum(flt(hours) for hours in bucket_hours_by_task.values())
			completed_value = max(0.0, completed_total_in_bucket - created_completed_value)
			completed_to_period = sum(flt(hours) for hours in cumulative_hours_by_task.values())
			open_names = []
			for task in eligible_open_tasks:
				name = task["name"]
				if name in created_task_names:
					continue
				remaining_hours = flt(task.get("volume")) - flt(cumulative_hours_by_task.get(name))
				if remaining_hours > 0:
					open_names.append(name)
			open_volume.append(
				max(0.0, eligible_forecast_volume - completed_to_period - created_raw - created_completed_value)
			)
			created.append(created_value)
			created_completed.append(created_completed_value)
			completed.append(completed_value)
			forecast_completed_total.append(completed_total_in_bucket)
			task_filters["created"].append(created_task_names)
			task_filters["open"].append(sorted(open_names))
			completed_task_names = sorted(
				name
				for name, hours in bucket_hours_by_task.items()
				if flt(hours) > 0 and name not in created_completed_names_set
			)
			task_filters["completed"].append(
				_utp_parent_names_in_bucket_for_tasks(project, bs, be, completed_task_names)
			)
			task_filters["created_completed"].append(
				_utp_parent_names_in_bucket_for_tasks(project, bs, be, created_completed_names)
				if created_completed_names
				else []
			)
			continue
		open_volume.append(
			_measure_open_scope_from_rows(
				tasks, be, use_progress=use_progress, bucket_start=bs, progress_rows=progress_rows
			)
		)
		progress_completed = _measure_completed_scope_from_rows(
			tasks, progress_rows, bs, be, use_progress=use_progress
		)
		progress_created_completed = _measure_created_and_completed_scope_from_rows(
			tasks, progress_rows, bs, be, use_progress=use_progress
		)
		completed_raw = progress_completed
		created_completed_value = progress_created_completed
		created_completed_value = min(created_completed_value, completed_raw, created_raw)
		created.append(max(0.0, created_raw - created_completed_value))
		created_completed.append(created_completed_value)
		completed.append(max(0.0, completed_raw - created_completed_value))
		forecast_completed_total.append(progress_completed)
		task_filters["created"].append(created_task_names)
		task_filters["open"].append(
			_task_names_open_from_rows(
				tasks,
				be,
				use_progress=use_progress,
				bucket_start=bs,
				progress_rows=progress_rows,
			)
		)
		task_filters["completed"].append(
			[
				name
				for name in _task_names_completed_from_rows(
					tasks, progress_rows, bs, be, use_progress=use_progress
				)
				if name
				not in set(
					_task_names_created_and_completed_from_rows(
						tasks, progress_rows, bs, be, use_progress=use_progress
					)
				)
			]
		)
		task_filters["created_completed"].append(
			_task_names_created_and_completed_from_rows(
				tasks, progress_rows, bs, be, use_progress=use_progress
			)
		)

	categories = [bucket[0] for bucket in buckets]
	y_label = {
		"hours": _("Hours"),
		"story_points": _("Story Points"),
		"task_count": _("Tasks"),
	}.get(measure, _("Volume"))
	forecast_summary: dict[str, Any] = {"show": False}
	completed_total = [flt(completed[i]) + flt(created_completed[i]) for i in range(len(categories))]
	summary = _task_epic_burndown_chart_summary(
		tasks,
		measure,
		use_task_weight,
		completed_total,
		total_forecast_volume,
	)
	velocity_completed_total = forecast_completed_total if not use_progress else completed_total
	fact_end_idx = _fact_end_index(buckets)
	forecast_completed = [0.0 for _ in categories]
	forecast_open = list(open_volume)
	forecast_from_index: int | None = None
	if show_completion_forecast and categories and fact_end_idx >= 0 and fact_end_idx < len(categories) - 1:
		_fact_label, _fact_bs, fact_be = buckets[fact_end_idx]
		if measure == "hours":
			forecast_baseline_open = max(
				0.0,
				total_forecast_volume
				- sum(
					flt(hours)
					for hours in _utp_cumulative_hours_by_task(project, fact_be, tasks, task_names).values()
				),
			)
		else:
			forecast_baseline_open = _measure_forecast_open_baseline_from_rows(
				tasks,
				fact_be,
				use_progress=use_progress,
				progress_rows=progress_rows,
			)
		velocity_window = _velocity_window_values(
			buckets, velocity_completed_total, fact_end_idx, group_by, holiday_dates
		)
		velocity = _weighted_velocity(velocity_window, group_by)
		remaining_open = flt(forecast_baseline_open)
		if velocity > 0 and remaining_open > 0:
			forecast_from_index = fact_end_idx + 1
			_initial_remaining = remaining_open
			_velocity_flt = flt(velocity)
			remaining_periods = (
				int(math.ceil(_initial_remaining / _velocity_flt)) if _velocity_flt > 0 else 0
			)
			_period_singular, _period_plural = _forecast_period_unit_labels(group_by)
			remaining_periods_label = (
				_("1 {0} remaining").format(_period_singular)
				if remaining_periods == 1
				else _("{0} {1} remaining").format(remaining_periods, _period_plural)
			)
			_volume_tail = {
				"hours": _("remaining hours"),
				"story_points": _("remaining story points"),
				"task_count": _("remaining tasks"),
			}.get(measure, _("remaining volume"))
			forecast_summary = {
				"show": True,
				"remaining_periods": remaining_periods,
				"remaining_periods_label": remaining_periods_label,
				"velocity": _velocity_flt,
				"remaining_volume": _initial_remaining,
				"period_label": _period_singular,
				"volume_label": _volume_tail,
			}
			if measure != "hours" and not use_progress:
				open_tasks_for_forecast = _tasks_open_from_rows(
					tasks,
					fact_be,
					use_progress=False,
					bucket_start=None,
					progress_rows=progress_rows,
				)
				accumulated_capacity = 0.0
				for index in range(forecast_from_index, len(categories)):
					accumulated_capacity += velocity
					open_tasks_for_forecast, bucket_forecast = _discrete_forecast_bucket_completion(
						open_tasks_for_forecast, accumulated_capacity
					)
					accumulated_capacity = max(0.0, accumulated_capacity - bucket_forecast)
					forecast_completed[index] = bucket_forecast
					remaining_open = sum(flt(task.get("volume")) for task in open_tasks_for_forecast)
					forecast_open[index] = remaining_open
					if remaining_open <= 0:
						for tail_index in range(index + 1, len(categories)):
							forecast_open[tail_index] = 0.0
						break
			else:
				for index in range(forecast_from_index, len(categories)):
					bucket_forecast = min(velocity, remaining_open)
					forecast_completed[index] = bucket_forecast
					remaining_open = max(0.0, remaining_open - bucket_forecast)
					forecast_open[index] = remaining_open
					if remaining_open <= 0:
						for tail_index in range(index + 1, len(categories)):
							forecast_open[tail_index] = 0.0
						break
	return {
		"measure": measure,
		"categories": categories,
		"summary": summary,
		"forecast_summary": forecast_summary,
		"created": created,
		"open": open_volume,
		"completed": completed,
		"created_completed": created_completed,
		"same_period_completed": created_completed,
		"task_filters": task_filters,
		"use_progress": use_progress,
		"use_task_weight": use_task_weight,
		"y_axis_label": y_label,
		"holiday_list_name": holiday_list_name,
		"holiday_dates": holiday_dates,
		# Backward-compatible aliases for older report JavaScript.
		"added": created,
		"remaining": open_volume,
		"end_scope": open_volume,
		"placeholder": [],
		"start_scope": [],
		"cumulative_plan": [],
		"cumulative_actual": [],
		"forecast_categories": [],
		"forecast_placeholder": [],
		"forecast_start_scope": [],
		"forecast_end_scope": [],
		"forecast_added": [],
		"forecast_remaining": forecast_open if show_completion_forecast else [],
		"forecast_completed": forecast_completed if show_completion_forecast else [],
		"forecast_from_index": forecast_from_index,
	}


def _hours_burndown(
	project: str,
	fd: date,
	td: date,
	group_by: str,
	exclude_group: bool,
	forecast_periods: int,
) -> dict[str, Any]:
	tasks = _task_name_list(project, exclude_group, None)
	plan_rows = _load_pwe_plan_rows(project, None)
	buckets = get_period_buckets(project, fd, td, group_by)

	categories: list[str] = []
	added: list[float] = []
	completed: list[float] = []
	start_scope: list[float] = []
	end_rem: list[float] = []
	placeholder: list[float] = []
	cum_plan: list[float] = []
	cum_act: list[float] = []

	for _label, bs, be in buckets:
		cp_end = _cumulative_plan_through(plan_rows, be)
		cp_start = _cumulative_plan_through(plan_rows, bs - timedelta(days=1))
		ca_end = _utp_sum_hours(project, fd, be, tasks)
		ca_start = _utp_sum_hours(project, fd, bs - timedelta(days=1), tasks)

		st = max(0.0, cp_start - ca_start)
		ad = max(0.0, cp_end - cp_start)
		act = max(0.0, ca_end - ca_start)
		er = max(0.0, cp_end - ca_end)
		ph = max(0.0, er + act - ad)

		categories.append(_label)
		start_scope.append(st)
		added.append(ad)
		completed.append(act)
		end_rem.append(er)
		placeholder.append(ph)
		cum_plan.append(cp_end)
		cum_act.append(ca_end)

	# forecast (velocity from last fact buckets)
	today = getdate()
	fc_labels: list[str] = []
	fc_ph: list[float] = []
	fc_add: list[float] = []
	fc_start: list[float] = []
	fc_rem: list[float] = []
	fc_comp: list[float] = []

	fact_end_idx = len(buckets) - 1
	for i, (_c, _bs, be) in enumerate(buckets):
		if be >= today:
			fact_end_idx = i - 1 if i > 0 else 0
			break

	if forecast_periods > 0 and fact_end_idx >= 0:
		lo = max(0, fact_end_idx - 2)
		window = completed[lo : fact_end_idx + 1]
		velocity = sum(window) / len(window) if window else 0.0
		rem = end_rem[fact_end_idx]
		for _j in range(forecast_periods):
			if velocity <= 0 or rem <= 0:
				break
			fc_start.append(rem)
			fc = min(velocity, rem)
			rem = max(0.0, rem - fc)
			fc_labels.append(_("Forecast {0}").format(len(fc_labels) + 1))
			fc_comp.append(fc)
			fc_add.append(0.0)
			fc_rem.append(rem)
			fc_ph.append(0.0)

	return {
		"measure": "hours",
		"categories": categories,
		"placeholder": placeholder,
		"start_scope": start_scope,
		"end_scope": end_rem,
		"added": added,
		"remaining": end_rem,
		"completed": completed,
		"cumulative_plan": cum_plan,
		"cumulative_actual": cum_act,
		"forecast_categories": fc_labels,
		"forecast_placeholder": fc_ph,
		"forecast_start_scope": fc_start,
		"forecast_end_scope": fc_rem,
		"forecast_added": fc_add,
		"forecast_remaining": fc_rem,
		"forecast_completed": fc_comp,
		"forecast_from_index": len(categories) if fc_labels else None,
		"y_axis_label": _("Hours"),
	}

def _story_point_map() -> dict[str, float]:
	return {r.name: flt(r.value) for r in frappe.get_all("Story Point", fields=["name", "value"])}


def _mval(
	name: str,
	doc: dict | None,
	sp_map: dict[str, float],
	measure: str,
	use_task_weight: bool = False,
) -> float:
	if measure == "task_count":
		if use_task_weight:
			w = flt((doc or {}).get("task_weight"))
			return w if w > 0 else 0.0
		return 1.0
	if measure == "story_points":
		sp = (doc or {}).get("story_point")
		return sp_map.get(sp, 0.0) if sp else 0.0
	return flt((doc or {}).get("expected_time"))


def _task_measure_burndown(
	project: str,
	fd: date,
	td: date,
	group_by: str,
	measure: str,
	exclude_group: bool,
	use_task_weight: bool = False,
) -> dict[str, Any]:
	sp_map = _story_point_map() if measure == "story_points" else {}
	buckets = get_period_buckets(project, fd, td, group_by)
	tasks = _task_name_list(project, exclude_group, None)

	added = [0.0] * len(buckets)
	completed = [0.0] * len(buckets)
	start_scope = [0.0] * len(buckets)
	end_rem = [0.0] * len(buckets)

	for i, (_lb, bs, be) in enumerate(buckets):
		added[i] = _measure_new_scope(tasks, bs, be, sp_map, measure, use_task_weight)
		completed[i] = _measure_completed_hist(tasks, bs, be, sp_map, measure, use_task_weight)

	running = _initial_remaining(tasks, fd, sp_map, measure, use_task_weight)
	for i, (_lb, bs, be) in enumerate(buckets):
		start_scope[i] = running
		running = running + added[i] - completed[i]
		if running < 0:
			running = 0.0
		end_rem[i] = running

	placeholder = []
	for i in range(len(buckets)):
		er = end_rem[i]
		act = completed[i]
		ad = added[i]
		placeholder.append(max(0.0, er + act - ad))

	categories = [b[0] for b in buckets]
	return _series_dict(
		measure,
		categories,
		placeholder,
		start_scope,
		added,
		end_rem,
		completed,
		_("Story Points") if measure == "story_points" else _("Tasks"),
	)


def _series_dict(
	meas: str,
	categories: list[str],
	placeholder: list[float],
	start_scope: list[float],
	added: list[float],
	remaining: list[float],
	completed: list[float],
	y_label: str,
) -> dict[str, Any]:
	return {
		"measure": meas,
		"categories": categories,
		"placeholder": placeholder,
		"start_scope": start_scope,
		"end_scope": remaining,
		"added": added,
		"remaining": remaining,
		"completed": completed,
		"cumulative_plan": [],
		"cumulative_actual": [],
		"forecast_categories": [],
		"forecast_placeholder": [],
		"forecast_start_scope": [],
		"forecast_end_scope": [],
		"forecast_added": [],
		"forecast_remaining": [],
		"forecast_completed": [],
		"forecast_from_index": None,
		"y_axis_label": y_label,
	}


def _derive_start_scope_series(
	remaining: list[float], added: list[float], completed: list[float]
) -> list[float]:
	"""Return bucket opening scope so start + added - completed = end."""
	out: list[float] = []
	for er, ad, act in zip(remaining, added, completed, strict=False):
		out.append(max(0.0, er - ad + act))
	return out


def _initial_remaining(
	tasks: list[str],
	from_date: date,
	sp_map: dict[str, float],
	measure: str,
	use_task_weight: bool = False,
) -> float:
	"""Approximate remaining scope just before from_date using forecast task starts."""
	if not tasks:
		return 0.0
	total = 0.0
	for name in tasks:
		doc = frappe.db.get_value(
			"Task",
			name,
			[
				"creation",
				"progress",
				"story_point",
				"expected_time",
				"task_weight",
				"exp_start_date",
				"custom_planned_start_date",
			],
			as_dict=True,
		)
		if not doc:
			continue
		scope_start = doc.get("exp_start_date") or doc.get("custom_planned_start_date") or doc.creation
		if getdate(scope_start) >= from_date:
			continue
		m = _mval(name, doc, sp_map, measure, use_task_weight)
		p = flt(doc.progress)
		total += m * (1.0 - p / 100.0)
	return total


def _measure_new_scope(
	tasks: list[str],
	bs: date,
	be: date,
	sp_map: dict[str, float],
	measure: str,
	use_task_weight: bool = False,
) -> float:
	if not tasks:
		return 0.0
	task = frappe.qb.DocType("Task")
	rows = (
		frappe.qb.from_(task)
		.select(
			task.name,
			task.progress,
			task.story_point,
			task.expected_time,
			task.task_weight,
			task.exp_start_date,
			task.custom_planned_start_date,
		)
		.where(task.name.isin(tasks))
		.where(Date(Coalesce(task.exp_start_date, task.custom_planned_start_date, task.creation)).between(bs, be))
		.run(as_dict=True)
	)
	s = 0.0
	for r in rows:
		m = _mval(r.name, r, sp_map, measure, use_task_weight)
		s += m * (1.0 - flt(r.progress) / 100.0)
	return s


def _measure_completed_hist(
	tasks: list[str],
	bs: date,
	be: date,
	sp_map: dict[str, float],
	measure: str,
	use_task_weight: bool = False,
) -> float:
	if not tasks:
		return 0.0
	history = frappe.qb.DocType("Task Progress History")
	rows = (
		frappe.qb.from_(history)
		.select(
			history.parent,
			IfNull(history.old_progress, 0).as_("op"),
			IfNull(history.new_progress, 0).as_("np"),
		)
		.where(history.parent.isin(tasks))
		.where(Date(history.changed_on).between(bs, be))
		.run(as_dict=True)
	)
	s = 0.0
	for r in rows:
		doc = frappe.db.get_value(
			"Task", r.parent, ["story_point", "expected_time", "task_weight"], as_dict=True
		)
		m = _mval(r.parent, doc, sp_map, measure, use_task_weight)
		s += m * (flt(r.np) - flt(r.op)) / 100.0
	return s


def _measure_remaining_snapshot(
	tasks: list[str],
	sp_map: dict[str, float],
	measure: str,
	use_task_weight: bool = False,
) -> float:
	if not tasks:
		return 0.0
	s = 0.0
	for name in tasks:
		doc = frappe.db.get_value(
			"Task",
			name,
			["progress", "story_point", "expected_time", "task_weight"],
			as_dict=True,
		)
		if not doc:
			continue
		m = _mval(name, doc, sp_map, measure, use_task_weight)
		s += m * (1.0 - flt(doc.progress) / 100.0)
	return s
