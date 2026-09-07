# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Install helpers for dinext_project_tasks_gantt."""

from __future__ import annotations

import frappe

OWNED_PROJECT_TEAM_FIELDS = (
	"pt_allow_pss",
)


def detach_owned_project_team_fields() -> None:
	"""Detach DocFields re-owned as Custom Fields before fixture sync.

	CI still pins dinext_projects releases that define these as DocFields.
	`after_install` runs before sync_fixtures, so delete_fields makes install idempotent.
	"""
	from frappe.model import delete_fields

	delete_fields({"Project Team Details": list(OWNED_PROJECT_TEAM_FIELDS)}, delete=0)
	frappe.clear_cache(doctype="Project Team Details")


def after_install() -> None:
	detach_owned_project_team_fields()
	from dinext_project_tasks_gantt.setup.dinext_hub import register_dinext_hub_items

	register_dinext_hub_items()


def report_form_contract_lint() -> list[str]:
	"""Log Task depends_on-family findings the tree cannot honour. Never raises.

	Manual run: `bench --site <site> execute dinext_project_tasks_gantt.install.report_form_contract_lint`
	"""
	from dinext_project_tasks_gantt.form_contract import lint_messages

	try:
		messages = lint_messages("Task")
	except Exception:
		frappe.log_error(title="Task form contract lint failed")
		return []
	logger = frappe.logger("dinext_project_tasks_gantt")
	for message in messages:
		logger.warning(message)
		print(f"[form-contract] {message}")
	return messages


def after_migrate() -> None:
	from dinext_project_tasks_gantt.setup.dinext_hub import register_dinext_hub_items

	register_dinext_hub_items()
	report_form_contract_lint()
