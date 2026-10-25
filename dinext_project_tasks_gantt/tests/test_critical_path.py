# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Critical path float: planned dates, business days, Task Relation types."""

from __future__ import annotations

import unittest
from copy import deepcopy
from datetime import date, timedelta
from functools import cache
from itertools import product
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


class TestCriticalPathCalendar(unittest.TestCase):
	def test_float_matches_forward_moves_across_calendar_boundaries(self):
		# Independent oracle: try actual forward moves against the deadline
		# and successor. It never subtracts a duration or reverses a lag.
		@cache
		def move(day, amount, holidays):
			direction = 1 if amount >= 0 else -1
			for _ in range(abs(amount)):
				day += timedelta(days=direction)
				while day.weekday() >= 5 or day.isoformat() in holidays:
					day += timedelta(days=direction)
			return day

		@cache
		def latest_dates(start, end, deadline, holidays):
			# These schedules span at most 13 calendar days, so 20 working
			# days exceed every possible positive float in the test matrix.
			for amount in range(1, 21):
				if move(end, amount, holidays) > deadline:
					return amount - 1, move(start, amount - 1, holidays), move(end, amount - 1, holidays)
			self.fail("Forward oracle search range exhausted")

		schedules = [
			(date(2026, 1, 5) + timedelta(days=i), length) for i in range(7) for length in (0, 1, 3, 7)
		]
		calendars = (frozenset(), frozenset({"2026-01-08", "2026-01-09"}))
		for (a, da), (b, db), kind, lag, holidays in product(
			schedules, schedules, ("FS", "SS", "FF", "SF"), (-2, -1, 0, 1, 2), calendars
		):
			a_end, b_end = a + timedelta(days=da), b + timedelta(days=db)
			deadline = max(a_end, b_end)
			b_float, b_start_late, b_end_late = latest_dates(b, b_end, deadline, holidays)
			a_start_moved, a_end_moved = move(a, 1, holidays), move(a_end, 1, holidays)
			pred_anchor = a_end_moved if kind[0] == "F" else a_start_moved
			succ_anchor = b_start_late if kind[1] == "S" else b_end_late
			a_has_float = a_end_moved <= deadline and move(pred_anchor, lag, holidays) <= succ_anchor
			expected = ([] if a_has_float else ["A"]) + (["B"] if b_float == 0 else [])
			rows = [_task("A", a, a_end), _task("B", b, b_end)]
			with self.subTest(
				a=(str(a), str(a_end)), b=(str(b), str(b_end)), kind=kind, lag=lag, holidays=sorted(holidays)
			):
				result = compute_critical_path(rows, [_rel("A", "B", kind, lag)], holidays)
				self.assertEqual(result["tasks"], expected)
				original_anchor = a_end if kind[0] == "F" else a
				actual = b if kind[1] == "S" else b_end
				tight = expected == ["A", "B"] and move(original_anchor, lag, holidays) == actual
				self.assertEqual(result["edges"], [{"from": "A", "to": "B", "type": kind}] if tight else [])
				self.assertFalse(result["cycles"])

	def test_month_year_and_leap_day_boundaries(self):
		cases = [
			("2025-12-26", "2026-01-04", {"2026-01-01", "2026-01-02"}),
			("2026-01-26", "2026-02-01", set()),
			("2028-02-28", "2028-03-05", {"2028-02-29"}),
		]
		for start, end, holidays in cases:
			with self.subTest(start=start, end=end, holidays=sorted(holidays)):
				self.assertEqual(
					compute_critical_path([_task("T", start, end)], [], holidays)["tasks"], ["T"]
				)

	def test_tight_branch_wins_over_a_successor_with_a_gap(self):
		rows = [
			_task("A", "2026-01-05", "2026-01-07"),
			_task("B", "2026-01-08", "2026-01-11"),
			_task("C", "2026-01-07", "2026-01-11"),
		]
		for relations in ([_rel("A", "B"), _rel("A", "C")], [_rel("A", "C"), _rel("A", "B")]):
			with self.subTest(order=[rel["task"] for rel in relations]):
				result = compute_critical_path(rows, relations)
				self.assertEqual(result["tasks"], ["A", "B", "C"])
				self.assertEqual(result["edges"], [{"from": "A", "to": "C", "type": "FS"}])

	def test_demo_group_finishing_on_sunday(self):
		rows = [_task("G", "2026-08-03", "2026-12-06", is_group=1)]
		self.assertEqual(compute_critical_path(rows, [])["tasks"], ["G"])

	def test_terminal_task_all_start_and_finish_weekdays(self):
		calendars = [set(), {"2026-01-23"}, {"2026-01-22", "2026-01-23", "2026-01-26"}]
		for start_day in range(7):
			for finish_day in range(7):
				for holidays in calendars:
					for extra in ({}, {"is_group": 1}, {"status": "Completed"}):
						start = (date(2026, 1, 5) + timedelta(days=start_day)).isoformat()
						end = (date(2026, 1, 19) + timedelta(days=finish_day)).isoformat()
						with self.subTest(start=start, end=end, holidays=sorted(holidays), extra=extra):
							rows = [_task("T", start, end, **extra)]
							before = deepcopy(rows)
							self.assertEqual(compute_critical_path(rows, [], holidays)["tasks"], ["T"])
							self.assertEqual(rows, before)

	def test_positive_slack_for_every_start_and_finish_weekday(self):
		calendars = [set(), {"2026-01-23"}, {"2026-01-22", "2026-01-23", "2026-01-26"}]
		for start_day in range(7):
			for finish_day in range(7):
				for holidays in calendars:
					start = date(2026, 1, 5) + timedelta(days=start_day)
					end = date(2026, 1, 19) + timedelta(days=finish_day)
					deadline = end + timedelta(days=1)
					while deadline.weekday() >= 5 or deadline.isoformat() in holidays:
						deadline += timedelta(days=1)
					with self.subTest(
						start=str(start), end=str(end), deadline=str(deadline), holidays=sorted(holidays)
					):
						rows = [_task("A", start, end), _task("Z", deadline, deadline, is_milestone=1)]
						self.assertEqual(compute_critical_path(rows, [], holidays)["tasks"], ["Z"])

	def test_zero_duration_and_milestones_on_nonworking_days(self):
		for offset in range(7):
			day = date(2026, 1, 5) + timedelta(days=offset)
			for holidays in (set(), {day.isoformat()}):
				for extra in ({}, {"is_group": 1}, {"is_milestone": 1}):
					with self.subTest(day=str(day), holidays=sorted(holidays), extra=extra):
						rows = [_task("Z", day, day, **extra)]
						self.assertEqual(compute_critical_path(rows, [], holidays)["tasks"], ["Z"])

	def test_intervals_without_any_working_day(self):
		cases = [
			("2026-01-10", "2026-01-11", set()),
			("2026-01-08", "2026-01-12", {"2026-01-08", "2026-01-09", "2026-01-12"}),
			("2026-01-05", "2026-01-11", {f"2026-01-{d:02d}" for d in range(5, 10)}),
		]
		for start, end, holidays in cases:
			with self.subTest(start=start, end=end, holidays=sorted(holidays)):
				self.assertEqual(
					compute_critical_path([_task("Z", start, end)], [], holidays)["tasks"], ["Z"]
				)

	def test_buffers_and_all_relation_types_at_nonworking_boundaries(self):
		# Expected memberships are explicit: tight negative lags can still permit
		# a working-day move because several weekend anchors map to Friday.
		cases = [
			("FS", 0, ("2026-01-05", "2026-01-11"), ("2026-01-11", "2026-01-18"), set(), ["A", "B"]),
			("FS", 1, ("2026-01-05", "2026-01-11"), ("2026-01-12", "2026-01-18"), set(), ["A", "B"]),
			("FS", -1, ("2026-01-05", "2026-01-11"), ("2026-01-09", "2026-01-18"), set(), ["B"]),
			("FS", -2, ("2026-01-05", "2026-01-12"), ("2026-01-08", "2026-01-18"), set(), ["A", "B"]),
			("SS", 0, ("2026-01-11", "2026-01-13"), ("2026-01-11", "2026-01-18"), set(), ["A", "B"]),
			("SS", 1, ("2026-01-11", "2026-01-13"), ("2026-01-12", "2026-01-18"), set(), ["A", "B"]),
			("SS", -1, ("2026-01-11", "2026-01-13"), ("2026-01-09", "2026-01-18"), set(), ["B"]),
			("FF", 0, ("2026-01-05", "2026-01-11"), ("2026-01-05", "2026-01-11"), set(), ["A", "B"]),
			("FF", 1, ("2026-01-05", "2026-01-11"), ("2026-01-05", "2026-01-12"), set(), ["A", "B"]),
			("FF", -1, ("2026-01-05", "2026-01-11"), ("2026-01-05", "2026-01-09"), set(), ["A", "B"]),
			("SF", 0, ("2026-01-11", "2026-01-11"), ("2026-01-05", "2026-01-11"), set(), ["A", "B"]),
			("SF", 1, ("2026-01-11", "2026-01-11"), ("2026-01-05", "2026-01-12"), set(), ["A", "B"]),
			("SF", -1, ("2026-01-11", "2026-01-11"), ("2026-01-05", "2026-01-09"), set(), ["A", "B"]),
			("SF", -1, ("2026-01-11", "2026-01-13"), ("2026-01-05", "2026-01-09"), set(), ["A"]),
			(
				"FS",
				1,
				("2026-01-05", "2026-01-07"),
				("2026-01-12", "2026-01-18"),
				{"2026-01-08", "2026-01-09"},
				["A", "B"],
			),
			(
				"SS",
				1,
				("2026-01-07", "2026-01-07"),
				("2026-01-12", "2026-01-18"),
				{"2026-01-08", "2026-01-09"},
				["A", "B"],
			),
			(
				"FF",
				1,
				("2026-01-05", "2026-01-07"),
				("2026-01-05", "2026-01-12"),
				{"2026-01-08", "2026-01-09"},
				["A", "B"],
			),
			(
				"SF",
				1,
				("2026-01-07", "2026-01-07"),
				("2026-01-05", "2026-01-12"),
				{"2026-01-08", "2026-01-09"},
				["A", "B"],
			),
		]
		for kind, buffer, a, b, holidays, expected in cases:
			with self.subTest(kind=kind, buffer=buffer, a=a, b=b, holidays=sorted(holidays)):
				rows = [_task("A", *a), _task("B", *b)]
				result = compute_critical_path(rows, [_rel("A", "B", kind, buffer)], holidays)
				self.assertEqual(result["tasks"], expected)
				expected_edges = [{"from": "A", "to": "B", "type": kind}] if expected == ["A", "B"] else []
				self.assertEqual(result["edges"], expected_edges)

	def test_positive_lag_before_nonworking_successor_anchor(self):
		# Mon + 2 workdays is Wed; moving Mon to Tue would require the next
		# Monday, past the successor's holiday. The holiday is not a spare day.
		for kind in ("FS", "SS", "FF", "SF"):
			for lag, expected in ((1, ["B"]), (2, ["A", "B"])):
				with self.subTest(kind=kind, lag=lag):
					rows = [_task("A", "2026-01-05", "2026-01-05"), _task("B", "2026-01-08", "2026-01-08")]
					result = compute_critical_path(
						rows, [_rel("A", "B", kind, lag)], {"2026-01-08", "2026-01-09"}
					)
					self.assertEqual(result["tasks"], expected)
					self.assertEqual(result["edges"], [])

	def test_positive_lag_through_intermediate_weekend_task(self):
		rows = [
			_task("A", "2026-01-05", "2026-01-05"),
			_task("B", "2026-01-11", "2026-01-11"),
			_task("C", "2026-01-11", "2026-01-12"),
		]
		result = compute_critical_path(rows, [_rel("A", "B", buffer_days=4), _rel("B", "C")])
		self.assertEqual(result["tasks"], ["A", "B", "C"])
		self.assertEqual(result["edges"], [{"from": "B", "to": "C", "type": "FS"}])

	def test_working_day_gaps_are_not_critical_for_any_relation(self):
		cases = [
			("FS", ("2026-01-05", "2026-01-07"), ("2026-01-09", "2026-01-11")),
			("SS", ("2026-01-05", "2026-01-07"), ("2026-01-07", "2026-01-11")),
			("FF", ("2026-01-05", "2026-01-07"), ("2026-01-05", "2026-01-11")),
			("SF", ("2026-01-07", "2026-01-07"), ("2026-01-05", "2026-01-11")),
		]
		for kind, a, b in cases:
			with self.subTest(kind=kind):
				result = compute_critical_path([_task("A", *a), _task("B", *b)], [_rel("A", "B", kind)])
				self.assertEqual(result["tasks"], ["B"])
				self.assertEqual(result["edges"], [])

	def test_weekend_gap_is_not_an_exactly_tight_edge(self):
		rows = [_task("A", "2026-01-05", "2026-01-09"), _task("B", "2026-01-11", "2026-01-12")]
		result = compute_critical_path(rows, [_rel("A", "B")])
		self.assertEqual(result["tasks"], ["A", "B"])
		self.assertEqual(result["edges"], [])

	def test_independent_chains_share_a_weekend_finish(self):
		rows = [
			_task("A", "2026-01-05", "2026-01-07"),
			_task("B", "2026-01-07", "2026-01-11"),
			_task("C", "2026-01-05", "2026-01-07"),
			_task("D", "2026-01-07", "2026-01-11"),
			_task("E", "2026-01-05", "2026-01-06"),
		]
		result = compute_critical_path(rows, [_rel("A", "B"), _rel("C", "D")])
		self.assertEqual(result["tasks"], ["A", "B", "C", "D"])
		self.assertEqual(
			result["edges"], [{"from": "A", "to": "B", "type": "FS"}, {"from": "C", "to": "D", "type": "FS"}]
		)

	def test_excluded_tasks_do_not_extend_a_weekend_deadline(self):
		rows = [
			_task("G", "2026-01-05", "2026-01-11", is_group=1),
			_task("X", "2026-01-05", "2026-01-30", status="Cancelled"),
			_task("Y", None, "2026-01-30"),
		]
		self.assertEqual(compute_critical_path(rows, [])["tasks"], ["G"])

	def test_cycle_exclusion_preserves_a_weekend_terminal_task(self):
		rows = [
			_task("A", "2026-01-05", "2026-01-30"),
			_task("B", "2026-01-05", "2026-01-30"),
			_task("G", "2026-01-05", "2026-01-11", is_group=1),
		]
		result = compute_critical_path(rows, [_rel("A", "B"), _rel("B", "A")])
		self.assertTrue(result["cycles"])
		self.assertEqual(result["tasks"], ["G"])


