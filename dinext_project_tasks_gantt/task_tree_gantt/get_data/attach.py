# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Attach type labels, relations, and assign PWA/todo onto readable Task rows."""

from __future__ import annotations

import frappe
from frappe.utils import add_user_info


class TaskRowAttach:
	@classmethod
	def type_labels(cls, rows: list[dict]) -> None:
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

	@classmethod
	def relations(cls, rows: list[dict]) -> None:
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

	@classmethod
	def publish_assign_user_info(cls, rows: list[dict]) -> None:
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

	@classmethod
	def assign_sources(cls, rows: list[dict]) -> None:
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
