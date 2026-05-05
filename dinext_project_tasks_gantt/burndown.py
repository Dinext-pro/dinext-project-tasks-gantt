# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""
Epic-style burndown data for Task Epic Burndown report.

Hours: plan from Project Work Efforts (pwea_plan), actual from approved User Timesheet Position.
Story points / task count: Task + Task Progress History.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Date, IfNull, Sum
from frappe.utils import add_months, flt, get_datetime, getdate

UTP_STATUS_APPROVED = "Согласовано"
TASK_PERIOD_TYPES = {"phase": "Phase", "stage": "Stage", "sprint": "Sprint"}


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


def _weekly_off_dates_in_range(weekly_off: str | None, from_date: date, to_date: date) -> list[str]:
	"""Dates matching Holiday List weekly off (same weekday each week), inclusive."""
	if not weekly_off:
		return []
	key = str(weekly_off).strip().lower()
	weekday = _WEEKDAY_NAME_TO_INDEX.get(key)
	if weekday is None:
		return []
	out: list[str] = []
	cur = from_date
	while cur <= to_date:
		if cur.weekday() == weekday:
			out.append(cur.isoformat())
		cur += timedelta(days=1)
	return out


def _nonworking_holiday_dates_in_range(holiday_list: str | None, from_date: date, to_date: date) -> list[str]:
	"""Explicit holidays from child table plus weekly off days from Holiday List header."""
	explicit = _holiday_dates_in_range(holiday_list, from_date, to_date)
	weekly_off = (
		frappe.db.get_value("Holiday List", holiday_list, "weekly_off") if holiday_list else None
	)
	weekly = _weekly_off_dates_in_range(weekly_off, from_date, to_date)
	merged = sorted(set(explicit) | set(weekly))
	return merged


def _fact_end_index(buckets: list[tuple[str, date, date]]) -> int:
	today = getdate()
	fact_end_idx = len(buckets) - 1
	for index, (_label, bucket_start, bucket_end) in enumerate(buckets):
		if bucket_start <= today <= bucket_end:
			return index
		if bucket_start > today:
			return index - 1 if index > 0 else -1
	return fact_end_idx


def _weighted_velocity(values: list[float]) -> float:
	if not values:
		return 0.0
	window = values[-5:]
	weights = [1, 2, 3, 3, 3][-len(window) :]
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


def _task_name_list(
	project: str, exclude_group: bool, task_type_filter: str | None
) -> list[str]:
	filters: dict[str, Any] = {"project": project}
	if exclude_group:
		filters["is_group"] = 0
	if task_type_filter:
		filters["type"] = task_type_filter
	return frappe.get_all("Task", filters=filters, pluck="name")


def _pwe_plan_by_task(project: str, task_names: list[str] | None = None) -> dict[str, float]:
	plan_by_task: dict[str, float] = {}
	for row in _load_pwe_plan_rows(project, task_names):
		task = row.get("pwe_task")
		if not task:
			continue
		plan_by_task[task] = plan_by_task.get(task, 0.0) + flt(row.get("pwea_plan"))
	return plan_by_task


def _load_task_volume_rows(
	project: str, exclude_group: bool, measure: str, use_task_weight: bool = False
) -> list[dict]:
	task_names = _task_name_list(project, exclude_group, None)
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

	for task in tasks:
		task["volume"] = _task_volume(task, measure, sp_map, pwe_by_task, use_task_weight)
	return tasks


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
	value = task.get("creation")
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
	buckets: list[tuple[str, date, date]], progress_rows: list[dict], task_start: date | None
) -> list[float | None]:
	if not task_start:
		return []
	rows = sorted(progress_rows, key=lambda row: get_datetime(row.get("changed_on")))
	last_change_date = getdate(rows[-1].get("changed_on")) if rows else task_start
	series_end = max(last_change_date, getdate())
	last_progress = 0.0
	row_index = 0
	series: list[float | None] = []
	for _label, _bucket_start, bucket_end in buckets:
		if bucket_end < task_start or bucket_end > series_end:
			series.append(None)
			continue
		while row_index < len(rows) and getdate(rows[row_index].get("changed_on")) <= bucket_end:
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


