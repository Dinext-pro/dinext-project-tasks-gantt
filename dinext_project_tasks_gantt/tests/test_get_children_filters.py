# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_data.acl import TaskTreeAcl
from dinext_project_tasks_gantt.task_tree_gantt.get_data.query import TaskTreeQuery
from dinext_project_tasks_gantt.task_tree_gantt.get_data.row import TaskRow


class TestGetChildrenAttrFilters(FrappeTestCase):
	def test_ids_with_ancestors_keeps_chain_not_unrelated_groups(self):
		parent = {"leaf": "mid", "mid": "root", "root": "", "other-group": ""}
		keep = TaskTreeAcl.ids_with_ancestors(parent, {"leaf"})
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
		keep = TaskTreeAcl.ids_with_ancestors(parent, {"X"})
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
		keep = TaskTreeAcl.ids_with_ancestors(parent, {"X", "Y"})
		self.assertEqual(keep, {"X", "Y", "mid", "other-mid", "root"})
		self.assertNotIn("sibling", keep)
		self.assertNotIn("unrelated", keep)

	def test_intersect_keep_sets_none_and_task(self):
		self.assertIsNone(TaskTreeAcl.intersect_keep_sets(None, None))
		self.assertEqual(TaskTreeAcl.intersect_keep_sets({"a", "b"}, None), {"a", "b"})
		self.assertEqual(TaskTreeAcl.intersect_keep_sets({"a", "b"}, {"b", "c"}), {"b"})
		self.assertEqual(TaskTreeAcl.intersect_keep_sets({"X", "mid"}, set()), set())

	def test_row_matches_status_and_assign(self):
		row = {
			"status": "Working",
			"priority": "High",
			"_assign": '["user@example.com"]',
			"_user_tags": ",alpha,beta",
		}
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(row, "Working", None, None, None)
		)
		self.assertFalse(
			TaskTreeQuery.row_matches_attr_filters(row, "Open", None, None, None)
		)
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(row, ["Open", "Working"], None, None, None)
		)
		self.assertFalse(
			TaskTreeQuery.row_matches_attr_filters(row, ["Open", "Completed"], None, None, None)
		)
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(
				row, ["Working"], ["High", "Medium"], None, None
			)
		)
		self.assertFalse(
			TaskTreeQuery.row_matches_attr_filters(row, ["Working"], ["Low"], None, None)
		)
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(row, None, None, "user@example.com", None)
		)
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(
				row, None, None, ["user@example.com", "other@x.com"], None
			)
		)
		self.assertFalse(
			TaskTreeQuery.row_matches_attr_filters(row, None, None, ["other@x.com"], None)
		)
		self.assertTrue(TaskTreeQuery.row_matches_attr_filters(row, None, None, None, "alpha"))
		self.assertTrue(
			TaskTreeQuery.row_matches_attr_filters(row, None, None, None, ["alpha", "gamma"])
		)
		self.assertFalse(
			TaskTreeQuery.row_matches_attr_filters(row, None, None, None, ["gamma"])
		)
		self.assertFalse(TaskTreeQuery.row_matches_attr_filters(row, None, None, None, "gamma"))

	def test_parse_multi_empty_is_no_filter(self):
		self.assertIsNone(TaskTreeQuery.parse_multi(None))
		self.assertIsNone(TaskTreeQuery.parse_multi(""))
		self.assertIsNone(TaskTreeQuery.parse_multi([]))
		self.assertIsNone(TaskTreeQuery.parse_multi("[]"))
		self.assertIsNone(TaskTreeQuery.parse_multi([""]))
		self.assertIsNone(TaskTreeQuery.parse_multi("null"))
		self.assertEqual(TaskTreeQuery.parse_multi("Open"), ["Open"])
		self.assertEqual(TaskTreeQuery.parse_multi(["Open", "Working"]), ["Open", "Working"])
		self.assertEqual(TaskTreeQuery.parse_multi('["Open","Working"]'), ["Open", "Working"])

	def test_empty_multi_does_not_activate_attr_keep(self):
		self.assertFalse(TaskTreeQuery.attr_filters_on([], [], None, None))
		self.assertFalse(TaskTreeQuery.attr_filters_on("[]", None, None, None))
		self.assertFalse(TaskTreeQuery.attr_filters_on(None, [""], None, None))
		self.assertFalse(TaskTreeQuery.attr_filters_on(None, None, [], []))
		self.assertFalse(TaskTreeQuery.attr_filters_on(None, None, "[]", None))
		self.assertTrue(TaskTreeQuery.attr_filters_on(["Working"], None, None, None))
		self.assertTrue(TaskTreeQuery.attr_filters_on(None, ["High"], None, None))
		self.assertTrue(TaskTreeQuery.attr_filters_on(None, None, ["user@example.com"], None))
		self.assertTrue(TaskTreeQuery.attr_filters_on(None, None, None, ["alpha"]))

	def test_visible_keeps_unreadable_ancestors_not_unrelated(self):
		parent = {
			"leaf": "mid",
			"mid": "root",
			"root": "",
			"other-group": "",
			"other-leaf": "other-group",
		}
		readable = {"leaf"}
		visible = TaskTreeAcl.visible_task_ids(readable, parent)
		self.assertEqual(visible, {"leaf", "mid", "root"})
		self.assertNotIn("other-group", visible)
		self.assertNotIn("other-leaf", visible)
		stubs = visible - readable
		self.assertEqual(stubs, {"mid", "root"})

	def test_visible_empty_when_nothing_readable(self):
		parent = {"leaf": "mid", "mid": ""}
		self.assertEqual(TaskTreeAcl.visible_task_ids(set(), parent), set())

	def test_task_filter_match_only_readable_still_keeps_stub_ancestors(self):
		parent = {
			"X": "mid",
			"mid": "root",
			"root": "",
			"secret": "root",
		}
		readable = {"X"}
		# Unreadable "secret" selected in the page filter must not enter keep.
		match = {name for name in ["X", "secret"] if name in readable}
		keep = TaskTreeAcl.ids_with_ancestors(parent, match)
		self.assertEqual(keep, {"X", "mid", "root"})
		self.assertNotIn("secret", keep)

	def test_strip_stub_keeps_tree_keys_clears_content(self):
		row = {
			"id": "mid",
			"subject": "secret subject",
			"status": "Open",
			"exp_start_date": "2026-09-01",
			"assign": ["u@x.com"],
			"relations": [{"predecessor": "X"}],
			"parent_task": "root",
			"has_children": True,
			"can_read": 0,
			"can_write": 0,
			"custom_tree_order": 10,
			"owner": "Administrator",
		}
		TaskRow.apply_field_read_strip([row], {"subject", "status", "_assign"})
		self.assertEqual(row["id"], "mid")
		self.assertEqual(row["parent_task"], "root")
		self.assertTrue(row["has_children"])
		self.assertEqual(row["can_read"], 0)
		self.assertEqual(row["custom_tree_order"], 10)
		self.assertEqual(row["subject"], "")
		self.assertIsNone(row["status"])
		self.assertIsNone(row["exp_start_date"])
		self.assertEqual(row["assign"], [])
		self.assertEqual(row["relations"], [])
		self.assertIsNone(row["owner"])
		self.assertTrue(TaskRow.STUB_KEEP_KEYS <= set(row))

	def test_strip_readable_nulls_fields_not_in_permitted(self):
		row = {
			"id": "leaf",
			"subject": "ok",
			"status": "Open",
			"exp_start_date": "2026-09-01",
			"assign": ["u@x.com"],
			"can_read": 1,
			"can_write": 1,
			"parent_task": None,
		}
		TaskRow.apply_field_read_strip([row], {"subject", "status"})
		self.assertEqual(row["subject"], "ok")
		self.assertEqual(row["status"], "Open")
		self.assertIsNone(row["exp_start_date"])
		self.assertEqual(row["assign"], [])

	def test_aliases_are_true_mismatches_only(self):
		self.assertEqual(
			TaskRow.ALIASES,
			{
				"id": "name",
				"task_type": "type",
				"task_type_label": "type",
				"assign": "_assign",
				"assign_pwa": "_assign",
				"assign_todo_only": "_assign",
				"user_tags": "_user_tags",
				"relations": "custom_relations",
			},
		)
		for api_key, fieldname in TaskRow.ALIASES.items():
			self.assertNotEqual(api_key, fieldname)
		for field in TaskRow.COPY_FIELDS:
			self.assertNotIn(field, TaskRow.ALIASES)

	def test_from_task_copies_matching_fields_and_applies_aliases(self):
		row = TaskRow.from_task(
			{
				"name": "TASK-1",
				"subject": "Hello",
				"is_group": 1,
				"type": "Issue",
				"_assign": '["a@x.com"]',
				"_user_tags": ",alpha",
				"status": "Open",
				"progress": None,
				"custom_include": 1,
				"parent_task": "ROOT",
			}
		)
		self.assertEqual(row["id"], "TASK-1")
		self.assertEqual(row["subject"], "Hello")
		self.assertEqual(row["status"], "Open")
		self.assertTrue(row["has_children"])
		self.assertEqual(row["task_type"], "Issue")
		self.assertEqual(row["task_type_label"], "")
		self.assertEqual(row["assign"], ["a@x.com"])
		self.assertEqual(row["assign_pwa"], [])
		self.assertEqual(row["assign_todo_only"], [])
		self.assertEqual(row["user_tags"], ",alpha")
		self.assertEqual(row["relations"], [])
		self.assertEqual(row["progress"], 0)
		self.assertEqual(row["custom_include"], 1)
		self.assertEqual(row["parent_task"], "ROOT")

	def test_permitted_includes_optional_assign_and_relations(self):
		permitted = TaskRow.permitted_fieldnames()
		self.assertIn("_assign", permitted)
		self.assertIn("custom_relations", permitted)

	def test_strip_uses_alias_fieldnames(self):
		row = {
			"id": "leaf",
			"task_type": "Issue",
			"task_type_label": "Bug",
			"subject": "ok",
			"assign": ["u@x.com"],
			"assign_pwa": ["u@x.com"],
			"assign_todo_only": [],
			"relations": [{"predecessor": "X"}],
			"can_read": 1,
		}
		TaskRow.apply_field_read_strip([row], {"subject"})
		self.assertEqual(row["subject"], "ok")
		self.assertIsNone(row["task_type"])
		self.assertEqual(row["task_type_label"], "")
		self.assertEqual(row["assign"], [])
		self.assertEqual(row["assign_pwa"], [])
		self.assertEqual(row["relations"], [])
