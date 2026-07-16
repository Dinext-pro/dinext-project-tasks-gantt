# Copyright (c) 2026, Dinext and contributors
# Temporary one-shot: disable Tree CS + get_children SS for cutover.
# Run: bench --site dev.dinext.localhost execute dinext_project_tasks_gantt.cutover_ops.disable_tree_scripts

import frappe


CS_NAMES = [
	"Tree Plan-Fact Data_V2",
	"Tree Plan-Fact Data_V3",
	"Task Tree Layout V2",
	"Task_TreeView_Style_V3",
	"Task_TreeView_Style_V4",
	"Task_Custom_TreeVIew_V6",
	"Task Tree Gantt V2",
	"Task Tree Dependencies",
]

SS_NAMES = [
	"Task Get Tree Nodes_V6",
]


def disable_tree_scripts():
	updated = []
	for name in CS_NAMES:
		if frappe.db.exists("Client Script", name):
			frappe.db.set_value("Client Script", name, "enabled", 0)
			updated.append(f"CS:{name}")
	for name in SS_NAMES:
		if frappe.db.exists("Server Script", name):
			frappe.db.set_value("Server Script", name, "disabled", 1)
			updated.append(f"SS:{name}")
	for name in frappe.get_all(
		"Server Script",
		filters={"api_method": "custom_task_get_children"},
		pluck="name",
	):
		frappe.db.set_value("Server Script", name, "disabled", 1)
		key = f"SS:{name}"
		if key not in updated:
			updated.append(key)
	frappe.db.commit()
	frappe.clear_cache()
	return updated


def enable_tree_scripts():
	"""Rollback helper: re-enable legacy Tree CS + get_children SS."""
	updated = []
	for name in CS_NAMES:
		if frappe.db.exists("Client Script", name):
			frappe.db.set_value("Client Script", name, "enabled", 1)
			updated.append(f"CS:{name}")
	for name in SS_NAMES:
		if frappe.db.exists("Server Script", name):
			frappe.db.set_value("Server Script", name, "disabled", 0)
			updated.append(f"SS:{name}")
	for name in frappe.get_all(
		"Server Script",
		filters={"api_method": "custom_task_get_children"},
		pluck="name",
	):
		frappe.db.set_value("Server Script", name, "disabled", 0)
		key = f"SS:{name}"
		if key not in updated:
			updated.append(key)
	frappe.db.commit()
	frappe.clear_cache()
	return updated
