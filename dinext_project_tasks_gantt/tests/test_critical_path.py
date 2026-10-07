# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Critical path float: planned dates, business days, Task Relation types."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import frappe

from dinext_project_tasks_gantt.api import get_critical_path
from dinext_project_tasks_gantt.task_tree_gantt.critical_path import compute_critical_path


def _task(task_id, start, end, **extra):
	row = {"id": task_id, "start": start, "end": end, "status": "Open"}
	row.update(extra)
	return row


def _rel(pred, succ, kind="FS", buffer_days=0):
	return {
		"predecessor": pred,
		"task": succ,
		"type": f"{kind} (test)",
		"buffer_days": buffer_days,
	}


class TestCriticalPath(unittest.TestCase):
	def test_tight_finish_to_start_chain(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "FS"}])
		self.assertFalse(result["cycles"])

	def test_gap_removes_predecessor(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-08", "2026-01-09"),
			],
			[_rel("A", "B")],
		)
		self.assertEqual(result["tasks"], ["B"])
		self.assertEqual(result["edges"], [])

	def test_buffer_and_holiday(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-09", "2026-01-09"),
			],
			[_rel("A", "B", buffer_days=1)],
			holidays=["2026-01-08"],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "FS"}])

	def test_start_to_start(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-05", "2026-01-09"),
			],
			[_rel("A", "B", "SS")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "SS"}])

	def test_finish_to_finish(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-06"),
				_task("B", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B", "FF", buffer_days=3)],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "FF"}])

	def test_start_to_finish_milestone(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-09", "2026-01-09", is_milestone=1),
				_task("B", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B", "SF")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "SF"}])

	def test_group_uses_own_dates(self):
		result = compute_critical_path(
			[
				_task("G", "2026-01-05", "2026-01-06", is_group=1),
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertNotIn("G", result["tasks"])

	def test_group_on_project_finish_is_critical(self):
		result = compute_critical_path(
			[
				_task("G", "2026-01-09", "2026-01-09", is_group=1),
				_task("A", "2026-01-05", "2026-01-06"),
			],
			[],
		)
		self.assertEqual(result["tasks"], ["G"])

	def test_negative_float_is_critical_without_tight_edge(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-09"),
				_task("B", "2026-01-08", "2026-01-09"),
			],
			[_rel("A", "B")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [])

	def test_cycle_is_excluded(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-06"),
				_task("B", "2026-01-06", "2026-01-07"),
				_task("C", "2026-01-05", "2026-01-06"),
			],
			[_rel("A", "B"), _rel("B", "A")],
		)
		self.assertTrue(result["cycles"])
		self.assertEqual(result["tasks"], ["C"])
		self.assertEqual(result["edges"], [])

	def test_cancelled_and_dateless_are_not_nodes(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-09"),
				_task("X", "2026-01-05", "2026-01-09", status="Cancelled"),
				_task("Y", "2026-01-05", None),
			],
			[_rel("X", "A"), _rel("Y", "A")],
		)
		self.assertEqual(result["tasks"], ["A"])
		self.assertEqual(result["edges"], [])

	def test_completed_task_stays_on_the_plan(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07", status="Completed"),
				_task("B", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B")],
		)
		self.assertEqual(result["tasks"], ["A", "B"])

	def test_two_disjoint_chains(self):
		result = compute_critical_path(
			[
				_task("A", "2026-01-05", "2026-01-07"),
				_task("B", "2026-01-07", "2026-01-09"),
				_task("C", "2026-01-05", "2026-01-07"),
				_task("D", "2026-01-07", "2026-01-09"),
			],
			[_rel("A", "B"), _rel("C", "D")],
		)
		self.assertEqual(result["tasks"], ["A", "B", "C", "D"])
		self.assertEqual(len(result["edges"]), 2)


class TestCriticalPathApi(unittest.TestCase):
	def test_method_is_whitelisted(self):
		self.assertIn(get_critical_path, frappe.whitelisted)

	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.holiday_dates_for_project", return_value=set())
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.get_all")
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.TaskTreeAcl.readable_task_rows")
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.has_permission", return_value=True)
	def test_get_critical_path_shape(self, _perm, readable, get_all, _holidays):
		readable.return_value = [
			{
				"name": "A",
				"status": "Open",
				"exp_start_date": "2026-01-05",
				"exp_end_date": "2026-01-07",
				"is_group": 0,
				"is_milestone": 0,
			},
			{
				"name": "B",
				"status": "Open",
				"exp_start_date": "2026-01-07",
				"exp_end_date": "2026-01-09",
				"is_group": 0,
				"is_milestone": 0,
			},
		]
		get_all.return_value = [
			{
				"parent": "B",
				"predecessor": "A",
				"type": "FS (Finish → Start)",
				"buffer_days": 0,
			}
		]
		result = get_critical_path("PROJ")
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": "FS"}])
		self.assertFalse(result["cycles"])
