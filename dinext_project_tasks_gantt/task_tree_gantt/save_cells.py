# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Batch cell save for Task Tree Gantt (canonical fields only)."""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint, getdate


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

DATE_FIELDS = frozenset({"exp_start_date", "exp_end_date"})
MAX_ANCESTOR_DEPTH = 20


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


def _date_str(value):
	if value is None or value == "":
		return None
	return str(getdate(value))


def _persist_task(task_id: str, values: dict) -> None:
	"""Persist via Document.save() so ERPNext validate + DocType events run.

	Avoid db.set_value: skips ISS-2026-02606 date sync, PWA, status/Issue mirrors,
	treeview preventive validation, etc.
	"""
	doc = frappe.get_doc("Task", task_id)
	doc.update(values)
	doc.save()


def collect_date_side_effect_rows(task_ids: list[str]) -> list[dict]:
	"""Saved tasks + ancestors after Actual parent cascade may widen exp_*."""
	out: dict[str, dict] = {}
	for task_id in task_ids:
		current = task_id
		depth = 0
		while current and current not in out and depth <= MAX_ANCESTOR_DEPTH:
			data = frappe.db.get_value(
				"Task",
				current,
				["name", "exp_start_date", "exp_end_date", "parent_task"],
				as_dict=True,
			)
			if not data:
				break
			out[current] = {
				"id": data.name,
				"exp_start_date": _date_str(data.exp_start_date),
				"exp_end_date": _date_str(data.exp_end_date),
			}
			current = data.get("parent_task")
			depth += 1
	return list(out.values())


def save_cells(changes=None) -> dict:
	"""
	Persist Tree Gantt cell edits.

	changes: list of {id, field, value}

	When exp_* change, also returns `rows` — saved tasks + ancestors with
	current forecast dates so the tree UI can patch parent bars without reload.
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
	date_task_ids: list[str] = []
	for task_id, values in by_id.items():
		_persist_task(task_id, values)
		updated += 1
		if DATE_FIELDS.intersection(values):
			date_task_ids.append(task_id)

	result: dict = {"updated": updated}
	if date_task_ids:
		result["rows"] = collect_date_side_effect_rows(date_task_ids)
	return result
