import re
import sqlite3
import sys
from datetime import date
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch

import frappe


class TestTimesheetStatusCompatibility(TestCase):
	def test_burndown_reads_both_approved_values_with_timesheets_develop(self):
		source = Path(__file__).resolve().parents[1] / "burndown.py"
		spec = spec_from_file_location("_gantt_burndown_compatibility", source)
		burndown = module_from_spec(spec)
		with patch.dict(sys.modules, {"dinext_timesheets.timesheet_status": None}):
			spec.loader.exec_module(burndown)

		with sqlite3.connect(":memory:") as db:
			db.row_factory = sqlite3.Row
			db.executescript(
				"""
				CREATE TABLE `tabUser Timesheet Position` (
					name TEXT, project TEXT, document_name TEXT, document_type TEXT, project_role TEXT, status TEXT
				);
				CREATE TABLE `tabUser Timesheet Position Details` (parent TEXT, date TEXT, hours REAL);
				INSERT INTO `tabUser Timesheet Position` VALUES
					('legacy', 'PROJECT', 'TASK', 'Task', 'Dev', 'Согласовано'),
					('current', 'PROJECT', 'TASK', 'Task', 'Dev', 'Approved'),
					('rejected', 'PROJECT', 'TASK', 'Task', 'Dev', 'Rejected'),
					('issue', 'PROJECT', 'TASK', 'Issue', 'Dev', 'Approved');
				INSERT INTO `tabUser Timesheet Position Details` VALUES
					('legacy', '2026-11-09', 3), ('current', '2026-11-09', 7),
					('legacy', '2026-11-08', 13), ('rejected', '2026-11-09', 17), ('issue', '2026-11-09', 19);
				"""
			)

			def read(sql, params, *, as_dict):
				self.assertTrue(as_dict)
				bound_sql = re.sub(r"%\((\w+)\)s", r":\1", sql)
				values = {
					key: str(value) if isinstance(value, date) else value for key, value in params.items()
				}
				return [frappe._dict(dict(row)) for row in db.execute(bound_sql, values)]

			day = date(2026, 11, 9)
			with patch.object(frappe.local, "db", SimpleNamespace(sql=read)):
				self.assertEqual(burndown._utp_sum_hours("PROJECT", day, day, ["TASK"], ["Dev"]), 10.0)
				self.assertEqual(
					burndown._load_task_timesheet_role_rows(["TASK"], day, day),
					[{"project_role": "Dev", "date": "2026-11-09", "hours": 10.0}],
				)
