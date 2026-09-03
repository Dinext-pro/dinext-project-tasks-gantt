# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Whitelisted API для вызова из Desk / Script Report через frappe.call."""

from __future__ import annotations

from typing import Any

import frappe

from dinext_project_tasks_gantt.task_tree_gantt.get_data import get_children as run_get_children
from dinext_project_tasks_gantt.task_tree_gantt.get_data.meta import TaskTreeMeta
from dinext_project_tasks_gantt.task_tree_gantt.models import (
	GetChildrenFormInput,
	GetChildrenRow,
	ReorderSiblingsFormInput,
	ReorderSiblingsResponse,
	SaveCellsFormInput,
	SaveCellsResponse,
	TreeMeta,
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
def get_tree_meta() -> TreeMeta:
	"""Permlevels + workflow contract for client field status (also sent with get_children)."""
	if not frappe.has_permission("Task", "read") and not frappe.has_permission("Task", "write"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	return TaskTreeMeta.build()


@frappe.whitelist()
def lint_form_contract() -> list[str]:
	"""Task depends_on-family expressions the tree cannot honour (System Manager only)."""
	frappe.only_for("System Manager")
	from dinext_project_tasks_gantt.install import report_form_contract_lint

	return report_form_contract_lint()


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
