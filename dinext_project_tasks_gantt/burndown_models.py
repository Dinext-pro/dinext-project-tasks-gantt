# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""TypedDict for Burndown whitelist API."""

from __future__ import annotations

from typing import Any, TypedDict


class ProjectOptionsFormInput(TypedDict, total=False):
	"""Вход project-*_options."""

	project: str | None


class LabelValueOption(TypedDict, total=False):
	"""Опция Select / MultiSelect."""

	label: str
	value: str
	description: str


class TaskProgressTrendFormInput(TypedDict, total=False):
	"""Вход get_task_progress_trend."""

	task: str | None
	group_by: str


class BurndownSeriesFormInput(TypedDict, total=False):
	"""Вход get_burndown_series."""

	project: str | None
	from_date: str | None
	to_date: str | None
	group_by: str
	measure: str
	exclude_group_tasks: int | str
	task_type_filter: str | None
	task_type_filters: list[str] | str | None
	forecast_periods: int | str
	use_progress: int | str
	show_completion_forecast: int | str
	use_task_weight: int | str
	issue_type_filters: list[str] | str | None
	hours_source: str | None
	project_role_filters: list[str] | str | None


class BurndownSeriesResponse(TypedDict, total=False):
	"""Ответ get_burndown_series (частичные ключи)."""

	detail_rows: list[dict[str, Any]]
	chart: dict[str, Any]
	meta: dict[str, Any]
