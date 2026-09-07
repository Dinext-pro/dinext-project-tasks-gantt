# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt row shape: the permitted Task document + tiny API aliases."""

from __future__ import annotations

import json

import frappe
from frappe.model import (
	display_fieldtypes,
	get_permitted_fields,
	optional_fields,
	table_fields,
)
from frappe.utils import cint

from dinext_project_tasks_gantt.form_contract import (
	referenced_fieldnames,
	referenced_table_fields,
)


class TaskRow:
	# Always selected: tree structure + Frappe document system columns.
	SYSTEM_FIELDS = (
		"name",
		"owner",
		"docstatus",
		"modified",
		"creation",
		"idx",
		"is_group",
	)

	# Optional columns (not in meta.fields). `_assign` / `_user_tags` feed the
	# aliases below; other optional_fields ship only when an expression references them.
	OPTIONAL_ALWAYS = ("_assign", "_user_tags")

	# True mismatches only. Payload keys that equal Task fieldnames are not listed.
	# DocType-named keys are shipped alongside these aliases (row has both
	# `assign` (list) and `_assign` (raw), `task_type` and `type`).
	# Do not rewrite client column ids in this change.
	ALIASES = {
		"id": "name",
		"task_type": "type",
		"task_type_label": "type",
		"assign": "_assign",
		"assign_pwa": "_assign",
		"assign_todo_only": "_assign",
		"user_tags": "_user_tags",
		"relations": "custom_relations",
	}

	# Tree keys only. Stub has no document read — no subject/dates/assign in JSON.
	STUB_KEEP_KEYS = frozenset(
		{
			"id",
			"parent_task",
			"has_children",
			"can_read",
			"can_write",
			"custom_tree_order",
		}
	)

	@classmethod
	def parse_assign(cls, raw) -> list[str]:
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

	@classmethod
	def from_task(cls, row: dict) -> dict:
		"""DocType-shaped values as selected, plus client aliases and normalisation."""
		out = dict(row)
		out["id"] = row["name"]
		out["task_type"] = row.get("type")
		out["task_type_label"] = ""
		out["assign"] = cls.parse_assign(row.get("_assign"))
		out["assign_pwa"] = []
		out["assign_todo_only"] = []
		out["user_tags"] = row.get("_user_tags") or ""
		out["relations"] = []
		out["has_children"] = bool(row.get("is_group"))
		out["subject"] = out.get("subject") or ""
		out["progress"] = out.get("progress") or 0
		out["parent_task"] = out.get("parent_task") or None
		out["custom_tree_order"] = cint(out.get("custom_tree_order"))
		out["custom_include"] = 1 if out.get("custom_include") else 0
		out["is_milestone"] = 1 if out.get("is_milestone") else 0
		out["confirm"] = 1 if out.get("confirm") else 0
		return out

	@classmethod
	def permitted_fieldnames(cls, meta=None, permission_type: str = "read") -> set[str]:
		"""Value fields from get_permitted_fields plus Table/etc. at the permitted permlevel.

		`permission_type="write"` → fields the user may write (save_cells permlevel
		check; row select for role-write-without-read).
		"""
		if meta is None:
			meta = frappe.get_meta("Task")
		allowed = set(
			get_permitted_fields("Task", permission_type=permission_type, ignore_virtual=True)
		)
		levels = set(meta.get_permlevel_access(permission_type))
		for df in meta.fields:
			if (df.permlevel or 0) in levels and df.fieldname:
				allowed.add(df.fieldname)
		# _assign / _user_tags are optional (not in Task meta.fields).
		# Same permlevel-0 rule as get_permitted_fields optional_fields.
		if 0 in levels:
			if not meta.has_field("_assign"):
				allowed.add("_assign")
			if not meta.has_field("_user_tags"):
				allowed.add("_user_tags")
		return allowed

	@classmethod
	def scalar_fieldnames(cls, meta=None, permitted: set[str] | None = None) -> list[str]:
		"""Permitted Task DocFields that are real DB columns (no display / Table / virtual)."""
		if meta is None:
			meta = frappe.get_meta("Task")
		if permitted is None:
			permitted = cls.permitted_fieldnames(meta)
		valid = set(meta.get_valid_columns())
		out: list[str] = []
		for df in meta.fields:
			fieldname = df.fieldname
			if not fieldname or fieldname in out:
				continue
			if df.fieldtype in display_fieldtypes or df.fieldtype in table_fields:
				continue
			if cint(getattr(df, "is_virtual", 0)):
				continue
			if fieldname not in valid or fieldname not in permitted:
				continue
			out.append(fieldname)
		return out

	@classmethod
	def select_fieldnames(cls, meta=None, permitted: set[str] | None = None) -> list[str]:
		"""Columns for the tree query: system + optional + permitted scalar fields.

		Built from meta at request time. Optional columns referenced by a
		form-contract expression (e.g. `_comments`) are added on demand.
		"""
		if meta is None:
			meta = frappe.get_meta("Task")
		if permitted is None:
			permitted = cls.permitted_fieldnames(meta)
		# get_valid_columns() excludes optional_fields (_assign, _user_tags, _comments, ...);
		# every Frappe table has them, so they are valid whenever permitted.
		valid = set(meta.get_valid_columns()) | set(optional_fields)
		names: list[str] = [f for f in cls.SYSTEM_FIELDS if f in valid]
		for optional in cls.OPTIONAL_ALWAYS:
			if optional in permitted and optional not in names:
				names.append(optional)
		for ref in sorted(referenced_fieldnames(meta)):
			if ref in valid and ref in permitted and ref not in names and not meta.has_field(ref):
				names.append(ref)
		for fieldname in cls.scalar_fieldnames(meta, permitted):
			if fieldname not in names:
				names.append(fieldname)
		return names

	@classmethod
	def child_select_fieldnames(cls, child_doctype: str) -> list[str]:
		child_meta = frappe.get_meta(child_doctype)
		valid = set(child_meta.get_valid_columns())
		out: list[str] = []
		for fieldname in get_permitted_fields(
			child_doctype, parenttype="Task", ignore_virtual=True
		):
			if fieldname in valid and fieldname not in out:
				out.append(fieldname)
		return out

	@classmethod
	def attach_child_tables(
		cls, rows: list[dict], meta=None, permitted: set[str] | None = None
	) -> None:
		"""Ship child rows for Table fields referenced by any form-contract expression.

		One query per child DocType (`parent in (...)`), never per row.
		"""
		if not rows:
			return
		if meta is None:
			meta = frappe.get_meta("Task")
		if permitted is None:
			permitted = cls.permitted_fieldnames(meta)
		table_dfs = [
			df for df in referenced_table_fields(meta) if df.fieldname in permitted
		]
		if not table_dfs:
			return
		names = [row["id"] for row in rows if row.get("id")]
		for df in table_dfs:
			by_parent: dict[str, list] = {name: [] for name in names}
			if names:
				children = frappe.get_all(
					df.options,
					filters={
						"parenttype": "Task",
						"parentfield": df.fieldname,
						"parent": ("in", names),
					},
					fields=cls.child_select_fieldnames(df.options),
					order_by="idx asc",
					limit_page_length=0,
					parent_doctype="Task",
				)
				for child in children:
					by_parent.setdefault(child.get("parent"), []).append(child)
			for row in rows:
				row[df.fieldname] = by_parent.get(row.get("id"), [])

	@classmethod
	def blank_value(cls, key: str):
		if key in ("assign", "assign_pwa", "assign_todo_only", "relations"):
			return []
		if key in ("subject", "user_tags", "task_type_label"):
			return ""
		if key == "custom_tree_order":
			return 0
		return None

	@classmethod
	def apply_field_read_strip(
		cls,
		rows: list[dict],
		permitted: set[str],
		*,
		keep_unreadable_values: bool = False,
	) -> None:
		"""Null fields the user may not read. Stubs: all content gone, tree keys stay.

		The query already selects permitted columns only; this covers aliases and
		columns added for internal use (workflow state).

		keep_unreadable_values: Role write without read — show values, no edit.
		"""
		for row in rows:
			if not row.get("can_read"):
				if keep_unreadable_values:
					continue
				for key in list(row.keys()):
					if key not in cls.STUB_KEEP_KEYS:
						row[key] = cls.blank_value(key)
				continue
			for key in list(row.keys()):
				if key in cls.STUB_KEEP_KEYS:
					continue
				fieldname = cls.ALIASES.get(key, key)
				if fieldname not in permitted:
					row[key] = cls.blank_value(key)
