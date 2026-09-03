# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Task Tree Gantt access meta, published once per response as `frappe.response["tree_meta"]`.

The client turns it into the `perm` object for `frappe.perm.get_field_display_status`
and into the workflow read-only rule Desk Form applies via `cur_frm`.
UI properties (form-contract expressions) are a client-side contract — never evaluated here.
"""

from __future__ import annotations

import frappe

from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite

_WORKFLOW_UNSET = object()
RESPONSE_KEY = "tree_meta"


class TaskTreeMeta:
	@classmethod
	def workflow_contract(cls, workflow) -> dict | None:
		"""Same data Desk Form uses: `frappe.workflow.get_state_fieldname` + `get_update_fields`."""
		if not workflow or not workflow.workflow_state_field:
			return None
		update_fields: list[str] = []
		for state in workflow.states or []:
			field = getattr(state, "update_field", None)
			if field and field not in update_fields:
				update_fields.append(field)
		return {
			"state_field": workflow.workflow_state_field,
			"update_fields": update_fields,
		}

	@classmethod
	def build(cls, workflow=_WORKFLOW_UNSET) -> dict:
		if workflow is _WORKFLOW_UNSET:
			workflow = TaskFieldWrite.active_workflow()
		meta = frappe.get_meta("Task")
		return {
			"doctype": "Task",
			"permlevels_readable": sorted(meta.get_permlevel_access("read")),
			"permlevels_writable": sorted(meta.get_permlevel_access("write")),
			"workflow": cls.workflow_contract(workflow),
		}

	@classmethod
	def publish(cls, tree_meta: dict) -> None:
		"""Sideband like `user_info`: `frappe.call` exposes it as `r.tree_meta`."""
		frappe.response[RESPONSE_KEY] = tree_meta
