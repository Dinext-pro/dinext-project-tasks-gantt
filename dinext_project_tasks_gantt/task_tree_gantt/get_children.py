# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Load Task rows for Tree Gantt DinextTable (canonical contract, not TreeView SS shape)."""

from __future__ import annotations

import json

import frappe
from frappe.utils import add_user_info, cint


ALLOWED_SORT_FIELDS = frozenset(
	{
		"subject",
		"status",
		"priority",
		"exp_start_date",
		"exp_end_date",
		"expected_time",
		"progress",
		"creation",
		"modified",
		"custom_planned_start_date",
		"custom_planned_end_date",
		"custom_tree_order",
	}
)


def _param(kwargs: dict, key: str, default=None):
	if key in kwargs and kwargs[key] is not None and kwargs[key] != "":
		return kwargs[key]
	# form_dict fallback only for desk debugging; preferred path is explicit kwargs
	val = frappe.form_dict.get(key)
	if val is None or val == "":
		return default
	return val


def _truthy(val) -> bool:
	if val is None or val == "":
		return False
	if isinstance(val, bool):
		return val
	return bool(cint(val))


def _parse_assign(raw) -> list[str]:
	if not raw:
		return []
	if isinstance(raw, list):
		return [str(x) for x in raw if x]
	try:
		parsed = json.loads(raw)
		if isinstance(parsed, list):
			return [str(x) for x in parsed if x]
	except (TypeError, ValueError, json.JSONDecodeError):
		pass
	return []


def _type_labels(rows: list[dict]) -> None:
	"""Set task_type_label; keep task_type as raw code."""
	task_types = frappe.get_all("Task Type", fields=["name", "custom_title"])
	type_title = {t["name"]: t.get("custom_title") or t["name"] for t in task_types}

	issue_ids = {
		row.get("custom_linked_issue")
		for row in rows
		if row.get("task_type") == "Issue" and row.get("custom_linked_issue")
	}
	issue_types = {}
	if issue_ids:
		for issue in frappe.get_all(
			"Issue",
			filters={"name": ("in", list(issue_ids))},
			fields=["name", "issue_type"],
		):
			issue_types[issue["name"]] = issue.get("issue_type") or "Issue"

	for row in rows:
		code = row.get("task_type")
		if code == "Issue":
			row["task_type_label"] = issue_types.get(row.get("custom_linked_issue"), "Issue")
		else:
			row["task_type_label"] = type_title.get(code, code or "")


def _attach_relations(rows: list[dict]) -> None:
	names = [row["id"] for row in rows if row.get("id")]
	by_parent: dict[str, list] = {name: [] for name in names}
	if names:
		for rel in frappe.get_all(
			"Task Relation",
			filters={"parent": ("in", names), "is_active": 1},
			fields=["name", "parent", "predecessor", "type", "buffer_days", "project"],
		):
			by_parent.setdefault(rel["parent"], []).append(rel)

	pred_ids = {
		rel["predecessor"]
		for rels in by_parent.values()
		for rel in rels
		if rel.get("predecessor")
	}
	subjects: dict[str, str] = {}
	if pred_ids:
		for task in frappe.get_all(
			"Task",
			filters={"name": ("in", list(pred_ids))},
			fields=["name", "subject"],
		):
			subjects[task["name"]] = task.get("subject") or ""

	for rels in by_parent.values():
		for rel in rels:
			rel["predecessor_subject"] = subjects.get(rel.get("predecessor"), "")

	for row in rows:
		row["relations"] = by_parent.get(row["id"], [])


def _publish_assign_user_info(rows: list[dict]) -> None:
	"""Expose assignee fullname/image for frappe.avatar_group (boot.user_info)."""
	users: set[str] = set()
	for row in rows:
		for user in row.get("assign") or []:
			if user:
				users.add(user)
	if not users:
		return
	user_info: dict = {}
	add_user_info(users, user_info)
	if user_info:
		# Same channel as frappe.handler message payload (list views use this key).
		frappe.response["user_info"] = user_info


def _attach_assign_sources(rows: list[dict]) -> None:
	"""Split assign into PWA-backed vs Open-ToDo-only (for avatar chrome)."""
	task_ids = [row["id"] for row in rows if row.get("id")]
	pwa_by_task: dict[str, set[str]] = {tid: set() for tid in task_ids}
	if task_ids and frappe.db.exists("DocType", "Project Workload Assignment"):
		for rec in frappe.get_all(
			"Project Workload Assignment",
			filters={"task": ("in", task_ids)},
			fields=["task", "user"],
			limit_page_length=0,
		):
			task = rec.get("task")
			user = rec.get("user")
			if task and user and task in pwa_by_task:
				pwa_by_task[task].add(user)

	for row in rows:
		assign = list(row.get("assign") or [])
		pwa_users = [u for u in assign if u in pwa_by_task.get(row["id"], ())]
		pwa_set = set(pwa_users)
		row["assign_pwa"] = pwa_users
		row["assign_todo_only"] = [u for u in assign if u not in pwa_set]


