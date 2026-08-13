# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Whitelisted API для вызова из Desk / Script Report через frappe.call."""

from __future__ import annotations

from typing import Any

import frappe

from dinext_project_tasks_gantt.burndown import (
	get_burndown_series as run_get_burndown_series,
	get_project_issue_type_options as run_get_project_issue_type_options,
	get_project_role_options as run_get_project_role_options,
	get_project_task_type_options as run_get_project_task_type_options,
	get_project_x_axis_period_options as run_get_project_x_axis_period_options,
	get_task_progress_trend as run_get_task_progress_trend,
)
from dinext_project_tasks_gantt.burndown_models import (
	BurndownSeriesFormInput,
	BurndownSeriesResponse,
	LabelValueOption,
	ProjectOptionsFormInput,
	TaskProgressTrendFormInput,
)
from dinext_project_tasks_gantt.task_tree_gantt.get_children import get_children as run_get_children
from dinext_project_tasks_gantt.task_tree_gantt.models import (
	GetChildrenFormInput,
	GetChildrenRow,
	ReorderSiblingsFormInput,
	ReorderSiblingsResponse,
	SaveCellsFormInput,
	SaveCellsResponse,
)
from dinext_project_tasks_gantt.task_tree_gantt.save_cells import save_cells as run_save_cells
from dinext_project_tasks_gantt.task_tree_order import reorder_siblings as run_reorder_siblings


def _merge_form_input(kwargs: dict[str, Any]) -> frappe._dict:
	form_input = frappe._dict(frappe.form_dict)
	for key, value in kwargs.items():
		if value is not None:
			form_input[key] = value
	return form_input


@frappe.whitelist()
def get_children(**kwargs) -> list[GetChildrenRow]:
	"""Task rows for Tree Gantt DinextTable."""
	form_input: GetChildrenFormInput = _merge_form_input(kwargs)
	return run_get_children(**form_input)


@frappe.whitelist()
def save_cells(**kwargs) -> SaveCellsResponse:
	"""Batch cell save for Task Tree Gantt."""
	form_input: SaveCellsFormInput = _merge_form_input(kwargs)
	return run_save_cells(changes=form_input.get("changes"))


@frappe.whitelist()
def reorder_siblings(**kwargs) -> ReorderSiblingsResponse:
	"""Sibling reorder / reparent Task in tree."""
	form_input: ReorderSiblingsFormInput = _merge_form_input(kwargs)
	return run_reorder_siblings(
		task=form_input.get("task"),
		parent_task=form_input.get("parent_task"),
		ordered_ids=form_input.get("ordered_ids"),
		from_ordered_ids=form_input.get("from_ordered_ids"),
	)


@frappe.whitelist()
def fit_depend_task_dates(args=None, **kwargs) -> dict:
	"""Подогнать прогноз depends_on под период текущей Task (кнопка в окне конфликта дат)."""
	payload = args if isinstance(args, dict) else {}
	if not payload:
		payload = kwargs
	from dinext_project_tasks_gantt.task_dates.depend import (
		fit_depend_task_dates as run_fit,
	)

	return run_fit(
		task=payload.get("task"),
		exp_start_date=payload.get("exp_start_date"),
		exp_end_date=payload.get("exp_end_date"),
	)


@frappe.whitelist()
def get_project_task_type_options(**kwargs) -> list[LabelValueOption]:
	"""Task.type options for burndown filters."""
	form_input: ProjectOptionsFormInput = _merge_form_input(kwargs)
	return run_get_project_task_type_options(project=form_input.get("project"))


@frappe.whitelist()
def get_project_x_axis_period_options(**kwargs) -> list[LabelValueOption]:
	"""Calendar + task-type period options for burndown X axis."""
	form_input: ProjectOptionsFormInput = _merge_form_input(kwargs)
	return run_get_project_x_axis_period_options(project=form_input.get("project"))


@frappe.whitelist()
def get_project_role_options(**kwargs) -> list[LabelValueOption]:
	"""Project role options for burndown filters."""
	form_input: ProjectOptionsFormInput = _merge_form_input(kwargs)
	return run_get_project_role_options(project=form_input.get("project"))


@frappe.whitelist()
def get_project_issue_type_options(**kwargs) -> list[LabelValueOption]:
	"""Issue type options for burndown filters."""
	form_input: ProjectOptionsFormInput = _merge_form_input(kwargs)
	return run_get_project_issue_type_options(project=form_input.get("project"))


@frappe.whitelist()
def get_task_progress_trend(**kwargs) -> dict[str, Any]:
	"""Progress trend widget data for Task form."""
	form_input: TaskProgressTrendFormInput = _merge_form_input(kwargs)
	return run_get_task_progress_trend(
		task=form_input.get("task"),
		group_by=form_input.get("group_by") or "week",
	)


@frappe.whitelist()
def get_burndown_series(**kwargs) -> BurndownSeriesResponse:
	"""Task Epic Burndown series payload."""
	form_input: BurndownSeriesFormInput = _merge_form_input(kwargs)
	return run_get_burndown_series(
		project=form_input.get("project"),
		from_date=form_input.get("from_date"),
		to_date=form_input.get("to_date"),
		group_by=form_input.get("group_by") or "month",
		measure=form_input.get("measure") or "hours",
		exclude_group_tasks=form_input.get("exclude_group_tasks", 1),
		task_type_filter=form_input.get("task_type_filter"),
		task_type_filters=form_input.get("task_type_filters"),
		forecast_periods=form_input.get("forecast_periods", 6),
		use_progress=form_input.get("use_progress", 1),
		show_completion_forecast=form_input.get("show_completion_forecast", 0),
		use_task_weight=form_input.get("use_task_weight", 0),
		issue_type_filters=form_input.get("issue_type_filters"),
		hours_source=form_input.get("hours_source"),
		project_role_filters=form_input.get("project_role_filters"),
	)
