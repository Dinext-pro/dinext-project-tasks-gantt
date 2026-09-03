# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Unit tests for task_dates (layer 2 Actual + Depend). Pure logic / mocks."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe

from dinext_project_tasks_gantt.task_dates.actual import sync_task_actual_dates
from dinext_project_tasks_gantt.task_dates.child_inherit import inherit_child_forecast_dates
from dinext_project_tasks_gantt.task_dates.depend import validate_depend_task_dates


def _task(**kwargs):
	flags = kwargs.pop("flags", None) or {}
	doc = SimpleNamespace(flags=flags, **kwargs)
	doc.get = lambda k, d=None: getattr(doc, k, d)
	doc.set = lambda k, v: setattr(doc, k, v)
	return doc


class TestTaskActualDates(unittest.TestCase):
	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	def test_act_expands_exp(self, _cascade):
		doc = _task(
			status="Open",
			act_start_date="2026-08-01",
			act_end_date="2026-08-25",
			exp_start_date="2026-08-10",
			exp_end_date="2026-08-20",
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-01")
		self.assertEqual(str(doc.exp_end_date), "2026-08-25")

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	def test_act_does_not_shrink_exp(self, _cascade):
		doc = _task(
			status="Open",
			act_start_date="2026-08-05",
			act_end_date="2026-08-10",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-30",
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-01")
		self.assertEqual(str(doc.exp_end_date), "2026-08-30")

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	def test_virtual_completed_without_act_end(self, _cascade):
		doc = _task(
			status="Completed",
			type="Issue",
			custom_linked_issue="ISS-1",
			act_start_date=None,
			act_end_date=None,
			completed_on="2026-08-07",
			exp_start_date=None,
			exp_end_date=None,
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.act_end_date), "2026-08-07")
		self.assertEqual(str(doc.completed_on), "2026-08-07")
		self.assertEqual(str(doc.exp_end_date), "2026-08-07")

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	def test_parent_sync_skips_heavy_normalize(self, _cascade):
		doc = _task(
			status="Open",
			act_start_date="2026-08-01",
			act_end_date="2026-08-25",
			exp_start_date="2026-08-10",
			exp_end_date="2026-08-20",
			parent_task=None,
			flags={"task_actual_dates_parent_sync": 1},
		)
		sync_task_actual_dates(doc)
		# parent_sync: не трогаем exp фактом
		self.assertEqual(str(doc.exp_start_date), "2026-08-10")
		self.assertEqual(str(doc.exp_end_date), "2026-08-20")
		_cascade.assert_called_once()

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	@patch(
		"dinext_project_tasks_gantt.virtual_task.sync.dates.today",
		return_value="2026-09-03",
	)
	def test_completed_without_act_end_sets_completed_on_today(self, _today, _cascade):
		doc = _task(
			status="Completed",
			act_start_date=None,
			act_end_date=None,
			completed_on=None,
			exp_start_date=None,
			exp_end_date=None,
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.completed_on), "2026-09-03")
		self.assertIsNone(doc.act_end_date)

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	@patch(
		"dinext_project_tasks_gantt.virtual_task.sync.dates.today",
		return_value="2026-09-03",
	)
	def test_completed_past_act_end_copies_to_completed_on(self, _today, _cascade):
		doc = _task(
			status="Completed",
			act_start_date=None,
			act_end_date="2026-08-01",
			completed_on=None,
			exp_start_date=None,
			exp_end_date=None,
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.completed_on), "2026-08-01")
		self.assertEqual(str(doc.act_end_date), "2026-08-01")

	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	@patch(
		"dinext_project_tasks_gantt.virtual_task.sync.dates.today",
		return_value="2026-09-03",
	)
	def test_completed_future_act_end_caps_completed_on_today(self, _today, _cascade):
		doc = _task(
			status="Completed",
			act_start_date=None,
			act_end_date="2026-12-31",
			completed_on=None,
			exp_start_date="2026-01-01",
			exp_end_date="2026-01-10",
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(doc.completed_on), "2026-09-03")
		self.assertEqual(str(doc.act_end_date), "2026-12-31")


