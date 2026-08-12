# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""TypedDict for Task Tree Gantt whitelist API."""

from __future__ import annotations

from typing import Any, TypedDict


class GetChildrenFormInput(TypedDict, total=False):
	"""Вход get_children (Tree Gantt / DinextTable)."""

	project: str
	parent_task: str | None
	all_tasks: int | str | bool
	status: str | None
	priority: str | None
	assign: str | None
	tag: str | None
	sort_field: str | None
	sort_order: str | None
	limit: int | str | None


class GetChildrenRow(TypedDict, total=False):
	"""Строка дерева Task для DinextTable."""

	id: str
	subject: str | None
	status: str | None
	priority: str | None
	is_group: int
	exp_start_date: str | None
	exp_end_date: str | None
	expected_time: float | None
	progress: float | None
	parent_task: str | None
	_assign: Any
	custom_include: int
	is_milestone: int
	custom_planned_start_date: str | None
	custom_planned_end_date: str | None
	custom_tree_order: int | float | None


class SaveCellsChange(TypedDict, total=False):
	"""Одно изменение ячейки Tree Gantt."""

	id: str
	rowId: str
	field: str
	value: Any


class SaveCellsFormInput(TypedDict, total=False):
	"""Вход save_cells."""

	changes: list[SaveCellsChange] | str | None


class SaveCellsSideEffectRow(TypedDict, total=False):
	"""Side-effect row после каскада exp_*."""

	id: str
	exp_start_date: str | None
	exp_end_date: str | None


class SaveCellsResponse(TypedDict, total=False):
	"""Ответ save_cells."""

	updated: int
	rows: list[SaveCellsSideEffectRow]


class ReorderSiblingsFormInput(TypedDict, total=False):
	"""Вход reorder_siblings (sibling reorder / reparent)."""

	task: str
	parent_task: str | None
	ordered_ids: list[str] | str | None
	from_ordered_ids: list[str] | str | None


class ReorderSiblingsResponse(TypedDict, total=False):
	"""Ответ reorder_siblings."""

	updated: int
	reparented: int
	parent_task: str | None
