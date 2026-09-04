# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt import save_cells as mod
from dinext_project_tasks_gantt.task_tree_gantt.get_data.query import TaskTreeQuery


class FakeDoc:
	def __init__(self, name, **fields):
		self.name = name
		self._data = {"name": name, **fields}

	def get(self, key, default=None):
		return getattr(self, key, self._data.get(key, default))

	def as_dict(self):
		return dict(self._data)


class TestSaveCellsAuthorization(FrappeTestCase):
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission")
	def test_save_cells_requires_read_and_write(self, perm, persist):
		def hp(doctype, ptype="read", doc=None, *args, **kwargs):
			# Role write without read: doctype write ok, document read denied.
			return ptype == "write"

		perm.side_effect = hp
		with self.assertRaises(frappe.PermissionError):
			mod.save_cells([{"id": "T1", "field": "subject", "value": "Bye"}])
		persist.assert_not_called()

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission")
	def test_save_cells_rejects_document_without_write(self, perm, persist):
		"""Row `can_write=0` case: doctype write ok, document write denied."""

		def hp(doctype, ptype="read", doc=None, *args, **kwargs):
			return not (doc and ptype == "write")

		perm.side_effect = hp
		with self.assertRaises(frappe.PermissionError):
			mod.save_cells([{"id": "T1", "field": "subject", "value": "Bye"}])
		persist.assert_not_called()

	@patch.object(TaskTreeQuery, "rows_for_ids", return_value=[])
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_accepts_field_with_js_only_depends_on(self, _perm, persist, _rows):
		"""`eval:!doc.custom_opportunity` is JS; the server must not evaluate it (ISS root cause)."""
		if not frappe.get_meta("Task").has_field("custom_include"):
			self.skipTest("Task.custom_include not on site")
		frappe.db.savepoint("js_only_depends_on")
		frappe.make_property_setter(
			{
				"doctype": "Task",
				"fieldname": "custom_include",
				"property": "depends_on",
				"value": "eval:!doc.custom_opportunity",
				"property_type": "Data",
			},
			validate_fields_for_doctype=False,
		)
		frappe.clear_cache(doctype="Task")
		try:
			self.assertEqual(
				frappe.get_meta("Task").get_field("custom_include").depends_on,
				"eval:!doc.custom_opportunity",
			)
			out = mod.save_cells([{"id": "T1", "field": "custom_include", "value": 1}])
		finally:
			frappe.db.rollback(save_point="js_only_depends_on")
			frappe.clear_cache(doctype="Task")
		persist.assert_called_once_with("T1", {"custom_include": 1})
		self.assertEqual(out["updated"], 1)

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_denies_field_outside_writable_permlevel(self, _perm, persist):
		with patch.object(mod.TaskRow, "permitted_fieldnames", return_value={"subject"}):
			with self.assertRaises(frappe.PermissionError):
				mod.save_cells([{"id": "T1", "field": "status", "value": "Open"}])
		persist.assert_not_called()

	@patch.object(TaskTreeQuery, "rows_for_ids", return_value=[])
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_allows_field_on_writable_permlevel(self, _perm, persist, _rows):
		with patch.object(mod.TaskRow, "permitted_fieldnames", return_value={"subject", "status"}):
			out = mod.save_cells([{"id": "T1", "field": "status", "value": "Open"}])
		persist.assert_called_once_with("T1", {"status": "Open"})
		self.assertEqual(out["updated"], 1)

	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_propagates_document_mandatory_error(self, _perm, persist):
		"""reqd / mandatory are Document.save() concerns — surfaced as-is."""
		persist.side_effect = frappe.MandatoryError("Expected End Date")
		with self.assertRaises(frappe.MandatoryError):
			mod.save_cells([{"id": "T1", "field": "status", "value": "Completed"}])

	@patch.object(TaskTreeQuery, "rows_for_ids", return_value=[])
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_save_cells_accepts_completed_on(self, _perm, persist, _rows):
		out = mod.save_cells(
			[
				{"id": "T1", "field": "status", "value": "Completed"},
				{"id": "T1", "field": "completed_on", "value": "2026-08-01"},
			]
		)
		persist.assert_called_once_with(
			"T1", {"status": "Completed", "completed_on": "2026-08-01"}
		)
		self.assertEqual(out["updated"], 1)


class TestPersistTask(FrappeTestCase):
	@patch("frappe.get_doc")
	def test_persist_updates_fills_completed_on_then_saves(self, get_doc):
		order = []
		doc = FakeDoc("T1", subject="Hi", status="Open")
		doc.update = lambda values: order.append(("update", dict(values)))
		doc.save = lambda: order.append("save")
		get_doc.return_value = doc
		with patch.object(mod, "apply_completed_on", side_effect=lambda d: order.append("fill")):
			mod._persist_task("T1", {"status": "Completed"})
		self.assertEqual(order, [("update", {"status": "Completed"}), "fill", "save"])

	def test_no_ui_contract_asserts_in_module(self):
		for name in ("assert_mandatory", "assert_not_writing_hidden", "_write_flags"):
			self.assertFalse(hasattr(mod, name), name)


class TestSaveCellsResponse(FrappeTestCase):
	@patch.object(TaskTreeQuery, "rows_for_ids")
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_response_saved_rows_full_contract(self, _perm, persist, rows_for_ids):
		rows_for_ids.return_value = [
			{"id": "T1", "name": "T1", "subject": "Bye", "type": None, "can_read": 1, "can_write": 1}
		]
		out = mod.save_cells([{"id": "T1", "field": "subject", "value": "Bye"}])
		self.assertEqual(out["updated"], 1)
		rows_for_ids.assert_called_once_with(["T1"])
		self.assertEqual(out["saved"][0]["id"], "T1")
		self.assertNotIn("write", out)
		self.assertNotIn("rows", out)

	@patch.object(TaskTreeQuery, "rows_for_ids", return_value=[])
	@patch.object(mod, "collect_date_side_effect_rows", return_value=[{"id": "T1"}])
	@patch.object(mod, "_persist_task")
	@patch("frappe.has_permission", return_value=True)
	def test_response_rows_only_for_date_changes(self, _perm, _persist, side, _rows):
		out = mod.save_cells([{"id": "T1", "field": "exp_end_date", "value": "2026-09-03"}])
		side.assert_called_once_with(["T1"])
		self.assertEqual(out["rows"], [{"id": "T1"}])

	def test_live_rows_for_ids_full_row(self):
		task = frappe.db.get_value("Task", {"docstatus": ("<", 2)}, "name")
		if not task:
			self.skipTest("no Task on site")
		rows = TaskTreeQuery.rows_for_ids([task])
		self.assertEqual(len(rows), 1)
		row = rows[0]
		for key in ("id", "name", "owner", "docstatus", "modified", "type", "task_type", "assign", "can_read", "can_write"):
			self.assertIn(key, row, key)
		self.assertEqual(row["can_read"], 1)
		self.assertNotIn("can_write_fields", row)
