# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Weighted group Task progress rollup to direct parent (monotonic, chain via nested save)."""

import frappe
from frappe.utils import flt


def compute_raw_group_progress(parent_name: str) -> float | None:
	"""Weighted average of direct children's progress; only children with task_weight > 0.

	Returns None if there is no positive total weight (no contributing children).
	"""
	rows = frappe.get_all(
		"Task",
		filters={"parent_task": parent_name, "task_weight": (">", 0)},
		fields=["progress", "task_weight"],
	)
	if not rows:
		return None
	total_w = sum(flt(r.get("task_weight")) for r in rows)
	if total_w <= 0:
		return None
	numer = sum(flt(r.get("progress")) * flt(r.get("task_weight")) for r in rows)
	return min(100.0, flt(numer) / flt(total_w))


def try_recompute_parent_group_progress(parent_name: str) -> None:
	"""Recompute ``progress`` for group task ``parent_name`` from DB children; save only if it increases."""
	if not parent_name:
		return
	if not frappe.db.exists("Task", parent_name):
		return
	if not frappe.db.get_value("Task", parent_name, "is_group"):
		return

	raw = compute_raw_group_progress(parent_name)
	if raw is None:
		return

	cur = flt(frappe.db.get_value("Task", parent_name, "progress"))
	target = min(100.0, max(flt(raw), cur))

	if round(target, 2) <= round(cur, 2):
		return

	parent = frappe.get_doc("Task", parent_name)
	parent.flags.ignore_permissions = True
	parent.progress = round(target, 2)
	parent.save()


def try_update_direct_parent(child_doc, method=None) -> None:
	"""After a child Task is saved, refresh only its immediate parent's progress."""
	if child_doc.doctype != "Task":
		return
	parent = child_doc.get("parent_task")
	if not parent:
		return
	try_recompute_parent_group_progress(parent)


def on_update_task(doc, method=None) -> None:
	if doc.doctype != "Task":
		return
	if getattr(doc.flags, "skip_parent_progress_rollup", False):
		return
	try_update_direct_parent(doc)


def after_delete_task(doc, method=None) -> None:
	if doc.doctype != "Task":
		return
	if getattr(doc.flags, "skip_parent_progress_rollup", False):
		return
	parent = doc.get("parent_task")
	if not parent:
		return
	try_recompute_parent_group_progress(parent)
