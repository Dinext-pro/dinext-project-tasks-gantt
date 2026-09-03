# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt write flag: document-level workflow lock.

Field-level UI properties (hidden, read_only, form-contract expressions, mandatory) are
the Frappe form contract and are resolved on the client with the same
primitives the Desk form uses. The server only answers "may this user write
this document" — role / owner / share (TaskTreeAcl) and workflow state.
"""

from __future__ import annotations

import frappe

_WORKFLOW_UNSET = object()


class TaskFieldWrite:
	@classmethod
	def attach(
		cls,
		rows: list[dict],
		*,
		workflow=_WORKFLOW_UNSET,
		state_by_id: dict[str, str] | None = None,
	) -> None:
		"""Drop can_write on rows whose workflow state has no allow_edit role for the user."""
		if not rows:
			return

		if workflow is _WORKFLOW_UNSET:
			workflow = cls.active_workflow()
		if not workflow:
			return
		roles = set(frappe.get_roles())
		state_by_id = dict(state_by_id or {})
		writable_ids = [
			row["id"]
			for row in rows
			if row.get("can_read") and row.get("can_write")
		]
		missing_state_ids = [i for i in writable_ids if i not in state_by_id]
		if missing_state_ids:
			state_by_id.update(cls.workflow_states(workflow, missing_state_ids))
		for row in rows:
			if not row.get("can_read") or not row.get("can_write"):
				continue
			if cls.workflow_locks(row, workflow, roles, state_by_id):
				row["can_write"] = 0

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
