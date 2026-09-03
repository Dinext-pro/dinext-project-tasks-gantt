# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""TypedDict for Task Tree Gantt whitelist API."""

from __future__ import annotations

from typing import Any, TypedDict


class GetChildrenFormInput(TypedDict, total=False):
	"""Вход get_children (Tree Gantt / DinextTable)."""

	project: str
	parent_task: str | None
	task: str | list[str] | None
	all_tasks: int | str | bool
	status: str | list[str] | None
	priority: str | list[str] | None
	assign: str | list[str] | None
	tag: str | list[str] | None
	sort_field: str | None
	sort_order: str | None
	limit: int | str | None


class GetChildrenRow(TypedDict, total=False):
	"""Строка дерева Task для DinextTable.

	Row = документ: все permitted скалярные поля Task под DocType-именами
	(перечислены ключевые) + `name/owner/docstatus/modified/_assign/_user_tags`
	+ клиентские алиасы. Table-поля включаются только если на них ссылается
	form-contract выражение (см. `form_contract.py`). Stub (`can_read=0`) —
	только tree-ключи и пустые алиасы.
	"""

	# tree / auth
	id: str
	name: str
	parent_task: str | None
	has_children: bool
	can_read: int
	can_write: int
	custom_tree_order: int | float | None
	# DocType (subset, illustrative)
	owner: str
	docstatus: int
	modified: str
	is_group: int
	subject: str | None
	status: str | None
	priority: str | None
	type: str | None
	exp_start_date: str | None
	exp_end_date: str | None
	expected_time: float | None
	progress: float | None
	_assign: Any
	_user_tags: str | None
	custom_include: int
	is_milestone: int
	custom_planned_start_date: str | None
	custom_planned_end_date: str | None
	# client aliases (kept — see TaskRow.ALIASES)
	task_type: str | None
	task_type_label: str
	assign: list[str]
	assign_pwa: list[str]
	assign_todo_only: list[str]
	user_tags: str
	relations: list[dict]


class TreeMetaWorkflow(TypedDict):
	"""Workflow-часть tree_meta (как Desk Form: state field + update fields → RO)."""

	state_field: str
	update_fields: list[str]


class TreeMeta(TypedDict):
	"""`frappe.response["tree_meta"]` — один раз на ответ get_children / get_tree_meta."""

	doctype: str
	permlevels_readable: list[int]
	permlevels_writable: list[int]
	workflow: TreeMetaWorkflow | None


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
	saved: list[GetChildrenRow]
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
	rows: list[SaveCellsSideEffectRow]
