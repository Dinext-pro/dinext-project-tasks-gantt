# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt ACL: readable ids, parent map, visible set, ancestor stubs."""

from __future__ import annotations

import frappe


class TaskTreeAcl:
	@classmethod
	def role_can_read(cls) -> bool:
		return bool(frappe.has_permission("Task", "read"))

	@classmethod
	def role_can_write(cls) -> bool:
		return bool(frappe.has_permission("Task", "write"))

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
	def write_without_read_ids(cls, parent_by_name: dict[str, str]) -> set[str]:
		"""Role write=1 read=0: show whole project (values as-is, no edit)."""
		return set(parent_by_name)

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
	def doc_can_edit(cls, task_id: str) -> bool:
		"""Edit only if this document has read AND write. Write without read is display-only.

		Role DocPerm can be write=1 read=0 (or if_owner read that does not apply).
		get_list may still return the Task (select + permission_query). Form values stay
		visible; cells must not be editable.
		"""
		return bool(
			frappe.has_permission("Task", "read", task_id)
			and frappe.has_permission("Task", "write", task_id)
		)

	@classmethod
	def mark_access(cls, rows: list[dict], readable_ids: set[str]) -> None:
		"""can_read = in get_list (values visible). can_write = document read AND write."""
		for row in rows:
			can_read = 1 if row["id"] in readable_ids else 0
			row["can_read"] = can_read
			if can_read:
				row["can_write"] = 1 if cls.doc_can_edit(row["id"]) else 0
			else:
				row["can_write"] = 0
				if cls.role_can_read():
					row["has_children"] = True
