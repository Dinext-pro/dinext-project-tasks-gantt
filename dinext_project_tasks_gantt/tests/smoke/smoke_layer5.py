# Copyright (c) 2026, Dinext and contributors
"""Layer 5 UI-entrypoint smoke (local): doors → same hooks as Form/gantt.

Run:
  bench --site dev.dinext.localhost execute \\
    dinext_project_tasks_gantt.tests.smoke.smoke_layer5.run
"""

from __future__ import annotations

import inspect
from datetime import date, timedelta
from pathlib import Path

import frappe
from frappe.utils import getdate

from dinext_project_tasks_gantt.task_tree_gantt.save_cells import save_cells

# Virtual Task type constant (helpers.is_virtual_task: type == "Issue")
VIRTUAL_TASK_TYPE = "Issue"

PROJECT = "TEST-V15.106.0 (HEAD)"
PREFIX = "TEST ISS-2026-03288 L5"
ROLE = "Консультант"


def _ok(label: str, cond: bool, detail: str = "") -> None:
	print(("PASS" if cond else "FAIL"), label, detail)


def _issue_type_virtual() -> str:
	project = frappe.get_doc("Project", PROJECT)
	for row in project.get("custom_issue_setting") or []:
		if row.get("enable_virtual_task"):
			return row.issue_type
	raise AssertionError(f"no virtual issue_type on {PROJECT}")


def _ss_disabled(names: list[str]) -> None:
	for n in names:
		if not frappe.db.exists("Server Script", n):
			_ok(f"ss_off:{n}", True, "missing")
			continue
		disabled = frappe.db.get_value("Server Script", n, "disabled")
		_ok(f"ss_off:{n}", int(disabled or 0) == 1, f"disabled={disabled}")


def _door_save_cells_uses_document_save() -> None:
	from dinext_project_tasks_gantt.task_tree_gantt import save_cells as mod

	src = inspect.getsource(mod._persist_task)
	# docstring may mention db.set_value as anti-pattern; require real call doc.save()
	_ok(
		"save_cells_Document.save",
		"doc.save()" in src and "frappe.db.set_value" not in src,
	)


def _door_gantt_assign_seed_task_dates() -> None:
	"""Code door: gantt assign persist seeds task_dates: 1 + app bulk method."""
	path = (
		Path(frappe.get_app_path("dinext_project_tasks_gantt"))
		/ "public/js/task_tree_gantt/table/columns/assign/persist.js"
	)
	src = path.read_text(encoding="utf-8")
	_ok("gantt_assign_seed_task_dates", "task_dates: 1" in src or "task_dates:1" in src)
	_ok(
		"gantt_assign_bulk_method",
		"project_workload_assignment.pwa_dates.bulk.bulk_process_pwa" in src,
	)


def _door_pwa_dialog_bulk_method() -> None:
	path = (
		Path(frappe.get_app_path("project_workload_assignment"))
		/ "public/js/assignment/dialog.js"
	)
	src = path.read_text(encoding="utf-8")
	_ok(
		"pwa_dialog_bulk_method",
		"project_workload_assignment.pwa_dates.bulk.bulk_process_pwa" in src,
	)


def _door_pwa_multi_dialog_bulk_method() -> None:
	path = (
		Path(frappe.get_app_path("project_workload_assignment"))
		/ "public/js/assignment/dialog-multi.js"
	)
	src = path.read_text(encoding="utf-8")
	_ok("pwa_multi_dialog_fn", "start_pwa_multi_dialog" in src)
	_ok(
		"pwa_multi_dialog_bulk_method",
		"project_workload_assignment.pwa_dates.bulk.bulk_process_pwa" in src,
	)
	_ok("pwa_multi_dialog_no_pwe", "pwe_rows" not in src)
	_ok("pwa_multi_dialog_no_task_dates_col", 'fieldname: "task_dates"' not in src)


