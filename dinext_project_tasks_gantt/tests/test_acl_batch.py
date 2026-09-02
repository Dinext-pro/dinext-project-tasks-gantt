from contextlib import contextmanager
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from dinext_project_tasks_gantt.task_tree_gantt.get_data.acl import TaskTreeAcl
from dinext_project_tasks_gantt.task_tree_gantt.get_data.query import TaskTreeQuery


class TestTaskTreeAclBatch(FrappeTestCase):
	@contextmanager
	def as_user(self, user):
		original_user = frappe.session.user
		frappe.set_user(user)
		try:
			yield
		finally:
			frappe.set_user(original_user)

	def test_if_owner_only_edits_owned_task(self):
		rows = [
			{"id": "OWN", "owner": "Administrator"},
			{"id": "OTHER", "owner": "Administrator"},
		]

		def role_permissions(_meta, user=None, is_owner=None):
			return frappe._dict(
				has_if_owner_enabled=True,
				read=1,
				write=0,
				if_owner={"read": int(is_owner), "write": int(is_owner)},
			)

		with self.as_user("user@example.com"):
			with (
				patch.object(TaskTreeAcl, "_supports_batch_edit_check", return_value=True),
				patch.object(TaskTreeAcl, "_shared_rights", return_value={}),
				patch.object(
					frappe.permissions,
					"get_role_permissions",
					side_effect=role_permissions,
				),
			):
				editable = TaskTreeAcl.editable_task_ids(rows, {"OWN", "OTHER"})

		self.assertEqual(editable, {"OWN"})

	def test_docshare_adds_missing_read_and_write(self):
		rows = [{"id": "SHARED", "owner": "Administrator"}]
		role_permissions = frappe._dict(
			has_if_owner_enabled=False, read=0, write=0, if_owner={}
		)
		with self.as_user("user@example.com"):
			with (
				patch.object(TaskTreeAcl, "_supports_batch_edit_check", return_value=True),
				patch.object(
					TaskTreeAcl,
					"_shared_rights",
					return_value={"SHARED": {"read", "write"}},
				),
				patch.object(
					frappe.permissions,
					"get_role_permissions",
					return_value=role_permissions,
				),
			):
				editable = TaskTreeAcl.editable_task_ids(rows, {"SHARED"})

		self.assertEqual(editable, {"SHARED"})

	def test_relevant_user_permission_uses_exact_fallback(self):
		rows = [
			{"id": "YES", "owner": "Administrator"},
			{"id": "NO", "owner": "Administrator"},
		]
		with self.as_user("user@example.com"):
			with (
				patch.object(TaskTreeAcl, "_supports_batch_edit_check", return_value=False),
				patch.object(
					TaskTreeAcl,
					"doc_can_edit",
					side_effect=lambda task_id: task_id == "YES",
				) as exact,
			):
				editable = TaskTreeAcl.editable_task_ids(rows, {"YES", "NO"})

		self.assertEqual(editable, {"YES"})
		self.assertEqual(exact.call_count, 2)

	def test_mark_access_computes_batch_once(self):
		rows = [
			{"id": "YES", "has_children": False},
			{"id": "NO", "has_children": False},
			{"id": "STUB", "has_children": False},
		]
		with (
			patch.object(TaskTreeAcl, "editable_task_ids", return_value={"YES"}) as batch,
			patch.object(TaskTreeAcl, "role_can_read", return_value=True),
		):
			TaskTreeAcl.mark_access(rows, {"YES", "NO"})

		batch.assert_called_once_with(rows, {"YES", "NO"})
		self.assertEqual(rows[0]["can_write"], 1)
		self.assertEqual(rows[1]["can_write"], 0)
		self.assertEqual(rows[2]["can_read"], 0)
		self.assertEqual(rows[2]["can_write"], 0)
		self.assertTrue(rows[2]["has_children"])

	def test_invalid_nested_set_uses_full_project_fallback(self):
		full_map = {"PARENT": "", "CHILD": "PARENT"}
		with (
			patch(
				"frappe.db.get_value",
				return_value=frappe._dict(lft=None, rgt=None),
			),
			patch.object(TaskTreeAcl, "task_parent_map", return_value=full_map) as fallback,
		):
			parent_map, bounds = TaskTreeAcl.task_descendant_scope(
				"PROJECT", "PARENT"
			)

		self.assertEqual(parent_map, full_map)
		self.assertIsNone(bounds)
		fallback.assert_called_once_with("PROJECT")

	def test_incomplete_nested_set_scope_uses_full_project_fallback(self):
		full_map = {
			"PARENT": "",
			"CHILD": "PARENT",
			"GRANDCHILD": "CHILD",
		}
		with (
			patch(
				"frappe.db.get_value",
				return_value=frappe._dict(lft=1, rgt=6),
			),
			patch(
				"frappe.get_all",
				return_value=[frappe._dict(name="CHILD", parent_task="PARENT")],
			),
			patch.object(TaskTreeAcl, "task_parent_map", return_value=full_map),
		):
			parent_map, bounds = TaskTreeAcl.task_descendant_scope(
				"PROJECT", "PARENT"
			)

		self.assertEqual(parent_map, full_map)
		self.assertIsNone(bounds)

	def test_broken_nested_set_parent_chain_uses_full_project_fallback(self):
		full_map = {
			"PARENT": "",
			"CHILD": "PARENT",
			"GRANDCHILD": "CHILD",
		}
		scoped_rows = [
			frappe._dict(
				name="CHILD", parent_task="PARENT", lft=2, rgt=3
			),
			frappe._dict(
				name="FOREIGN", parent_task="OTHER", lft=4, rgt=5
			),
		]
		with (
			patch(
				"frappe.db.get_value",
				return_value=frappe._dict(lft=1, rgt=6),
			),
			patch("frappe.get_all", return_value=scoped_rows),
			patch.object(TaskTreeAcl, "task_parent_map", return_value=full_map),
		):
			parent_map, bounds = TaskTreeAcl.task_descendant_scope(
				"PROJECT", "PARENT"
			)

		self.assertEqual(parent_map, full_map)
		self.assertIsNone(bounds)

	def test_fast_batch_matches_frappe_for_live_tasks(self):
		original_user = frappe.session.user
		task_rows = frappe.get_all(
			"Task",
			filters={"docstatus": ("<", 2)},
			fields=["name as id", "owner"],
			limit_page_length=20,
		)
		if not task_rows:
			self.skipTest("No live Task rows")

		users = frappe.get_all(
			"Has Role",
			filters={"role": ("in", ["Projects User", "Dinext_User"])},
			pluck="parent",
			distinct=True,
			limit_page_length=20,
		)
		try:
			for user in users:
				if not TaskTreeAcl._supports_batch_edit_check(user):
					continue
				frappe.set_user(user)
				task_ids = [row["id"] for row in task_rows]
				try:
					readable = set(
						frappe.get_list(
							"Task",
							filters={"name": ("in", task_ids)},
							pluck="name",
							limit_page_length=0,
						)
					)
				except frappe.PermissionError:
					continue
				actual = {
					task_id
					for task_id in readable
					if TaskTreeAcl.doc_can_edit(task_id)
				}
				batched = TaskTreeAcl.editable_task_ids(task_rows, readable)
				self.assertEqual(batched, actual, user)
				return
		finally:
			frappe.set_user(original_user)
		self.skipTest("No user eligible for fast batch parity check")

	def test_descendant_scope_matches_full_project_visibility(self):
		original_user = frappe.session.user
		parents = frappe.get_all(
			"Task",
			filters={
				"docstatus": ("<", 2),
				"is_group": 1,
				"lft": ("is", "set"),
				"rgt": ("is", "set"),
			},
			fields=["name", "project", "lft", "rgt"],
			limit_page_length=100,
		)
		if not parents:
			self.skipTest("No live Task group")

		parent = max(parents, key=lambda row: (row.rgt or 0) - (row.lft or 0))
		if not parent.project:
			self.skipTest("No live Task group with project")
		full_map = TaskTreeAcl.task_parent_map(parent.project)
		direct_ids = {
			name for name, parent_name in full_map.items() if parent_name == parent.name
		}
		if not direct_ids:
			self.skipTest("No live Task group with children")

		scoped_map, bounds = TaskTreeAcl.task_descendant_scope(
			parent.project, parent.name
		)
		self.assertIsNotNone(bounds)
		self.assertEqual(
			{
				name
				for name, parent_name in scoped_map.items()
				if parent_name == parent.name
			},
			direct_ids,
		)
		frappe.set_user("Administrator")
		actual_ids = {
			row["id"]
			for row in TaskTreeQuery.run(
				project=parent.project, parent_task=parent.name
			)
		}
		self.assertEqual(
			actual_ids,
			direct_ids,
		)

		users = ["Administrator"]
		users.extend(
			frappe.get_all(
				"Has Role",
				filters={"role": ("in", ["Projects User", "Dinext_User"])},
				pluck="parent",
				distinct=True,
				limit_page_length=5,
			)
		)
		try:
			for user in dict.fromkeys(users):
				frappe.set_user(user)
				if not TaskTreeAcl.role_can_read():
					continue
				try:
					full_readable = TaskTreeAcl.readable_task_ids(parent.project)
					scoped_readable = TaskTreeAcl.readable_task_ids(
						parent.project, bounds
					)
				except frappe.PermissionError:
					continue
				full_visible = TaskTreeAcl.visible_task_ids(full_readable, full_map)
				scoped_visible = TaskTreeAcl.visible_task_ids(
					scoped_readable, scoped_map
				)
				self.assertEqual(
					full_visible.intersection(direct_ids),
					scoped_visible.intersection(direct_ids),
					user,
				)
		finally:
			frappe.set_user(original_user)
