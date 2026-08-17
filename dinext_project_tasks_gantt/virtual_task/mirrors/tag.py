"""Зеркало Tag Link Issue ↔ virtual Task (prod: Tag Link To Issue Virtual Task_V2)."""

from __future__ import annotations

import frappe

from dinext_project_tasks_gantt.virtual_task.helpers import mirror_target_for_issue_or_task


def sync_tag_link_mirror(doc) -> None:
	"""После insert Tag Link на Issue/Task — повесить тот же тег на пару через add_tag."""
	if doc.document_type not in ("Issue", "Task"):
		return

	target_type, target_name = mirror_target_for_issue_or_task(doc.document_type, doc.document_name)

	if not target_type:
		return

	target_doc = frappe.get_doc(target_type, target_name)
	target_doc.add_tag(doc.tag)
