# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Unit tests for virtual_task helpers (no site restart required for pure logic).

Integration smoke against live DocTypes is deferred until SS cutover + backend reload.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from dinext_project_tasks_gantt.virtual_task.helpers import (
	ISSUE_TO_TASK_PRIORITY,
	ISSUE_TO_TASK_STATUS,
	ITVT_DEPTH,
	TASK_TO_ISSUE_PRIORITY,
	TASK_TO_ISSUE_STATUS,
	is_virtual_task,
	mirror_target_for_issue_or_task,
)
from dinext_project_tasks_gantt.virtual_task.mirrors.todo import sync_todo_mirror
from dinext_project_tasks_gantt.virtual_task.sync.dates import (
	apply_task_actual_dates_logic,
	date_cmp_value,
)
from dinext_project_tasks_gantt.virtual_task.sync.task_to_issue import sync_virtual_task_to_issue


class TestVirtualTaskMaps(unittest.TestCase):
	def test_issue_to_task_status(self):
		self.assertEqual(ISSUE_TO_TASK_STATUS.get("Closed", "Closed"), "Completed")
		self.assertEqual(ISSUE_TO_TASK_STATUS.get("Replied", "Replied"), "Working")

	def test_task_to_issue_status(self):
		self.assertEqual(TASK_TO_ISSUE_STATUS.get("Completed", "Completed"), "Closed")
		self.assertEqual(TASK_TO_ISSUE_STATUS.get("Overdue", "Overdue"), "Open")

	def test_priority_roundtrip_high(self):
		self.assertEqual(ISSUE_TO_TASK_PRIORITY.get("Высокий", "Высокий"), "High")
		self.assertEqual(TASK_TO_ISSUE_PRIORITY.get("Urgent", "Urgent"), "Высокий")


class TestVirtualTaskGuards(unittest.TestCase):
	def test_is_virtual_task(self):
		doc = SimpleNamespace(type="Issue", custom_linked_issue="ISS-1", flags={})
		doc.get = lambda k, d=None: getattr(doc, k, d)
		self.assertTrue(is_virtual_task(doc))
		doc.type = "Task"
		self.assertFalse(is_virtual_task(doc))

	def test_depth_flag_name(self):
		self.assertEqual(ITVT_DEPTH, "itvt_save_depth")


class TestVirtualTaskDates(unittest.TestCase):
	def test_date_cmp_value(self):
		self.assertEqual(date_cmp_value(None), "")
		self.assertEqual(date_cmp_value("2026-08-01"), "2026-08-01")

	def test_act_expands_exp(self):
		data = {"status": "Open", "exp_start_date": "2026-08-10", "exp_end_date": "2026-08-20"}
		apply_task_actual_dates_logic(data, "2026-08-01", "2026-08-25", None)
		self.assertEqual(str(data["exp_start_date"]), "2026-08-01")
		self.assertEqual(str(data["exp_end_date"]), "2026-08-25")

	def test_act_does_not_shrink_exp(self):
		data = {"status": "Open", "exp_start_date": "2026-08-01", "exp_end_date": "2026-08-30"}
		apply_task_actual_dates_logic(data, "2026-08-05", "2026-08-10", None)
		self.assertEqual(str(data["exp_start_date"]), "2026-08-01")
		self.assertEqual(str(data["exp_end_date"]), "2026-08-30")

	def test_completed_without_act_end_sets_act_end_from_completed_on(self):
		data = {"status": "Completed"}
		with patch(
			"dinext_project_tasks_gantt.virtual_task.sync.dates.today",
			return_value="2026-08-07",
		):
			apply_task_actual_dates_logic(data, None, None, None)
		self.assertEqual(data["completed_on"], "2026-08-07")
		self.assertEqual(data["act_end_date"], "2026-08-07")

	def test_completed_future_act_end_caps_completed_on_today(self):
		data = {"status": "Completed"}
		with patch(
			"dinext_project_tasks_gantt.virtual_task.sync.dates.today",
			return_value="2026-09-03",
		):
			apply_task_actual_dates_logic(data, None, "2026-12-31", None)
		self.assertEqual(data["completed_on"], "2026-09-03")
		self.assertNotIn("act_end_date", data)


