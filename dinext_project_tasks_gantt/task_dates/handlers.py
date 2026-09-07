"""Тонкие entrypoint'ы doc_events для слоя 2 (preventive + inherit + Actual + Depend)."""

from __future__ import annotations

from dinext_project_tasks_gantt.task_dates.actual import sync_task_actual_dates
from dinext_project_tasks_gantt.task_dates.child_inherit import apply_child_forecast_defaults
from dinext_project_tasks_gantt.task_dates.depend import validate_depend_task_dates
from dinext_project_tasks_gantt.task_dates.preventive import apply_treeview_preventive


def before_validate_task(doc, method=None):
	"""Task before_validate → inherit, Actual, then ISS-2024-02939 preventive."""
	apply_child_forecast_defaults(doc)
	sync_task_actual_dates(doc)
	apply_treeview_preventive(doc)


def before_save_task(doc, method=None):
	"""Task before_save → Depend_Task_Date_Check (до TVTI)."""
	validate_depend_task_dates(doc)
