# -*- coding: utf-8 -*-
"""Live smoke: child forecast inherit on insert under existing parents."""
from __future__ import annotations

import frappe
from frappe.utils import getdate, today


def _clear_blank_type(doc):
	if doc.get("type") is not None and not str(doc.type).strip():
		doc.type = None


def run():
	frappe.set_user("Administrator")
	today_d = getdate(today())
	result = {"today": str(today_d), "cases": []}
	created = []

	parents = {
		"past-future": "TASK-2026-00137",
		"both-past": None,
		"future": None,
	}

	# Find extra parents in same project if possible
	project = frappe.db.get_value("Task", parents["past-future"], "project")
	rows = frappe.get_all(
		"Task",
		filters={"project": project, "is_group": 1},
		fields=["name", "exp_start_date", "exp_end_date"],
		limit=50,
	)
	for row in rows:
		start = getdate(row.exp_start_date) if row.exp_start_date else None
		end = getdate(row.exp_end_date) if row.exp_end_date else None
		if start and end and start < today_d and end < today_d and not parents["both-past"]:
			parents["both-past"] = row.name
		if start and start > today_d and not parents["future"]:
			parents["future"] = row.name

	try:
		for key, parent_name in parents.items():
			if not parent_name:
				result["cases"].append({"key": key, "ok": False, "detail": "no parent"})
				continue
			parent = frappe.get_doc("Task", parent_name)
			child = frappe.get_doc(
				{
					"doctype": "Task",
					"subject": f"ISS-00926 inherit smoke {key}",
					"project": parent.project,
					"parent_task": parent_name,
					"is_group": 0,
				}
			)
			_clear_blank_type(child)
			child.flags.ignore_links = True
			child.insert()
			created.append(child.name)
			child.reload()
			result["cases"].append(
				{
					"key": key,
					"parent": parent_name,
					"parent_start": str(getdate(parent.exp_start_date)) if parent.exp_start_date else None,
					"parent_end": str(getdate(parent.exp_end_date)) if parent.exp_end_date else None,
					"child": child.name,
					"child_start": str(getdate(child.exp_start_date)) if child.exp_start_date else None,
					"child_end": str(getdate(child.exp_end_date)) if child.exp_end_date else None,
				}
			)

		# User bug: insert already has parent dates copied 1:1
		parent_name = parents["past-future"]
		parent = frappe.get_doc("Task", parent_name)
		cloned = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": "ISS-00926 inherit smoke copied-window",
				"project": parent.project,
				"parent_task": parent_name,
				"is_group": 0,
				"exp_start_date": parent.exp_start_date,
				"exp_end_date": parent.exp_end_date,
			}
		)
		_clear_blank_type(cloned)
		cloned.flags.ignore_links = True
		cloned.insert()
		created.append(cloned.name)
		cloned.reload()
		result["cases"].append(
			{
				"key": "copied-window",
				"parent": parent_name,
				"parent_start": str(getdate(parent.exp_start_date)),
				"parent_end": str(getdate(parent.exp_end_date)),
				"child": cloned.name,
				"child_start": str(getdate(cloned.exp_start_date)) if cloned.exp_start_date else None,
				"child_end": str(getdate(cloned.exp_end_date)) if cloned.exp_end_date else None,
			}
		)

		ms = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": "ISS-00926 inherit smoke milestone",
				"project": parent.project,
				"parent_task": parent_name,
				"is_group": 0,
				"is_milestone": 1,
			}
		)
		_clear_blank_type(ms)
		ms.flags.ignore_links = True
		ms.insert()
		created.append(ms.name)
		ms.reload()
		result["cases"].append(
			{
				"key": "milestone",
				"parent": parent_name,
				"child": ms.name,
				"child_start": str(getdate(ms.exp_start_date)) if ms.exp_start_date else None,
				"child_end": str(getdate(ms.exp_end_date)) if ms.exp_end_date else None,
				"is_milestone": int(ms.is_milestone or 0),
			}
		)
	finally:
		for name in reversed(created):
			try:
				frappe.delete_doc("Task", name, force=True, ignore_permissions=True)
			except Exception as exc:
				result.setdefault("cleanup_errors", []).append(f"{name}: {exc}")
		frappe.db.commit()

	return result
