"""Зеркало Tag Link Issue ↔ virtual Task (prod: Tag Link To Issue Virtual Task_V2).

Добавление тега создаёт Tag Link через insert — ловится doc_event after_insert.
Снятие тега в Desk идёт через DocTags.remove → update_tags → frappe.db.delete,
без on_trash/after_delete. Поэтому удаление зеркалится патчем update_tags.
"""

from __future__ import annotations

import frappe

from dinext_project_tasks_gantt.virtual_task.helpers import mirror_target_for_issue_or_task

_MIRROR_FLAG = "vt_tag_mirror"


def sync_tag_link_mirror(doc) -> None:
	"""После insert Tag Link на Issue/Task — повесить тот же тег на пару через add_tag."""
	if doc.document_type not in ("Issue", "Task"):
		return

	target_type, target_name = mirror_target_for_issue_or_task(doc.document_type, doc.document_name)

	if not target_type:
		return

	target_doc = frappe.get_doc(target_type, target_name)
	target_doc.add_tag(doc.tag)


def tags_removed_from_link(doctype: str, name: str, tags: str) -> list[str]:
	"""Теги, которые update_tags снимет: есть в Tag Link, нет в новой строке _user_tags."""
	if doctype not in ("Issue", "Task"):
		return []
	new_tags = {part.strip() for part in (tags or "").split(",") if part.strip()}
	existing = frappe.get_all(
		"Tag Link",
		filters={"document_type": doctype, "document_name": name},
		fields=["tag"],
	)
	return [row.tag for row in existing if row.tag not in new_tags]


def sync_tag_unlink_mirror(doctype: str, name: str, tag: str) -> None:
	"""Снять тот же тег с парного Issue / virtual Task."""
	if doctype not in ("Issue", "Task") or not tag:
		return

	target_type, target_name = mirror_target_for_issue_or_task(doctype, name)
	if not target_type:
		return

	target = frappe.get_doc(target_type, target_name)
	current = [part for part in target.get_tags() if part]
	if not any(part.lower() == tag.lower() for part in current):
		return

	prev = bool(getattr(frappe.flags, "ignore_permissions", False))
	frappe.flags.ignore_permissions = True
	try:
		target.remove_tag(tag)
	finally:
		frappe.flags.ignore_permissions = prev


def wrap_update_tags(original):
	"""После штатного update_tags снять с пары теги, удалённые на Issue/Task."""

	def update_tags(doc, tags):
		removed = []
		if not getattr(frappe.flags, _MIRROR_FLAG, False):
			removed = tags_removed_from_link(doc.doctype, doc.name, tags)

		original(doc, tags)

		if not removed or getattr(frappe.flags, _MIRROR_FLAG, False):
			return

		frappe.flags.vt_tag_mirror = True
		try:
			for tag in removed:
				sync_tag_unlink_mirror(doc.doctype, doc.name, tag)
		finally:
			frappe.flags.vt_tag_mirror = False

	update_tags._vt_tag_mirror = True
	return update_tags


def install_tag_delete_mirror() -> None:
	"""Подменить frappe update_tags один раз на процесс."""
	import frappe.desk.doctype.tag.tag as tag_module

	current = tag_module.update_tags
	if getattr(current, "_vt_tag_mirror", False):
		return
	tag_module.update_tags = wrap_update_tags(current)
