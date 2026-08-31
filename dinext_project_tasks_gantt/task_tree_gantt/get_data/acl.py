# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt ACL: readable ids, parent map, visible set, ancestor stubs."""

from __future__ import annotations

import frappe


class TaskTreeAcl:
	@classmethod
	def readable_task_ids(cls, project: str) -> set[str]:
		"""Task names the current user may read (User Permission, if_owner, hooks)."""
		names = frappe.get_list(
			"Task",
			filters={"project": project, "docstatus": ("<", 2)},
			pluck="name",
			limit_page_length=0,
		)
		return set(names or [])

	@classmethod
	def task_parent_map(cls, project: str) -> dict[str, str]:
		"""name → parent_task for the project. Links only; ignores user read perm."""
		rows = frappe.get_all(
			"Task",
			filters={"project": project, "docstatus": ("<", 2)},
			fields=["name", "parent_task"],
			limit_page_length=0,
			ignore_permissions=True,
		)
		return {r["name"]: r.get("parent_task") or "" for r in rows}

	@classmethod
	def ids_with_ancestors(cls, parent_by_name: dict[str, str], match_ids: set[str]) -> set[str]:
		"""Match ids + ancestor chain. Unrelated groups stay out."""
		keep = set(match_ids)
		for name in match_ids:
			cur = parent_by_name.get(name) or ""
			guard: set[str] = set()
			while cur and cur not in guard:
				if cur in keep:
					break
				keep.add(cur)
				guard.add(cur)
				cur = parent_by_name.get(cur) or ""
		return keep

	@classmethod
	def visible_task_ids(cls, readable_ids: set[str], parent_by_name: dict[str, str]) -> set[str]:
		"""Readable tasks + unreadable ancestors (stubs). Structure stays."""
		if not readable_ids:
			return set()
		return cls.ids_with_ancestors(parent_by_name, readable_ids)

	@classmethod
	def intersect_keep_sets(cls, *sets):
		"""None = filter off. Intersect active sets. Empty set = no rows."""
		active = [s for s in sets if s is not None]
		if not active:
			return None
		out = set(active[0])
		for extra in active[1:]:
			out &= extra
		return out

	@classmethod
	def mark_access(cls, rows: list[dict], readable_ids: set[str]) -> None:
		for row in rows:
			can_read = 1 if row["id"] in readable_ids else 0
			row["can_read"] = can_read
			if can_read:
				row["can_write"] = 1 if frappe.has_permission("Task", "write", row["id"]) else 0
			else:
				# Unreadable ancestor stub: keep tree shape, no edit, always expandable.
				row["can_write"] = 0
				row["has_children"] = True
