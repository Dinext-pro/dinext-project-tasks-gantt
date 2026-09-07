# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt ACL: readable ids, parent map, visible set, ancestor stubs."""

from __future__ import annotations

import copy

import frappe


class TaskTreeAcl:
	_BATCHED_CONTROLLER_HOOKS = frozenset(
		{"doctype_permission.doctype_permission.utils.has_permission"}
	)

	@classmethod
	def role_can_read(cls) -> bool:
		return bool(frappe.has_permission("Task", "read"))

	@classmethod
	def role_can_write(cls) -> bool:
		return bool(frappe.has_permission("Task", "write"))

	@classmethod
	def readable_task_ids(
		cls, project: str, bounds: tuple[int, int] | None = None
	) -> set[str]:
		"""Task names the current user may read (User Permission, if_owner, hooks)."""
		return {
			row["name"]
			for row in cls.readable_task_rows(project, ["name"], bounds)
		}

	@classmethod
	def readable_task_rows(
		cls,
		project: str,
		fields: list[str],
		bounds: tuple[int, int] | None = None,
	) -> list[dict]:
		"""Permission-aware Task rows, reusable by visibility and attribute filters."""
		filters = {"project": project, "docstatus": ("<", 2)}
		if bounds:
			filters["lft"] = (">", bounds[0])
			filters["rgt"] = ("<", bounds[1])
		return frappe.get_list(
			"Task",
			filters=filters,
			fields=fields,
			limit_page_length=0,
		)

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
	def task_descendant_scope(
		cls, project: str, parent_task: str
	) -> tuple[dict[str, str], tuple[int, int] | None]:
		"""Parent map and nested-set bounds below one Task."""
		parent = frappe.db.get_value(
			"Task",
			{"name": parent_task, "project": project, "docstatus": ("<", 2)},
			["lft", "rgt"],
			as_dict=True,
		)
		if not parent:
			return {}, None
		if (
			parent.lft is None
			or parent.rgt is None
			or int(parent.lft) < 1
			or int(parent.rgt) <= int(parent.lft)
			or (int(parent.rgt) - int(parent.lft)) % 2 != 1
		):
			return cls.task_parent_map(project), None
		bounds = (int(parent.lft), int(parent.rgt))
		rows = frappe.get_all(
			"Task",
			filters={
				"project": project,
				"docstatus": ("<", 2),
				"lft": (">", bounds[0]),
				"rgt": ("<", bounds[1]),
			},
			fields=["name", "parent_task", "lft", "rgt"],
			limit_page_length=0,
			ignore_permissions=True,
		)
		expected_count = (bounds[1] - bounds[0] - 1) // 2
		if len(rows) != expected_count:
			return cls.task_parent_map(project), None
		nodes = {row["name"]: row for row in rows}
		for row in rows:
			row_parent = row.get("parent_task") or ""
			if row_parent == parent_task:
				parent_lft, parent_rgt = bounds
			elif row_parent in nodes:
				parent_node = nodes[row_parent]
				if parent_node.lft is None or parent_node.rgt is None:
					return cls.task_parent_map(project), None
				parent_lft = int(parent_node.lft)
				parent_rgt = int(parent_node.rgt)
			else:
				return cls.task_parent_map(project), None
			if (
				row.lft is None
				or row.rgt is None
				or not (parent_lft < int(row.lft) < int(row.rgt) < parent_rgt)
			):
				return cls.task_parent_map(project), None
		return (
			{r["name"]: r.get("parent_task") or "" for r in rows},
			bounds,
		)

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
		doc = frappe.get_doc("Task", task_id)
		return bool(
			frappe.has_permission("Task", "read", doc)
			and frappe.has_permission("Task", "write", doc)
		)

	@classmethod
	def _has_relevant_user_permissions(cls, user: str) -> bool:
		"""True when child-table-only UP may diverge from Frappe document write.

		Parent Task link UPs (Company, Project, Task, …) already filter
		`get_list` / `readable_ids`. Diagnostic only — not a runtime branch.
		"""
		user_permissions = frappe.permissions.get_user_permissions(user)
		if not user_permissions:
			return False

		meta = frappe.get_meta("Task")
		parent_links = {"Task"}
		parent_links.update(
			df.options
			for df in meta.get_link_fields()
			if df.options and not df.ignore_user_permissions
		)
		child_only = set()
		for table_df in meta.get_table_fields():
			child_meta = frappe.get_meta(table_df.options)
			child_only.update(
				df.options
				for df in child_meta.get_link_fields()
				if df.options
				and not df.ignore_user_permissions
				and df.options not in parent_links
			)
		return bool(child_only.intersection(user_permissions))

	@classmethod
	def _supports_batch_edit_check(cls, user: str) -> bool:
		"""True when in-memory write matches Frappe document has_permission.

		Unknown has_permission hooks or child-table-only UP may diverge.
		Diagnostic only — editable_task_ids always uses the batch path.
		"""
		hooks = frappe.get_hooks("has_permission")
		methods = set(hooks.get("Task", [])) | set(hooks.get("*", []))
		if methods - cls._BATCHED_CONTROLLER_HOOKS:
			return False
		return not cls._has_relevant_user_permissions(user)

	@classmethod
	def _shared_rights(cls, task_ids: list[str], user: str) -> dict[str, set[str]]:
		"""Task id → shared read/write rights, fetched in one query."""
		if not task_ids:
			return {}

		DocShare = frappe.qb.DocType("DocShare")
		user_condition = DocShare.user == user
		if user != "Guest":
			user_condition |= DocShare.everyone == 1
		rows = (
			frappe.qb.from_(DocShare)
			.select(DocShare.share_name, DocShare.read, DocShare.write)
			.where(DocShare.share_doctype == "Task")
			.where(DocShare.share_name.isin(task_ids))
			.where(user_condition)
		).run(as_dict=True)

		out: dict[str, set[str]] = {}
		for row in rows:
			rights = out.setdefault(row["share_name"], set())
			if row.get("read"):
				rights.add("read")
			if row.get("write"):
				rights.add("write")
		return out

	@classmethod
	def editable_task_ids(cls, rows: list[dict], readable_ids: set[str]) -> set[str]:
		"""Document read+write for a Task batch. Never loads documents.

		`readable_ids` already passed Frappe list permissions and the Dinext
		DocType Permission query. Role/owner and DocShare checks are
		computed in memory.
		"""
		candidates = [row for row in rows if row["id"] in readable_ids]
		if not candidates:
			return set()

		user = frappe.session.user
		if user == "Administrator":
			return {row["id"] for row in candidates}

		task_ids = [row["id"] for row in candidates]
		shared = cls._shared_rights(task_ids, user)
		meta = frappe.get_meta("Task")
		out = set()
		for row in candidates:
			is_owner = str(row.get("owner") or "").lower() == user.lower()
			permissions = copy.deepcopy(
				frappe.permissions.get_role_permissions(
					meta, user=user, is_owner=is_owner
				)
			)
			if permissions.get("has_if_owner_enabled"):
				permissions.update(permissions.get("if_owner", {}))
			rights = shared.get(row["id"], set())
			can_read = bool(permissions.get("read") or "read" in rights)
			can_write = bool(permissions.get("write") or "write" in rights)
			if can_read and can_write:
				out.add(row["id"])
		return out

	@classmethod
	def mark_access(
		cls,
		rows: list[dict],
		readable_ids: set[str],
		*,
		role_read: bool | None = None,
	) -> None:
		"""can_read = in get_list (values visible). can_write = document read AND write."""
		editable_ids = cls.editable_task_ids(rows, readable_ids)
		if role_read is None:
			role_read = cls.role_can_read()
		for row in rows:
			can_read = 1 if row["id"] in readable_ids else 0
			row["can_read"] = can_read
			if can_read:
				row["can_write"] = 1 if row["id"] in editable_ids else 0
			else:
				row["can_write"] = 0
				if role_read:
					row["has_children"] = True
