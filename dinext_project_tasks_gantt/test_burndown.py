# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from datetime import date
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate as frappe_getdate

from dinext_project_tasks_gantt.burndown import (
	_current_date_marker,
	_derive_start_scope_series,
	_forecast_progress_to_completion,
	_measure_completed_scope_from_rows,
	_measure_created_scope_from_rows,
	_measure_open_scope_from_rows,
	_period_progress_series,
	_planned_progress_series,
	_task_tree_names_from_rows,
	_task_actual_progress_series,
	_task_actual_or_forecast_date_markers,
	_task_progress_history_start_date,
	_task_widget_planned_dates,
	_task_names_created_from_rows,
	_task_names_completed_from_rows,
	_task_names_open_from_rows,
	_timesheet_limit_bands,
	_timesheet_role_series_from_rows,
	get_period_buckets,
	iter_day_buckets,
	iter_task_type_period_buckets_from_rows,
	iter_month_buckets,
	iter_week_buckets,
)


class TestBurndownBuckets(FrappeTestCase):
	def test_iter_month_buckets(self):
		buckets = iter_month_buckets(date(2025, 1, 10), date(2025, 3, 5))
		self.assertGreaterEqual(len(buckets), 2)
		self.assertEqual(buckets[0][0], "2025-01")
		labels = [x[0] for x in buckets]
		self.assertIn("2025-02", labels)

	def test_iter_week_buckets(self):
		buckets = iter_week_buckets(date(2025, 1, 1), date(2025, 1, 31))
		self.assertGreaterEqual(len(buckets), 4)

	def test_iter_day_buckets(self):
		buckets = iter_day_buckets(date(2026, 1, 30), date(2026, 2, 2))

		self.assertEqual(
			buckets,
			[
				("2026-01-30", date(2026, 1, 30), date(2026, 1, 30)),
				("2026-01-31", date(2026, 1, 31), date(2026, 1, 31)),
				("2026-02-01", date(2026, 2, 1), date(2026, 2, 1)),
				("2026-02-02", date(2026, 2, 2), date(2026, 2, 2)),
			],
		)

	def test_get_period_buckets_dispatches_day_group(self):
		buckets = get_period_buckets("PROJECT-1", date(2026, 1, 30), date(2026, 1, 31), "day")

		self.assertEqual(
			buckets,
			[
				("2026-01-30", date(2026, 1, 30), date(2026, 1, 30)),
				("2026-01-31", date(2026, 1, 31), date(2026, 1, 31)),
			],
		)

	def test_derive_start_scope_series_respects_bucket_invariant(self):
		end_scope = [386.0, 370.0, 298.0]
		added = [200.0, 0.0, 0.0]
		completed = [24.0, 16.0, 72.0]

		start_scope = _derive_start_scope_series(end_scope, added, completed)

		self.assertEqual(start_scope, [210.0, 386.0, 370.0])
		for start, add, done, end in zip(start_scope, added, completed, end_scope, strict=False):
			self.assertEqual(start + add - done, end)

	def test_iter_task_type_period_buckets_from_rows_uses_forecast_dates(self):
		rows = [
			{
				"name": "SPR-2",
				"subject": "Волна 2. Интеграции и регистрация документов",
				"exp_start_date": date(2026, 8, 26),
				"exp_end_date": date(2026, 9, 30),
			},
			{
				"name": "SPR-1",
				"subject": "Волна 1. Базовые процессы согласования",
				"exp_start_date": date(2026, 7, 11),
				"exp_end_date": date(2026, 8, 25),
			},
			{
				"name": "OUT",
				"subject": "Вне диапазона",
				"exp_start_date": date(2027, 1, 1),
				"exp_end_date": date(2027, 1, 31),
			},
		]

		buckets = iter_task_type_period_buckets_from_rows(
			rows, date(2026, 7, 1), date(2026, 9, 15)
		)

		self.assertEqual(
			buckets,
			[
				("Волна 1. Базовые процессы согласования", date(2026, 7, 11), date(2026, 8, 25)),
				("Волна 2. Интеграции и регистрация документов", date(2026, 8, 26), date(2026, 9, 15)),
			],
		)

	def test_iter_task_type_period_buckets_from_rows_falls_back_to_planned_dates(self):
		rows = [
			{
				"name": "STAGE-1",
				"subject": "Подготовка маршрутов согласования документов",
				"custom_planned_start_date": date(2026, 6, 5),
				"custom_planned_end_date": date(2026, 6, 15),
			}
		]

		buckets = iter_task_type_period_buckets_from_rows(
			rows, date(2026, 6, 10), date(2026, 6, 30)
		)

		self.assertEqual(
			buckets,
			[("Подготовка маршрутов согласования документов", date(2026, 6, 10), date(2026, 6, 15))],
		)

	def test_measure_created_scope_uses_creation_date_and_full_volume(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 10),
				"exp_start_date": date(2026, 8, 1),
				"progress": 25,
				"volume": 8,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 6, 30),
				"exp_start_date": date(2026, 7, 15),
				"progress": 0,
				"volume": 13,
			},
		]

		created = _measure_created_scope_from_rows(rows, date(2026, 7, 1), date(2026, 7, 31))

		self.assertEqual(created, 8)

	def test_measure_open_scope_uses_unfinished_volume_at_period_end(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 10),
				"exp_start_date": date(2026, 7, 10),
				"progress": 25,
				"volume": 8,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 8, 1),
				"exp_start_date": date(2026, 8, 1),
				"progress": 0,
				"volume": 13,
			},
		]

		open_volume = _measure_open_scope_from_rows(rows, date(2026, 7, 31))

		self.assertEqual(open_volume, 6)

	def test_measure_open_scope_excludes_tasks_created_in_same_period(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 10),
				"exp_start_date": date(2026, 7, 10),
				"progress": 25,
				"volume": 8,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 6, 30),
				"exp_start_date": date(2026, 7, 1),
				"progress": 50,
				"volume": 10,
			},
		]

		open_volume = _measure_open_scope_from_rows(
			rows, date(2026, 7, 31), use_progress=True, bucket_start=date(2026, 7, 1)
		)

		self.assertEqual(open_volume, 5)

	def test_measure_open_scope_ignores_task_before_creation_date(self):
		rows = [
			{
				"name": "TASK-2026-00008",
				"creation": date(2026, 4, 27),
				"exp_start_date": date(2026, 4, 26),
				"progress": 25,
				"volume": 1,
			}
		]

		open_before_creation = _measure_open_scope_from_rows(
			rows, date(2026, 4, 26), use_progress=True, bucket_start=date(2026, 4, 26)
		)
		open_in_creation_period = _measure_open_scope_from_rows(
			rows, date(2026, 4, 27), use_progress=True, bucket_start=date(2026, 4, 27)
		)
		open_after_creation = _measure_open_scope_from_rows(
			rows, date(2026, 4, 28), use_progress=True, bucket_start=date(2026, 4, 28)
		)

		self.assertEqual(open_before_creation, 0)
		self.assertEqual(open_in_creation_period, 0)
		self.assertEqual(open_after_creation, 0.75)

	def test_measure_open_scope_ignores_planned_start_date_for_period_assignment(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 20),
				"exp_start_date": date(2026, 7, 1),
				"custom_planned_start_date": date(2026, 7, 5),
				"progress": 0,
				"volume": 1,
			}
		]

		open_before_creation = _measure_open_scope_from_rows(
			rows, date(2026, 7, 10), use_progress=True, bucket_start=date(2026, 7, 10)
		)

		self.assertEqual(open_before_creation, 0)

	def test_measure_open_scope_uses_progress_history_as_of_period_end(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 4, 27),
				"progress": 25,
				"volume": 1,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 4, 27),
				"progress": 15,
				"volume": 1,
			},
			{
				"name": "TASK-3",
				"creation": date(2026, 4, 27),
				"progress": 0,
				"volume": 1,
			},
		]
		progress_rows = [
			{
				"parent": "TASK-1",
				"changed_on": date(2026, 4, 28),
				"old_progress": 0,
				"new_progress": 15,
			},
			{
				"parent": "TASK-1",
				"changed_on": date(2026, 5, 2),
				"old_progress": 15,
				"new_progress": 25,
			},
			{
				"parent": "TASK-2",
				"changed_on": date(2026, 5, 2),
				"old_progress": 0,
				"new_progress": 15,
			},
		]

		open_volume = _measure_open_scope_from_rows(
			rows,
			date(2026, 4, 28),
			use_progress=True,
			bucket_start=date(2026, 4, 28),
			progress_rows=progress_rows,
		)

		self.assertEqual(open_volume, 2.85)

		open_names = _task_names_open_from_rows(
			rows,
			date(2026, 4, 28),
			use_progress=True,
			bucket_start=date(2026, 4, 28),
			progress_rows=progress_rows,
		)
		self.assertEqual(open_names, ["TASK-1", "TASK-2", "TASK-3"])

	def test_measure_completed_scope_uses_progress_delta(self):
		rows = [
			{"name": "TASK-1", "volume": 10},
			{"name": "TASK-2", "volume": 20},
		]
		progress_rows = [
			{
				"parent": "TASK-1",
				"changed_on": date(2026, 7, 10),
				"old_progress": 10,
				"new_progress": 40,
			},
			{
				"parent": "TASK-2",
				"changed_on": date(2026, 7, 11),
				"old_progress": 0,
				"new_progress": 50,
			},
		]

		completed = _measure_completed_scope_from_rows(
			rows, progress_rows, date(2026, 7, 1), date(2026, 7, 31)
		)

		self.assertEqual(completed, 13)

	def test_created_task_can_also_be_completed_by_progress_delta_in_same_period(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 10),
				"exp_start_date": date(2026, 7, 10),
				"progress": 60,
				"volume": 10,
			}
		]
		progress_rows = [
			{
				"parent": "TASK-1",
				"changed_on": date(2026, 7, 20),
				"old_progress": 10,
				"new_progress": 60,
			}
		]

		created = _measure_created_scope_from_rows(rows, date(2026, 7, 1), date(2026, 7, 31))
		open_volume = _measure_open_scope_from_rows(
			rows, date(2026, 7, 31), use_progress=True, bucket_start=date(2026, 7, 1)
		)
		completed = _measure_completed_scope_from_rows(
			rows, progress_rows, date(2026, 7, 1), date(2026, 7, 31), use_progress=True
		)

		self.assertEqual(created, 10)
		self.assertEqual(open_volume, 0)
		self.assertEqual(completed, 5)

	def test_measure_open_scope_without_progress_uses_full_open_task_volume(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 7, 10),
				"exp_start_date": date(2026, 7, 10),
				"status": "Working",
				"progress": 75,
				"volume": 8,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 7, 15),
				"exp_start_date": date(2026, 7, 15),
				"status": "Completed",
				"completed_on": date(2026, 7, 20),
				"volume": 13,
			},
		]

		open_volume = _measure_open_scope_from_rows(rows, date(2026, 7, 31), use_progress=False)

		self.assertEqual(open_volume, 8)

	def test_measure_completed_scope_without_progress_uses_completed_on_only(self):
		rows = [
			{
				"name": "TASK-1",
				"status": "Completed",
				"completed_on": date(2026, 7, 10),
				"volume": 10,
			},
			{
				"name": "TASK-2",
				"status": "Completed",
				"closing_date": date(2026, 8, 1),
				"exp_end_date": date(2026, 7, 15),
				"custom_planned_end_date": date(2026, 7, 16),
				"volume": 20,
			},
		]

		completed = _measure_completed_scope_from_rows(
			rows, [], date(2026, 7, 1), date(2026, 7, 31), use_progress=False
		)

		self.assertEqual(completed, 10)

	def test_task_name_helpers_select_drilldown_tasks_by_segment(self):
		rows = [
			{
				"name": "TASK-1",
				"creation": date(2026, 6, 30),
				"exp_start_date": date(2026, 7, 10),
				"status": "Working",
				"progress": 50,
				"volume": 8,
			},
			{
				"name": "TASK-2",
				"creation": date(2026, 7, 1),
				"exp_start_date": date(2026, 7, 15),
				"status": "Completed",
				"completed_on": date(2026, 7, 20),
				"volume": 13,
			},
		]
		progress_rows = [
			{
				"parent": "TASK-1",
				"changed_on": date(2026, 7, 25),
				"old_progress": 0,
				"new_progress": 50,
			}
		]

		self.assertEqual(_task_names_created_from_rows(rows, date(2026, 7, 1), date(2026, 7, 31)), ["TASK-2"])
		self.assertEqual(_task_names_open_from_rows(rows, date(2026, 7, 31), use_progress=False), ["TASK-1"])
		self.assertEqual(
			_task_names_open_from_rows(
				rows, date(2026, 7, 31), use_progress=False, bucket_start=date(2026, 7, 1)
			),
			["TASK-1"],
		)
		self.assertEqual(
			_task_names_completed_from_rows(
				rows, progress_rows, date(2026, 7, 1), date(2026, 7, 31), use_progress=True
			),
			["TASK-1"],
		)

	def test_period_progress_series_uses_latest_history_before_bucket_end(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
			("2026-W03", date(2026, 1, 12), date(2026, 1, 18)),
		]
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 10), "old_progress": 20, "new_progress": 55},
		]

		series = _period_progress_series(buckets, progress_rows, current_progress=70)

		self.assertEqual(series, [20.0, 55.0, 70.0])

	def test_period_progress_series_supports_daily_buckets(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 4))
		progress_rows = [
			{"changed_on": date(2026, 1, 2), "old_progress": 0, "new_progress": 25},
			{"changed_on": date(2026, 1, 4), "old_progress": 25, "new_progress": 50},
		]

		series = _period_progress_series(buckets, progress_rows, current_progress=50)

		self.assertEqual(series, [0.0, 25.0, 25.0, 50.0])

	def test_task_actual_progress_series_runs_from_task_start_to_last_progress_change(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 5), "old_progress": 20, "new_progress": 50},
		]

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 4) if value is None else frappe_getdate(value),
		):
			series = _task_actual_progress_series(buckets, progress_rows, date(2026, 1, 2))

		self.assertEqual(series, [None, 0.0, 20.0, 20.0, 50.0, None])

	def test_task_actual_progress_series_extends_to_today_when_later_than_last_change(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 5), "old_progress": 20, "new_progress": 50},
		]

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 6) if value is None else frappe_getdate(value),
		):
			series = _task_actual_progress_series(buckets, progress_rows, date(2026, 1, 2))

		self.assertEqual(series, [None, 0.0, 20.0, 20.0, 50.0, 50.0])

	def test_forecast_progress_to_completion_continues_after_last_actual_point(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [None, 0.0, 20.0, 20.0, 50.0, None])

		self.assertEqual(forecast["series"], [None, 0.0, 15.0, 30.0, 45.0, 60.0, 75.0, 90.0, 100.0])
		self.assertEqual(
			forecast["categories"],
			[
				"2026-01-01",
				"2026-01-02",
				"2026-01-03",
				"2026-01-04",
				"2026-01-05",
				"2026-01-06",
				"Forecast 1",
				"Forecast 2",
				"Forecast 3",
			],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 9))

	def test_forecast_progress_to_completion_uses_all_factual_period_points_for_linear_regression(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [0.0, 0.0, 0.0, 60.0, 60.0, 60.0])

		self.assertEqual(
			forecast["series"],
			[0.0, 6.9, 22.3, 37.7, 53.1, 68.6, 84.0, 99.4, 100.0],
		)
		self.assertEqual(
			forecast["categories"],
			[
				"2026-01-01",
				"2026-01-02",
				"2026-01-03",
				"2026-01-04",
				"2026-01-05",
				"2026-01-06",
				"Forecast 1",
				"Forecast 2",
				"Forecast 3",
			],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 9))

	def test_forecast_progress_to_completion_starts_from_expected_start_bucket(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(
			buckets,
			[None, None, 20.0, 20.0, 50.0, 50.0],
			forecast_start_date=date(2026, 1, 1),
		)

		self.assertEqual(
			forecast["series"],
			[0.0, 5.0, 17.0, 29.0, 41.0, 53.0, 65.0, 77.0, 89.0, 100.0],
		)
		self.assertEqual(forecast["categories"][:6], ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"])
		self.assertEqual(forecast["completion_date"], date(2026, 1, 10))

	def test_planned_progress_series_interpolates_between_planned_dates(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
			("2026-W03", date(2026, 1, 12), date(2026, 1, 18)),
		]

		series = _planned_progress_series(buckets, date(2026, 1, 5), date(2026, 1, 15))

		self.assertEqual(series, [None, 60.0, 100.0])

	def test_planned_progress_series_stops_after_reaching_100_percent(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
			("2026-W03", date(2026, 1, 12), date(2026, 1, 18)),
			("2026-W04", date(2026, 1, 19), date(2026, 1, 25)),
		]

		series = _planned_progress_series(buckets, date(2026, 1, 5), date(2026, 1, 15))

		self.assertEqual(series, [None, 60.0, 100.0, None])

	def test_task_widget_planned_dates_use_custom_fields_only(self):
		planned_start, planned_end = _task_widget_planned_dates(
			{
				"custom_planned_start_date": date(2026, 1, 5),
				"custom_planned_end_date": date(2026, 1, 20),
				"exp_start_date": date(2026, 1, 1),
				"exp_end_date": date(2026, 1, 31),
			}
		)

		self.assertEqual(planned_start, date(2026, 1, 5))
		self.assertEqual(planned_end, date(2026, 1, 20))

	def test_task_progress_history_start_date_uses_task_start_before_planned_start(self):
		start = _task_progress_history_start_date(
			{
				"exp_start_date": date(2026, 4, 26),
				"custom_planned_start_date": date(2026, 5, 10),
			}
		)

		self.assertEqual(start, date(2026, 4, 26))

	def test_task_actual_markers_take_precedence_over_forecast_fallbacks(self):
		markers = _task_actual_or_forecast_date_markers(
			{
				"actual_start_date": date(2026, 1, 7),
				"actual_end_date": date(2026, 1, 25),
				"exp_start_date": date(2026, 1, 3),
			},
			{"completion_date": date(2026, 2, 1)},
		)

		self.assertEqual(
			[marker["type"] for marker in markers],
			["actual_start", "actual_end", "forecast_progress_end"],
		)
		self.assertEqual([marker["date"] for marker in markers], ["2026-01-07", "2026-01-25", "2026-02-01"])

	def test_task_marker_fallbacks_use_expected_start_and_forecast_completion(self):
		markers = _task_actual_or_forecast_date_markers(
			{
				"exp_start_date": date(2026, 1, 3),
				"exp_end_date": date(2026, 1, 20),
				"actual_start_date": None,
				"actual_end_date": None,
				"completed_on": None,
				"closing_date": None,
			},
			{"completion_date": date(2026, 2, 1)},
		)

		self.assertEqual(
			[marker["type"] for marker in markers],
			["expected_start", "expected_end", "forecast_progress_end"],
		)
		self.assertEqual(markers[0]["label"], "Expected start")
		self.assertEqual(
			[marker["date"] for marker in markers],
			["2026-01-03", "2026-01-20", "2026-02-01"],
		)

	def test_forecast_progress_to_completion_extends_from_actual_trend(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
			("2026-W03", date(2026, 1, 12), date(2026, 1, 18)),
		]

		forecast = _forecast_progress_to_completion(buckets, [20.0, 50.0, 80.0])

		self.assertEqual(forecast["series"], [20.0, 50.0, 80.0, 100.0])
		self.assertEqual(forecast["categories"], ["2026-W01", "2026-W02", "2026-W03", "Forecast 1"])
		self.assertEqual(forecast["completion_date"], date(2026, 1, 25))

	def test_forecast_progress_to_completion_stops_after_reaching_100_percent(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [None, 40.0, 70.0, None, None, None])

		self.assertEqual(forecast["series"], [None, 40.0, 70.0, 100.0])
		self.assertEqual(
			forecast["categories"],
			["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 4))

	def test_current_date_marker_is_added_only_inside_bucket_range(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 4) if value is None else frappe_getdate(value),
		):
			marker = _current_date_marker(buckets)

		self.assertEqual(marker, {"label": "Today", "date": "2026-01-04", "type": "today", "bucket_label": "2026-01-04"})

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 7) if value is None else frappe_getdate(value),
		):
			self.assertIsNone(_current_date_marker(buckets))

	def test_timesheet_role_series_from_rows_groups_hours_by_role_and_bucket(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
		]
		rows = [
			{"project_role": "Developer", "date": date(2026, 1, 2), "hours": 3},
			{"project_role": "Developer", "date": date(2026, 1, 8), "hours": 5},
			{"project_role": "Analyst", "date": date(2026, 1, 8), "hours": 2},
			{"project_role": None, "date": date(2026, 1, 9), "hours": 1},
		]

		series = _timesheet_role_series_from_rows(buckets, rows)

		self.assertEqual(
			series,
			[
				{"role": "Analyst", "values": [0.0, 2.0]},
				{"role": "Developer", "values": [3.0, 5.0]},
				{"role": "No role", "values": [0.0, 1.0]},
			],
		)

	def test_task_tree_names_from_rows_includes_recursive_children(self):
		rows = [
			{"name": "TASK-2", "parent_task": "TASK-1"},
			{"name": "TASK-3", "parent_task": "TASK-2"},
			{"name": "TASK-4", "parent_task": "TASK-1"},
			{"name": "TASK-5", "parent_task": "OTHER"},
		]

		self.assertEqual(_task_tree_names_from_rows("TASK-1", rows), ["TASK-1", "TASK-2", "TASK-3", "TASK-4"])

	def test_timesheet_limit_bands_without_explicit_limits(self):
		limits = _timesheet_limit_bands(
			planned_hours_by_role={"Developer": 100.0},
			hours_by_role=[{"role": "Developer", "values": [40.0, 70.0]}],
			project_limits={},
		)

		self.assertEqual(limits["planned_hours"], 100.0)
		self.assertEqual(limits["actual_hours"], 110.0)
		self.assertEqual(limits["axis_max"], 121.0)
		self.assertEqual(
			limits["bands"],
			[
				{"name": "Plan", "color": "green", "from": 0.0, "to": 100.0},
				{"name": "Warning", "color": "yellow", "from": 100.0, "to": 121.0},
			],
		)

	def test_timesheet_limit_bands_with_warning_and_block_limits(self):
		limits = _timesheet_limit_bands(
			planned_hours_by_role={"Developer": 100.0},
			hours_by_role=[{"role": "Developer", "values": [60.0, 90.0]}],
			project_limits={"warning": 80.0, "block": 120.0},
		)

		self.assertEqual(limits["warning_limit_hours"], 80.0)
		self.assertEqual(limits["block_limit_hours"], 120.0)
		self.assertEqual(limits["axis_max"], 165.0)
		self.assertEqual(
			limits["bands"],
			[
				{"name": "Within warning limit", "color": "green", "from": 0.0, "to": 80.0},
				{"name": "Warning limit", "color": "yellow", "from": 80.0, "to": 120.0},
				{"name": "Block limit", "color": "red", "from": 120.0, "to": 165.0},
			],
		)
