# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt row shape: DocType fields + tiny API aliases, permlevel strip."""

from __future__ import annotations

import json

import frappe
from frappe.model import get_permitted_fields
from frappe.utils import cint


class TaskRow:
	# Task fieldnames copied 1:1 into the API row (already match DocType).
	COPY_FIELDS = (
		"subject",
		"status",
		"priority",
		"custom_planned_start_date",
		"custom_planned_end_date",
		"exp_start_date",
		"exp_end_date",
		"act_start_date",
		"act_end_date",
		"expected_time",
		"duration",
		"progress",
		"parent_task",
		"custom_tree_order",
		"custom_include",
		"custom_linked_issue",
		"is_milestone",
		"color",
		"owner",
		"confirm",
	)

	# True mismatches only. Payload keys that equal Task fieldnames are not listed.
	# Future: client should adopt DocType names except `id` (UI row id) and maybe
	# `type` (JS reserved). Server stays DocType-shaped; this table shrinks, not grows.
	# Do not rewrite client in this change.
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
		out = {field: row.get(field) for field in cls.COPY_FIELDS}
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
	def permitted_fieldnames(cls) -> set[str]:
		"""Value fields from get_permitted_fields plus Table/etc. at readable permlevel."""
		meta = frappe.get_meta("Task")
		allowed = set(get_permitted_fields("Task", ignore_virtual=True))
		levels = set(meta.get_permlevel_access("read"))
		for df in meta.fields:
			if (df.permlevel or 0) in levels and df.fieldname:
				allowed.add(df.fieldname)
		# _assign / _user_tags are optional (not in Task meta.fields).
		# Same permlevel-0 read rule as get_permitted_fields optional_fields.
		if 0 in levels:
			if not meta.has_field("_assign"):
				allowed.add("_assign")
			if not meta.has_field("_user_tags"):
				allowed.add("_user_tags")
		return allowed

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
	def apply_field_read_strip(cls, rows: list[dict], permitted: set[str]) -> None:
		"""Null fields the user may not read. Stubs: all content gone, tree keys stay."""
		for row in rows:
			if not row.get("can_read"):
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
