# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Unit tests for task_dates (layer 2 Actual + Depend). Pure logic / mocks."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.utils import getdate

from dinext_project_tasks_gantt.task_dates.actual import sync_task_actual_dates
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

	@patch("dinext_project_tasks_gantt.task_dates.actual._issue_resolution_date", return_value="2026-08-28")
	@patch("dinext_project_tasks_gantt.task_dates.actual._cascade_parent_exp_dates")
	def test_act_end_is_max_of_act_completed_and_sla(self, _cascade, _sla):
		doc = _task(
			status="Open",
			type="Issue",
			custom_linked_issue="ISS-1",
			act_start_date="2026-08-01",
			act_end_date="2026-08-10",
			completed_on="2026-08-12",
			exp_start_date="2026-08-01",
			exp_end_date="2026-08-10",
			parent_task=None,
		)
		sync_task_actual_dates(doc)
		self.assertEqual(str(getdate(doc.act_end_date)), "2026-08-28")
		self.assertEqual(str(getdate(doc.exp_end_date)), "2026-08-28")


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


	def test_fact_outside_window_blocks_fit(self):
		from dinext_project_tasks_gantt.task_dates.depend import fact_blocks_fit

		dep = SimpleNamespace(
			act_start_date=None,
			act_end_date="2026-08-25",
			completed_on=None,
			get=lambda k, d=None: getattr(dep, k, d),
		)
		self.assertTrue(fact_blocks_fit(dep, getdate("2026-08-10"), getdate("2026-08-20")))
		self.assertFalse(fact_blocks_fit(dep, getdate("2026-08-01"), getdate("2026-08-31")))

	def test_throw_without_button_when_fact_blocks(self):
		old = SimpleNamespace(exp_start_date="2026-08-01", exp_end_date="2026-08-31")
		doc = _task(
			name="TASK-P",
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
			act_start_date=None,
			act_end_date="2026-08-25",
			completed_on=None,
		)
		dep.get = lambda k, d=None: getattr(dep, k, d)
		captured = {}

		def fake_throw(**kwargs):
			captured.update(kwargs)
			raise frappe.ValidationError(kwargs.get("msg"))

		with patch(
			"dinext_project_tasks_gantt.task_dates.depend.frappe.get_all",
			return_value=[dep],
		):
			with patch(
				"dinext_project_tasks_gantt.task_dates.depend.frappe.throw",
				side_effect=fake_throw,
			):
				with self.assertRaises(frappe.ValidationError):
					validate_depend_task_dates(doc)
		self.assertIsNone(captured.get("primary_action"))
		self.assertIn("факт", captured.get("msg", "").lower())

	def test_throw_with_button_when_fact_allows_fit(self):
		old = SimpleNamespace(exp_start_date="2026-08-01", exp_end_date="2026-08-31")
		doc = _task(
			name="TASK-P",
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
			act_start_date=None,
			act_end_date="2026-08-15",
			completed_on=None,
		)
		dep.get = lambda k, d=None: getattr(dep, k, d)
		captured = {}

		def fake_throw(**kwargs):
			captured.update(kwargs)
			raise frappe.ValidationError(kwargs.get("msg"))

		with patch(
			"dinext_project_tasks_gantt.task_dates.depend.frappe.get_all",
			return_value=[dep],
		):
			with patch(
				"dinext_project_tasks_gantt.task_dates.depend.frappe.throw",
				side_effect=fake_throw,
			):
				with self.assertRaises(frappe.ValidationError):
					validate_depend_task_dates(doc)
		self.assertIsNotNone(captured.get("primary_action"))
		self.assertEqual(
			captured["primary_action"]["client_action"],
			"dinext_fit_depend_task_dates",
		)


if __name__ == "__main__":
	unittest.main()
