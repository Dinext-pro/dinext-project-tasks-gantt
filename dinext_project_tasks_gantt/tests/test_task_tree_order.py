# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Unit tests for reorder_siblings append_only (sort-locked reparent)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt import task_tree_order as mod


class TestReorderAppendOnly(FrappeTestCase):
	def test_append_only_reparent_skips_sibling_rewrite(self):
		meta = MagicMock()
		meta.has_field.return_value = True

		def get_value(_dt, _name, field):
			if field == "parent_task":
				return "OLD"
			if field == "project":
				return "PROJ"
			return None

		with (
			patch.object(frappe, "has_permission", return_value=True),
			patch.object(frappe, "get_meta", return_value=meta),
			patch.object(frappe.db, "get_value", side_effect=get_value),
			patch.object(frappe.db, "set_value") as set_value,
			patch.object(mod, "next_tree_order", return_value=40) as next_order,
			patch.object(mod, "_reparent_task") as reparent,
			patch.object(mod, "_apply_sibling_order") as apply_order,
			patch.object(mod, "collect_date_side_effect_rows", return_value=[]),
		):
			out = mod.reorder_siblings(
				task="T1",
				parent_task="NEW",
				ordered_ids=["A", "T1", "B"],
				from_ordered_ids=["X"],
				append_only=1,
			)

		reparent.assert_called_once_with("T1", "NEW")
		next_order.assert_called_once_with("PROJ", "NEW")
		set_value.assert_called_once_with(
			"Task", "T1", mod.ORDER_FIELD, 40, update_modified=False
		)
		apply_order.assert_not_called()
		self.assertEqual(out["reparented"], 1)
		self.assertEqual(out["updated"], 1)
		self.assertEqual(out["parent_task"], "NEW")

	def test_append_only_same_parent_rejected(self):
		meta = MagicMock()
		meta.has_field.return_value = True

		with (
			patch.object(frappe, "has_permission", return_value=True),
			patch.object(frappe, "get_meta", return_value=meta),
			patch.object(frappe.db, "get_value", return_value="P1"),
			patch.object(mod, "_apply_sibling_order") as apply_order,
			patch.object(mod, "_reparent_task") as reparent,
		):
			with self.assertRaises(frappe.ValidationError):
				mod.reorder_siblings(
					task="T1",
					parent_task="P1",
					ordered_ids=["T1", "T2"],
					append_only=1,
				)

		reparent.assert_not_called()
		apply_order.assert_not_called()
