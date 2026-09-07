# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""get_children after ISS move-task-tree-field-rules-to-client.

Server: row = permitted Task document + aliases, `can_read`/`can_write`,
workflow lock, `frappe.response["tree_meta"]`. No depends_on interpretation.
"""

from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt import form_contract
from dinext_project_tasks_gantt.task_tree_gantt.get_data.meta import TaskTreeMeta
from dinext_project_tasks_gantt.task_tree_gantt.get_data.row import TaskRow
from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite


def _df(fieldname, fieldtype="Data", options=None, permlevel=0, **props):
	return SimpleNamespace(
		fieldname=fieldname,
		fieldtype=fieldtype,
		options=options,
		permlevel=permlevel,
		depends_on=props.get("depends_on"),
		read_only_depends_on=props.get("read_only_depends_on"),
		mandatory_depends_on=props.get("mandatory_depends_on"),
		is_virtual=props.get("is_virtual", 0),
	)


class FakeMeta:
	def __init__(self, fields, levels=(0,)):
		self.fields = fields
		self._levels = list(levels)

	def get_permlevel_access(self, permission_type="read", parenttype=None, *, user=None):
		return self._levels

	def get_table_fields(self):
		return [df for df in self.fields if df.fieldtype in ("Table", "Table MultiSelect")]

	def get_valid_columns(self):
		return ["name", "owner", "creation", "modified", "docstatus", "idx", "is_group"] + [
			df.fieldname
			for df in self.fields
			if df.fieldtype not in ("Table", "Table MultiSelect", "Section Break", "Column Break", "Tab Break")
		]

	def has_field(self, fieldname):
		return any(df.fieldname == fieldname for df in self.fields)


class TestNoServerSideUiContract(FrappeTestCase):
	def test_task_tree_gantt_has_no_safe_eval_or_depends_on_interpretation(self):
		"""CI invariant: UI properties are a client contract."""
		import os

		import dinext_project_tasks_gantt.task_tree_gantt as pkg

		root = os.path.dirname(pkg.__file__)
		for dirpath, _dirs, files in os.walk(root):
			for fname in files:
				if not fname.endswith(".py"):
					continue
				with open(os.path.join(dirpath, fname), encoding="utf-8") as fh:
					src = fh.read()
				self.assertNotIn("safe_eval", src, f"{fname} must not evaluate expressions")
				self.assertNotIn("hidden_fields", src, f"{fname} must not compute hidden_fields")
				self.assertNotIn("can_write_fields", src, f"{fname} must not compute can_write_fields")

	def test_removed_helpers_are_gone(self):
		for attr in (
			"writable_fields",
			"hidden_fields",
			"field_is_hidden",
			"eval_depends_on",
			"assert_mandatory",
			"assert_not_writing_hidden",
			"missing_mandatory_labels",
		):
			self.assertFalse(hasattr(TaskFieldWrite, attr), attr)


class TestFormContractReferences(FrappeTestCase):
	def test_expression_refs(self):
		self.assertEqual(form_contract.expression_refs("eval:!doc.custom_opportunity"), {"custom_opportunity"})
		self.assertEqual(
			form_contract.expression_refs("eval: doc.type?.trim() != '' && !doc.is_template"),
			{"type", "is_template"},
		)
		self.assertEqual(form_contract.expression_refs("custom_opportunity"), {"custom_opportunity"})
		self.assertEqual(form_contract.expression_refs("fn:is_visible"), set())
		self.assertEqual(form_contract.expression_refs(""), set())
		self.assertEqual(form_contract.expression_refs(None), set())

	def test_referenced_fieldnames_include_breaks_and_all_props(self):
		meta = FakeMeta(
			[
				_df("sec", fieldtype="Section Break", depends_on="eval:doc.a"),
				_df("x", read_only_depends_on="eval:doc.b == 1"),
				_df("y", mandatory_depends_on="c"),
				_df("z"),
			]
		)
		self.assertEqual(form_contract.referenced_fieldnames(meta), {"a", "b", "c"})

	def test_referenced_table_fields(self):
		meta = FakeMeta(
			[
				_df("depends_on_tasks", fieldtype="Table", options="Task Depends On"),
				_df("custom_relations", fieldtype="Table", options="Task Relation"),
				_df("x", depends_on="eval:doc.depends_on_tasks.length"),
			]
		)
		self.assertEqual(
			[df.fieldname for df in form_contract.referenced_table_fields(meta)],
			["depends_on_tasks"],
		)

	def test_live_lint_never_raises(self):
		messages = form_contract.lint_messages("Task")
		self.assertIsInstance(messages, list)
		for message in messages:
			self.assertTrue(message.startswith(("WARN", "INFO")), message)


class TestTaskRowShape(FrappeTestCase):
	def test_select_fieldnames_system_optional_scalar(self):
		meta = FakeMeta(
			[
				_df("subject"),
				_df("sec", fieldtype="Section Break"),
				_df("depends_on_tasks", fieldtype="Table", options="Task Depends On"),
				_df("virt", is_virtual=1),
				_df("secret", permlevel=1),
			]
		)
		names = TaskRow.select_fieldnames(meta, permitted={"subject", "_assign", "_user_tags", "virt"})
		for system in ("name", "owner", "docstatus", "modified", "is_group"):
			self.assertIn(system, names)
		self.assertIn("_assign", names)
		self.assertIn("_user_tags", names)
		self.assertIn("subject", names)
		self.assertNotIn("sec", names)
		self.assertNotIn("depends_on_tasks", names)
		self.assertNotIn("virt", names)
		self.assertNotIn("secret", names)

	def test_select_fieldnames_adds_referenced_optional_column(self):
		meta = FakeMeta([_df("subject", depends_on="eval:doc._comments")])
		names = TaskRow.select_fieldnames(meta, permitted={"subject", "_comments"})
		self.assertIn("_comments", names)

	def test_from_task_keeps_doctype_names_and_aliases(self):
		row = TaskRow.from_task(
			{
				"name": "T1",
				"type": "Phase",
				"_assign": '["a@x.com"]',
				"_user_tags": ",Urgent",
				"custom_opportunity": "OPP-1",
				"is_group": 1,
			}
		)
		self.assertEqual(row["id"], "T1")
		self.assertEqual(row["name"], "T1")
		self.assertEqual(row["type"], "Phase")
		self.assertEqual(row["task_type"], "Phase")
		self.assertEqual(row["assign"], ["a@x.com"])
		self.assertEqual(row["_assign"], '["a@x.com"]')
		self.assertEqual(row["user_tags"], ",Urgent")
		self.assertEqual(row["custom_opportunity"], "OPP-1")
		self.assertTrue(row["has_children"])
		self.assertNotIn("can_write_fields", row)
		self.assertNotIn("hidden_fields", row)

	def test_live_permitted_fieldnames_read_vs_write(self):
		meta = frappe.get_meta("Task")
		read = TaskRow.permitted_fieldnames(meta)
		write = TaskRow.permitted_fieldnames(meta, permission_type="write")
		self.assertIn("subject", read)
		self.assertIn("subject", write)
		self.assertIn("_assign", read)
		self.assertIn("custom_relations", read)

	def test_live_select_covers_every_permitted_scalar_field(self):
		meta = frappe.get_meta("Task")
		permitted = TaskRow.permitted_fieldnames(meta)
		names = set(TaskRow.select_fieldnames(meta, permitted))
		for df in meta.fields:
			if df.fieldtype in ("Data", "Link", "Select", "Date", "Check", "Int", "Float", "Percent"):
				if df.fieldname in permitted and not getattr(df, "is_virtual", 0):
					self.assertIn(df.fieldname, names, df.fieldname)
		for system in ("name", "owner", "docstatus", "modified", "_assign", "_user_tags"):
			self.assertIn(system, names)

	def test_stub_keeps_tree_keys_only(self):
		row = TaskRow.from_task({"name": "mid", "subject": "Secret", "type": "Phase", "is_group": 1})
		row["can_read"] = 0
		row["can_write"] = 0
		TaskRow.apply_field_read_strip([row], {"subject", "type"})
		self.assertEqual(row["id"], "mid")
		self.assertEqual(row["subject"], "")
		self.assertIsNone(row["type"])
		self.assertIsNone(row["task_type"])
		self.assertIsNone(row["name"])

	def test_attach_child_tables_only_for_referenced_tables(self):
		meta = FakeMeta(
			[
				_df("depends_on_tasks", fieldtype="Table", options="Task Depends On"),
				_df("custom_relations", fieldtype="Table", options="Task Relation"),
				_df("x", depends_on="eval:doc.depends_on_tasks.length"),
			]
		)
		rows = [{"id": "T1"}, {"id": "T2"}]
		fake_children = [{"parent": "T1", "task": "T9", "idx": 1}]
		with (
			patch("frappe.get_all", return_value=fake_children) as get_all,
			patch.object(TaskRow, "child_select_fieldnames", return_value=["name", "parent", "task"]),
		):
			TaskRow.attach_child_tables(rows, meta, permitted={"depends_on_tasks", "custom_relations"})
		self.assertEqual(get_all.call_count, 1)
		self.assertEqual(rows[0]["depends_on_tasks"], fake_children)
		self.assertEqual(rows[1]["depends_on_tasks"], [])
		self.assertNotIn("custom_relations", rows[0])


class TestTreeMeta(FrappeTestCase):
	def test_workflow_contract(self):
		workflow = SimpleNamespace(
			workflow_state_field="workflow_state",
			states=[
				SimpleNamespace(state="Pending", allow_edit="Task Manager", update_field="status"),
				SimpleNamespace(state="Done", allow_edit="Task Manager", update_field="status"),
				SimpleNamespace(state="Odd", allow_edit="Task Manager", update_field=None),
			],
		)
		self.assertEqual(
			TaskTreeMeta.workflow_contract(workflow),
			{"state_field": "workflow_state", "update_fields": ["status"]},
		)
		self.assertIsNone(TaskTreeMeta.workflow_contract(None))

	def test_build_and_publish_live(self):
		meta = TaskTreeMeta.build(workflow=None)
		self.assertEqual(meta["doctype"], "Task")
		self.assertIn(0, meta["permlevels_readable"])
		self.assertIsInstance(meta["permlevels_writable"], list)
		self.assertIsNone(meta["workflow"])
		frappe.response = frappe._dict()
		TaskTreeMeta.publish(meta)
		self.assertEqual(frappe.response["tree_meta"], meta)


class TestWorkflowLock(FrappeTestCase):
	def test_workflow_locks_when_allow_edit_role_missing(self):
		workflow = SimpleNamespace(
			workflow_state_field="workflow_state",
			states=[SimpleNamespace(state="Pending", allow_edit="Task Manager")],
		)
		row = {"id": "T1", "workflow_state": "Pending"}
		self.assertTrue(TaskFieldWrite.workflow_locks(row, workflow, {"Employee"}, {}))
		self.assertFalse(TaskFieldWrite.workflow_locks(row, workflow, {"Task Manager"}, {}))
		self.assertFalse(TaskFieldWrite.workflow_locks(row, None, {"Employee"}, {}))

	def test_attach_reuses_loaded_workflow_state(self):
		workflow = SimpleNamespace(
			workflow_state_field="workflow_state",
			states=[SimpleNamespace(state="Pending", allow_edit="Task Manager")],
		)
		row = {"id": "T1", "subject": "Hi", "can_read": 1, "can_write": 1}
		with (
			patch.object(TaskFieldWrite, "workflow_states") as state_query,
			patch("frappe.get_roles", return_value=["Employee"]),
		):
			TaskFieldWrite.attach([row], workflow=workflow, state_by_id={"T1": "Pending"})
		state_query.assert_not_called()
		self.assertEqual(row["can_write"], 0)
		self.assertNotIn("can_write_fields", row)

	def test_attach_leaves_rows_without_workflow(self):
		row = {"id": "T1", "can_read": 1, "can_write": 1}
		TaskFieldWrite.attach([row], workflow=None)
		self.assertEqual(row["can_write"], 1)


class TestGetChildrenLive(FrappeTestCase):
	"""Live read on dev site (Administrator). No writes."""

	def _project(self):
		return frappe.db.get_value(
			"Task", {"docstatus": ("<", 2), "project": ("is", "set")}, "project"
		)

	def test_rows_are_documents_with_aliases_and_meta_published(self):
		project = self._project()
		if not project:
			self.skipTest("no Task with project on site")
		from dinext_project_tasks_gantt.task_tree_gantt.get_data import get_children

		frappe.response = frappe._dict()
		rows = get_children(project=project, all_tasks=1, limit=5)
		self.assertTrue(rows)
		meta = frappe.response.get("tree_meta")
		self.assertEqual(meta["doctype"], "Task")
		self.assertIn("permlevels_writable", meta)
		self.assertIn("workflow", meta)
		row = rows[0]
		for key in ("id", "name", "owner", "docstatus", "modified", "_assign", "_user_tags", "type", "task_type", "assign", "can_read", "can_write"):
			self.assertIn(key, row, key)
		self.assertNotIn("can_write_fields", row)
		self.assertNotIn("hidden_fields", row)
		self.assertEqual(row["id"], row["name"])
