# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe

TABLE_FIELD = "custom_progress_history"


def before_save_task(doc, method=None):
	if doc.doctype != "Task":
		return

	meta = frappe.get_meta("Task")
	if not meta.has_field(TABLE_FIELD):
		return

	# No audit rows on first insert (no prior persisted progress to compare).
	if doc.is_new():
		return

	prev = doc.get_doc_before_save()
	if not prev:
		return

	old_p = prev.get("progress")
	new_p = doc.get("progress")
	if _progress_equal(old_p, new_p):
		return

	doc.append(
		TABLE_FIELD,
		{
			"changed_on": frappe.utils.now_datetime(),
			"changed_by": frappe.session.user,
			"old_progress": old_p,
			"new_progress": new_p,
		},
	)


def _progress_equal(old, new) -> bool:
	if old is None and new is None:
		return True
	try:
		return float(old if old is not None else 0) == float(new if new is not None else 0)
	except (TypeError, ValueError):
		return old == new
