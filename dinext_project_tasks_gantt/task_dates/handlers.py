"""Тонкие entrypoint'ы doc_events для слоя 2 (Actual + Depend)."""

from __future__ import annotations

from dinext_project_tasks_gantt.task_dates.actual import sync_task_actual_dates
from dinext_project_tasks_gantt.task_dates.child_inherit import apply_child_forecast_defaults
from dinext_project_tasks_gantt.task_dates.depend import validate_depend_task_dates


def before_validate_task(doc, method=None):
	"""Task before_validate → child forecast inherit, then Actual Dates Sync."""
	apply_child_forecast_defaults(doc)
	sync_task_actual_dates(doc)


def before_save_task(doc, method=None):
	"""Task before_save → Depend_Task_Date_Check (до TVTI)."""
	validate_depend_task_dates(doc)
