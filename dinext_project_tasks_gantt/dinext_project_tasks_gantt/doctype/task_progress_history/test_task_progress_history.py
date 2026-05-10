# Copyright (c) 2026, Dinext and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate


class TestTaskProgressAudit(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")

	def _make_task(self, subject: str):
		if frappe.db.exists("Task", subject):
			frappe.delete_doc("Task", subject, force=True)

		task = frappe.new_doc("Task")
		task.subject = subject
		task.status = "Open"
		task.exp_start_date = nowdate()
		task.exp_end_date = add_days(nowdate(), 1)
		task.progress = 0
		project = frappe.db.get_value("Project", {"project_name": "_Test Project"})
		if project:
			task.project = project
		task.insert()
		return task

	def test_no_history_on_insert(self):
		task = self._make_task("_TPA Insert Only")
		task.reload()
		self.assertFalse(task.get("custom_progress_history"))

	def test_appends_row_when_progress_changes(self):
		task = self._make_task("_TPA Progress Change")
		task.progress = 25
		task.save()

		task.reload()
		hist = task.get("custom_progress_history") or []
		self.assertEqual(len(hist), 1)
		row = hist[0]
		self.assertEqual(float(row.old_progress or 0), 0.0)
		self.assertEqual(float(row.new_progress or 0), 25.0)
		self.assertEqual(row.changed_by, "Administrator")

	def test_no_row_when_progress_unchanged(self):
		task = self._make_task("_TPA No Op")
		task.progress = 40
		task.save()
		task.reload()
		n = len(task.get("custom_progress_history") or [])

		task.status = "Working"
		task.save()
		task.reload()
		self.assertEqual(len(task.get("custom_progress_history") or []), n)

	def test_sequential_changes_append_rows(self):
		task = self._make_task("_TPA Sequential")
		for progress in (10, 50, 75):
			task.progress = progress
			task.save()
			task.reload()

		hist = task.get("custom_progress_history") or []
		self.assertEqual(len(hist), 3)
		self.assertEqual(float(hist[-1].new_progress or 0), 75.0)
