# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import math
from datetime import date
from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate as frappe_getdate

from dinext_project_tasks_gantt.burndown import (
	_current_date_marker,
	_creation_date,
	_derive_start_scope_series,
	_extended_forecast_bucket_label,
	_forecast_progress_to_completion,
	get_task_progress_trend,
	_load_task_volume_rows,
	_mval,
	_measure_completed_scope_from_rows,
	_measure_created_scope_from_rows,
	_measure_open_scope_from_rows,
	_period_volume_burndown,
	_period_progress_series,
	_planned_progress_series,
	_task_tree_names_from_rows,
	_task_actual_progress_series,
	_task_actual_or_forecast_date_markers,
	_task_earliest_progress_change_date,
	_task_progress_history_start_date,
	_task_trend_forecasts_suppressed,
	_task_widget_planned_dates,
	_task_names_created_from_rows,
	_task_names_completed_from_rows,
	_task_names_open_from_rows,
	_task_volume,
	_timesheet_limit_bands,
	_timesheet_role_series_from_rows,
	_weighted_velocity,
	get_burndown_series,
	get_period_buckets,
	iter_day_buckets,
	iter_task_type_period_buckets_from_rows,
	iter_month_buckets,
	iter_week_buckets,
)


class TestWeightedVelocityForForecast(FrappeTestCase):
	def test_weighted_velocity_day_uses_last_ten_and_weights_1112222333(self):
		values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
		v = _weighted_velocity(values, "day")
		self.assertAlmostEqual(v, 131.0 / 20.0, places=10)

	def test_weighted_velocity_non_day_uses_last_five_and_weights_12333(self):
		values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
		v = _weighted_velocity(values, "month")
		self.assertAlmostEqual(v, 101.0 / 12.0, places=10)

	def test_weighted_velocity_none_group_by_same_as_non_day(self):
		values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
		self.assertEqual(_weighted_velocity(values, None), _weighted_velocity(values, "week"))

	def test_weighted_velocity_short_window_day_and_week_share_tail_weights(self):
		short = [10.0, 20.0, 30.0]
		self.assertEqual(_weighted_velocity(short, "day"), _weighted_velocity(short, "week"))


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

	def test_extended_forecast_bucket_label_formats_by_group(self):
		buckets = [
			("2026-W01", date(2026, 1, 1), date(2026, 1, 4)),
			("2026-W02", date(2026, 1, 5), date(2026, 1, 11)),
		]
		self.assertEqual(
			_extended_forecast_bucket_label("day", buckets, 10, date(2026, 2, 1)),
			"2026-02-01",
		)
		self.assertEqual(
			_extended_forecast_bucket_label("week", buckets, 10, date(2026, 1, 25)),
			"2026-W04",
		)
		self.assertEqual(
			_extended_forecast_bucket_label("month", buckets, 10, date(2026, 3, 15)),
			"2026-03",
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

	def test_task_actual_progress_series_truncates_after_completed_on_when_no_late_facts(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 4), "old_progress": 20, "new_progress": 50},
		]

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 6) if value is None else frappe_getdate(value),
		):
			series = _task_actual_progress_series(
				buckets, progress_rows, date(2026, 1, 2), completed_on=date(2026, 1, 4)
			)

		self.assertEqual(series, [None, 0.0, 20.0, 50.0, None, None])

	def test_task_actual_progress_series_extends_to_last_fact_after_completed_on(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 5), "old_progress": 20, "new_progress": 50},
		]

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 6) if value is None else frappe_getdate(value),
		):
			series = _task_actual_progress_series(
				buckets, progress_rows, date(2026, 1, 2), completed_on=date(2026, 1, 4)
			)

		self.assertEqual(series, [None, 0.0, 20.0, 20.0, 50.0, None])

	def test_task_actual_progress_series_week_uses_row_cutoff_when_completed_on_mid_week(self):
		buckets = iter_week_buckets(date(2026, 1, 5), date(2026, 1, 20))
		progress_rows = [
			{"changed_on": date(2026, 1, 6), "old_progress": 0, "new_progress": 30},
			{"changed_on": date(2026, 1, 10), "old_progress": 30, "new_progress": 90},
		]
		series = _task_actual_progress_series(
			buckets,
			progress_rows,
			date(2026, 1, 5),
			completed_on=date(2026, 1, 8),
		)
		self.assertEqual(series, [90.0, None, None])

	def test_task_actual_progress_series_keeps_start_bucket_when_completed_before_start(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))
		progress_rows = [
			{"changed_on": date(2026, 1, 3), "old_progress": 0, "new_progress": 20},
			{"changed_on": date(2026, 1, 5), "old_progress": 20, "new_progress": 50},
		]

		with patch(
			"dinext_project_tasks_gantt.burndown.getdate",
			side_effect=lambda value=None: date(2026, 1, 6) if value is None else frappe_getdate(value),
		):
			series = _task_actual_progress_series(
				buckets, progress_rows, date(2026, 1, 4), completed_on=date(2026, 1, 2)
			)

		self.assertEqual(series, [None, None, None, 20.0, 50.0, 50.0])

	def test_forecast_progress_to_completion_continues_after_last_actual_point(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [None, 0.0, 20.0, 20.0, 50.0, None], group_by="day")

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
				"2026-01-07",
				"2026-01-08",
				"2026-01-09",
			],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 9))

	def test_forecast_progress_to_completion_uses_all_factual_period_points_for_linear_regression(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [0.0, 0.0, 0.0, 60.0, 60.0, 60.0], group_by="day")

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
				"2026-01-07",
				"2026-01-08",
				"2026-01-09",
			],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 9))

	def test_forecast_progress_to_completion_starts_from_expected_start_bucket(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(
			buckets,
			[None, None, 20.0, 20.0, 50.0, 50.0],
			forecast_start_date=date(2026, 1, 1),
			group_by="day",
		)

		self.assertEqual(
			forecast["series"],
			[0.0, 5.0, 17.0, 29.0, 41.0, 53.0, 65.0, 77.0, 89.0, 100.0],
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
				"2026-01-07",
				"2026-01-08",
				"2026-01-09",
				"2026-01-10",
			],
		)
		self.assertEqual(forecast["completion_date"], date(2026, 1, 10))

	def test_forecast_progress_to_completion_without_start_date_uses_first_factual_point(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(
			buckets,
			[None, None, 20.0, 20.0, 50.0, 50.0],
			group_by="day",
		)

		self.assertEqual(forecast["series"][:5], [None, None, 17.0, 29.0, 41.0])
		self.assertEqual(
			forecast["categories"][:5],
			["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
		)

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

	@patch("dinext_project_tasks_gantt.burndown.frappe.qb.from_")
	@patch("dinext_project_tasks_gantt.burndown.frappe.qb.DocType")
	def test_task_earliest_progress_change_date_returns_min_history_date(self, _mock_doctype, mock_from):
		query = mock_from.return_value
		query.select.return_value = query
		query.where.return_value = query
		query.run.return_value = [{"min_changed_on": date(2026, 1, 3)}]

		result = _task_earliest_progress_change_date("TASK-1")

		self.assertEqual(result, date(2026, 1, 3))

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
		self.assertEqual(forecast["categories"], ["2026-W01", "2026-W02", "2026-W03", "2026-W04"])
		self.assertEqual(forecast["completion_date"], date(2026, 1, 25))

	def test_forecast_progress_to_completion_stops_after_reaching_100_percent(self):
		buckets = iter_day_buckets(date(2026, 1, 1), date(2026, 1, 6))

		forecast = _forecast_progress_to_completion(buckets, [None, 40.0, 70.0, None, None, None], group_by="day")

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


class TestTaskProgressTrendForecastSuppression(FrappeTestCase):
	def test_task_trend_forecasts_suppressed_at_full_progress(self):
		self.assertTrue(_task_trend_forecasts_suppressed({"progress": 100}))
		self.assertTrue(_task_trend_forecasts_suppressed({"progress": 100.0}))
		self.assertFalse(_task_trend_forecasts_suppressed({"progress": 99.9}))
		self.assertFalse(_task_trend_forecasts_suppressed({"progress": 0}))

	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 1, 15) if value is None else frappe_getdate(value),
	)
	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	def test_get_task_progress_trend_omits_forecasts_when_progress_complete(
		self,
		_mock_fallback_company_hl,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
	):
		mock_get_value.return_value = {
			"name": "T-DONE",
			"subject": "Done task",
			"progress": 100,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": None,
			"exp_end_date": None,
			"custom_planned_start_date": None,
			"custom_planned_end_date": None,
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}
		out = get_task_progress_trend(task="T-DONE", group_by="day")
		self.assertEqual(out["progress"]["forecast"], [])
		self.assertEqual(out["hours_forecast"]["values"], [])
		self.assertIsNone(out["hours_forecast"]["completion_date"])
		types = [m["type"] for m in out["date_markers"]]
		self.assertNotIn("forecast_progress_end", types)
		self.assertNotIn("forecast_work_hours_end", types)

	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 1, 12), "old_progress": 0, "new_progress": 10},
			{"changed_on": date(2026, 1, 14), "old_progress": 10, "new_progress": 40},
			{"changed_on": date(2026, 1, 16), "old_progress": 40, "new_progress": 70},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 1, 20) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_uses_custom_planned_start_and_guards_completed_before_start(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		_mock_fallback_company_hl,
	):
		mock_get_value.return_value = {
			"name": "TASK-2026-00160",
			"subject": "Regression task",
			"progress": 70,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 1, 12),
			"exp_end_date": date(2026, 1, 25),
			"custom_planned_start_date": date(2026, 1, 10),
			"custom_planned_end_date": date(2026, 1, 25),
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": date(2026, 1, 8),
			"closing_date": None,
		}

		out = get_task_progress_trend(task="TASK-2026-00160", group_by="day")

		start_index = out["categories"].index("2026-01-10")
		self.assertEqual(out["progress"]["factual"][start_index : start_index + 7], [0.0, 0.0, 10.0, 10.0, 40.0, 40.0, 70.0])
		self.assertTrue(any(value is not None for value in out["progress"]["forecast"]))
		self.assertEqual(out["categories"][start_index], "2026-01-10")

	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 1, 12), "old_progress": 0, "new_progress": 10},
			{"changed_on": date(2026, 1, 14), "old_progress": 10, "new_progress": 40},
			{"changed_on": date(2026, 1, 16), "old_progress": 40, "new_progress": 70},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 1, 20) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_forecast_no_longer_starts_from_expected_start(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		_mock_fallback_company_hl,
	):
		mock_get_value.return_value = {
			"name": "TASK-2026-00160",
			"subject": "Regression task",
			"progress": 70,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 1, 12),
			"exp_end_date": date(2026, 1, 25),
			"custom_planned_start_date": date(2026, 1, 10),
			"custom_planned_end_date": date(2026, 1, 25),
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": date(2026, 1, 8),
			"closing_date": None,
		}

		out = get_task_progress_trend(task="TASK-2026-00160", group_by="day")

		forecast = out["progress"]["forecast"]
		first_forecast_index = next(index for index, value in enumerate(forecast) if value is not None)
		self.assertEqual(out["categories"][first_forecast_index], "2026-01-10")
		self.assertNotEqual(out["categories"][first_forecast_index], "2026-01-12")

	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 1, 5), "old_progress": 0, "new_progress": 5},
			{"changed_on": date(2026, 1, 12), "old_progress": 5, "new_progress": 10},
			{"changed_on": date(2026, 1, 14), "old_progress": 10, "new_progress": 40},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown._task_earliest_progress_change_date", return_value=date(2026, 1, 5))
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 1, 20) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_starts_from_earliest_factual_change_before_all_start_dates(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_earliest_change,
		_mock_hist,
		_mock_ts,
		_mock_fallback_company_hl,
	):
		mock_get_value.return_value = {
			"name": "TASK-EARLY",
			"subject": "Early progress",
			"progress": 40,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 1, 12),
			"exp_end_date": date(2026, 1, 25),
			"custom_planned_start_date": date(2026, 1, 10),
			"custom_planned_end_date": date(2026, 1, 25),
			"actual_start_date": date(2026, 1, 15),
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}

		out = get_task_progress_trend(task="TASK-EARLY", group_by="day")

		self.assertEqual(out["categories"][0], "2026-01-04")
		self.assertEqual(out["progress"]["factual"][:5], [0.0, 5.0, 5.0, 5.0, 5.0])
		first_forecast_index = next(index for index, value in enumerate(out["progress"]["forecast"]) if value is not None)
		self.assertEqual(out["categories"][first_forecast_index], "2026-01-04")

	@patch("dinext_project_tasks_gantt.burndown._nonworking_holiday_dates_in_range", return_value=["2026-01-20"])
	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value="Co-HL")
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 1, 15) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_day_uses_company_holiday_list_when_no_project(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		mock_fallback_hl,
		mock_nonworking,
	):
		mock_get_value.return_value = {
			"name": "T-NOPROJ",
			"subject": "No project",
			"progress": 10,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": None,
			"exp_end_date": None,
			"custom_planned_start_date": None,
			"custom_planned_end_date": None,
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}
		out = get_task_progress_trend(task="T-NOPROJ", group_by="day")
		mock_fallback_hl.assert_called_once_with(None)
		mock_nonworking.assert_called_once()
		call_args = mock_nonworking.call_args[0]
		self.assertEqual(call_args[0], "Co-HL")
		self.assertEqual(out["holiday_list_name"], "Co-HL")
		self.assertEqual(out["holiday_dates"], ["2026-01-20"])

	@patch("dinext_project_tasks_gantt.burndown._nonworking_holiday_dates_in_range", return_value=["2026-06-20"])
	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value="Co-HL")
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 5, 10), "old_progress": 0, "new_progress": 10},
			{"changed_on": date(2026, 5, 16), "old_progress": 10, "new_progress": 30},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 5, 16) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_day_extends_holiday_range_to_forecast_categories(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		mock_fallback_hl,
		mock_nonworking,
	):
		mock_get_value.return_value = {
			"name": "T-FORECAST",
			"subject": "Forecast horizon",
			"progress": 30,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 5, 1),
			"exp_end_date": date(2026, 6, 17),
			"custom_planned_start_date": None,
			"custom_planned_end_date": None,
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}
		out = get_task_progress_trend(task="T-FORECAST", group_by="day")
		mock_fallback_hl.assert_called_once_with(None)
		mock_nonworking.assert_called_once()
		call_args = mock_nonworking.call_args[0]
		self.assertEqual(call_args[0], "Co-HL")
		self.assertEqual(call_args[1], date(2026, 5, 1))
		self.assertEqual(call_args[2], date(2026, 7, 17))
		self.assertEqual(out["progress"]["forecast_categories"][-1], "2026-07-17")
		self.assertEqual(out["holiday_dates"], ["2026-06-20"])

	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	@patch(
		"dinext_project_tasks_gantt.burndown._forecast_hours_to_plan",
		return_value={"categories": ["2026-05-01", "2026-05-02", "2026-05-03"], "series": [10.0, 40.0, 70.0], "completion_date": date(2026, 5, 3)},
	)
	@patch(
		"dinext_project_tasks_gantt.burndown._forecast_progress_to_completion",
		return_value={"categories": ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04"], "series": [10.0, 30.0, 50.0, 70.0], "completion_date": date(2026, 5, 4)},
	)
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 5, 1), "old_progress": 0, "new_progress": 10},
			{"changed_on": date(2026, 5, 2), "old_progress": 10, "new_progress": 20},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 5, 1) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_uses_max_completion_date_for_axis_end(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		_mock_forecast_progress,
		_mock_forecast_hours,
		_mock_fallback_company_hl,
	):
		mock_get_value.return_value = {
			"name": "T-TD-MAX",
			"subject": "Max td",
			"progress": 20,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 5, 1),
			"exp_end_date": date(2026, 5, 4),
			"custom_planned_start_date": date(2026, 5, 1),
			"custom_planned_end_date": date(2026, 5, 4),
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}

		out = get_task_progress_trend(task="T-TD-MAX", group_by="day")

		self.assertEqual(out["categories"][-1], "2026-05-04")

	@patch("dinext_project_tasks_gantt.burndown._fallback_company_holiday_list", return_value=None)
	@patch(
		"dinext_project_tasks_gantt.burndown._forecast_hours_to_plan",
		return_value={"categories": ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05"], "series": [10.0, 30.0, 50.0, 70.0, 90.0], "completion_date": date(2026, 5, 5)},
	)
	@patch(
		"dinext_project_tasks_gantt.burndown._forecast_progress_to_completion",
		return_value={"categories": ["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05", "2026-05-06"], "series": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0], "completion_date": date(2026, 5, 6)},
	)
	@patch("dinext_project_tasks_gantt.burndown._load_task_timesheet_role_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_progress_rows",
		return_value=[
			{"changed_on": date(2026, 5, 1), "old_progress": 0, "new_progress": 10},
			{"changed_on": date(2026, 5, 2), "old_progress": 10, "new_progress": 20},
		],
	)
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown.frappe.db.get_value")
	@patch(
		"dinext_project_tasks_gantt.burndown._task_trend_fields",
		return_value=[
			"name",
			"subject",
			"project",
			"progress",
			"exp_start_date",
			"exp_end_date",
			"custom_planned_start_date",
			"custom_planned_end_date",
			"actual_start_date",
			"actual_end_date",
			"completed_on",
			"closing_date",
			"type",
			"is_group",
			"is_milestone",
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.getdate",
		side_effect=lambda value=None: date(2026, 5, 1) if value is None else frappe_getdate(value),
	)
	def test_get_task_progress_trend_caps_axis_end_by_existing_forecast_horizon(
		self,
		_mock_getdate,
		_mock_trend_fields,
		mock_get_value,
		_mock_perm,
		_mock_hist,
		_mock_ts,
		_mock_forecast_progress,
		_mock_forecast_hours,
		_mock_fallback_company_hl,
	):
		mock_get_value.return_value = {
			"name": "T-TD-CAP",
			"subject": "Cap td",
			"progress": 20,
			"project": None,
			"is_group": 0,
			"is_milestone": 0,
			"type": "Task",
			"exp_start_date": date(2026, 5, 1),
			"exp_end_date": date(2026, 5, 2),
			"custom_planned_start_date": date(2026, 5, 1),
			"custom_planned_end_date": date(2026, 5, 2),
			"actual_start_date": None,
			"actual_end_date": None,
			"completed_on": None,
			"closing_date": None,
		}

		out = get_task_progress_trend(task="T-TD-CAP", group_by="day")

		self.assertEqual(out["categories"][-1], "2026-05-03")


class TestTaskCountVolume(FrappeTestCase):
	def test_task_volume_task_count_unweighted(self):
		task = {"name": "T-1", "task_weight": 3}
		self.assertEqual(_task_volume(task, "task_count", use_task_weight=False), 1.0)

	def test_task_volume_task_count_weighted(self):
		task = {"name": "T-1", "task_weight": 3}
		self.assertEqual(_task_volume(task, "task_count", use_task_weight=True), 3.0)

	def test_task_volume_task_count_weighted_zero_or_missing(self):
		self.assertEqual(_task_volume({"name": "T-1", "task_weight": 0}, "task_count", use_task_weight=True), 0.0)
		self.assertEqual(_task_volume({"name": "T-1"}, "task_count", use_task_weight=True), 0.0)

	def test_mval_task_count_unweighted(self):
		self.assertEqual(_mval("T-1", {"task_weight": 5}, {}, "task_count", use_task_weight=False), 1.0)

	def test_mval_task_count_weighted(self):
		self.assertEqual(_mval("T-1", {"task_weight": 5}, {}, "task_count", use_task_weight=True), 5.0)

	def test_mval_task_count_weighted_zero_or_missing(self):
		self.assertEqual(_mval("T-1", {"task_weight": 0}, {}, "task_count", use_task_weight=True), 0.0)
		self.assertEqual(_mval("T-1", {}, {}, "task_count", use_task_weight=True), 0.0)


class TestForecastWithoutProgress(FrappeTestCase):
	@patch("dinext_project_tasks_gantt.burndown._fact_end_index", return_value=1)
	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._utp_hours_by_task")
	@patch("dinext_project_tasks_gantt.burndown._utp_cumulative_hours_by_task")
	@patch(
		"dinext_project_tasks_gantt.burndown._utp_parent_names_in_bucket_for_tasks",
		return_value=[],
	)
	@patch("dinext_project_tasks_gantt.burndown._utp_sum_hours", return_value=1.5)
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-DONE",
				"creation": date(2026, 4, 20),
				"exp_start_date": date(2026, 4, 20),
				"status": "Completed",
				"completed_on": date(2026, 5, 4),
				"volume": 5.0,
			},
			{
				"name": "TASK-OPEN",
				"creation": date(2026, 4, 20),
				"exp_start_date": date(2026, 4, 20),
				"status": "Working",
				"progress": 30.0,
				"volume": 10.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[
			("2026-05-03", date(2026, 5, 3), date(2026, 5, 3)),
			("2026-05-04", date(2026, 5, 4), date(2026, 5, 4)),
			("2026-05-05", date(2026, 5, 5), date(2026, 5, 5)),
		],
	)
	def test_period_volume_burndown_forecast_uses_binary_velocity_when_progress_disabled(
		self,
		_mock_buckets,
		_mock_tasks,
		_mock_utp_sum,
		_mock_utp_parent_names,
		mock_utp_cumulative,
		mock_utp_by_task,
		_mock_progress,
		_mock_holiday_list,
		_mock_holidays,
		_mock_fact_end,
	):
		mock_utp_by_task.side_effect = [
			{"TASK-DONE": 1.5},
			{"TASK-DONE": 1.5},
			{"TASK-DONE": 1.5},
		]
		mock_utp_cumulative.side_effect = [
			{"TASK-DONE": 1.5},
			{"TASK-DONE": 3.0},
			{"TASK-DONE": 4.5},
			{"TASK-DONE": 3.0},
		]
		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 3),
			td=date(2026, 5, 5),
			group_by="day",
			measure="hours",
			exclude_group=False,
			use_progress=False,
			show_completion_forecast=True,
		)

		self.assertEqual(out["forecast_from_index"], 2)
		self.assertEqual(out["forecast_remaining"], [13.5, 12.0, 10.5])
		self.assertEqual(out["forecast_completed"], [0.0, 0.0, 1.5])
		fs = out["forecast_summary"]
		self.assertTrue(fs["show"])
		self.assertGreater(fs["remaining_volume"], 0)
		self.assertGreater(fs["velocity"], 0)
		self.assertEqual(
			fs["remaining_periods"],
			int(math.ceil(fs["remaining_volume"] / fs["velocity"])),
		)
		self.assertIsInstance(fs["remaining_periods_label"], str)
		self.assertIsInstance(fs["period_label"], str)
		self.assertIsInstance(fs["volume_label"], str)

	@patch("dinext_project_tasks_gantt.burndown._fact_end_index", return_value=1)
	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-D1",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Completed",
				"completed_on": date(2026, 5, 1),
				"volume": 1.0,
			},
			{
				"name": "TASK-D2",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Completed",
				"completed_on": date(2026, 5, 2),
				"volume": 1.0,
			},
			{
				"name": "TASK-D3",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Completed",
				"completed_on": date(2026, 5, 2),
				"volume": 1.0,
			},
			{
				"name": "TASK-O1",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Working",
				"volume": 1.0,
			},
			{
				"name": "TASK-O2",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Working",
				"volume": 1.0,
			},
			{
				"name": "TASK-O3",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Working",
				"volume": 1.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[
			("2026-05-01", date(2026, 5, 1), date(2026, 5, 1)),
			("2026-05-02", date(2026, 5, 2), date(2026, 5, 2)),
			("2026-05-03", date(2026, 5, 3), date(2026, 5, 3)),
			("2026-05-04", date(2026, 5, 4), date(2026, 5, 4)),
		],
	)
	def test_task_count_forecast_without_progress_uses_whole_tasks(
		self,
		_mock_buckets,
		_mock_tasks,
		_mock_progress,
		_mock_holiday_list,
		_mock_holidays,
		_mock_fact_end,
	):
		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 1),
			td=date(2026, 5, 4),
			group_by="day",
			measure="task_count",
			exclude_group=False,
			use_progress=False,
			show_completion_forecast=True,
		)

		self.assertEqual(out["forecast_from_index"], 2)
		self.assertEqual(out["forecast_completed"], [0.0, 0.0, 1.0, 2.0])
		self.assertEqual(out["forecast_remaining"], [0.0, 3.0, 2.0, 0.0])


