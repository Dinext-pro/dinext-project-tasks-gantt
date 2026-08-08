"""Task_Virtual_To_Issue — Task before_save → Issue via db.set_value (prod parity)."""

from __future__ import annotations

import frappe
from frappe.utils import now

from .dates import date_cmp_value, issue_resolution_fieldname
from .helpers import (
	ITVT_DEPTH,
	TASK_TO_ISSUE_PRIORITY,
	TASK_TO_ISSUE_STATUS,
	is_virtual_task,
)


def sync_virtual_task_to_issue(doc) -> None:
	"""Mirror virtual Task fields onto linked Issue. Skip when ITVT nested save (depth>0)."""
	if int(doc.flags.get(ITVT_DEPTH) or 0) != 0 or not is_virtual_task(doc):
		return

	status = doc.get("status")
	priority = doc.get("priority")
	new_status = TASK_TO_ISSUE_STATUS.get(status, status)
	new_priority = TASK_TO_ISSUE_PRIORITY.get(priority, priority)
	act_end_date = doc.get("act_end_date")

	issue = frappe.get_doc("Issue", doc.get("custom_linked_issue"), ignore_permissions=True)

	updates = {}
	field_updates = {
		"subject": doc.get("subject"),
		"owner": doc.get("owner"),
		"description": doc.get("description"),
		"project": doc.get("project"),
		"priority": new_priority,
		"custom_story_point": doc.get("story_point"),
		"status": new_status,
		"custom_expected_resolution_date": doc.get("exp_end_date"),
		"custom_include": doc.get("custom_include"),
	}

	date_fields = (
		"custom_expected_resolution_date",
		"resolution_date",
		"sla_resolution_date",
	)

	for fieldname, new_value in field_updates.items():
		old_value = issue.get(fieldname)
		if fieldname in date_fields:
			old_cmp = date_cmp_value(old_value)
			new_cmp = date_cmp_value(new_value)
		else:
			old_cmp = "" if old_value in (None, "") else str(old_value)
			new_cmp = "" if new_value in (None, "") else str(new_value)
		if old_cmp != new_cmp:
			updates[fieldname] = new_value

	# Prod: write resolution when act_end differs (empty never clears).
	if act_end_date:
		resolution_field = issue_resolution_fieldname(issue)
		if resolution_field:
			old_res_cmp = date_cmp_value(issue.get(resolution_field))
			new_res_cmp = date_cmp_value(act_end_date)
			if old_res_cmp != new_res_cmp:
				updates[resolution_field] = act_end_date

	# Extreme: db.set_value — avoid Issue_To_Virtual_Task ping-pong (ISS-2025-02315).
	if updates:
		for fieldname, value in updates.items():
			frappe.db.set_value("Issue", issue.name, fieldname, value, update_modified=False)
		frappe.db.set_value("Issue", issue.name, "modified", now(), update_modified=False)
