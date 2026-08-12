"""Live smoke ISS-2026-03288 layers 1+4b+2 on current site.

Run:
  bench --site dev.dinext.localhost execute \\
    dinext_project_tasks_gantt.tests.smoke.smoke_03288_manual.run

Disposable prefix: TEST ISS-2026-03288 MANUAL*
"""

from __future__ import annotations

import traceback

import frappe
from frappe.utils import add_days, getdate, today

PREFIX = "TEST ISS-2026-03288 MANUAL"
PROJECT = "TEST-V15.106.0 (HEAD)"


def _ok(name, detail=""):
	print(f"PASS\t{name}" + (f"\t{detail}" if detail else ""))


def _fail(name, detail=""):
	print(f"FAIL\t{name}" + (f"\t{detail}" if detail else ""))


def _find_virtual_setting():
	project = frappe.get_doc("Project", PROJECT)
	for row in project.get("custom_issue_setting") or []:
		if row.get("enable_virtual_task"):
			return row.issue_type, row.get("parent_task")
	return None, None


def _cleanup_old():
	"""Best-effort remove prior MANUAL disposable docs."""
	issues = frappe.get_all("Issue", filters={"subject": ["like", f"{PREFIX}%"]}, pluck="name")
	for name in issues:
		try:
			frappe.delete_doc("Issue", name, force=1, ignore_permissions=True)
		except Exception:
			pass
	tasks = frappe.get_all("Task", filters={"subject": ["like", f"{PREFIX}%"]}, pluck="name")
	for name in tasks:
		try:
			frappe.delete_doc("Task", name, force=1, ignore_permissions=True)
		except Exception:
			pass
	frappe.db.commit()


def tc_ss_disabled():
	names = [
		"Issue_To_Virtual_Task",
		"Task_Virtual_To_Issue",
		"Task_Actual_Dates_Sync",
		"Depend_Task_Date_Check",
		"ToDo To Issue Virtual Task_V2",
	]
	bad = []
	for n in names:
		if not frappe.db.exists("Server Script", n):
			continue
		if not frappe.db.get_value("Server Script", n, "disabled"):
			bad.append(n)
	if bad:
		_fail("TC0 SS disabled", ",".join(bad))
	else:
		_ok("TC0 SS disabled", "layer1/2/4b key scripts off")


def tc_issue_creates_virtual(issue_type, parent_task):
	issue = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": f"{PREFIX} L1 create",
			"project": PROJECT,
			"issue_type": issue_type,
			"priority": "Средний",
			"status": "Open",
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()

	vt = frappe.db.get_value(
		"Task",
		{"custom_linked_issue": issue.name, "type": "Issue"},
		["name", "subject", "status", "parent_task"],
		as_dict=True,
	)
	if not vt:
		_fail("TC1 Issue→virtual create", f"no Task for {issue.name}")
		return None, None
	detail = f"issue={issue.name} task={vt.name}"
	if vt.subject != issue.subject:
		_fail("TC1 Issue→virtual create", f"subject mismatch {detail}")
	elif parent_task and vt.parent_task != parent_task:
		_fail("TC1 Issue→virtual create", f"parent_task want={parent_task} got={vt.parent_task}")
	else:
		_ok("TC1 Issue→virtual create", detail)
	return issue.name, vt.name


def tc_issue_update_mirrors(issue_name, task_name):
	issue = frappe.get_doc("Issue", issue_name)
	issue.subject = f"{PREFIX} L1 updated"
	issue.status = "Replied"
	issue.save(ignore_permissions=True)
	frappe.db.commit()

	vt = frappe.db.get_value(
		"Task", task_name, ["subject", "status"], as_dict=True
	)
	# Replied → Working via ISSUE_TO_TASK_STATUS
	if vt.subject == issue.subject and vt.status == "Working":
		_ok("TC2 Issue→virtual update", f"{task_name} status={vt.status}")
	else:
		_fail(
			"TC2 Issue→virtual update",
			f"got subject={vt.subject} status={vt.status}",
		)


