# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""ISS-2026-02536 #5.1: sibling order via Task.custom_tree_order."""

from __future__ import annotations

import frappe
from frappe.utils import cint


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


@frappe.whitelist()
def reorder_siblings(task: str, parent_task: str | None = None, ordered_ids: list | str | None = None):
	"""Persist sibling order within one parent. Dates unchanged.

	ordered_ids: full sibling list in desired order (Task names).
	``task`` must be in ordered_ids; parent must match for all.
	"""
	if isinstance(ordered_ids, str):
		import json

		ordered_ids = json.loads(ordered_ids)
	ordered_ids = [str(x) for x in (ordered_ids or []) if x]
	if not task or task not in ordered_ids:
		frappe.throw(frappe._("Invalid reorder payload"))

	if not frappe.has_permission("Task", "write", task):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta("Task")
	if not meta.has_field(ORDER_FIELD):
		frappe.throw(frappe._("Tree order field is not installed"))

	task_parent = frappe.db.get_value("Task", task, "parent_task") or None
	expected_parent = parent_task if parent_task not in (None, "") else task_parent
	if (task_parent or None) != (expected_parent or None):
		frappe.throw(frappe._("Reorder only allowed within the same parent"))

	# Validate every id is a sibling under the same parent.
	for name in ordered_ids:
		if not frappe.has_permission("Task", "write", name):
			frappe.throw(frappe._("Not permitted to write Task {0}").format(name))
		row_parent = frappe.db.get_value("Task", name, "parent_task") or None
		if (row_parent or None) != (expected_parent or None):
			frappe.throw(
				frappe._("Task {0} is not a sibling under the same parent").format(name)
			)

	# Spacing of 10 leaves room for future inserts without full reindex.
	for idx, name in enumerate(ordered_ids):
		frappe.db.set_value(
			"Task",
			name,
			ORDER_FIELD,
			(idx + 1) * 10,
			update_modified=False,
		)

	return {"updated": len(ordered_ids)}