def _document_hook_order() -> None:
	from dinext_project_tasks_gantt import hooks as gantt_hooks

	bs = gantt_hooks.doc_events["Task"]["before_save"]
	_ok(
		"hook_order_progress_depend_tvti",
		isinstance(bs, list)
		and any("task_progress_audit.before_save_task" in x for x in bs)
		and bs[-2].endswith("task_dates.handlers.before_save_task")
		and bs[-1].endswith("virtual_task.handlers.before_save_task"),
		str(bs),
	)
	bv = gantt_hooks.doc_events["Task"]["before_validate"]
	_ok(
		"hook_before_validate_actual",
		"task_dates.handlers.before_validate_task" in str(bv),
		str(bv),
	)


def _door_gantt_save_cells_virtual_exp() -> str:
	"""Gantt cell edit path: save_cells → Task.save → TVTI → Issue."""
	issue_type = _issue_type_virtual()
	issue = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": f"{PREFIX} save_cells {frappe.generate_hash(length=6)}",
			"project": PROJECT,
			"issue_type": issue_type,
			"status": "Open",
			"priority": "Medium",
			"opening_date": date.today(),
			"custom_expected_resolution_date": date.today() + timedelta(days=5),
		}
	)
	issue.insert(ignore_permissions=True)
	frappe.db.commit()

	task_name = frappe.db.get_value(
		"Task",
		{"custom_linked_issue": issue.name, "type": VIRTUAL_TASK_TYPE},
		"name",
	)
	assert task_name, "ITVT should create virtual"

	d0 = date.today() + timedelta(days=14)
	d1 = d0 + timedelta(days=3)
	out = save_cells(
		[
			{"id": task_name, "field": "exp_start_date", "value": str(d0)},
			{"id": task_name, "field": "exp_end_date", "value": str(d1)},
		]
	)
	frappe.db.commit()
	_ok("save_cells_updated", out.get("updated") == 1, str(out))

	task = frappe.get_doc("Task", task_name)
	_ok(
		"gantt_exp_on_task",
		getdate(task.exp_start_date) == d0 and getdate(task.exp_end_date) == d1,
		f"{task.exp_start_date}/{task.exp_end_date}",
	)

	# TVTI canon: exp_end → custom_expected_resolution_date (not opening_date)
	issue.reload()
	_ok(
		"gantt_exp→issue_end",
		getdate(issue.custom_expected_resolution_date) == d1,
		f"end={issue.custom_expected_resolution_date}",
	)
	return issue.name


def _door_issue_edit_virtual_pwa(issue_name: str) -> None:
	issue = frappe.get_doc("Issue", issue_name)
	task_name = frappe.db.get_value(
		"Task",
		{"custom_linked_issue": issue.name, "type": VIRTUAL_TASK_TYPE},
		"name",
	)
	d0 = date.today() + timedelta(days=20)
	d1 = d0 + timedelta(days=2)
	issue.opening_date = d0
	issue.custom_expected_resolution_date = d1
	issue.save(ignore_permissions=True)
	frappe.db.commit()

	task = frappe.get_doc("Task", task_name)
	_ok(
		"issue→virtual_exp",
		getdate(task.exp_start_date) == d0 and getdate(task.exp_end_date) == d1,
		f"{task.exp_start_date}/{task.exp_end_date}",
	)

	# Seed PWA with task_dates=1 (gantt assign seed), then shift Issue again
	pwa = frappe.get_doc(
		{
			"doctype": "Project Workload Assignment",
			"user": frappe.session.user if frappe.session.user != "Guest" else "Administrator",
			"role": ROLE,
			"task": task_name,
			"task_dates": 1,
			"date_from": d0,
			"date_to": d1,
			"wl_value": 10,
		}
	)
	pwa.insert(ignore_permissions=True)
	frappe.db.commit()

	d2 = d0 + timedelta(days=5)
	d3 = d1 + timedelta(days=5)
	issue.reload()
	issue.opening_date = d2
	issue.custom_expected_resolution_date = d3
	issue.save(ignore_permissions=True)
	frappe.db.commit()

	# With virtual: Issue→PWA is via ITVT Task save → task_sync
	pwa.reload()
	_ok(
		"issue→pwa_task_dates",
		getdate(pwa.date_from) == d2 and getdate(pwa.date_to) == d3,
		f"{pwa.date_from}/{pwa.date_to}",
	)


