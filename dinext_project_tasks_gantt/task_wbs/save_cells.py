# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Batch cell save for Task WBS (canonical fields only)."""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint


ALLOWED_FIELDS = frozenset(
	{
		"subject",
		"status",
		"priority",
		"exp_start_date",
		"exp_end_date",
		"expected_time",
		"custom_include",
		"is_milestone",
		"custom_planned_start_date",
		"custom_planned_end_date",
	}
)


def _parse_changes(raw) -> list[dict]:
	if raw is None or raw == "":
		return []
	if isinstance(raw, str):
		raw = json.loads(raw)
	if not isinstance(raw, list):
		frappe.throw(frappe._("Invalid changes payload"))
	return raw


def _normalize_value(field: str, value):
	if field == "custom_include" or field == "is_milestone":
		return 1 if cint(value) else 0
	if value == "":
		return None
	return value


def save_cells(changes=None) -> dict:
	"""
	Persist WBS cell edits.

	changes: list of {id, field, value}
	"""
	if not frappe.has_permission("Task", "write"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	items = _parse_changes(changes)
	if not items:
		return {"updated": 0}

	# Group by Task id → field dict
	by_id: dict[str, dict] = {}
	for item in items:
		task_id = item.get("id") or item.get("rowId")
		field = item.get("field")
		if not task_id or field not in ALLOWED_FIELDS:
			frappe.throw(frappe._("Invalid field: {0}").format(field or "?"))
		if not frappe.has_permission("Task", "write", task_id):
			frappe.throw(
				frappe._("Not permitted to write Task {0}").format(task_id),
				frappe.PermissionError,
			)
		by_id.setdefault(task_id, {})[field] = _normalize_value(field, item.get("value"))

	updated = 0
	for task_id, values in by_id.items():
		frappe.db.set_value("Task", task_id, values, update_modified=True)
		updated += 1

	return {"updated": updated}