class TestDependTaskDates(unittest.TestCase):
	def test_noop_when_dates_unchanged(self):
		old = SimpleNamespace(exp_start_date="2026-08-01", exp_end_date="2026-08-10")
		doc = _task(
			subject="T",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-10",
			depends_on=[SimpleNamespace(task="TASK-DEP")],
		)
		doc.get_doc_before_save = lambda: old
		with patch("dinext_project_tasks_gantt.task_dates.depend.frappe.get_all") as ga:
			validate_depend_task_dates(doc)
			ga.assert_not_called()

	def test_throw_when_depend_outside_period(self):
		old = SimpleNamespace(exp_start_date="2026-08-01", exp_end_date="2026-08-31")
		doc = _task(
			subject="Parent-ish",
			exp_start_date="2026-08-10",
			exp_end_date="2026-08-20",
			depends_on=[SimpleNamespace(task="TASK-DEP")],
		)
		doc.get_doc_before_save = lambda: old

		dep = SimpleNamespace(
			name="TASK-DEP",
			subject="Dep",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-25",
		)
		with patch(
			"dinext_project_tasks_gantt.task_dates.depend.frappe.get_all",
			return_value=[dep],
		):
			with self.assertRaises(frappe.ValidationError):
				validate_depend_task_dates(doc)

	def test_ok_when_depend_inside_period(self):
		old = SimpleNamespace(exp_start_date="2026-08-01", exp_end_date="2026-08-10")
		doc = _task(
			subject="T",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-31",
			depends_on=[SimpleNamespace(task="TASK-DEP")],
		)
		doc.get_doc_before_save = lambda: old
		dep = SimpleNamespace(
			name="TASK-DEP",
			subject="Dep",
			exp_start_date="2026-08-05",
			exp_end_date="2026-08-10",
		)
		with patch(
			"dinext_project_tasks_gantt.task_dates.depend.frappe.get_all",
			return_value=[dep],
		):
			validate_depend_task_dates(doc)  # no throw


class TestChildForecastInherit(unittest.TestCase):
	TODAY = "2026-08-25"

	def _pair(self, parent_start, parent_end):
		start, end = inherit_child_forecast_dates(parent_start, parent_end, self.TODAY)
		return str(start) if start else None, str(end) if end else None

	def test_default_start_today_end_parent(self):
		self.assertEqual(self._pair("2026-08-01", "2026-08-31"), ("2026-08-25", "2026-08-31"))

	def test_parent_start_past_end_today(self):
		self.assertEqual(self._pair("2026-08-01", "2026-08-25"), ("2026-08-25", "2026-08-25"))

	def test_parent_both_in_past(self):
		self.assertEqual(self._pair("2026-07-01", "2026-07-31"), ("2026-07-01", "2026-07-31"))

	def test_parent_start_in_future(self):
		self.assertEqual(self._pair("2026-09-01", "2026-09-30"), ("2026-09-01", "2026-09-30"))

	def test_parent_start_today(self):
		self.assertEqual(self._pair("2026-08-25", "2026-08-31"), ("2026-08-25", "2026-08-31"))

	def test_parent_start_missing(self):
		self.assertEqual(self._pair(None, "2026-08-31"), ("2026-08-25", "2026-08-31"))

	def test_parent_end_missing_start_past(self):
		self.assertEqual(self._pair("2026-08-01", None), ("2026-08-25", None))

	def test_parent_end_missing_start_future(self):
		self.assertEqual(self._pair("2026-09-01", None), ("2026-09-01", None))

	def test_parent_dates_missing(self):
		self.assertEqual(self._pair(None, None), ("2026-08-25", None))