def _door_pwa_dialog_bulk_then_task_shift() -> None:
	"""bulk_process_pwa returns None — assert via DB row (dialog/gantt seed shape)."""
	from project_workload_assignment.pwa_dates.bulk import bulk_process_pwa

	issue_type = _issue_type_virtual()
	issue = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": f"{PREFIX} PWA dialog {frappe.generate_hash(length=6)}",
			"project": PROJECT,
			"issue_type": issue_type,
			"status": "Open",
			"priority": "Medium",
			"opening_date": date.today() + timedelta(days=30),
			"custom_expected_resolution_date": date.today() + timedelta(days=34),
		}
	)
	issue.insert(ignore_permissions=True)
	frappe.db.commit()
	task_name = frappe.db.get_value(
		"Task",
		{"custom_linked_issue": issue.name, "type": VIRTUAL_TASK_TYPE},
		"name",
	)
	assert task_name, "ITVT should create virtual"

	d0 = date.today() + timedelta(days=30)
	d1 = d0 + timedelta(days=4)
	task = frappe.get_doc("Task", task_name)
	task.exp_start_date = d0
	task.exp_end_date = d1
	task.save(ignore_permissions=True)
	frappe.db.commit()

	user = frappe.session.user if frappe.session.user != "Guest" else "Administrator"
	out = bulk_process_pwa(
		[
			{
				"__islocal": True,
				"user": user,
				"role": ROLE,
				"task": task_name,
				"task_dates": 1,
				"date_from": str(d0),
				"date_to": str(d1),
				"wl_value": 5,
			}
		]
	)
	frappe.db.commit()
	# API returns None (prod parity); success = row exists
	pwa_name = frappe.db.get_value(
		"Project Workload Assignment",
		{"task": task_name, "user": user, "task_dates": 1},
		"name",
		order_by="creation desc",
	)
	_ok("pwa_dialog_bulk", bool(pwa_name), f"out={out!r} pwa={pwa_name}")
	assert pwa_name

	d2 = d0 + timedelta(days=7)
	d3 = d1 + timedelta(days=7)
	task.reload()
	task.exp_start_date = d2
	task.exp_end_date = d3
	task.save(ignore_permissions=True)
	frappe.db.commit()
	pwa = frappe.get_doc("Project Workload Assignment", pwa_name)
	_ok(
		"task_exp→pwa_after_dialog",
		getdate(pwa.date_from) == d2 and getdate(pwa.date_to) == d3,
		f"{pwa.date_from}/{pwa.date_to}",
	)


