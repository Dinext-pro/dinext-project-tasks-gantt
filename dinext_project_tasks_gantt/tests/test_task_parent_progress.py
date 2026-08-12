# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, flt, getdate

from dinext_project_tasks_gantt.task_parent_progress import compute_raw_group_progress


class TestTaskParentProgressRollup(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.prefix = frappe.generate_hash(length=8)
		self._cleanup: list[str] = []

	def tearDown(self):
		for name in reversed(self._cleanup):
			if frappe.db.exists("Task", name):
				frappe.delete_doc("Task", name, force=True, ignore_permissions=True)
		super().tearDown()

	def _task(self, tail: str, **kwargs):
		subject = f"{self.prefix}-{tail}"
		t = frappe.new_doc("Task")
		t.subject = subject
		t.status = "Open"
		t.exp_start_date = getdate()
		t.exp_end_date = add_days(getdate(), 7)
		for k, v in kwargs.items():
			setattr(t, k, v)
		t.insert()
		self._cleanup.append(t.name)
		return t

	def _by_tail(self, tail: str) -> str | None:
		return frappe.db.get_value("Task", {"subject": f"{self.prefix}-{tail}"}, "name")

	def test_weighted_average_two_children(self):
		root = self._task("R-WAvg", is_group=1)
		self._task("B-WAvg", parent_task=root.name, task_weight=2, progress=50)
		self._task("C-WAvg", parent_task=root.name, task_weight=3, progress=80)
		root.reload()
		self.assertAlmostEqual(flt(root.progress), (50 * 2 + 80 * 3) / 5, places=2)

	def test_monotonic_parent_floor(self):
		root = self._task("R-Mono", is_group=1)
		self._task("B-Mono", parent_task=root.name, task_weight=1, progress=40)
		self._task("C-Mono", parent_task=root.name, task_weight=1, progress=40)
		root.reload()
		self.assertAlmostEqual(flt(root.progress), 40.0, places=2)

		root = frappe.get_doc("Task", root.name)
		root.progress = 60
		root.flags.skip_parent_progress_rollup = True
		root.save()

		b = frappe.get_doc("Task", self._by_tail("B-Mono"))
		b.progress = 30
		b.save()
		root.reload()
		self.assertAlmostEqual(flt(root.progress), 60.0, places=2)

		b.progress = 90
		b.save()
		root.reload()
		self.assertGreater(flt(root.progress), 60.0)

	def test_zero_weight_excluded(self):
		root = self._task("R-ZeroW", is_group=1)
		self._task("B-ZW", parent_task=root.name, task_weight=0, progress=0)
		self._task("C-ZW", parent_task=root.name, task_weight=1, progress=100)
		root.reload()
		self.assertAlmostEqual(flt(root.progress), 100.0, places=2)

	def test_all_zero_weight_no_rollup(self):
		root = self._task("R-AllZero", is_group=1, progress=0)
		self._task("B-AZ", parent_task=root.name, task_weight=0, progress=50)
		root.reload()
		self.assertAlmostEqual(flt(root.progress), 0.0, places=2)

	def test_two_level_chain(self):
		root = self._task("R-2L", is_group=1)
		mid = self._task("M-2L", parent_task=root.name, is_group=1, task_weight=1, progress=0)
		self._task("L-2L", parent_task=mid.name, task_weight=1, progress=100)
		mid.reload()
		root.reload()
		self.assertAlmostEqual(flt(mid.progress), 100.0, places=2)
		self.assertAlmostEqual(flt(root.progress), 100.0, places=2)

	def test_delete_does_not_lower_parent(self):
		root = self._task("R-Del", is_group=1)
		self._task("C1-Del", parent_task=root.name, task_weight=1, progress=40)
		c2 = self._task("C2-Del", parent_task=root.name, task_weight=1, progress=100)
		root.reload()
		self.assertAlmostEqual(flt(root.progress), 70.0, places=2)

		frappe.delete_doc("Task", c2.name, force=True, ignore_permissions=True)
		self._cleanup = [n for n in self._cleanup if n != c2.name]

		root.reload()
		self.assertAlmostEqual(flt(root.progress), 70.0, places=2)


class TestComputeRawGroupProgress(FrappeTestCase):
	def test_compute_raw_none_without_weights(self):
		self.assertIsNone(compute_raw_group_progress("__nonexistent_parent__"))
