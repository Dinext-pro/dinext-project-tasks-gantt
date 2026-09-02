# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task tree order + move (sibling reorder and reparent)."""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint

from dinext_project_tasks_gantt.task_tree_gantt.save_cells import collect_date_side_effect_rows


ORDER_FIELD = "custom_tree_order"


def next_tree_order(project: str | None, parent_task: str | None) -> int:
	"""Next order value among siblings (same project + parent_task)."""
	if parent_task:
		max_order = frappe.db.sql(
			"""
			select max(ifnull(custom_tree_order, 0))
			from `tabTask`
			where parent_task = %s
			  and ifnull(project, '') = ifnull(%s, '')
			""",
			(parent_task, project or ""),
		)
	else:
		max_order = frappe.db.sql(
			"""
			select max(ifnull(custom_tree_order, 0))
			from `tabTask`
			where (parent_task is null or parent_task = '')
			  and ifnull(project, '') = ifnull(%s, '')
			""",
			(project or "",),
		)
	current = cint(max_order[0][0]) if max_order and max_order[0] else 0
	return current + 10


def before_insert_task(doc, method=None):
	"""Assign default tree order for new tasks when field is empty."""
	if not doc or doc.doctype != "Task":
		return
	if not frappe.get_meta("Task").has_field(ORDER_FIELD):
		return
	if cint(doc.get(ORDER_FIELD)):
		return
	doc.set(ORDER_FIELD, next_tree_order(doc.project, doc.parent_task))


def _parse_ids(raw) -> list[str]:
	if raw is None or raw == "":
		return []
	if isinstance(raw, str):
		raw = json.loads(raw)
	return [str(x) for x in (raw or []) if x]


def _norm_parent(value) -> str | None:
	if value in (None, ""):
		return None
	return str(value)


def _ensure_parent_is_group(parent_task: str) -> None:
	"""ERPNext validate_parent_is_group requires destination parent.is_group."""
	if frappe.db.get_value("Task", parent_task, "is_group"):
		return
	frappe.db.set_value("Task", parent_task, "is_group", 1, update_modified=False)


def _assert_not_cycle(task: str, new_parent: str | None) -> None:
	"""Reject parent_task = self or descendant (cycle)."""
	if not new_parent:
		return
	if new_parent == task:
		frappe.throw(frappe._("Cannot move a task under itself"))
	current = new_parent
	seen = set()
	while current:
		if current == task:
			frappe.throw(frappe._("Cannot move a task under its descendant"))
		if current in seen:
			break
		seen.add(current)
		current = frappe.db.get_value("Task", current, "parent_task") or None


def _apply_sibling_order(ordered_ids: list[str], expected_parent: str | None) -> None:
	"""Write custom_tree_order for siblings under expected_parent."""
	for name in ordered_ids:
		if not frappe.has_permission("Task", "write", name):
			frappe.throw(frappe._("Not permitted to write Task {0}").format(name))
		row_parent = _norm_parent(frappe.db.get_value("Task", name, "parent_task"))
		if row_parent != expected_parent:
			frappe.throw(
				frappe._("Task {0} is not a sibling under the same parent").format(name)
			)

	for idx, name in enumerate(ordered_ids):
		frappe.db.set_value(
			"Task",
			name,
			ORDER_FIELD,
			(idx + 1) * 10,
			update_modified=False,
		)


def _reparent_task(task: str, new_parent: str | None) -> None:
	"""Persist parent_task via Document.save so ERPNext + app hooks run."""
	_assert_not_cycle(task, new_parent)
	if new_parent:
		if not frappe.db.exists("Task", new_parent):
			frappe.throw(frappe._("Parent Task {0} not found").format(new_parent))
		_ensure_parent_is_group(new_parent)

	doc = frappe.get_doc("Task", task)
	current = _norm_parent(doc.parent_task)
	if current == new_parent:
		return
	doc.parent_task = new_parent
	doc.save()


def reorder_siblings(
	task: str,
	parent_task: str | None = None,
	ordered_ids: list | str | None = None,
	from_ordered_ids: list | str | None = None,
):
	"""Move/reorder Task in tree.

	- Same parent: only rewrite ``custom_tree_order`` for ``ordered_ids``.
	- New parent: ``Document.save`` for ``parent_task``, then order destination
	  siblings; optionally reindex former siblings via ``from_ordered_ids``.
	"""
	ordered_ids = _parse_ids(ordered_ids)
	from_ordered_ids = _parse_ids(from_ordered_ids)

	if not task or task not in ordered_ids:
		frappe.throw(frappe._("Invalid reorder payload"))

	if not frappe.has_permission("Task", "read", task) or not frappe.has_permission(
		"Task", "write", task
	):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta("Task")
	if not meta.has_field(ORDER_FIELD):
		frappe.throw(frappe._("Tree order field is not installed"))

	old_parent = _norm_parent(frappe.db.get_value("Task", task, "parent_task"))
	# Explicit "" from client = project root; omit → keep current (legacy sibling call).
	if parent_task is None:
		new_parent = old_parent
	else:
		new_parent = _norm_parent(parent_task)

	reparented = old_parent != new_parent
	if reparented:
		_reparent_task(task, new_parent)

	_apply_sibling_order(ordered_ids, new_parent)

	if reparented and from_ordered_ids:
		if task in from_ordered_ids:
			frappe.throw(frappe._("Moved task must not appear in source sibling order"))
		_apply_sibling_order(from_ordered_ids, old_parent)

	result = {
		"updated": len(ordered_ids) + (len(from_ordered_ids) if reparented else 0),
		"reparented": 1 if reparented else 0,
		"parent_task": new_parent,
	}
	if reparented:
		# Moved task walks new parent chain; old_parent covers former ancestors.
		seeds = [task]
		if old_parent:
			seeds.append(old_parent)
		result["rows"] = collect_date_side_effect_rows(seeds)
	return result