class TestHoursBurndownByApprovedTimesheets(FrappeTestCase):
	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._utp_sum_hours", return_value=0.0)
	@patch("dinext_project_tasks_gantt.burndown._utp_hours_by_task")
	@patch("dinext_project_tasks_gantt.burndown._utp_cumulative_hours_by_task")
	@patch(
		"dinext_project_tasks_gantt.burndown._utp_parent_names_in_bucket_for_tasks",
		side_effect=[["UTP-OLD-0"], ["UTP-OLD-1"], ["UTP-NEW-CC"]],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-OLD",
				"creation": date(2026, 4, 20),
				"exp_start_date": date(2026, 4, 20),
				"status": "Working",
				"progress": 80.0,
				"volume": 10.0,
			},
			{
				"name": "TASK-NEW",
				"creation": date(2026, 5, 2),
				"exp_start_date": date(2026, 5, 2),
				"status": "Open",
				"progress": 0.0,
				"volume": 6.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[
			("2026-05-01", date(2026, 5, 1), date(2026, 5, 1)),
			("2026-05-02", date(2026, 5, 2), date(2026, 5, 2)),
		],
	)
	def test_hours_buckets_use_only_approved_timesheet_hours_and_residual_open(
		self,
		_mock_buckets,
		_mock_tasks,
		mock_utp_parent_names,
		mock_utp_cumulative,
		mock_utp_by_task,
		_mock_utp_sum,
		_mock_progress,
		_mock_holiday_list,
		_mock_holidays,
	):
		mock_utp_by_task.side_effect = [
			{"TASK-OLD": 3.0},
			{"TASK-OLD": 2.0, "TASK-NEW": 1.0},
		]
		mock_utp_cumulative.side_effect = [
			{"TASK-OLD": 3.0},
			{"TASK-OLD": 5.0, "TASK-NEW": 1.0},
		]

		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 1),
			td=date(2026, 5, 2),
			group_by="day",
			measure="hours",
			exclude_group=False,
			use_progress=False,
			show_completion_forecast=False,
		)

		self.assertEqual(out["created"], [0.0, 5.0])
		self.assertEqual(out["created_completed"], [0.0, 1.0])
		self.assertEqual(out["completed"], [3.0, 2.0])
		self.assertEqual(out["open"], [7.0, 3.0])
		self.assertEqual(out["remaining"], [7.0, 3.0])
		self.assertFalse(out["forecast_summary"]["show"])
		self.assertEqual(out["task_filters"]["created"], [[], ["TASK-NEW"]])
		self.assertEqual(out["task_filters"]["created_completed"], [[], ["UTP-NEW-CC"]])
		self.assertEqual(out["task_filters"]["completed"], [["UTP-OLD-0"], ["UTP-OLD-1"]])
		self.assertEqual(out["task_filters"]["open"], [["TASK-OLD"], ["TASK-OLD"]])

	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._utp_sum_hours", return_value=0.0)
	@patch("dinext_project_tasks_gantt.burndown._utp_cumulative_hours_by_task")
	@patch("dinext_project_tasks_gantt.burndown._utp_hours_by_task", return_value={"TASK-OLD": 1.0})
	@patch(
		"dinext_project_tasks_gantt.burndown._utp_parent_names_in_bucket_for_tasks",
		return_value=["UTP-OLD"],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-OLD",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Working",
				"progress": 0.0,
				"volume": 10.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[("2026-05-10", date(2026, 5, 10), date(2026, 5, 10))],
	)
	def test_hours_open_subtracts_pre_period_approved_hours(
		self,
		_mock_buckets,
		_mock_tasks,
		_mock_utp_parent_names,
		_mock_bucket_hours,
		mock_cumulative_hours,
		_mock_utp_sum,
		_mock_progress,
		_mock_holiday_list,
		_mock_holidays,
	):
		mock_cumulative_hours.return_value = {"TASK-OLD": 4.0}

		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 10),
			td=date(2026, 5, 10),
			group_by="day",
			measure="hours",
			exclude_group=False,
			use_progress=False,
			show_completion_forecast=False,
		)

		self.assertEqual(out["created"], [0.0])
		self.assertEqual(out["created_completed"], [0.0])
		self.assertEqual(out["completed"], [1.0])
		self.assertEqual(out["open"], [6.0])
		self.assertEqual(out["task_filters"]["open"], [["TASK-OLD"]])
		mock_cumulative_hours.assert_called_once()


