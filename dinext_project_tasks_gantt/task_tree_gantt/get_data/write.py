# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt write flags: per-field can_write from meta + row + workflow."""

from __future__ import annotations

from types import SimpleNamespace

import frappe
from frappe.model import display_fieldtypes, table_fields
from frappe.utils import cint, cstr

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
	mandatory_depends_on=None,
	depends_on=None,
	hidden=0,
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
		"""Set can_write_fields + hidden_fields. Hidden is computed for every row."""
		if not rows:
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
		writable_ids = [
			row["id"]
			for row in rows
			if row.get("can_read") and row.get("can_write")
		]
		missing_state_ids = [i for i in writable_ids if i not in state_by_id]
		if missing_state_ids:
			state_by_id.update(cls.workflow_states(workflow, missing_state_ids))
		meta = frappe.get_meta("Task")
		write_levels = set(meta.get_permlevel_access("write"))
		for row in rows:
			row["hidden_fields"] = cls.hidden_fields(
				meta, row, permitted=permitted
			)
			if not row.get("can_read") or not row.get("can_write"):
				row["can_write_fields"] = []
				continue
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
			if fieldname in {
				"can_read",
				"can_write",
				"has_children",
				"can_write_fields",
				"hidden_fields",
			}:
				continue
			if fieldname == "id":
				data.setdefault("name", value)
				continue
			if key in TaskRow.STUB_KEEP_KEYS or fieldname in permitted:
				data.setdefault(fieldname, value)
		return data

	@classmethod
	def eval_depends_on(cls, expr, doc_values: dict, *, on_fail: bool) -> bool:
		"""Form depends_on / read_only_depends_on / mandatory_depends_on.

		on_fail: value when the ref is missing or eval errors.
		"""
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
				return on_fail
		if expr not in doc_values:
			return on_fail
		value = doc_values[expr]
		if isinstance(value, (list, tuple)):
			return bool(value)
		return bool(value)

	@classmethod
	def depends_on_read_only(cls, expr, doc_values: dict) -> bool:
		"""True → field is read-only. Missing refs / eval fail → read-only (safer)."""
		return cls.eval_depends_on(expr, doc_values, on_fail=True)

	@classmethod
	def field_is_mandatory(cls, df, doc_values: dict) -> bool:
		"""Same order as Desk ``is_docfield_mandatory``: depends_on wins over reqd."""
		depends = getattr(df, "mandatory_depends_on", None)
		if depends:
			return cls.eval_depends_on(depends, doc_values, on_fail=False)
		return bool(cint(getattr(df, "reqd", 0)))

	@classmethod
	def value_missing(cls, value) -> bool:
		if value is None:
			return True
		if isinstance(value, (list, tuple)):
			return not value
		if isinstance(value, str) and not cstr(value).strip():
			return True
		return False

	@classmethod
	def missing_mandatory_labels(cls, meta, doc_values: dict) -> list[str]:
		"""Labels of parent fields that are required and empty after the change."""
		missing: list[str] = []
		for df in meta.fields:
			fieldtype = getattr(df, "fieldtype", None)
			if fieldtype in SKIP_FIELDTYPES or fieldtype in table_fields:
				continue
			if not cls.field_is_mandatory(df, doc_values):
				continue
			fieldname = getattr(df, "fieldname", None)
			if not fieldname:
				continue
			if cls.value_missing(doc_values.get(fieldname)):
				label = getattr(df, "label", None) or fieldname
				missing.append(str(label))
		return missing

	@classmethod
	def assert_mandatory(cls, doc) -> None:
		"""Whole-doc check like form Save. Cell save can trip a *other* field."""
		meta = frappe.get_meta(doc.doctype)
		doc_values = doc.as_dict()
		missing = cls.missing_mandatory_labels(meta, doc_values)
		if not missing:
			return
		message = frappe._("Mandatory fields required in {0}").format(
			frappe._(doc.doctype)
		)
		message += "<br><br><ul><li>" + "</li><li>".join(missing) + "</ul>"
		frappe.throw(message, frappe.MandatoryError)

	@classmethod
	def field_is_hidden(cls, df, doc_values: dict) -> bool:
		"""Static ``hidden`` or form ``depends_on`` (shown only when expr is true)."""
		if cint(getattr(df, "hidden", 0)):
			return True
		depends = getattr(df, "depends_on", None)
		if depends:
			return not cls.eval_depends_on(depends, doc_values, on_fail=False)
		return False

	@classmethod
	def hidden_fields(
		cls,
		meta,
		row: dict,
		permitted: set[str] | None = None,
	) -> list[str]:
		if permitted is None:
			permitted = TaskRow.permitted_fieldnames()
		doc_values = cls.row_doc_values(row, permitted)
		out: list[str] = []
		for df in meta.fields:
			fieldtype = getattr(df, "fieldtype", None)
			if fieldtype in SKIP_FIELDTYPES or fieldtype in table_fields:
				continue
			fieldname = getattr(df, "fieldname", None)
			if not fieldname:
				continue
			if cls.field_is_hidden(df, doc_values):
				out.append(fieldname)
		if not any(df.fieldname == "_assign" for df in meta.fields):
			if cls.field_is_hidden(_OPTIONAL_ASSIGN, doc_values):
				out.append("_assign")
		return out

	@classmethod
	def assert_not_writing_hidden(cls, doc, fieldnames) -> None:
		"""Reject cell writes to fields hidden on the resulting doc."""
		meta = frappe.get_meta(doc.doctype)
		doc_values = doc.as_dict()
		blocked = []
		for fieldname in fieldnames:
			df = meta.get_field(fieldname)
			if not df:
				continue
			if cls.field_is_hidden(df, doc_values):
				blocked.append(getattr(df, "label", None) or fieldname)
		if blocked:
			frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	@classmethod
	def field_writable(cls, df, write_levels: set, doc_values: dict) -> bool:
		fieldname = getattr(df, "fieldname", None)
		if not fieldname:
			return False
		if getattr(df, "fieldtype", None) in SKIP_FIELDTYPES:
			return False
		if cls.field_is_hidden(df, doc_values):
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
