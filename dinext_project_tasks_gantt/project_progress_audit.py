# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe

TABLE_FIELD = "custom_progress_history"
_CAPTURED_PERCENT_BY_PROJECT_FLAG = "_captured_project_percent_by_project"


def before_save_project(doc, method=None):
	if doc.doctype != "Project":
		return
	if not _project_has_history_table():
		return
	if doc.is_new():
		return

	prev = doc.get_doc_before_save()
	if not prev:
		return

	old_percent = prev.get("percent_complete")
	new_percent = doc.get("percent_complete")
	if _percent_equal(old_percent, new_percent):
		return

	doc.append(
		TABLE_FIELD,
		{
			"changed_on": frappe.utils.now_datetime(),
			"changed_by": frappe.session.user,
			"old_progress": old_percent,
			"new_progress": new_percent,
		},
	)


def before_insert_task(doc, method=None):
	if doc.doctype != "Task":
		return
	_capture_project_percentages(doc, [doc.get("project")])


def before_save_task(doc, method=None):
	if doc.doctype != "Task":
		return

	project_names = [doc.get("project")]
	prev = doc.get_doc_before_save()
	if prev:
		project_names.append(prev.get("project"))

	_capture_project_percentages(doc, project_names)


def on_trash_task(doc, method=None):
	if doc.doctype != "Task":
		return
	_capture_project_percentages(doc, [doc.get("project")])


def on_update_task(doc, method=None):
	if doc.doctype != "Task":
		return
	_sync_project_history_after_task_change(doc)


def after_delete_task(doc, method=None):
	if doc.doctype != "Task":
		return
	_sync_project_history_after_task_change(doc)


def _capture_project_percentages(doc, project_names: list[str | None]) -> None:
	if not _project_has_history_table():
		return

	names = [name for name in dict.fromkeys(project_names) if name]
	if not names:
		return

	rows = frappe.get_all(
		"Project",
		filters={"name": ["in", names]},
		fields=["name", "percent_complete"],
	)
	setattr(
		doc.flags,
		_CAPTURED_PERCENT_BY_PROJECT_FLAG,
		{row["name"]: row.get("percent_complete") for row in rows if row.get("name")},
	)


def _sync_project_history_after_task_change(doc) -> None:
	if not _project_has_history_table():
		return

	captured = getattr(doc.flags, _CAPTURED_PERCENT_BY_PROJECT_FLAG, {}) or {}
	current_project = doc.get("project")

	project_names = list(captured.keys())
	if current_project and current_project not in project_names:
		project_names.append(current_project)

	for project_name in project_names:
		if not project_name or not frappe.db.exists("Project", project_name):
			continue

		if project_name != current_project:
			project_doc = frappe.get_doc("Project", project_name)
			project_doc.update_project()

		old_percent = captured.get(project_name)
		new_percent = frappe.db.get_value("Project", project_name, "percent_complete")
		_insert_history_row_if_changed(project_name, old_percent, new_percent)


def _insert_history_row_if_changed(project_name: str, old_percent, new_percent) -> None:
	if _percent_equal(old_percent, new_percent):
		return

	row = frappe.get_doc(
		{
			"doctype": "Task Progress History",
			"parent": project_name,
			"parenttype": "Project",
			"parentfield": TABLE_FIELD,
			"idx": _next_history_idx(project_name),
			"changed_on": frappe.utils.now_datetime(),
			"changed_by": frappe.session.user,
			"old_progress": old_percent,
			"new_progress": new_percent,
		}
	)
	row.insert(ignore_permissions=True)


def _next_history_idx(project_name: str) -> int:
	return (
		frappe.db.count(
			"Task Progress History",
			filters={
				"parent": project_name,
				"parenttype": "Project",
				"parentfield": TABLE_FIELD,
			},
		)
		+ 1
	)


def _project_has_history_table() -> bool:
	return frappe.get_meta("Project").has_field(TABLE_FIELD)


def _percent_equal(old, new) -> bool:
	if old is None and new is None:
		return True
	try:
		return float(old if old is not None else 0) == float(new if new is not None else 0)
	except (TypeError, ValueError):
		return old == new
