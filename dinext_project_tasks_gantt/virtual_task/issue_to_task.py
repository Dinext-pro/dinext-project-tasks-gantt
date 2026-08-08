"""Issue_To_Virtual_Task — Issue after save → create/update virtual Task (prod parity)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cstr, getdate

from .dates import apply_task_actual_dates_logic, resolution_date_from_issue
from .helpers import ISSUE_TO_TASK_PRIORITY, ISSUE_TO_TASK_STATUS, ITVT_DEPTH


def sync_issue_to_virtual_task(doc) -> None:
	"""Create or update virtual Task when Project enables virtual task for issue_type."""
	if not doc.project or not doc.get("issue_type"):
		return

	project = frappe.get_doc("Project", doc.project, ignore_permissions=True)
	enable_flag = False
	parent_task = None

	for setting in project.get("custom_issue_setting") or []:
		if setting.issue_type == doc.issue_type:
			enable_flag = setting.get("enable_virtual_task")
			parent_task = setting.get("parent_task")
			break

	if not enable_flag:
		return

	task_name = frappe.db.get_value("Task", {"custom_linked_issue": doc.name}, "name")

	priority = doc.get("priority")
	status = doc.get("status")
	data = {
		"subject": doc.get("subject"),
		"owner": doc.get("owner"),
		"description": doc.get("description"),
		"project": doc.get("project"),
		"priority": ISSUE_TO_TASK_PRIORITY.get(priority, priority),
		"status": ISSUE_TO_TASK_STATUS.get(status, status),
		"exp_start_date": doc.get("opening_date"),
		"exp_end_date": doc.get("custom_expected_resolution_date"),
		# act_* not from opening_date / resolution (ISS-2025-02606)
		"custom_include": doc.get("custom_include"),
		"parent_task": parent_task,
	}

	if task_name:
		_update_existing_virtual_task(doc, task_name, data)
	else:
		_create_virtual_task(doc, data)


def _persist_virtual_task_or_throw(task_doc, is_new=False):
	cur = int(task_doc.flags.get(ITVT_DEPTH) or 0)
	task_doc.flags.itvt_save_depth = cur + 1
	try:
		if is_new:
			task_doc.insert(ignore_permissions=True)
		else:
			task_doc.save(ignore_permissions=True)
	except frappe.ValidationError as e:
		msg = cstr(e)
		if msg:
			raise
		frappe.throw(
			title=_("Невозможно сохранить задачу из обращения"),
			msg=_("Проверьте поля связанной задачи."),
			exc=frappe.ValidationError,
		)
	finally:
		task_doc.flags.itvt_save_depth = cur



def _ensure_parent_depends_on_link(child_name, parent_name, child_subject):
	"""ISS-2026-02796: privileged parent.depends_on before setting child.parent_task."""
	if not parent_name or not child_name:
		return
	parent = frappe.get_doc("Task", parent_name, ignore_permissions=True)
	changed = False
	if not parent.is_group:
		parent.is_group = True
		changed = True
	if child_name not in [row.task for row in (parent.depends_on or [])]:
		parent.append(
			"depends_on",
			{
				"doctype": "Task Depends On",
				"task": child_name,
				"subject": child_subject,
			},
		)
		changed = True
	if changed:
		parent.save(ignore_permissions=True)


def _update_existing_virtual_task(doc, task_name, data):
	current_act_start_date = frappe.db.get_value("Task", task_name, "act_start_date")
	current_act_end_date = frappe.db.get_value("Task", task_name, "act_end_date")
	current_completed_on_date = frappe.db.get_value("Task", task_name, "completed_on")
	resolution_date = resolution_date_from_issue(doc)
	effective_act_end_date = current_act_end_date

	if (
		resolution_date
		and current_act_end_date
		and getdate(resolution_date) > getdate(current_act_end_date)
	):
		effective_act_end_date = resolution_date
		data["act_end_date"] = resolution_date

	apply_task_actual_dates_logic(
		data,
		current_act_start_date,
		effective_act_end_date,
		current_completed_on_date,
	)

	task_doc = frappe.get_doc("Task", task_name, ignore_permissions=True)
	for fieldname in data:
		task_doc.set(fieldname, data[fieldname])

	_persist_virtual_task_or_throw(task_doc, is_new=False)


def _create_virtual_task(doc, data):
	apply_task_actual_dates_logic(data, None, None, None)

	intended_parent = data.get("parent_task")

	task = frappe.new_doc("Task")
	for fieldname in data:
		if fieldname == "parent_task":
			continue
		task.set(fieldname, data[fieldname])
	task.type = "Issue"
	task.custom_linked_issue = doc.name
	task.workflow_state = "_______"

	_persist_virtual_task_or_throw(task, is_new=True)
	task_name = task.name

	if intended_parent:
		_ensure_parent_depends_on_link(task.name, intended_parent, task.subject)
		task.parent_task = intended_parent
		_persist_virtual_task_or_throw(task, is_new=False)

	# Re-parent Tasks that pointed at Issue via issue field (ISS-2025-00821)
	existing_tasks = frappe.get_all(
		"Task",
		filters={"issue": doc.name},
		fields=["name"],
	)
	if existing_tasks:
		for existing_task in existing_tasks:
			frappe.db.set_value(
				"Task",
				existing_task.name,
				{"parent_task": task_name, "issue": None},
			)
		frappe.db.set_value("Task", task_name, {"is_group": True})

	_copy_docshares(doc.name, task_name)
	_copy_open_todos(doc.name, task_name)
	_copy_tag_links(doc.name, task_name)


def _copy_docshares(issue_name, task_name):
	docshares = frappe.get_all(
		"DocShare",
		filters={"share_doctype": "Issue", "share_name": issue_name},
		fields=["user", "read", "write", "share", "everyone", "notify_by_email"],
	)
	for ds in docshares:
		if frappe.db.exists(
			"DocShare",
			{"share_doctype": "Task", "share_name": task_name, "user": ds.user},
		):
			continue
		# App insert (prod SS used db.set_value insert hack)
		frappe.get_doc(
			{
				"doctype": "DocShare",
				"share_doctype": "Task",
				"share_name": task_name,
				"user": ds.user,
				"read": ds.read,
				"write": ds.write,
				"share": ds.share,
				"everyone": ds.everyone,
				"notify_by_email": ds.notify_by_email,
			}
		).insert(ignore_permissions=True)


def _copy_open_todos(issue_name, task_name):
	todos = frappe.get_all(
		"ToDo",
		filters={"reference_type": "Issue", "reference_name": issue_name, "status": "Open"},
		fields=["allocated_to", "description", "assigned_by"],
	)
	for todo in todos:
		if frappe.db.exists(
			"ToDo",
			{
				"reference_type": "Task",
				"reference_name": task_name,
				"allocated_to": todo.allocated_to,
			},
		):
			continue
		frappe.get_doc(
			{
				"doctype": "ToDo",
				"reference_type": "Task",
				"reference_name": task_name,
				"allocated_to": todo.allocated_to,
				"description": todo.description,
				"assigned_by": todo.assigned_by,
				"status": "Open",
			}
		).insert(ignore_permissions=True)


def _copy_tag_links(issue_name, task_name):
	has_title = frappe.db.exists("DocField", {"parent": "Tag Link", "fieldname": "title"})
	fields = ["tag", "title"] if has_title else ["tag"]
	tag_links = frappe.get_all(
		"Tag Link",
		filters={"document_type": "Issue", "document_name": issue_name},
		fields=fields,
	)
	for tag_link in tag_links:
		if frappe.db.exists(
			"Tag Link",
			{
				"document_type": "Task",
				"document_name": task_name,
				"tag": tag_link.tag,
			},
		):
			continue
		new_tag = {
			"doctype": "Tag Link",
			"document_type": "Task",
			"document_name": task_name,
			"tag": tag_link.tag,
		}
		if has_title and tag_link.get("title"):
			new_tag["title"] = tag_link["title"]
		frappe.get_doc(new_tag).insert(ignore_permissions=True)