class TestCriticalPathApi(unittest.TestCase):
	def test_method_is_whitelisted(self):
		self.assertIn(get_critical_path, frappe.whitelisted)

	@patch(
		"dinext_project_tasks_gantt.task_tree_gantt.critical_path.holiday_dates_for_project",
		return_value=set(),
	)
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.get_all")
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.TaskTreeAcl.readable_task_rows")
	@patch(
		"dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.has_permission", return_value=True
	)
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

	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.holiday_dates_for_project")
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.get_all", return_value=[])
	@patch("dinext_project_tasks_gantt.task_tree_gantt.critical_path.TaskTreeAcl.readable_task_rows")
	@patch(
		"dinext_project_tasks_gantt.task_tree_gantt.critical_path.frappe.has_permission", return_value=True
	)
	def test_nonworking_project_finish_through_api(self, _perm, readable, _get_all, holidays):
		for end, calendar in [("2026-01-10", set()), ("2026-01-11", set()), ("2026-01-09", {"2026-01-09"})]:
			with self.subTest(end=end, holidays=sorted(calendar)):
				rows = [
					{
						"name": "G",
						"status": "Working",
						"exp_start_date": "2026-01-05",
						"exp_end_date": end,
						"is_group": 1,
						"is_milestone": 0,
					}
				]
				before = deepcopy(rows)
				readable.return_value = rows
				holidays.return_value = calendar
				self.assertEqual(get_critical_path("PROJ")["tasks"], ["G"])
				self.assertEqual(rows, before)
