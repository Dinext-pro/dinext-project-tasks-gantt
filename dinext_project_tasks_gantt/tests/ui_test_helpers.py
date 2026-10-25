"""Dev-server fixtures for the critical-path Cypress scenario."""

from __future__ import annotations

import frappe
from frappe.tests.ui_test_helpers import whitelist_for_tests
from frappe.utils.password import update_password

PASSWORD = "Cypress-Critical-2026!"
USER = "cy.critical.path@example.com"
PROJECT_ID = "CY-CRITICAL-PATH"
PROJECT_NAME = "Cypress Critical Path"
HOLIDAY_LIST = "Cypress Critical Path Holidays"
PROJECT_TYPE = "Cypress Critical Path Type"
PAYMENT_SCHEME = "Cypress Critical Path Payment"
TASK_TYPE = "Cypress Critical Path Task"
FIXTURE_LINKS = (
	("Project Type", "project_type", PROJECT_TYPE),
	("Project Payment Scheme", "payment_scheme", PAYMENT_SCHEME),
	("Task Type", "name", TASK_TYPE),
)
SUBJECTS = {
	"tight_start": "Cypress critical start",
	"tight_end": "Cypress critical end",
	"slack": "Cypress critical slack",
}


def _company() -> str:
	company = frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw("Cypress critical path needs a Company")
	return company


def _ensure_links() -> None:
	for doctype, field, value in FIXTURE_LINKS:
		if not frappe.db.exists(doctype, {field: value}):
			frappe.get_doc({"doctype": doctype, field: value, "custom_title": value}).insert(
				ignore_permissions=True
			)


def _ensure_user() -> None:
	if frappe.db.exists("User", USER):
		user = frappe.get_doc("User", USER)
		user.language = "en"
		user.save(ignore_permissions=True)
	else:
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": USER,
				"first_name": "Cypress",
				"last_name": "Critical",
				"language": "en",
				"send_welcome_email": 0,
				"user_type": "System User",
			}
		)
		user.insert(ignore_permissions=True)
	for role in ("System Manager", "Dinext_Project_Manager", "Dinext_Projects_Admin"):
		if role not in set(frappe.get_roles(USER)):
			user.add_roles(role)
	update_password(USER, PASSWORD)


def _ensure_holiday_list() -> str:
	existing = frappe.db.get_value("Holiday List", {"holiday_list_name": HOLIDAY_LIST}, "name")
	if existing:
		return existing
	doc = frappe.get_doc(
		{
			"doctype": "Holiday List",
			"holiday_list_name": HOLIDAY_LIST,
			"from_date": "2026-01-01",
			"to_date": "2026-12-31",
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def _delete_tasks() -> None:
	names = frappe.get_all(
		"Task",
		filters={"subject": ["in", list(SUBJECTS.values())]},
		pluck="name",
	)
	for name in names:
		frappe.delete_doc("Task", name, force=True, ignore_permissions=True)


def _delete_projects() -> None:
	names = set(frappe.get_all("Project", filters={"project_name": PROJECT_NAME}, pluck="name"))
	if frappe.db.exists("Project", PROJECT_ID):
		names.add(PROJECT_ID)
	for name in names:
		frappe.delete_doc("Project", name, force=True, ignore_permissions=True)


def _task(project: str, subject: str, start: str, end: str, predecessor: str | None = None):
	doc = frappe.get_doc(
		{
			"doctype": "Task",
			"subject": subject,
			"project": project,
			"type": TASK_TYPE,
			"status": "Open",
			"is_group": 0,
			"is_milestone": 0,
			"exp_start_date": start,
			"exp_end_date": end,
		}
	)
	if predecessor:
		doc.append(
			"custom_relations",
			{
				"predecessor": predecessor,
				"type": "FS (Finish → Start)",
				"buffer_days": 0,
				"is_active": 1,
			},
		)
	doc.insert(ignore_permissions=True)
	return doc.name


@whitelist_for_tests
def seed_critical_path() -> dict:
	"""Three tasks: a tight FS pair and one task with float."""
	_ensure_user()
	_delete_tasks()
	_delete_projects()
	_ensure_links()
	holiday_list = _ensure_holiday_list()
	project = frappe.get_doc(
		{
			"doctype": "Project",
			"name": PROJECT_ID,
			"project_name": PROJECT_NAME,
			"company": _company(),
			"project_type": PROJECT_TYPE,
			"custom_payment_scheme": PAYMENT_SCHEME,
			"holiday_list": holiday_list,
		}
	)
	project.insert(ignore_permissions=True)
	start = _task(project.name, SUBJECTS["tight_start"], "2026-03-02", "2026-03-04")
	end = _task(
		project.name,
		SUBJECTS["tight_end"],
		"2026-03-04",
		"2026-03-06",
		predecessor=start,
	)
	slack = _task(project.name, SUBJECTS["slack"], "2026-03-02", "2026-03-03")
	frappe.db.commit()
	return {
		"user": USER,
		"password": PASSWORD,
		"project": project.name,
		"critical": [start, end],
		"slack": slack,
	}


@whitelist_for_tests
def cleanup_critical_path() -> dict:
	"""Delete the Cypress tasks, project, reference records, calendar and user."""
	_delete_tasks()
	_delete_projects()
	holiday = frappe.db.get_value("Holiday List", {"holiday_list_name": HOLIDAY_LIST}, "name")
	if holiday:
		frappe.delete_doc("Holiday List", holiday, force=True, ignore_permissions=True)
	for doctype, field, value in FIXTURE_LINKS:
		name = frappe.db.get_value(doctype, {field: value}, "name")
		if name:
			frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
	if frappe.db.exists("User", USER):
		frappe.delete_doc("User", USER, force=True, ignore_permissions=True)
	frappe.db.commit()
	return {"ok": True}
