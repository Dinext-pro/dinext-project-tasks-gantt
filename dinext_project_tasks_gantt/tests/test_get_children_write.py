# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from types import SimpleNamespace

from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite


def _df(
	fieldname,
	permlevel=0,
	read_only=0,
	read_only_depends_on=None,
	mandatory_depends_on=None,
	depends_on=None,
	hidden=0,
	reqd=0,
	fieldtype="Data",
	label=None,
):
	return SimpleNamespace(
		fieldname=fieldname,
		permlevel=permlevel,
		read_only=read_only,
		read_only_depends_on=read_only_depends_on,
		mandatory_depends_on=mandatory_depends_on,
		depends_on=depends_on,
		hidden=hidden,
		reqd=reqd,
		fieldtype=fieldtype,
		label=label or fieldname,
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

	def test_mandatory_depends_on_completed_requires_end_date(self):
		meta = FakeMeta(
			[
				_df("status"),
				_df(
					"exp_end_date",
					mandatory_depends_on='eval:doc.status=="Completed"',
					label="Expected End Date",
				),
			]
		)
		empty = {"status": "Completed", "exp_end_date": None}
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(meta, empty),
			["Expected End Date"],
		)
		filled = {"status": "Completed", "exp_end_date": "2026-09-02"}
		self.assertEqual(TaskFieldWrite.missing_mandatory_labels(meta, filled), [])
		open_empty = {"status": "Open", "exp_end_date": None}
		self.assertEqual(TaskFieldWrite.missing_mandatory_labels(meta, open_empty), [])

	def test_eval_prefix_allows_spaces_like_form(self):
		"""Desk uses `eval: doc.x == \"Y\"`. Leading space after eval: is IndentationError in safe_eval."""
		meta = FakeMeta(
			[
				_df("status"),
				_df(
					"issue",
					mandatory_depends_on='eval: doc.status == "Completed"',
					label="Issue",
				),
			]
		)
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(
				meta, {"status": "Completed", "issue": None}
			),
			["Issue"],
		)
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(
				meta, {"status": "Open", "issue": None}
			),
			[],
		)

	def test_static_reqd_empty_is_missing(self):
		meta = FakeMeta([_df("subject", reqd=1, label="Subject")])
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(meta, {"subject": ""}),
			["Subject"],
		)
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(meta, {"subject": "Hi"}),
			[],
		)

	def test_mandatory_depends_on_wins_over_reqd(self):
		meta = FakeMeta(
			[
				_df("status"),
				_df(
					"exp_end_date",
					reqd=1,
					mandatory_depends_on='eval:doc.status=="Completed"',
					label="Expected End Date",
				),
			]
		)
		# Form: depends_on set → reqd ignored. Open + empty is ok.
		self.assertEqual(
			TaskFieldWrite.missing_mandatory_labels(
				meta, {"status": "Open", "exp_end_date": None}
			),
			[],
		)

	def test_static_hidden_field_not_writable(self):
		meta = FakeMeta([_df("subject"), _df("status", hidden=1)])
		row = {"id": "T1", "subject": "Hi", "status": "Open", "can_read": 1, "can_write": 1}
		self.assertEqual(
			TaskFieldWrite.hidden_fields(meta, row, permitted={"subject", "status"}),
			["status"],
		)
		fields = TaskFieldWrite.writable_fields(
			meta, row, write_levels={0}, permitted={"subject", "status"}
		)
		self.assertIn("subject", fields)
		self.assertNotIn("status", fields)

	def test_depends_on_hides_when_expr_false(self):
		meta = FakeMeta(
			[
				_df("status"),
				_df(
					"exp_end_date",
					depends_on='eval:doc.status=="Open"',
					label="Expected End Date",
				),
			]
		)
		hidden = TaskFieldWrite.hidden_fields(
			meta,
			{"id": "T1", "status": "Completed", "exp_end_date": "2026-01-01"},
			permitted={"status", "exp_end_date"},
		)
		self.assertEqual(hidden, ["exp_end_date"])
		shown = TaskFieldWrite.hidden_fields(
			meta,
			{"id": "T1", "status": "Open", "exp_end_date": "2026-01-01"},
			permitted={"status", "exp_end_date"},
		)
		self.assertEqual(shown, [])

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

	def test_attach_reuses_loaded_workflow_state(self):
		from unittest.mock import patch

		workflow = SimpleNamespace(
			workflow_state_field="workflow_state",
			states=[SimpleNamespace(state="Pending", allow_edit="Task Manager")],
		)
		row = {
			"id": "T1",
			"subject": "Hi",
			"can_read": 1,
			"can_write": 1,
		}
		meta = FakeMeta([_df("subject")])
		with (
			patch.object(TaskFieldWrite, "workflow_states") as state_query,
			patch("frappe.get_roles", return_value=["Employee"]),
			patch("frappe.get_meta", return_value=meta),
		):
			TaskFieldWrite.attach(
				[row],
				{"subject"},
				workflow=workflow,
				state_by_id={"T1": "Pending"},
			)

		state_query.assert_not_called()
		self.assertEqual(row["can_write"], 0)
		self.assertEqual(row["can_write_fields"], [])
