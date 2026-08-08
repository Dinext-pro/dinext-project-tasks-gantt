"""ToDo To Issue Virtual Task_V2 — After Save mirror (prod parity)."""

from __future__ import annotations

import frappe

from .helpers import mirror_target_for_issue_or_task

_TODO_SYNC_FIELDS = (
	"description",
	"status",
	"priority",
	"date",
	"color",
	"assigned_by",
	"assigned_by_full_name",
)


def sync_todo_mirror(doc) -> None:
	if doc.flags.get("todo_sync_in_progress"):
		return
	if doc.reference_type not in ("Issue", "Task"):
		return

	target_type, target_name = mirror_target_for_issue_or_task(
		doc.reference_type, doc.reference_name
	)
	if not target_type:
		return

	existing_todo = frappe.db.get_value(
		"ToDo",
		{
			"reference_type": target_type,
			"reference_name": target_name,
			"allocated_to": doc.get("allocated_to"),
		},
		["name", "status"],
		as_dict=True,
	)

	data = {field: doc.get(field) for field in _TODO_SYNC_FIELDS}

	if doc.status in ("Closed", "Cancelled"):
		# Extreme: db.set_value — avoid close_all_assignments ping-pong (ISS-2025-02315)
		if not existing_todo:
			return
		todo_row = (
			frappe.db.get_value("ToDo", existing_todo.name, list(_TODO_SYNC_FIELDS), as_dict=True)
			or {}
		)
		updates = {}
		for fieldname, new_value in data.items():
			old_value = todo_row.get(fieldname)
			old_s = "" if old_value is None else str(old_value)
			new_s = "" if new_value is None else str(new_value)
			if old_s != new_s:
				updates[fieldname] = new_value
		if updates:
			frappe.db.set_value("ToDo", existing_todo.name, updates, update_modified=False)
		return

	if existing_todo:
		todo_row = (
			frappe.db.get_value("ToDo", existing_todo.name, list(_TODO_SYNC_FIELDS), as_dict=True)
			or {}
		)
		changed = False
		for fieldname, new_value in data.items():
			old_value = todo_row.get(fieldname)
			old_s = "" if old_value is None else str(old_value)
			new_s = "" if new_value is None else str(new_value)
			if old_s != new_s:
				changed = True
				break
		if changed:
			todo_doc = frappe.get_doc("ToDo", existing_todo.name)
			todo_doc.flags.todo_sync_in_progress = True
			todo_doc.update(data)
			todo_doc.save(ignore_permissions=True)
		return

	new_todo = frappe.new_doc("ToDo")
	new_todo.reference_type = target_type
	new_todo.reference_name = target_name
	new_todo.allocated_to = doc.get("allocated_to")
	new_todo.flags.todo_sync_in_progress = True
	new_todo.update(data)
	new_todo.insert(ignore_permissions=True)
