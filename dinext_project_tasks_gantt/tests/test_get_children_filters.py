# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_children import (
	_attr_filters_on,
	_ids_with_ancestors,
	_intersect_keep_sets,
	_parse_multi,
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

	def test_task_filter_multi_is_union_of_selected_plus_ancestors(self):
		parent = {
			"X": "mid",
			"Y": "other-mid",
			"sibling": "mid",
			"mid": "root",
			"other-mid": "root",
			"root": "",
			"unrelated": "",
		}
		keep = _ids_with_ancestors(parent, {"X", "Y"})
		self.assertEqual(keep, {"X", "Y", "mid", "other-mid", "root"})
		self.assertNotIn("sibling", keep)
		self.assertNotIn("unrelated", keep)

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
			_row_matches_attr_filters(row, ["Open", "Working"], None, None, None)
		)
		self.assertFalse(
			_row_matches_attr_filters(row, ["Open", "Completed"], None, None, None)
		)
		self.assertTrue(
			_row_matches_attr_filters(
				row, ["Working"], ["High", "Medium"], None, None
			)
		)
		self.assertFalse(
			_row_matches_attr_filters(row, ["Working"], ["Low"], None, None)
		)
		self.assertTrue(
			_row_matches_attr_filters(row, None, None, "user@example.com", None)
		)
		self.assertTrue(
			_row_matches_attr_filters(
				row, None, None, ["user@example.com", "other@x.com"], None
			)
		)
		self.assertFalse(
			_row_matches_attr_filters(row, None, None, ["other@x.com"], None)
		)
		self.assertTrue(_row_matches_attr_filters(row, None, None, None, "alpha"))
		self.assertTrue(
			_row_matches_attr_filters(row, None, None, None, ["alpha", "gamma"])
		)
		self.assertFalse(
			_row_matches_attr_filters(row, None, None, None, ["gamma"])
		)
		self.assertFalse(_row_matches_attr_filters(row, None, None, None, "gamma"))

	def test_parse_multi_empty_is_no_filter(self):
		self.assertIsNone(_parse_multi(None))
		self.assertIsNone(_parse_multi(""))
		self.assertIsNone(_parse_multi([]))
		self.assertIsNone(_parse_multi("[]"))
		self.assertIsNone(_parse_multi([""]))
		self.assertIsNone(_parse_multi("null"))
		self.assertEqual(_parse_multi("Open"), ["Open"])
		self.assertEqual(_parse_multi(["Open", "Working"]), ["Open", "Working"])
		self.assertEqual(_parse_multi('["Open","Working"]'), ["Open", "Working"])

	def test_empty_multi_does_not_activate_attr_keep(self):
		self.assertFalse(_attr_filters_on([], [], None, None))
		self.assertFalse(_attr_filters_on("[]", None, None, None))
		self.assertFalse(_attr_filters_on(None, [""], None, None))
		self.assertFalse(_attr_filters_on(None, None, [], []))
		self.assertFalse(_attr_filters_on(None, None, "[]", None))
		self.assertTrue(_attr_filters_on(["Working"], None, None, None))
		self.assertTrue(_attr_filters_on(None, ["High"], None, None))
		self.assertTrue(_attr_filters_on(None, None, ["user@example.com"], None))
		self.assertTrue(_attr_filters_on(None, None, None, ["alpha"]))
