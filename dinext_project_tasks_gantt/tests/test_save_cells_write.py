# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt import save_cells as mod
from dinext_project_tasks_gantt.task_tree_gantt.get_data.row import TaskRow
from dinext_project_tasks_gantt.task_tree_gantt.get_data.write import TaskFieldWrite


class FakeDoc:
	def __init__(self, name, **fields):
		self.name = name
		self._data = {"name": name, **fields}

	def get(self, key, default=None):
		return getattr(self, key, self._data.get(key, default))

	def as_dict(self):
		return dict(self._data)


class TestSaveCellsWriteFlags(FrappeTestCase):
	def test_stub_can_write_fields_empty(self):
		row = TaskRow.from_task(FakeDoc("T1").as_dict())
		row["can_read"] = 0
		row["can_write"] = 0
		TaskFieldWrite.attach([row])
		self.assertEqual(row["can_write_fields"], [])

	def test_ro_can_write_fields_empty(self):
		row = TaskRow.from_task(FakeDoc("T1", subject="Hi").as_dict())
		row["can_read"] = 1
		row["can_write"] = 0
		TaskFieldWrite.attach([row])
		self.assertEqual(row["can_write_fields"], [])

	def test_writable_can_write_fields_nonempty(self):
		flags = mod._write_flags([FakeDoc("T1", subject="Hi", status="Open")])
		self.assertEqual(flags["T1"]["can_write"], 1)
		self.assertTrue(flags["T1"]["can_write_fields"])
		self.assertIn("subject", flags["T1"]["can_write_fields"])
		self.assertIn("_assign", flags["T1"]["can_write_fields"])
		self.assertIn("custom_relations", flags["T1"]["can_write_fields"])

	def test_workflow_lock_empties_fields(self):
		with patch.object(TaskFieldWrite, "workflow_locks", return_value=True):
			flags = mod._write_flags([FakeDoc("T1", subject="Hi", status="Open")])
		self.assertEqual(flags["T1"]["can_write"], 0)
		self.assertEqual(flags["T1"]["can_write_fields"], [])

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission")
	def test_save_cells_requires_read_and_write(self, perm, persist):
		def hp(doctype, ptype="read", doc=None, *args, **kwargs):
			# Role write without read: doctype write ok, document read denied.
			if doc is None:
				return ptype == "write"
			return ptype == "write"

		perm.side_effect = hp
		with self.assertRaises(frappe.PermissionError):
			mod.save_cells([{"id": "T1", "field": "subject", "value": "Bye"}])
		persist.assert_not_called()

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_stops_when_mandatory_fails(self, _perm, persist):
		persist.side_effect = frappe.MandatoryError("Expected End Date")
		with self.assertRaises(frappe.MandatoryError):
			mod.save_cells([{"id": "T1", "field": "status", "value": "Completed"}])

	@patch.object(TaskFieldWrite, "assert_not_writing_hidden")
	@patch.object(TaskFieldWrite, "assert_mandatory")
	@patch("frappe.get_doc")
	def test_persist_asserts_mandatory_before_save(
		self, get_doc, assert_mand, assert_hidden
	):
		doc = FakeDoc("T1", subject="Hi", status="Open")
		doc.update = lambda values: None
		doc.save = lambda: None
		get_doc.return_value = doc
		mod._persist_task("T1", {"status": "Completed"})
		assert_hidden.assert_called_once_with(doc, {"status": "Completed"})
		assert_mand.assert_called_once_with(doc)

	@patch.object(TaskFieldWrite, "assert_not_writing_hidden")
	@patch.object(TaskFieldWrite, "assert_mandatory")
	@patch("frappe.get_doc")
	def test_persist_fills_completed_on_before_mandatory(
		self, get_doc, assert_mand, assert_hidden
	):
		order = []
		doc = FakeDoc("T1", subject="Hi", status="Open")
		doc.update = lambda values: None
		doc.save = lambda: None
		get_doc.return_value = doc
		with patch.object(mod, "apply_completed_on", side_effect=lambda d: order.append("fill")):
			assert_hidden.side_effect = lambda *a, **k: order.append("hidden")
			assert_mand.side_effect = lambda *a, **k: order.append("mand")
			mod._persist_task("T1", {"status": "Completed"})
		self.assertEqual(order, ["fill", "hidden", "mand"])

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_response_write_keyed_by_name(self, _perm, persist):
		persist.return_value = FakeDoc("T1", subject="Hi", status="Open")
		out = mod.save_cells([{"id": "T1", "field": "subject", "value": "Bye"}])
		self.assertEqual(out["updated"], 1)
		self.assertIn("T1", out["write"])
		self.assertIn("can_write", out["write"]["T1"])
		self.assertIn("can_write_fields", out["write"]["T1"])
		self.assertIsInstance(out["write"]["T1"]["can_write_fields"], list)
		self.assertIn("hidden_fields", out["write"]["T1"])
		self.assertIsInstance(out["write"]["T1"]["hidden_fields"], list)
