# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_children import (
	_ids_with_ancestors,
	_intersect_keep_sets,
	_row_matches_attr_filters,
)


class TestGetChildrenAttrFilters(FrappeTestCase):
	def test_ids_with_ancestors_keeps_chain_not_unrelated_groups(self):
		parent = {"leaf": "mid", "mid": "root", "root": "", "other-group": ""}
		keep = _ids_with_ancestors(parent, {"leaf"})
		self.assertEqual(keep, {"leaf", "mid", "root"})
		self.assertNotIn("other-group", keep)

	def test_task_filter_keep_is_task_plus_ancestors_not_siblings(self):
		parent = {
			"X": "mid",
			"sibling": "mid",
			"mid": "root",
			"root": "",
			"other-group": "",
		}
		keep = _ids_with_ancestors(parent, {"X"})
		self.assertEqual(keep, {"X", "mid", "root"})
		self.assertNotIn("sibling", keep)
		self.assertNotIn("other-group", keep)

	def test_intersect_keep_sets_none_and_task(self):
		self.assertIsNone(_intersect_keep_sets(None, None))
		self.assertEqual(_intersect_keep_sets({"a", "b"}, None), {"a", "b"})
		self.assertEqual(_intersect_keep_sets({"a", "b"}, {"b", "c"}), {"b"})
		self.assertEqual(_intersect_keep_sets({"X", "mid"}, set()), set())

	def test_row_matches_status_and_assign(self):
		row = {
			"status": "Working",
			"priority": "High",
			"_assign": '["user@example.com"]',
			"_user_tags": ",alpha,beta",
		}
		self.assertTrue(
			_row_matches_attr_filters(row, "Working", None, None, None)
		)
		self.assertFalse(
			_row_matches_attr_filters(row, "Open", None, None, None)
		)
		self.assertTrue(
			_row_matches_attr_filters(row, None, None, "user@example.com", None)
		)
		self.assertTrue(_row_matches_attr_filters(row, None, None, None, "alpha"))
		self.assertFalse(_row_matches_attr_filters(row, None, None, None, "gamma"))
