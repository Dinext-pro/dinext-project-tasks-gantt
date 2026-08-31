# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from types import SimpleNamespace

from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite


def _df(fieldname, permlevel=0, read_only=0, read_only_depends_on=None, fieldtype="Data"):
	return SimpleNamespace(
		fieldname=fieldname,
		permlevel=permlevel,
		read_only=read_only,
		read_only_depends_on=read_only_depends_on,
		fieldtype=fieldtype,
	)


class FakeMeta:
	def __init__(self, fields, write_levels=(0,)):
		self.fields = fields
		self._write_levels = list(write_levels)

	def get_permlevel_access(self, permission_type="write", parenttype=None, *, user=None):
		return self._write_levels


class TestGetChildrenWriteFlags(FrappeTestCase):
	def test_stub_can_write_fields_empty(self):
		row = {
			"id": "mid",
			"can_read": 0,
			"can_write": 0,
			"parent_task": "root",
			"has_children": True,
		}
		TaskFieldWrite.attach([row])
		self.assertEqual(row["can_write_fields"], [])
		self.assertEqual(row["can_write"], 0)

	def test_acl_read_only_can_write_fields_empty(self):
		row = {"id": "leaf", "can_read": 1, "can_write": 0, "subject": "ok"}
		TaskFieldWrite.attach([row])
		self.assertEqual(row["can_write_fields"], [])

	def test_read_only_field_excluded(self):
		meta = FakeMeta([_df("subject"), _df("status", read_only=1)])
		row = {"id": "T1", "subject": "Hi", "status": "Open", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "status"}
		)
		self.assertIn("subject", fields)
		self.assertNotIn("status", fields)

	def test_permlevel_write_denied_excluded(self):
		meta = FakeMeta(
			[_df("subject"), _df("progress", permlevel=1)],
			write_levels=(0,),
		)
		row = {"id": "T1", "subject": "Hi", "progress": 10, "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "progress"}
		)
		self.assertIn("subject", fields)
		self.assertNotIn("progress", fields)

	def test_read_only_depends_on_missing_field_excluded(self):
		meta = FakeMeta(
			[
				_df("subject"),
				_df("status", read_only_depends_on="eval:doc.secret_flag"),
			]
		)
		row = {"id": "T1", "subject": "Hi", "status": "Open", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "status"}
		)
		self.assertIn("subject", fields)
		self.assertNotIn("status", fields)

	def test_optional_assign_included_when_absent_from_meta(self):
		meta = FakeMeta([_df("subject")])
		row = {"id": "T1", "subject": "Hi", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "_assign"}
		)
		self.assertIn("subject", fields)
		self.assertIn("_assign", fields)

	def test_optional_assign_excluded_without_permlevel_write(self):
		meta = FakeMeta([_df("subject")])
		row = {"id": "T1", "subject": "Hi", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={1}, permitted={"subject", "_assign"}
		)
		self.assertNotIn("subject", fields)
		self.assertNotIn("_assign", fields)

	def test_assign_in_meta_read_only_not_backfilled(self):
		meta = FakeMeta([_df("subject"), _df("_assign", read_only=1)])
		row = {"id": "T1", "subject": "Hi", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "_assign"}
		)
		self.assertIn("subject", fields)
		self.assertNotIn("_assign", fields)

	def test_table_relations_included(self):
		meta = FakeMeta([_df("custom_relations", fieldtype="Table")])
		row = {"id": "T1", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"custom_relations"}
		)
		self.assertIn("custom_relations", fields)

	def test_live_task_writable_includes_assign_and_relations(self):
		import frappe

		meta = frappe.get_meta("Task")
		row = {"id": "T1", "subject": "Hi", "status": "Open", "can_read": 1, "can_write": 1}
		fields = TaskFieldWrite.writable_fields(meta, row)
		self.assertIn("_assign", fields)
		self.assertIn("custom_relations", fields)

	def test_workflow_locks_when_allow_edit_role_missing(self):
		workflow = SimpleNamespace(
			workflow_state_field="workflow_state",
			states=[SimpleNamespace(state="Pending", allow_edit="Task Manager")],
		)
		row = {"id": "T1", "workflow_state": "Pending"}
		self.assertTrue(
			TaskFieldWrite.workflow_locks(row, workflow, {"Employee"}, {})
		)
		self.assertFalse(
			TaskFieldWrite.workflow_locks(row, workflow, {"Task Manager"}, {})
		)
		self.assertFalse(TaskFieldWrite.workflow_locks(row, None, {"Employee"}, {}))