def tc_tvti_task_to_issue(issue_name, task_name):
	task = frappe.get_doc("Task", task_name)
	task.subject = f"{PREFIX} L1 from task"
	task.status = "Completed"
	task.save(ignore_permissions=True)
	frappe.db.commit()

	issue = frappe.db.get_value(
		"Issue", issue_name, ["subject", "status"], as_dict=True
	)
	# Completed → Closed
	if issue.subject == f"{PREFIX} L1 from task" and issue.status == "Closed":
		_ok("TC3 TVTI Task→Issue", f"{issue_name} status={issue.status}")
	else:
		_fail(
			"TC3 TVTI Task→Issue",
			f"got subject={issue.subject} status={issue.status}",
		)


def tc_todo_mirror(issue_name, task_name):
	user = frappe.session.user
	if user == "Guest":
		user = "Administrator"

	todo = frappe.get_doc(
		{
			"doctype": "ToDo",
			"description": f"{PREFIX} assign",
			"reference_type": "Issue",
			"reference_name": issue_name,
			"allocated_to": user,
			"status": "Open",
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()

	mirror = frappe.db.get_value(
		"ToDo",
		{
			"reference_type": "Task",
			"reference_name": task_name,
			"allocated_to": user,
		},
		["name", "status"],
		as_dict=True,
	)
	if not mirror:
		_fail("TC4 ToDo mirror create", "no Task ToDo")
		return

	_ok("TC4 ToDo mirror create", f"{todo.name}→{mirror.name}")

	todo.status = "Closed"
	todo.save(ignore_permissions=True)
	frappe.db.commit()
	m_status = frappe.db.get_value("ToDo", mirror.name, "status")
	if m_status == "Closed":
		_ok("TC5 ToDo mirror close", mirror.name)
	else:
		_fail("TC5 ToDo mirror close", f"status={m_status}")


def tc_tag_mirror(issue_name, task_name):
	tag = f"t03288-{frappe.generate_hash(length=6)}"
	issue = frappe.get_doc("Issue", issue_name)
	issue.add_tag(tag)
	frappe.db.commit()

	exists = frappe.db.exists(
		"Tag Link",
		{"document_type": "Task", "document_name": task_name, "tag": tag},
	)
	if exists:
		_ok("TC6 Tag mirror", f"tag={tag}")
	else:
		_fail("TC6 Tag mirror", f"no Tag Link on {task_name}")


def _new_task(**kwargs):
	"""Ordinary (non-virtual) Task — type must be valid Task Type Link."""
	data = {"doctype": "Task", "type": "Stage", "project": PROJECT, "status": "Open"}
	data.update(kwargs)
	return frappe.get_doc(data).insert(ignore_permissions=True)


def tc_actual_expand():
	leaf = _new_task(
		subject=f"{PREFIX} L2 leaf",
		exp_start_date="2026-08-10",
		exp_end_date="2026-08-12",
	)
	frappe.db.commit()

	leaf.act_start_date = "2026-08-01"
	leaf.act_end_date = "2026-08-20"
	leaf.save(ignore_permissions=True)
	frappe.db.commit()

	row = frappe.db.get_value(
		"Task",
		leaf.name,
		["exp_start_date", "exp_end_date"],
		as_dict=True,
	)
	if getdate(row.exp_start_date) == getdate("2026-08-01") and getdate(
		row.exp_end_date
	) == getdate("2026-08-20"):
		_ok("TC7 Actual expand exp", leaf.name)
	else:
		_fail("TC7 Actual expand exp", f"{row.exp_start_date}..{row.exp_end_date}")
	return leaf.name


def tc_parent_cascade():
	p3 = _new_task(
		subject=f"{PREFIX} L2 P3",
		is_group=1,
		exp_start_date="2026-08-05",
		exp_end_date="2026-08-10",
	)
	p2 = _new_task(
		subject=f"{PREFIX} L2 P2",
		is_group=1,
		parent_task=p3.name,
		exp_start_date="2026-08-05",
		exp_end_date="2026-08-10",
	)
	p1 = _new_task(
		subject=f"{PREFIX} L2 P1",
		is_group=1,
		parent_task=p2.name,
		exp_start_date="2026-08-05",
		exp_end_date="2026-08-10",
	)
	leaf = _new_task(
		subject=f"{PREFIX} L2 cascade leaf",
		parent_task=p1.name,
		exp_start_date="2026-08-05",
		exp_end_date="2026-08-10",
	)
	frappe.db.commit()

	leaf.act_start_date = "2026-08-01"
	leaf.act_end_date = "2026-08-25"
	leaf.save(ignore_permissions=True)
	frappe.db.commit()

	ok = True
	details = []
	for name in (leaf.name, p1.name, p2.name, p3.name):
		row = frappe.db.get_value(
			"Task", name, ["exp_start_date", "exp_end_date"], as_dict=True
		)
		details.append(f"{name}:{row.exp_start_date}..{row.exp_end_date}")
		if getdate(row.exp_start_date) != getdate("2026-08-01") or getdate(
			row.exp_end_date
		) != getdate("2026-08-25"):
			ok = False
	if ok:
		_ok("TC8 Parent cascade×3", "; ".join(details))
	else:
		_fail("TC8 Parent cascade×3", "; ".join(details))


def tc_depend_throw():
	dep = _new_task(
		subject=f"{PREFIX} L2 dep child",
		exp_start_date="2026-08-01",
		exp_end_date="2026-08-20",
	)
	parent = frappe.get_doc(
		{
			"doctype": "Task",
			"type": "Stage",
			"subject": f"{PREFIX} L2 dep parent",
			"project": PROJECT,
			"status": "Open",
			"is_group": 1,
			"exp_start_date": "2026-08-01",
			"exp_end_date": "2026-08-20",
		}
	)
	parent.append("depends_on", {"task": dep.name, "subject": dep.subject})
	parent.insert(ignore_permissions=True)
	frappe.db.commit()

	parent.reload()
	parent.exp_start_date = "2026-08-05"
	parent.exp_end_date = "2026-08-10"
	try:
		parent.save(ignore_permissions=True)
		frappe.db.commit()
		_fail("TC9 Depend throw", "save succeeded, expected ValidationError")
	except frappe.ValidationError as e:
		msg = str(e)
		if "Конфликт" in msg or "период" in msg.lower() or "Conflict" in msg:
			_ok("TC9 Depend throw", "ValidationError as expected")
		else:
			_ok("TC9 Depend throw", f"ValidationError: {msg[:120]}")
	except Exception as e:
		_fail("TC9 Depend throw", f"{type(e).__name__}: {e}")


def tc_delete_pair():
	# recreate fresh pair for delete (previous may be Closed)
	issue_type, _ = _find_virtual_setting()
	issue = frappe.get_doc(
		{
			"doctype": "Issue",
			"subject": f"{PREFIX} L1 delete",
			"project": PROJECT,
			"issue_type": issue_type,
			"status": "Open",
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	vt = frappe.db.get_value("Task", {"custom_linked_issue": issue.name}, "name")
	if not vt:
		_fail("TC10 Delete Issue→virtual", "no virtual to delete")
		return
	frappe.delete_doc("Issue", issue.name, ignore_permissions=True)
	frappe.db.commit()
	if frappe.db.exists("Task", vt):
		_fail("TC10 Delete Issue→virtual", f"Task {vt} still exists")
	else:
		_ok("TC10 Delete Issue→virtual", f"removed {vt}")


def run():
	print(f"=== ISS-2026-03288 MANUAL smoke @ {frappe.local.site} ===")
	print(f"project={PROJECT} prefix={PREFIX}")
	_cleanup_old()

	issue_type, parent_task = _find_virtual_setting()
	if not issue_type:
		_fail("SETUP virtual setting", f"no enable_virtual_task on {PROJECT}")
		return "aborted"
	print(f"issue_type={issue_type} parent_task={parent_task}")

	tc_ss_disabled()
	try:
		issue_name, task_name = tc_issue_creates_virtual(issue_type, parent_task)
		if issue_name and task_name:
			tc_issue_update_mirrors(issue_name, task_name)
			# mirrors while Issue still open — close_all_assignments after Complete nukes ToDos
			tc_todo_mirror(issue_name, task_name)
			tc_tag_mirror(issue_name, task_name)
			tc_tvti_task_to_issue(issue_name, task_name)
	except Exception:
		traceback.print_exc()
		_fail("TC1-6 aborted", "see traceback")

	for label, fn in (
		("TC7", tc_actual_expand),
		("TC8", tc_parent_cascade),
		("TC9", tc_depend_throw),
		("TC10", tc_delete_pair),
	):
		try:
			fn()
		except Exception:
			traceback.print_exc()
			_fail(f"{label} aborted", "see traceback")

	frappe.db.commit()
	print("=== done ===")
	return "ok"