def _to_canonical(row: dict) -> dict:
	return {
		"id": row["name"],
		"subject": row.get("subject") or "",
		"has_children": bool(row.get("is_group")),
		"task_type": row.get("type"),
		"task_type_label": "",
		"status": row.get("status"),
		"priority": row.get("priority"),
		"assign": _parse_assign(row.get("_assign")),
		"assign_pwa": [],
		"assign_todo_only": [],
		"user_tags": row.get("_user_tags") or "",
		"custom_planned_start_date": row.get("custom_planned_start_date"),
		"custom_planned_end_date": row.get("custom_planned_end_date"),
		"exp_start_date": row.get("exp_start_date"),
		"exp_end_date": row.get("exp_end_date"),
		"act_start_date": row.get("act_start_date"),
		"act_end_date": row.get("act_end_date"),
		"expected_time": row.get("expected_time"),
		"duration": row.get("duration"),
		"progress": row.get("progress") or 0,
		"parent_task": row.get("parent_task") or None,
		"custom_tree_order": cint(row.get("custom_tree_order")),
		"custom_include": 1 if row.get("custom_include") else 0,
		"custom_linked_issue": row.get("custom_linked_issue"),
		"is_milestone": 1 if row.get("is_milestone") else 0,
		"color": row.get("color"),
		"owner": row.get("owner"),
		"confirm": 1 if row.get("confirm") else 0,
		"relations": [],
	}


def get_children(**kwargs) -> list[dict]:
	"""
	Return Tree Gantt rows for DinextTable.

	Args:
	        project: Project name (required)
	        parent_task: None → project roots; else children of this Task
	        all_tasks: if true, all tasks in project (ignore parent_task null filter)
	        status, priority, assign, tag: optional filters
	        sort_field, sort_order, limit: optional
	"""
	if not frappe.has_permission("Task", "read"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	project = _param(kwargs, "project")
	if not project:
		frappe.throw(frappe._("Project is required"))

	parent_task = _param(kwargs, "parent_task")
	# Legacy alias during transition — prefer parent_task
	if parent_task is None and "parent" in kwargs and not _truthy(_param(kwargs, "is_root")):
		parent_task = _param(kwargs, "parent")

	all_tasks = _truthy(_param(kwargs, "all_tasks")) or _truthy(_param(kwargs, "is_all"))
	status = _param(kwargs, "status")
	priority = _param(kwargs, "priority")
	assign_filter = _param(kwargs, "assign")
	tag = _param(kwargs, "tag")
	sort_field = _param(kwargs, "sort_field")
	sort_order = (_param(kwargs, "sort_order") or "asc").lower()
	limit = _param(kwargs, "limit")

	Task = frappe.qb.DocType("Task")
	assign_col = frappe.qb.Field("_assign")
	tags_col = frappe.qb.Field("_user_tags")
	has_tree_order = frappe.get_meta("Task").has_field("custom_tree_order")

	select_cols = [
		Task.name,
		Task.subject,
		Task.is_group,
		Task.type,
		Task.status,
		Task.priority,
		assign_col,
		tags_col,
		Task.custom_planned_start_date,
		Task.custom_planned_end_date,
		Task.exp_start_date,
		Task.exp_end_date,
		Task.act_start_date,
		Task.act_end_date,
		Task.expected_time,
		Task.duration,
		Task.progress,
		Task.parent_task,
		Task.custom_include,
		Task.custom_linked_issue,
		Task.is_milestone,
		Task.color,
		Task.owner,
		Task.confirm,
	]
	if has_tree_order:
		select_cols.append(Task.custom_tree_order)

	query = (
		frappe.qb.from_(Task)
		.select(*select_cols)
		.where(Task.docstatus < 2)
		.where(Task.project == project)
	)

	if all_tasks:
		pass
	elif parent_task:
		query = query.where(Task.parent_task == parent_task)
	else:
		query = query.where(Task.parent_task.isnull() | (Task.parent_task == ""))

	# Product rule: when filtering leaves, still show groups as scaffolding (Tree Gantt navigation).
	if status:
		query = query.where((Task.status == status) | (Task.is_group == 1))
	if priority:
		query = query.where((Task.priority == priority) | (Task.is_group == 1))
	if assign_filter:
		query = query.where((assign_col.like(f"%{assign_filter}%")) | (Task.is_group == 1))
	if tag:
		query = query.where((tags_col.like(f"%{tag}%")) | (Task.is_group == 1))

	if sort_field in ALLOWED_SORT_FIELDS and (
		sort_field != "custom_tree_order" or has_tree_order
	):
		field = frappe.qb.Field(sort_field)
		order = frappe.qb.desc if sort_order == "desc" else frappe.qb.asc
		query = query.orderby(field, order=order)
	else:
		# Manual sibling order first (ISS-2026-02536 #5.1), then forecast dates.
		if has_tree_order:
			query = query.orderby(Task.custom_tree_order, order=frappe.qb.asc)
		query = query.orderby(Task.exp_start_date, order=frappe.qb.asc)
		query = query.orderby(Task.exp_end_date, order=frappe.qb.asc)

	if limit:
		query = query.limit(cint(limit))

	raw_rows = query.run(as_dict=True)
	rows = [_to_canonical(r) for r in raw_rows]
	_type_labels(rows)
	_attach_relations(rows)
	_attach_assign_sources(rows)
	for row in rows:
		row["can_write"] = 1 if frappe.has_permission("Task", "write", row["id"]) else 0
	_publish_assign_user_info(rows)
	return rows