class TestHoursCreationDateFromApprovedTimesheets(FrappeTestCase):
	@patch("dinext_project_tasks_gantt.burndown._task_name_list", return_value=["TASK-LATE"])
	@patch("dinext_project_tasks_gantt.burndown._story_point_map", return_value={})
	@patch("dinext_project_tasks_gantt.burndown._utp_min_date_by_task")
	@patch("dinext_project_tasks_gantt.burndown._pwe_plan_by_task", return_value={"TASK-LATE": 8.0})
	@patch(
		"dinext_project_tasks_gantt.burndown.frappe.get_all",
		return_value=[
			{
				"name": "TASK-LATE",
				"creation": "2026-05-10 09:00:00",
				"progress": 0.0,
				"status": "Open",
				"completed_on": None,
				"closing_date": None,
				"story_point": None,
				"task_weight": 0,
				"exp_start_date": None,
				"exp_end_date": None,
				"custom_planned_start_date": None,
				"custom_planned_end_date": None,
			}
		],
	)
	def test_load_task_volume_rows_uses_earliest_approved_utp_date_for_hours_only(
		self,
		_mock_get_all,
		_mock_pwe,
		mock_min_date,
		_mock_story_point_map,
		_mock_task_name_list,
	):
		mock_min_date.return_value = {"TASK-LATE": date(2026, 5, 8)}

		hours_tasks = _load_task_volume_rows(
			project="PROJ-1", exclude_group=False, measure="hours", use_task_weight=False
		)
		self.assertEqual(hours_tasks[0]["hours_creation"], date(2026, 5, 8))
		self.assertEqual(_creation_date(hours_tasks[0]), date(2026, 5, 8))

		_mock_get_all.return_value = [
			{
				"name": "TASK-LATE",
				"creation": "2026-05-10 09:00:00",
				"progress": 0.0,
				"status": "Open",
				"completed_on": None,
				"closing_date": None,
				"story_point": None,
				"task_weight": 0,
				"exp_start_date": None,
				"exp_end_date": None,
				"custom_planned_start_date": None,
				"custom_planned_end_date": None,
			}
		]
		mock_min_date.reset_mock()
		mock_min_date.return_value = {"TASK-LATE": date(2026, 5, 8)}
		story_point_tasks = _load_task_volume_rows(
			project="PROJ-1", exclude_group=False, measure="story_points", use_task_weight=False
		)
		self.assertNotIn("hours_creation", story_point_tasks[0])
		self.assertEqual(_creation_date(story_point_tasks[0]), date(2026, 5, 10))
		mock_min_date.assert_not_called()

	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._utp_sum_hours", return_value=0.0)
	@patch("dinext_project_tasks_gantt.burndown._utp_hours_by_task")
	@patch("dinext_project_tasks_gantt.burndown._utp_cumulative_hours_by_task")
	@patch(
		"dinext_project_tasks_gantt.burndown._utp_parent_names_in_bucket_for_tasks",
		side_effect=[[], [], ["UTP-LATE-CC"], [], []],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-LATE",
				"creation": date(2026, 5, 27),
				"hours_creation": date(2026, 5, 26),
				"exp_start_date": date(2026, 5, 27),
				"status": "Open",
				"progress": 0.0,
				"volume": 8.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[
			("2026-05-25", date(2026, 5, 25), date(2026, 5, 25)),
			("2026-05-26", date(2026, 5, 26), date(2026, 5, 26)),
			("2026-05-27", date(2026, 5, 27), date(2026, 5, 27)),
			("2026-05-28", date(2026, 5, 28), date(2026, 5, 28)),
		],
	)
	def test_hours_buckets_use_effective_creation_from_earliest_approved_utp_date(
		self,
		_mock_buckets,
		_mock_tasks,
		mock_utp_parent_names,
		mock_utp_cumulative,
		mock_utp_by_task,
		_mock_utp_sum,
		_mock_progress,
		_mock_holiday_list,
		_mock_holidays,
	):
		mock_utp_by_task.side_effect = [
			{},
			{"TASK-LATE": 2.0},
			{},
			{},
		]
		mock_utp_cumulative.side_effect = [
			{},
			{"TASK-LATE": 2.0},
			{"TASK-LATE": 2.0},
			{"TASK-LATE": 2.0},
		]

		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 25),
			td=date(2026, 5, 28),
			group_by="day",
			measure="hours",
			exclude_group=False,
			use_progress=False,
			show_completion_forecast=False,
		)

		self.assertEqual(out["created"], [0.0, 6.0, 0.0, 0.0])
		self.assertEqual(out["created_completed"], [0.0, 2.0, 0.0, 0.0])
		self.assertEqual(out["completed"], [0.0, 0.0, 0.0, 0.0])
		self.assertEqual(out["open"], [0.0, 0.0, 6.0, 6.0])
		self.assertEqual(out["task_filters"]["open"], [[], [], ["TASK-LATE"], ["TASK-LATE"]])
		self.assertEqual(out["task_filters"]["created"], [[], ["TASK-LATE"], [], []])
		self.assertEqual(out["task_filters"]["created_completed"], [[], ["UTP-LATE-CC"], [], []])
		self.assertEqual(out["task_filters"]["completed"], [[], [], [], []])