def _forecast_progress_to_completion(
	buckets: list[tuple[str, date, date]],
	factual_progress: list[float | None],
	forecast_start_date: date | None = None,
	max_forecast_date: date | None = None,
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
			categories.append(_("Forecast {0}").format(target_index - len(buckets) + 1))
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
			categories.append(_("Forecast {0}").format(target_index - len(buckets) + 1))
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
	progress_rows = _load_progress_rows([task], history_start or add_months(getdate(), -6), add_months(getdate(), 6))
	all_dates = [getdate(row.get("changed_on")) for row in progress_rows]
	for candidate in (
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
	td = max(max(all_dates), getdate())
	max_forecast_date = _task_forecast_max_date(task_row, planned_start, planned_end)
	group_by = (group_by or "week").lower()
	if group_by == "day":
		buckets = iter_day_buckets(fd, td)
	elif group_by == "month":
		buckets = iter_month_buckets(fd, td)
	else:
		group_by = "week"
		buckets = iter_week_buckets(fd, td)
	task_start = getdate(task_row.get("actual_start_date") or task_row.get("exp_start_date")) if (
		task_row.get("actual_start_date") or task_row.get("exp_start_date")
	) else None
	skip_forecasts = _task_trend_forecasts_suppressed(task_row)
	factual = _task_actual_progress_series(buckets, progress_rows, task_start)
	planned = _planned_progress_series(buckets, planned_start, planned_end)
	if skip_forecasts:
		forecast = _empty_axis_forecast_for_buckets(buckets)
	else:
		forecast = _forecast_progress_to_completion(
			buckets,
			factual,
			task_row.get("exp_start_date"),
			max_forecast_date=max_forecast_date,
		)
		if forecast.get("completion_date") and getdate(forecast.get("completion_date")) > td:
			td = getdate(forecast.get("completion_date"))
			if group_by == "day":
				buckets = iter_day_buckets(fd, td)
			elif group_by == "month":
				buckets = iter_month_buckets(fd, td)
			else:
				buckets = iter_week_buckets(fd, td)
			factual = _task_actual_progress_series(buckets, progress_rows, task_start)
			planned = _planned_progress_series(buckets, planned_start, planned_end)
			forecast = _forecast_progress_to_completion(
				buckets,
				factual,
				task_row.get("exp_start_date"),
				max_forecast_date=max_forecast_date,
			)
	task_names_for_hours = _task_tree_names(task_row.get("project"), task)
	planned_hours_by_role = _planned_hours_by_role(task_row.get("project"), task)
	scale_planned_hours_by_role = (
		planned_hours_by_role
		if planned_hours_by_role
		else _child_tree_planned_hours_by_role(task_row.get("project"), task)
	)
	scale_planned_hours = sum(flt(value) for value in scale_planned_hours_by_role.values())
	project_limits = _project_limits(task_row.get("project"))
	hours_by_role = _timesheet_role_series_from_rows(
		buckets,
		_load_task_timesheet_role_rows(task_names_for_hours, buckets[0][1], buckets[-1][2]) if buckets else [],
	)
	timesheet_limits = _timesheet_limit_bands(
		planned_hours_by_role,
		hours_by_role,
		project_limits,
		scale_planned_hours=scale_planned_hours,
	)
	if skip_forecasts:
		hours_forecast = _empty_axis_forecast_for_buckets(buckets)
	else:
		hours_forecast = _forecast_hours_to_plan(
			buckets,
			hours_by_role,
			flt(timesheet_limits.get("planned_hours")),
			max_forecast_date=max_forecast_date,
		)
		if hours_forecast.get("completion_date") and getdate(hours_forecast.get("completion_date")) > td:
			td = getdate(hours_forecast.get("completion_date"))
			if group_by == "day":
				buckets = iter_day_buckets(fd, td)
			elif group_by == "month":
				buckets = iter_month_buckets(fd, td)
			else:
				buckets = iter_week_buckets(fd, td)
			factual = _task_actual_progress_series(buckets, progress_rows, task_start)
			planned = _planned_progress_series(buckets, planned_start, planned_end)
			forecast = _forecast_progress_to_completion(
				buckets,
				factual,
				task_row.get("exp_start_date"),
				max_forecast_date=max_forecast_date,
			)
			hours_by_role = _timesheet_role_series_from_rows(
				buckets,
				_load_task_timesheet_role_rows(task_names_for_hours, buckets[0][1], buckets[-1][2]) if buckets else [],
			)
			timesheet_limits = _timesheet_limit_bands(
				planned_hours_by_role,
				hours_by_role,
				project_limits,
				scale_planned_hours=scale_planned_hours,
			)
			hours_forecast = _forecast_hours_to_plan(
				buckets,
				hours_by_role,
				flt(timesheet_limits.get("planned_hours")),
				max_forecast_date=max_forecast_date,
			)

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
		project_name = task_row.get("project")
		if project_name:
			holiday_list_name = _resolve_project_holiday_list(project_name)
			bs0, be0 = buckets[0][1], buckets[-1][2]
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
	forecast_periods: int = 6,
	use_progress: int | str = 1,
	show_completion_forecast: int | str = 0,
	use_task_weight: int | str = 0,
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
	progress_enabled = _as_bool(use_progress)
	show_completion_forecast = _as_bool(show_completion_forecast, default=False)
	use_task_weight_flag = _as_bool(use_task_weight, default=False)
	measure = (measure or "hours").lower()
	group_by = (group_by or "month").lower()

	if measure == "hours":
		return _period_volume_burndown(
			project,
			fd,
			td,
			group_by,
			"hours",
			exclude_group,
			progress_enabled,
			show_completion_forecast,
			use_task_weight=False,
		)
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
	)


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
) -> dict[str, Any]:
	buckets = get_period_buckets(project, fd, td, group_by)
	tasks = _load_task_volume_rows(project, exclude_group, measure, use_task_weight)
	task_names = [task["name"] for task in tasks]
	progress_rows = _load_progress_rows(task_names, fd, td)
	holiday_list_name = _resolve_project_holiday_list(project)
	holiday_dates = _holiday_dates_in_range(holiday_list_name, fd, td)

	created: list[float] = []
	open_volume: list[float] = []
	completed: list[float] = []
	created_completed: list[float] = []
	task_filters = {"created": [], "open": [], "completed": [], "created_completed": []}
	for _label, bs, be in buckets:
		created_tasks = _tasks_created_from_rows(tasks, bs, be)
		created_task_names = [task["name"] for task in created_tasks]
		created_raw = sum(flt(task.get("volume")) for task in created_tasks)
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
		if measure == "hours":
			actual_completed = _utp_sum_hours(project, bs, be, task_names)
			actual_created_completed = _utp_sum_hours(project, bs, be, created_task_names)
			completed_raw = actual_completed or progress_completed
			created_completed_value = actual_created_completed or progress_created_completed
		else:
			completed_raw = progress_completed
			created_completed_value = progress_created_completed
		created_completed_value = min(created_completed_value, completed_raw, created_raw)
		created.append(max(0.0, created_raw - created_completed_value))
		created_completed.append(created_completed_value)
		completed.append(max(0.0, completed_raw - created_completed_value))
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
	completed_total = [flt(completed[i]) + flt(created_completed[i]) for i in range(len(categories))]
	fact_end_idx = _fact_end_index(buckets)
	forecast_completed = [0.0 for _ in categories]
	forecast_open = list(open_volume)
	forecast_from_index: int | None = None
	if show_completion_forecast and categories and fact_end_idx >= 0 and fact_end_idx < len(categories) - 1:
		_fact_label, _fact_bs, fact_be = buckets[fact_end_idx]
		forecast_baseline_open = _measure_forecast_open_baseline_from_rows(
			tasks,
			fact_be,
			use_progress=use_progress,
			progress_rows=progress_rows,
		)
		velocity_window = _velocity_window_values(
			buckets, completed_total, fact_end_idx, group_by, holiday_dates
		)
		velocity = _weighted_velocity(velocity_window)
		remaining_open = flt(forecast_baseline_open)
		if velocity > 0 and remaining_open > 0:
			forecast_from_index = fact_end_idx + 1
			for index in range(forecast_from_index, len(categories)):
				bucket_forecast = min(velocity, remaining_open)
				forecast_completed[index] = bucket_forecast
				remaining_open = max(0.0, remaining_open - bucket_forecast)
				forecast_open[index] = remaining_open
				if remaining_open <= 0:
					for tail_index in range(index + 1, len(categories)):
						forecast_open[tail_index] = 0.0
					break
	y_label = {
		"hours": _("Hours"),
		"story_points": _("Story Points"),
		"task_count": _("Tasks"),
	}.get(measure, _("Volume"))

	return {
		"measure": measure,
		"categories": categories,
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