class TestApplyChildForecastDefaults(unittest.TestCase):
	def test_insert_rewrites_copied_parent_window(self):
		from dinext_project_tasks_gantt.task_dates.child_inherit import (
			apply_child_forecast_defaults,
		)

		parent = SimpleNamespace(
			exp_start_date="2026-03-28",
			exp_end_date="2026-09-01",
		)
		doc = _task(
			parent_task="TASK-P",
			exp_start_date="2026-03-28",
			exp_end_date="2026-09-01",
		)
		doc.is_new = lambda: True
		with patch(
			"dinext_project_tasks_gantt.task_dates.child_inherit.frappe.db.get_value",
			return_value=parent,
		), patch(
			"dinext_project_tasks_gantt.task_dates.child_inherit.frappe.utils.today",
			return_value="2026-08-25",
		):
			apply_child_forecast_defaults(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-25")
		self.assertEqual(str(doc.exp_end_date), "2026-09-01")

	def test_keeps_user_dates_different_from_parent(self):
		from dinext_project_tasks_gantt.task_dates.child_inherit import (
			apply_child_forecast_defaults,
		)

		parent = SimpleNamespace(
			exp_start_date="2026-03-28",
			exp_end_date="2026-09-01",
		)
		doc = _task(
			parent_task="TASK-P",
			exp_start_date="2026-08-10",
			exp_end_date="2026-08-20",
		)
		doc.is_new = lambda: True
		with patch(
			"dinext_project_tasks_gantt.task_dates.child_inherit.frappe.db.get_value",
			return_value=parent,
		):
			apply_child_forecast_defaults(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-10")
		self.assertEqual(str(doc.exp_end_date), "2026-08-20")


class TestTreeviewPreventive(unittest.TestCase):
	def test_hours_to_days(self):
		from dinext_project_tasks_gantt.task_dates.preventive import hours_to_days

		self.assertEqual(hours_to_days(0), 1)
		self.assertEqual(hours_to_days(8), 1)
		self.assertEqual(hours_to_days(9), 2)
		self.assertEqual(hours_to_days(None), 1)

	def test_duration_both_empty(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_duration_date_defaults,
		)

		doc = _task(exp_start_date=None, exp_end_date=None, expected_time=8)
		with patch(
			"dinext_project_tasks_gantt.task_dates.preventive.today",
			return_value="2026-08-25",
		):
			apply_duration_date_defaults(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-25")
		self.assertEqual(str(doc.exp_end_date), "2026-08-26")

	def test_duration_only_end(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_duration_date_defaults,
		)

		doc = _task(exp_start_date=None, exp_end_date="2026-08-31", expected_time=8)
		apply_duration_date_defaults(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-30")

	def test_duration_only_start(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_duration_date_defaults,
		)

		doc = _task(exp_start_date="2026-08-25", exp_end_date=None, expected_time=8)
		apply_duration_date_defaults(doc)
		self.assertEqual(str(doc.exp_end_date), "2026-08-26")

	def test_milestone_collapses_to_end(self):
		from dinext_project_tasks_gantt.task_dates.preventive import apply_milestone_dates

		doc = _task(
			is_milestone=1,
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-31",
		)
		apply_milestone_dates(doc)
		self.assertEqual(str(doc.exp_start_date), "2026-08-31")
		self.assertEqual(str(doc.exp_end_date), "2026-08-31")

	def test_project_from_parent(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_project_from_parent,
		)

		doc = _task(parent_task="TASK-P", project=None)
		with patch(
			"dinext_project_tasks_gantt.task_dates.preventive.frappe.db.get_value",
			return_value="PROJ-1",
		):
			apply_project_from_parent(doc)
		self.assertEqual(doc.project, "PROJ-1")

	def test_confirm_non_owner_goes_pending_review(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_completed_confirm,
		)

		doc = _task(
			status="Completed",
			confirm=1,
			owner="owner@example.com",
		)
		with patch(
			"dinext_project_tasks_gantt.task_dates.preventive.frappe.session"
		) as session, patch(
			"dinext_project_tasks_gantt.task_dates.preventive.get_users_with_role",
			return_value=["admin@example.com"],
		):
			session.user = "other@example.com"
			apply_completed_confirm(doc)
		self.assertEqual(doc.status, "Pending Review")

	def test_confirm_owner_and_manager_keeps_completed(self):
		from dinext_project_tasks_gantt.task_dates.preventive import (
			apply_completed_confirm,
		)

		doc = _task(
			status="Completed",
			confirm=1,
			owner="owner@example.com",
		)
		with patch(
			"dinext_project_tasks_gantt.task_dates.preventive.frappe.session"
		) as session, patch(
			"dinext_project_tasks_gantt.task_dates.preventive.get_users_with_role",
			return_value=["owner@example.com"],
		):
			session.user = "owner@example.com"
			apply_completed_confirm(doc)
		self.assertEqual(doc.status, "Completed")


if __name__ == "__main__":
	unittest.main()
