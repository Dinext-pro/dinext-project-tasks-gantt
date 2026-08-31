# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt get_children: params, filters, query orchestrator."""

from __future__ import annotations

import json

import frappe
from frappe.utils import cint

from dinext_project_tasks_gantt.task_tree_gantt.get_data.acl import TaskTreeAcl
from dinext_project_tasks_gantt.task_tree_gantt.get_data.attach import TaskRowAttach
from dinext_project_tasks_gantt.task_tree_gantt.get_data.row import TaskRow
from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite


class TaskTreeQuery:
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

	@classmethod
	def param(cls, kwargs: dict, key: str, default=None):
		if key in kwargs and kwargs[key] is not None and kwargs[key] != "":
			return kwargs[key]
		# form_dict fallback only for desk debugging; preferred path is explicit kwargs
		val = frappe.form_dict.get(key)
		if val is None or val == "":
			return default
		return val

	@classmethod
	def truthy(cls, val) -> bool:
		if val is None or val == "":
			return False
		if isinstance(val, bool):
			return val
		return bool(cint(val))

	@classmethod
	def parse_multi(cls, raw) -> list[str] | None:
		"""None = filter off. Non-empty list = OR. Empty [] / '[]' / '' = off."""
		if raw is None or raw == "" or raw is False:
			return None
		if isinstance(raw, (list, tuple, set)):
			vals = [str(x).strip() for x in raw if x not in (None, "")]
			return vals or None
		if isinstance(raw, str):
			s = raw.strip()
			if not s or s in ("[]", "{}", "null", "None"):
				return None
			if s.startswith("["):
				try:
					parsed = json.loads(s)
					if isinstance(parsed, list):
						vals = [str(x).strip() for x in parsed if x not in (None, "")]
						return vals or None
				except (TypeError, ValueError, json.JSONDecodeError):
					pass
			return [s]
		return None

	@classmethod
	def attr_filters_on(cls, status, priority, assign_filter, tag) -> bool:
		return bool(
			cls.parse_multi(status)
			or cls.parse_multi(priority)
			or cls.parse_multi(assign_filter)
			or cls.parse_multi(tag)
		)

	@classmethod
	def row_tag_set(cls, raw) -> set[str]:
		return {p.strip() for p in str(raw or "").split(",") if p.strip()}

	@classmethod
	def row_matches_attr_filters(cls, row: dict, status, priority, assign_filter, tag) -> bool:
		status_vals = cls.parse_multi(status)
		priority_vals = cls.parse_multi(priority)
		if status_vals and row.get("status") not in status_vals:
			return False
		if priority_vals and row.get("priority") not in priority_vals:
			return False
		assign_vals = cls.parse_multi(assign_filter)
		if assign_vals:
			assigned = set(TaskRow.parse_assign(row.get("_assign")))
			if not assigned.intersection(assign_vals):
				return False
		tag_vals = cls.parse_multi(tag)
		if tag_vals and not cls.row_tag_set(row.get("_user_tags")).intersection(tag_vals):
			return False
		return True

	@classmethod
	def keep_ids_for_filters(
		cls,
		project,
		task_names,
		status,
		priority,
		assign_filter,
		tag,
		parent_by_name: dict[str, str],
		readable_ids: set[str],
	):
		"""None = no keep filter. Else match ids + ancestors (empty set = no rows).

		Matches only readable tasks. Ancestor walk uses full parent map so
		unreadable parents stay in the tree as stubs.
		"""
		need_attr = cls.attr_filters_on(status, priority, assign_filter, tag)
		if not task_names and not need_attr:
			return None
		parts = []
		if task_names:
			match = {name for name in task_names if name in readable_ids}
			if not match:
				return set()
			parts.append(TaskTreeAcl.ids_with_ancestors(parent_by_name, match))
		if need_attr:
			rows = frappe.get_list(
				"Task",
				filters={"project": project, "docstatus": ("<", 2)},
				fields=["name", "parent_task", "status", "priority", "_assign", "_user_tags"],
				limit_page_length=0,
			)
			match_ids = {
				r["name"]
				for r in rows
				if r["name"] in readable_ids
				and cls.row_matches_attr_filters(r, status, priority, assign_filter, tag)
			}
			parts.append(
				TaskTreeAcl.ids_with_ancestors(parent_by_name, match_ids) if match_ids else set()
			)
		return TaskTreeAcl.intersect_keep_sets(*parts)

	@classmethod
	def run(cls, **kwargs) -> list[dict]:
		"""
		Return Tree Gantt rows for DinextTable.

		Args:
		        project: Project name (required)
		        parent_task: None → project roots; else children of this Task
		        task: page-form Task filter — selected tasks ∪ ancestors, not children
		        all_tasks: if true, all tasks in project (ignore parent filter)
		        status, priority, assign, tag: optional str or list (OR inside field; empty = off)
		        sort_field, sort_order, limit: optional

		Read: only tasks the user may read, plus unreadable ancestors as stubs
		(`can_read=0`) so the tree shape stays. No reparent. Field values without
		read (permlevel) are blanked; stubs keep only tree keys.
		"""
		if not frappe.has_permission("Task", "read"):
			frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

		project = cls.param(kwargs, "project")
		if not project:
			frappe.throw(frappe._("Project is required"))

		parent_task = cls.param(kwargs, "parent_task")
		task_names = cls.parse_multi(cls.param(kwargs, "task"))
		all_tasks = cls.truthy(cls.param(kwargs, "all_tasks"))
		status = cls.parse_multi(cls.param(kwargs, "status"))
		priority = cls.parse_multi(cls.param(kwargs, "priority"))
		assign_filter = cls.parse_multi(cls.param(kwargs, "assign"))
		tag = cls.parse_multi(cls.param(kwargs, "tag"))
		sort_field = cls.param(kwargs, "sort_field")
		sort_order = (cls.param(kwargs, "sort_order") or "asc").lower()
		limit = cls.param(kwargs, "limit")

		parent_by_name = TaskTreeAcl.task_parent_map(project)
		readable_ids = TaskTreeAcl.readable_task_ids(project)
		visible_ids = TaskTreeAcl.visible_task_ids(readable_ids, parent_by_name)
		if not visible_ids:
			return []

		Task = frappe.qb.DocType("Task")
		assign_col = frappe.qb.Field("_assign")
		tags_col = frappe.qb.Field("_user_tags")
		has_tree_order = frappe.get_meta("Task").has_field("custom_tree_order")

		select_cols = [Task.name, Task.is_group, Task.type, assign_col, tags_col]
		for field in TaskRow.COPY_FIELDS:
			if field == "custom_tree_order":
				continue
			select_cols.append(getattr(Task, field))
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

		# Page-form Task + attr filters: matches + ancestors (not children of the Task).
		# Expanding a selected task itself: do not apply the task keep-set.
		task_keep = task_names
		if task_names and parent_task and parent_task in task_names and not all_tasks:
			task_keep = None
		keep_ids = cls.keep_ids_for_filters(
			project,
			task_keep,
			status,
			priority,
			assign_filter,
			tag,
			parent_by_name,
			readable_ids,
		)
		if keep_ids is not None:
			if not keep_ids:
				return []
			query = query.where(Task.name.isin(list(keep_ids)))
		else:
			query = query.where(Task.name.isin(list(visible_ids)))

		if sort_field in cls.ALLOWED_SORT_FIELDS and (
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
		rows = [TaskRow.from_task(r) for r in raw_rows]
		TaskTreeAcl.mark_access(rows, readable_ids)
		readable_rows = [row for row in rows if row["can_read"]]
		permitted = TaskRow.permitted_fieldnames()
		if "type" in permitted:
			TaskRowAttach.type_labels(readable_rows)
		if "custom_relations" in permitted:
			TaskRowAttach.relations(readable_rows)
		if "_assign" in permitted:
			TaskRowAttach.assign_sources(readable_rows)
			TaskRowAttach.publish_assign_user_info(readable_rows)
		TaskRow.apply_field_read_strip(rows, permitted)
		TaskFieldWrite.attach(rows, permitted)
		return rows
