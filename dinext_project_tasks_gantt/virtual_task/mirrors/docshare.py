"""Зеркало DocShare Issue ↔ virtual Task (prod: DocShare To / Delete)."""

from __future__ import annotations

import frappe

from dinext_project_tasks_gantt.virtual_task.helpers import mirror_target_for_issue_or_task


def sync_docshare_mirror(doc) -> None:
	"""После insert/update DocShare на Issue/Task — зеркало прав тому же user на паре.

	Уже есть → db.set_value полей прав; нет → insert. notify_by_email всегда False.
	"""
	if doc.share_doctype not in ("Issue", "Task"):
		return

	target_type, target_name = mirror_target_for_issue_or_task(
		doc.share_doctype, doc.share_name
	)
	if not target_type:
		return

	existing = frappe.db.get_value(
		"DocShare",
		{"share_doctype": target_type, "share_name": target_name, "user": doc.user},
	)

	data = {
		"read": doc.read,
		"write": doc.write,
		"share": doc.share,
		"submit": doc.submit,
		"everyone": doc.everyone,
		"notify_by_email": False,
	}

	if existing:
		frappe.db.set_value("DocShare", existing, data)
		return

	new_docshare = frappe.new_doc("DocShare")
	new_docshare.share_doctype = target_type
	new_docshare.share_name = target_name
	new_docshare.user = doc.user
	new_docshare.update(data)
	new_docshare.insert(ignore_permissions=True)


def delete_docshare_mirror(doc) -> None:
	"""После удаления DocShare — снять такой же share у того же user на парной стороне."""
	if doc.share_doctype == "Issue":
		virtual_task = frappe.db.get_value(
			"Task", {"custom_linked_issue": doc.share_name}, "name"
		)
		if not virtual_task:
			return
		ds = frappe.db.get_value(
			"DocShare",
			{"share_doctype": "Task", "share_name": virtual_task, "user": doc.user},
		)
		if ds:
			frappe.delete_doc("DocShare", ds, ignore_permissions=True)
	elif doc.share_doctype == "Task":
		linked_issue = frappe.db.get_value("Task", doc.share_name, "custom_linked_issue")
		if not linked_issue:
			return
		ds = frappe.db.get_value(
			"DocShare",
			{"share_doctype": "Issue", "share_name": linked_issue, "user": doc.user},
		)
		if ds:
			frappe.delete_doc("DocShare", ds, ignore_permissions=True)
