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
		"label": "Task Burndown",
		"description": "Burndown chart for project task progress.",
		"icon": "chart",
	},
)

HUB_SECTIONS = ({"section": "Project Management", "list_limit": 8, "card_columns": 4},)

HUB_DOCTYPE_ITEMS = ()  # Existing saved rows are retained; no new default contribution.


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