class TestCumulativeOpenAcrossMeasures(FrappeTestCase):
	@patch("dinext_project_tasks_gantt.burndown._holiday_dates_in_range", return_value=[])
	@patch("dinext_project_tasks_gantt.burndown._resolve_project_holiday_list", return_value=None)
	@patch(
		"dinext_project_tasks_gantt.burndown._load_task_volume_rows",
		return_value=[
			{
				"name": "TASK-SP",
				"creation": date(2026, 5, 1),
				"exp_start_date": date(2026, 5, 1),
				"status": "Working",
				"progress": 0.0,
				"volume": 8.0,
			},
		],
	)
	@patch(
		"dinext_project_tasks_gantt.burndown.get_period_buckets",
		return_value=[("2026-05-10", date(2026, 5, 10), date(2026, 5, 10))],
	)
	@patch("dinext_project_tasks_gantt.burndown._load_progress_rows")
	def test_story_points_open_uses_progress_history_before_filter_start(
		self,
		mock_load_progress_rows,
		_mock_buckets,
		_mock_tasks,
		_mock_holiday_list,
		_mock_holidays,
	):
		progress_rows = [
			{
				"parent": "TASK-SP",
				"changed_on": date(2026, 5, 5),
				"old_progress": 0,
				"new_progress": 50,
			}
		]

		def load_progress_rows_side_effect(task_names, history_fd, history_td):
			if history_fd == date(2026, 5, 1) and history_td == date(2026, 5, 10):
				return progress_rows
			return []

		mock_load_progress_rows.side_effect = load_progress_rows_side_effect

		out = _period_volume_burndown(
			project="PROJ-1",
			fd=date(2026, 5, 10),
			td=date(2026, 5, 10),
			group_by="day",
			measure="story_points",
			exclude_group=False,
			use_progress=True,
			show_completion_forecast=False,
		)

		self.assertEqual(out["created"], [0.0])
		self.assertEqual(out["created_completed"], [0.0])
		self.assertEqual(out["completed"], [0.0])
		self.assertEqual(out["open"], [4.0])
		self.assertEqual(out["task_filters"]["open"], [["TASK-SP"]])
		mock_load_progress_rows.assert_called_once_with(["TASK-SP"], date(2026, 5, 1), date(2026, 5, 10))


