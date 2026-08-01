# Copyright (c) 2026, Dinext and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, nowdate


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


class TestProjectProgressAudit(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.prefix = frappe.generate_hash(length=8)
		self._tasks: list[str] = []
		self._projects: list[str] = []

	def tearDown(self):
		for name in reversed(self._tasks):
			if frappe.db.exists("Task", name):
				frappe.delete_doc("Task", name, force=True, ignore_permissions=True)
		for name in reversed(self._projects):
			if frappe.db.exists("Project", name):
				frappe.delete_doc("Project", name, force=True, ignore_permissions=True)
		super().tearDown()

	def _make_project(self, tail: str, method: str = "Task Completion", percent_complete: float = 0):
		project = frappe.new_doc("Project")
		project.name = f"{self.prefix}-{tail}"
		project.project_name = project.name
		project.status = "Open"
		project.is_active = "Yes"
		project.project_type = "External"
		project.custom_payment_scheme = "Время и затраты (T&M)"
		project.percent_complete_method = method
		project.percent_complete = percent_complete
		project.insert()
		self._projects.append(project.name)
		return project

	def _make_task(
		self,
		tail: str,
		project: str,
		status: str = "Open",
		progress: float = 0,
		task_weight: float = 1,
	):
		task = frappe.new_doc("Task")
		task.subject = f"{self.prefix}-{tail}"
		task.project = project
		task.status = status
		task.progress = progress
		task.task_weight = task_weight
		task.exp_start_date = nowdate()
		task.exp_end_date = add_days(nowdate(), 1)
		task.insert()
		self._tasks.append(task.name)
		return task

	def _project_history(self, project_name: str):
		project = frappe.get_doc("Project", project_name)
		return project.get("custom_progress_history") or []

	def test_project_save_appends_history_for_manual_method(self):
		project = self._make_project("Manual", method="Manual")
		project.percent_complete = 35
		project.save()

		history = self._project_history(project.name)
		self.assertEqual(len(history), 1)
		self.assertAlmostEqual(flt(history[0].old_progress), 0.0, places=2)
		self.assertAlmostEqual(flt(history[0].new_progress), 35.0, places=2)
		self.assertEqual(history[0].changed_by, "Administrator")

	def test_project_save_skips_history_when_percent_unchanged(self):
		project = self._make_project("NoOp", method="Manual", percent_complete=20)
		project.notes = "No percent change"
		project.save()

		self.assertFalse(self._project_history(project.name))

	def test_task_completion_updates_project_history(self):
		project = self._make_project("TaskCompletion")
		task = self._make_task("CompletionTask", project.name)
		task.status = "Completed"
		task.save()

		history = self._project_history(project.name)
		self.assertEqual(len(history), 1)
		self.assertAlmostEqual(flt(history[0].old_progress), 0.0, places=2)
		self.assertAlmostEqual(flt(history[0].new_progress), 100.0, places=2)

	def test_task_progress_updates_project_history(self):
		project = self._make_project("TaskProgress", method="Task Progress")
		task = self._make_task("ProgressTask", project.name, progress=0)
		task.progress = 40
		task.save()

		history = self._project_history(project.name)
		self.assertEqual(len(history), 1)
		self.assertAlmostEqual(flt(history[0].old_progress), 0.0, places=2)
		self.assertAlmostEqual(flt(history[0].new_progress), 40.0, places=2)

	def test_task_delete_updates_project_history(self):
		project = self._make_project("DeleteProject")
		done = self._make_task("DeleteDone", project.name)
		open_task = self._make_task("DeleteOpen", project.name)

		done.status = "Completed"
		done.save()

		frappe.delete_doc("Task", open_task.name, force=True, ignore_permissions=True)
		self._tasks = [name for name in self._tasks if name != open_task.name]

		history = self._project_history(project.name)
		self.assertEqual(len(history), 2)
		self.assertAlmostEqual(flt(history[-1].old_progress), 50.0, places=2)
		self.assertAlmostEqual(flt(history[-1].new_progress), 100.0, places=2)

	def test_task_move_recalculates_both_projects(self):
		source = self._make_project("MoveSource", method="Task Progress")
		target = self._make_project("MoveTarget", method="Task Progress")
		task = self._make_task("MoveTask", source.name, progress=60)

		task.project = target.name
		task.save()

		source_history = self._project_history(source.name)
		target_history = self._project_history(target.name)

		self.assertEqual(len(source_history), 2)
		self.assertAlmostEqual(flt(source_history[-1].old_progress), 60.0, places=2)
		self.assertAlmostEqual(flt(source_history[-1].new_progress), 0.0, places=2)
		self.assertEqual(len(target_history), 1)
		self.assertAlmostEqual(flt(target_history[0].old_progress), 0.0, places=2)
		self.assertAlmostEqual(flt(target_history[0].new_progress), 60.0, places=2)
