"""Task_Actual_Dates_Sync — Before Validate (prod parity).

Нормализует даты Task по факту:
- Completed: completed_on ↔ act_end; virtual без act_end ← completed_on;
- факт расширяет прогноз (exp_*), не сужает;
- выход child.exp за parent.exp → parent.save + flags (каскад).
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import getdate

from dinext_project_tasks_gantt.virtual_task.sync.dates import resolve_completed_on


PARENT_SYNC_FLAG = "task_actual_dates_parent_sync"
FORCE_PWA_FLAG = "task_dates_force_pwa_sync"
SYNC_DEPTH_FLAG = "task_actual_dates_sync_depth"
MAX_SYNC_DEPTH = 20


def apply_completed_on(doc) -> None:
	"""Fill / cap completed_on when status is Completed. No parent cascade."""
	if doc.get("status") != "Completed":
		return
	flags = getattr(doc, "flags", None)
	if flags and int(flags.get(PARENT_SYNC_FLAG) or 0):
		return
	doc.completed_on = resolve_completed_on(
		doc.get("act_end_date"), doc.get("completed_on")
	)


def sync_task_actual_dates(doc) -> None:
	"""Before Validate: нормализация act/exp + каскад parent_task (prod SS)."""
	act_start_date = doc.get("act_start_date")
	act_end_date = doc.get("act_end_date")
	is_parent_sync = int(doc.flags.get(PARENT_SYNC_FLAG) or 0)

	if doc.status == "Completed" and not is_parent_sync:
		apply_completed_on(doc)
		# ISS-2025-02315: virtual Task → Completed без act_end_date — факт из completed_on
		if (
			doc.get("type") == "Issue"
			and doc.get("custom_linked_issue")
			and not doc.get("act_end_date")
			and doc.get("completed_on")
		):
			doc.act_end_date = doc.completed_on
		act_end_date = doc.get("act_end_date")

	# Факт переписывает прогноз только при расширении периода.
	if not is_parent_sync:
		gd = getdate
		if act_start_date and (not doc.exp_start_date or gd(act_start_date) < gd(doc.exp_start_date)):
			doc.exp_start_date = act_start_date
		if act_end_date and (not doc.exp_end_date or gd(act_end_date) > gd(doc.exp_end_date)):
			doc.exp_end_date = act_end_date

	_cascade_parent_exp_dates(doc)


def _cascade_parent_exp_dates(doc) -> None:
	"""Если exp ребёнка шире родителя — расширить parent через save + flags."""
	parent_task = doc.get("parent_task")
	c_start = doc.get("exp_start_date")
	c_end = doc.get("exp_end_date")

	if not parent_task or not (c_start or c_end):
		return

	gd = getdate
	sync_depth = int(doc.flags.get(SYNC_DEPTH_FLAG) or 0)

	if sync_depth > MAX_SYNC_DEPTH:
		frappe.throw(_("Task actual dates parent sync depth limit exceeded"))

	parent_data = frappe.db.get_value(
		"Task",
		parent_task,
		["status", "exp_start_date", "exp_end_date"],
		as_dict=True,
	)

	if not parent_data or parent_data.get("status") == "Cancelled":
		return

	p_start = parent_data.get("exp_start_date")
	p_end = parent_data.get("exp_end_date")
	vals = {}

	if c_start and (not p_start or gd(c_start) < gd(p_start)):
		vals["exp_start_date"] = c_start

	if c_end and (not p_end or gd(c_end) > gd(p_end)):
		vals["exp_end_date"] = c_end

	if not vals:
		return

	parent_doc = frappe.get_doc("Task", parent_task, ignore_permissions=True)
	changed = False

	for fieldname, value in vals.items():
		current_value = parent_doc.get(fieldname)
		current_s = "" if current_value is None else str(current_value)
		next_s = "" if value is None else str(value)
		if current_s != next_s:
			parent_doc.set(fieldname, value)
			changed = True

	if changed:
		parent_doc.flags.task_actual_dates_parent_sync = True
		parent_doc.flags.task_dates_force_pwa_sync = True
		parent_doc.flags.task_actual_dates_sync_depth = sync_depth + 1
		parent_doc.flags.skip_pss_guard = True
		parent_doc.save(ignore_permissions=True)