class TestGetBurndownSeriesHoursIgnoresUseProgress(FrappeTestCase):
	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown._period_volume_burndown")
	def test_hours_always_passes_progress_disabled_to_burndown(
		self, mock_pvb, _mock_perm
	):
		stub = {"measure": "hours", "categories": [], "use_progress": False}
		mock_pvb.return_value = stub

		out_on = get_burndown_series(
			project="PROJ-1",
			from_date="2026-05-01",
			to_date="2026-05-31",
			measure="hours",
			use_progress=1,
		)
		self.assertIs(out_on, stub)
		self.assertEqual(mock_pvb.call_args[0][6], False)

		mock_pvb.reset_mock()
		mock_pvb.return_value = stub
		out_off = get_burndown_series(
			project="PROJ-1",
			from_date="2026-05-01",
			to_date="2026-05-31",
			measure="hours",
			use_progress=0,
		)
		self.assertIs(out_off, stub)
		self.assertEqual(mock_pvb.call_args[0][6], False)

	@patch("dinext_project_tasks_gantt.burndown.frappe.has_permission", return_value=True)
	@patch("dinext_project_tasks_gantt.burndown._period_volume_burndown")
	def test_story_points_respects_use_progress_flag(self, mock_pvb, _mock_perm):
		mock_pvb.return_value = {"measure": "story_points", "categories": []}

		get_burndown_series(
			project="PROJ-1",
			from_date="2026-05-01",
			to_date="2026-05-31",
			measure="story_points",
			use_progress=1,
		)
		self.assertEqual(mock_pvb.call_args[0][6], True)

		mock_pvb.reset_mock()
		mock_pvb.return_value = {"measure": "story_points", "categories": []}
		get_burndown_series(
			project="PROJ-1",
			from_date="2026-05-01",
			to_date="2026-05-31",
			measure="story_points",
			use_progress=0,
		)
		self.assertEqual(mock_pvb.call_args[0][6], False)
