# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt write flags: per-field can_write from meta + row + workflow."""

from __future__ import annotations

from types import SimpleNamespace

import frappe
from frappe.model import display_fieldtypes
from frappe.utils import cint

from dinext_project_tasks_gantt.task_tree_gantt.get_data.row import TaskRow

SKIP_FIELDTYPES = frozenset(display_fieldtypes)
_WORKFLOW_UNSET = object()

# _assign is optional (not in Task meta.fields). Same write rules as other fields.
_OPTIONAL_ASSIGN = SimpleNamespace(
	fieldname="_assign",
	fieldtype="Text",
	permlevel=0,
	read_only=0,
	read_only_depends_on=None,
)


class _EvalDoc:
	"""doc.foo raises if field was stripped / never loaded — no silent None."""

	__slots__ = ("_data",)

	def __init__(self, data: dict):
		object.__setattr__(self, "_data", data)

	def __getattr__(self, key):
		data = object.__getattribute__(self, "_data")
		if key not in data:
			raise AttributeError(key)
		return data[key]

	def __getitem__(self, key):
		data = object.__getattribute__(self, "_data")
		if key not in data:
			raise KeyError(key)
		return data[key]


class TaskFieldWrite:
	@classmethod
	def attach(
		cls,
		rows: list[dict],
		permitted: set[str] | None = None,
		*,
		workflow=_WORKFLOW_UNSET,
		state_by_id: dict[str, str] | None = None,
	) -> None:
		"""Set can_write_fields on each row. Stubs / ACL-RO skip compute."""
		candidates: list[dict] = []
		for row in rows:
			if not row.get("can_read") or not row.get("can_write"):
				row["can_write_fields"] = []
			else:
				candidates.append(row)
		if not candidates:
			return

		if permitted is None:
			permitted = TaskRow.permitted_fieldnames()
		if workflow is _WORKFLOW_UNSET:
			workflow = cls.active_workflow()
		roles = set(frappe.get_roles())
		if state_by_id is None:
			state_by_id = {}
		else:
			state_by_id = dict(state_by_id)
		missing_state_ids = [
			row["id"] for row in candidates if row["id"] not in state_by_id
		]
		if missing_state_ids:
			state_by_id.update(cls.workflow_states(workflow, missing_state_ids))
		meta = frappe.get_meta("Task")
		write_levels = set(meta.get_permlevel_access("write"))
		for row in candidates:
			if cls.workflow_locks(row, workflow, roles, state_by_id):
				row["can_write"] = 0
				row["can_write_fields"] = []
				continue
			row["can_write_fields"] = cls.writable_fields(
				meta, row, write_levels=write_levels, permitted=permitted
			)

	@classmethod
	def active_workflow(cls):
		from frappe.model.workflow import get_workflow, get_workflow_name

		name = get_workflow_name("Task")
		if not name:
			return None
		return get_workflow("Task")

	@classmethod
	def workflow_states(cls, workflow, task_ids: list[str]) -> dict[str, str]:
		if not workflow or not task_ids:
			return {}
		field = workflow.workflow_state_field
		if not field:
			return {}
		out: dict[str, str] = {}
		for rec in frappe.get_all(
			"Task",
			filters={"name": ("in", task_ids)},
			fields=["name", field],
		):
			out[rec.name] = rec.get(field)
		return out

	@classmethod
	def workflow_locks(cls, row: dict, workflow, user_roles: set[str], state_by_id: dict) -> bool:
		"""Same idea as Desk Form `frappe.workflow.is_read_only`: no allow_edit role → whole doc RO."""
		if not workflow:
			return False
		state_field = workflow.workflow_state_field
		state = row.get(state_field) if state_field else None
		if not state:
			state = state_by_id.get(row.get("id"))
		if not state:
			return False
		allow = {s.allow_edit for s in workflow.states if s.state == state}
		return not bool(user_roles.intersection(allow))

	@classmethod
	def row_doc_values(cls, row: dict, permitted: set[str]) -> dict:
		"""DocType-shaped values present on the row (not stripped, not access flags)."""
		data: dict = {}
		for key, value in row.items():
			fieldname = TaskRow.ALIASES.get(key, key)
			if fieldname in {"can_read", "can_write", "has_children", "can_write_fields"}:
				continue
			if fieldname == "id":
				data.setdefault("name", value)
				continue
			if key in TaskRow.STUB_KEEP_KEYS or fieldname in permitted:
				data.setdefault(fieldname, value)
		return data

	@classmethod
	def depends_on_read_only(cls, expr, doc_values: dict) -> bool:
		"""True → field is read-only. Missing refs / eval fail → read-only (safer)."""
		if expr is True or expr is False:
			return bool(expr)
		expr = str(expr).strip()
		if not expr:
			return False
		if expr.startswith("eval:"):
			try:
				return bool(
					frappe.safe_eval(
						expr[5:], None, {"doc": _EvalDoc(doc_values), "parent": None}
					)
				)
			except Exception:
				return True
		if expr not in doc_values:
			return True
		value = doc_values[expr]
		if isinstance(value, (list, tuple)):
			return bool(value)
		return bool(value)

	@classmethod
	def field_writable(cls, df, write_levels: set, doc_values: dict) -> bool:
		fieldname = getattr(df, "fieldname", None)
		if not fieldname:
			return False
		if getattr(df, "fieldtype", None) in SKIP_FIELDTYPES:
			return False
		if (df.permlevel or 0) not in write_levels:
			return False
		if cint(getattr(df, "read_only", 0)):
			return False
		depends = getattr(df, "read_only_depends_on", None)
		if depends and cls.depends_on_read_only(depends, doc_values):
			return False
		return True

	@classmethod
	def writable_fields(
		cls,
		meta,
		row: dict,
		write_levels: set | None = None,
		permitted: set[str] | None = None,
	) -> list[str]:
		if write_levels is None:
			write_levels = set(meta.get_permlevel_access("write"))
		if permitted is None:
			permitted = TaskRow.permitted_fieldnames()
		doc_values = cls.row_doc_values(row, permitted)
		out: list[str] = []
		for df in meta.fields:
			if cls.field_writable(df, write_levels, doc_values):
				out.append(df.fieldname)
		if not any(df.fieldname == "_assign" for df in meta.fields):
			if cls.field_writable(_OPTIONAL_ASSIGN, write_levels, doc_values):
				out.append("_assign")
		return out