class TestVirtualTaskToIssueGuard(unittest.TestCase):
	def test_skips_when_depth_positive(self):
		flags = SimpleNamespace(itvt_save_depth=1)
		flags.get = lambda k, d=None: getattr(flags, k, d)
		doc = SimpleNamespace(
			type="Issue",
			custom_linked_issue="ISS-1",
			flags=flags,
			status="Open",
		)
		doc.get = lambda k, d=None: getattr(doc, k, d)
		with patch(
			"dinext_project_tasks_gantt.virtual_task.sync.task_to_issue.frappe.get_doc"
		) as get_doc:
			sync_virtual_task_to_issue(doc)
			get_doc.assert_not_called()

	def test_skips_non_virtual(self):
		flags = SimpleNamespace()
		flags.get = lambda k, d=None: getattr(flags, k, d)
		doc = SimpleNamespace(type="Task", custom_linked_issue=None, flags=flags)
		doc.get = lambda k, d=None: getattr(doc, k, d)
		with patch(
			"dinext_project_tasks_gantt.virtual_task.sync.task_to_issue.frappe.get_doc"
		) as get_doc:
			sync_virtual_task_to_issue(doc)
			get_doc.assert_not_called()


class TestMirrorTarget(unittest.TestCase):
	def test_issue_to_virtual_task(self):
		with patch(
			"dinext_project_tasks_gantt.virtual_task.helpers.frappe.db.get_value",
			return_value="TASK-V",
		):
			self.assertEqual(
				mirror_target_for_issue_or_task("Issue", "ISS-1"),
				("Task", "TASK-V"),
			)

	def test_task_to_issue(self):
		with patch(
			"dinext_project_tasks_gantt.virtual_task.helpers.frappe.db.get_value",
			return_value="ISS-1",
		):
			self.assertEqual(
				mirror_target_for_issue_or_task("Task", "TASK-V"),
				("Issue", "ISS-1"),
			)


class TestTodoMirrorGuard(unittest.TestCase):
	def test_skips_when_sync_in_progress(self):
		flags = SimpleNamespace(todo_sync_in_progress=True)
		flags.get = lambda k, d=None: getattr(flags, k, d)
		doc = SimpleNamespace(
			flags=flags,
			reference_type="Issue",
			reference_name="ISS-1",
		)
		with patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.mirror_target_for_issue_or_task"
		) as resolve:
			sync_todo_mirror(doc)
			resolve.assert_not_called()


class TestTodoMirrorAssignRebuild(unittest.TestCase):
	def _cancelled_doc(self):
		flags = SimpleNamespace()
		flags.get = lambda k, d=None: getattr(flags, k, d)
		doc = SimpleNamespace(
			flags=flags,
			reference_type="Task",
			reference_name="TASK-V",
			status="Cancelled",
			allocated_to="u@x",
		)
		doc.get = lambda k, d=None: getattr(doc, k, d)
		return doc

	def test_cancelled_rebuilds_assign_when_peer_already_cancelled(self):
		doc = self._cancelled_doc()
		existing = SimpleNamespace(name="TODO-ISS")
		dummy = MagicMock()
		peer_row = {field: None for field in (
			"description", "status", "priority", "date", "color",
			"assigned_by", "assigned_by_full_name",
		)}
		peer_row["status"] = "Cancelled"

		with patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.mirror_target_for_issue_or_task",
			return_value=("Issue", "ISS-1"),
		), patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.frappe.db.get_value",
			side_effect=[existing, peer_row],
		), patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.frappe.db.set_value"
		) as set_value, patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.frappe.get_doc",
			return_value=dummy,
		):
			sync_todo_mirror(doc)

		dummy.update_in_reference.assert_called_once()
		set_value.assert_not_called()

	def test_cancelled_rebuilds_assign_when_peer_missing(self):
		doc = self._cancelled_doc()
		dummy = MagicMock()

		with patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.mirror_target_for_issue_or_task",
			return_value=("Issue", "ISS-1"),
		), patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.frappe.db.get_value",
			return_value=None,
		), patch(
			"dinext_project_tasks_gantt.virtual_task.mirrors.todo.frappe.get_doc",
			return_value=dummy,
		):
			sync_todo_mirror(doc)

		dummy.update_in_reference.assert_called_once()


if __name__ == "__main__":
	unittest.main()
