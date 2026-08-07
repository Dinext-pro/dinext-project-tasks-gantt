# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Unit tests for virtual_task helpers (no site restart required for pure logic).

Integration smoke against live DocTypes is deferred until SS cutover + backend reload.
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from dinext_project_tasks_gantt.virtual_task.dates import (
	apply_task_actual_dates_logic,
	date_cmp_value,
)
from dinext_project_tasks_gantt.virtual_task.flags import ITVT_DEPTH
from dinext_project_tasks_gantt.virtual_task.guards import (
	bump_sync_depth,
	is_virtual_task,
	restore_sync_depth,
	sync_depth,
)
from dinext_project_tasks_gantt.virtual_task.maps import (
	issue_priority_to_task,
	issue_status_to_task,
	task_priority_to_issue,
	task_status_to_issue,
)
from dinext_project_tasks_gantt.virtual_task.task_to_issue import sync_virtual_task_to_issue


class TestVirtualTaskMaps(unittest.TestCase):
	def test_issue_to_task_status(self):
		self.assertEqual(issue_status_to_task("Closed"), "Completed")
		self.assertEqual(issue_status_to_task("Replied"), "Working")

	def test_task_to_issue_status(self):
		self.assertEqual(task_status_to_issue("Completed"), "Closed")
		self.assertEqual(task_status_to_issue("Overdue"), "Open")

	def test_priority_roundtrip_high(self):
		self.assertEqual(issue_priority_to_task("Высокий"), "High")
		self.assertEqual(task_priority_to_issue("Urgent"), "Высокий")


class TestVirtualTaskGuards(unittest.TestCase):
	def test_is_virtual_task(self):
		doc = SimpleNamespace(type="Issue", custom_linked_issue="ISS-1", flags={})
		# SimpleNamespace .get via dict-like helper
		doc.get = lambda k, d=None: getattr(doc, k, d)
		self.assertTrue(is_virtual_task(doc))
		doc.type = "Task"
		self.assertFalse(is_virtual_task(doc))

	def test_depth_bump_restore(self):
		flags = SimpleNamespace()
		doc = SimpleNamespace(flags=flags)
		flags.get = lambda k, d=None: getattr(flags, k, d)
		self.assertEqual(sync_depth(doc), 0)
		prev = bump_sync_depth(doc)
		self.assertEqual(prev, 0)
		self.assertEqual(sync_depth(doc), 1)
		restore_sync_depth(doc, prev)
		self.assertEqual(sync_depth(doc), 0)
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
			"dinext_project_tasks_gantt.virtual_task.dates.today",
			return_value="2026-08-07",
		):
			apply_task_actual_dates_logic(data, None, None, None)
		self.assertEqual(data["completed_on"], "2026-08-07")
		self.assertEqual(data["act_end_date"], "2026-08-07")


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
			"dinext_project_tasks_gantt.virtual_task.task_to_issue.frappe.get_doc"
		) as get_doc:
			sync_virtual_task_to_issue(doc)
			get_doc.assert_not_called()

	def test_skips_non_virtual(self):
		flags = SimpleNamespace()
		flags.get = lambda k, d=None: getattr(flags, k, d)
		doc = SimpleNamespace(type="Task", custom_linked_issue=None, flags=flags)
		doc.get = lambda k, d=None: getattr(doc, k, d)
		with patch(
			"dinext_project_tasks_gantt.virtual_task.task_to_issue.frappe.get_doc"
		) as get_doc:
			sync_virtual_task_to_issue(doc)
			get_doc.assert_not_called()


if __name__ == "__main__":
	unittest.main()