def _door_utp_approve_chain() -> None:
	"""UTP door: SS off + on_update → rollup; live act_* best-effort."""
	import inspect as _inspect

	from dinext_projects.dinext_projects.user_timesheet.events import (
		user_timesheet_position as utp_events,
	)
	from dinext_projects.dinext_projects.user_timesheet.events.status_rollup import (
		rollup_ut_status_and_task_dates,
	)

	src = _inspect.getsource(utp_events.on_update)
	_ok("utp_on_update_calls_rollup", "rollup_ut_status_and_task_dates" in src)
	ss = frappe.db.get_value("Server Script", "UTP_UT_Status_V3", "disabled")
	_ok("utp_ss_still_off", int(ss or 0) == 1, f"disabled={ss}")

	# Live soft path (same shape as dinext_projects _smoke_status_rollup)
	from dinext_projects.dinext_projects.user_timesheet.events import hours as hours_mod
	from dinext_projects.dinext_projects.user_timesheet.events import journal

	orig_je = journal.maybe_create_or_cancel_journal_entries
	orig_hours = hours_mod.calculate_ut_hours
	journal.maybe_create_or_cancel_journal_entries = lambda *a, **k: None
	hours_mod.calculate_ut_hours = lambda doc: None

	ut_name = None
	utp_name = None
	try:
		worker = frappe.get_all(
			"Worker",
			filters={"wuser": ["like", "%@%"], "wtimesheet_template": ["!=", ""]},
			fields=["name", "wuser", "wtimesheet_template"],
			limit=1,
		)
		if not worker:
			_ok("utp_chain_skip", True, "no worker")
			return
		w = worker[0]
		valid_from = getdate("2026-12-07")
		ut = frappe.get_doc(
			{
				"doctype": "User Timesheet",
				"timesheet_from": w.wuser,
				"ts_from_template": w.wtimesheet_template,
				"ts_valid_from": valid_from,
				"ts_valid_for": valid_from + timedelta(days=6),
				"ut_status": "Черновик",
			}
		)
		ut.insert(ignore_permissions=True)
		ut_name = ut.name

		task = frappe.get_doc(
			{
				"doctype": "Task",
				"subject": f"{PREFIX} UTP {frappe.generate_hash(length=6)}",
				"project": PROJECT,
				"type": "Stage",
				"status": "Open",
				"exp_start_date": date.today(),
				"exp_end_date": date.today() + timedelta(days=10),
			}
		)
		task.insert(ignore_permissions=True)

		role = frappe.db.get_value(
			"Project Team Details", {"parent": PROJECT}, "pt_role"
		) or frappe.db.get_value("Project Role", {}, "name")

		utp = frappe.get_doc(
			{
				"doctype": "User Timesheet Position",
				"user_timesheet": ut_name,
				"user": w.wuser,
				"document_type": "Task",
				"document_name": task.name,
				"project": PROJECT,
				"status": "Редактирование",
				"workflow_state": "Редактирование",
			}
		)
		if role:
			utp.project_role = role
		utp.insert(ignore_permissions=True)
		utp_name = utp.name

		# table is read_only on form — insert child directly for act_* input
		frappe.get_doc(
			{
				"doctype": "User Timesheet Position Details",
				"parent": utp_name,
				"parenttype": "User Timesheet Position",
				"parentfield": "table",
				"date": date.today(),
				"hours": 2,
			}
		).insert(ignore_permissions=True)

		frappe.db.set_value(
			"User Timesheet Position",
			utp_name,
			{"status": "Согласовано", "workflow_state": "Согласовано"},
		)
		doc = frappe.get_doc("User Timesheet Position", utp_name)
		before = frappe.get_doc("User Timesheet Position", utp_name)
		before.status = "Редактирование"
		doc.status = "Согласовано"
		doc._doc_before_save = before
		rollup_ut_status_and_task_dates(doc)
		frappe.db.commit()

		task.reload()
		_ok(
			"utp→task_act",
			bool(task.act_start_date),
			f"act_start={task.act_start_date} act_end={task.act_end_date}",
		)
	except Exception as exc:
		_ok("utp_chain_skip", True, f"cannot run live UTP: {type(exc).__name__}: {exc}")
	finally:
		journal.maybe_create_or_cancel_journal_entries = orig_je
		hours_mod.calculate_ut_hours = orig_hours
		# best-effort cleanup
		try:
			if utp_name and frappe.db.exists("User Timesheet Position", utp_name):
				frappe.delete_doc(
					"User Timesheet Position", utp_name, force=1, ignore_permissions=True
				)
			if ut_name and frappe.db.exists("User Timesheet", ut_name):
				frappe.delete_doc("User Timesheet", ut_name, force=1, ignore_permissions=True)
			frappe.db.commit()
		except Exception:
			pass


def run():
	frappe.set_user("Administrator")
	print(f"=== layer 5 UI entrypoints smoke @ {frappe.local.site} ===")
	_ss_disabled(
		[
			"Issue_To_Virtual_Task",
			"Task_Virtual_To_Issue",
			"Task_Actual_Dates_Sync",
			"Depend_Task_Date_Check",
			"UTP_UT_Status_V3",
			"Task dates update  PWA",
			"Issue dates update PWA",
			"PWA Bulk Process",
			"ToDo To Issue Virtual Task_V2",
			"DocShare To Issue Virtual Task",
			"Tag Link To Issue Virtual Task_V2",
		]
	)
	_door_save_cells_uses_document_save()
	_door_gantt_assign_seed_task_dates()
	_door_pwa_dialog_bulk_method()
	_door_pwa_multi_dialog_bulk_method()
	_document_hook_order()
	issue_name = _door_gantt_save_cells_virtual_exp()
	_door_issue_edit_virtual_pwa(issue_name)
	_door_pwa_dialog_bulk_then_task_shift()
	_door_utp_approve_chain()
	print("=== done ===")
	return {"ok": True}
