# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Install / migrate hooks for Dinext Project Tasks Gantt."""

from __future__ import annotations


def after_install() -> None:
	from dinext_project_tasks_gantt.setup.dinext_hub import register_dinext_hub_items

	register_dinext_hub_items()


def after_migrate() -> None:
	from dinext_project_tasks_gantt.setup.dinext_hub import register_dinext_hub_items

	register_dinext_hub_items()
