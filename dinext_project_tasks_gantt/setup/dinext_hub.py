# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Register this app's default Dinext Hub cards and DocType lists."""

from __future__ import annotations

import frappe

APP_NAME = "dinext_project_tasks_gantt"

HUB_ITEMS = (
	{
		"section": "Project Management",
		"element_type": "Report",
		"target": "Task Epic Burndown",
		"label": "Task Epic Burndown",
		"description": "Burndown chart for epic and project task progress.",
		"icon": "chart",
	},
)

HUB_SECTIONS = ({"section": "Project Management", "list_limit": 8},)

HUB_DOCTYPE_ITEMS = (
	{
		"section": "Project Management",
		"document_type": "Task",
		"show_quick_create": 0,
		"show_recently_opened": 1,
		"show_assigned": 1,
		"show_liked": 0,
		"show_attention": 1,
		"attention_filter": [
			["Task", "status", "=", "Overdue", False],
			["Task", "type", "!=", "Issue", False],
		],
	},
)


def register_dinext_hub_items() -> None:
	if "dinext_common" not in frappe.get_installed_apps():
		return

	try:
		from dinext_common.setup.hub_catalog import (
			register_hub_doctype_items,
			register_hub_items,
			register_hub_sections,
		)
	except ImportError:
		return

	register_hub_items(HUB_ITEMS, source_app=APP_NAME)
	register_hub_sections(HUB_SECTIONS, source_app=APP_NAME)
	register_hub_doctype_items(HUB_DOCTYPE_ITEMS, source_app=APP_NAME)
