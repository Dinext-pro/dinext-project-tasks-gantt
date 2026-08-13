from __future__ import annotations

import frappe


ISSUE_CODE = "ISS-2026-03288"
SCENARIO_SLUG = "iss_2026_03288_task_dates_virtual"
NAME_PREFIX = "TEST ISS-2026-03288-G"
BUSINESS_USER = "test.iss-2026-03288-g@example.com"
BUSINESS_USER_FULL_NAME = "Test ISS 2026 03288 Gantt"
WORKER_NAME = f"{NAME_PREFIX} WORKER"
PROJECT_NAME = f"{NAME_PREFIX} PROJECT"
PROJECT_ROLE_NAME = f"{NAME_PREFIX} ROLE"
ISSUE_TYPE_NAME = f"{NAME_PREFIX} ISSUE TYPE"
REGULAR_PARENT_SUBJECT = f"{NAME_PREFIX} REGULAR PARENT"
REGULAR_TASK_SUBJECT = f"{NAME_PREFIX} REGULAR TASK"
VIRTUAL_PARENT_SUBJECT = f"{NAME_PREFIX} VIRTUAL PARENT"
ISSUE_SUBJECT = f"{NAME_PREFIX} VIRTUAL ISSUE"
HIERARCHY_GRAND_SUBJECT = f"{NAME_PREFIX} HIERARCHY GRAND"
HIERARCHY_PARENT_SUBJECT = f"{NAME_PREFIX} HIERARCHY PARENT"
HIERARCHY_LEAF_SUBJECT = f"{NAME_PREFIX} HIERARCHY LEAF"
TIMESHEET_VALID_FROM = "2026-04-07"
TIMESHEET_VALID_FOR = "2026-04-13"
REGULAR_PARENT_EXP_START = "2026-04-09"
REGULAR_PARENT_EXP_END = "2026-04-11"
REGULAR_TASK_EXP_START = "2026-04-09"
REGULAR_TASK_EXP_END = "2026-04-11"
INSIDE_PLAN_FACT_ROWS = (
    ("2026-04-09", 3),
    ("2026-04-10", 2),
)
EARLY_START_FACT_ROWS = (
    ("2026-04-08", 3),
    ("2026-04-10", 2),
)
LATE_END_FACT_ROWS = (
    ("2026-04-10", 3),
    ("2026-04-12", 2),
)
WIDE_FACT_ROWS = (
    ("2026-04-08", 3),
    ("2026-04-12", 2),
)
NARROW_FACT_ROWS = (
    ("2026-04-10", 5),
)
SECOND_AGGREGATE_FACT_ROWS = (
    ("2026-04-07", 2),
    ("2026-04-11", 1),
)
SAME_RANGE_FACT_ROWS = (
    ("2026-04-08", 1),
    ("2026-04-12", 1),
)
BLOCKER_ROWS = (
    ("2026-04-09", 0),
)
PWA_INITIAL_FROM = "2026-04-01"
PWA_INITIAL_TO = "2026-04-02"
DEFAULT_WORKLOAD = "В рабочих часах"
DEFAULT_WORKLOAD_VALUE = 8
COMPLETED_TASK_ACT_START = "2026-04-07"
COMPLETED_TASK_ACT_END = "2026-04-18"
COMPLETED_TASK_OLD_COMPLETED_ON = "2026-04-15"
VIRTUAL_PARENT_EXP_START = "2026-04-08"
VIRTUAL_PARENT_EXP_END = "2026-04-20"
ISSUE_OPENING_DATE = "2026-04-09"
ISSUE_EXPECTED_RESOLUTION_DATE = "2026-04-14"
VIRTUAL_TASK_ACT_START = "2026-04-08"
VIRTUAL_TASK_ACT_END = "2026-04-18"
ISSUE_CLOSED_RESOLUTION_DATE = "2026-04-17"
# ISS-2026-03288: logic in app hooks, not Server Script.
# Names kept only as comments for mapping to the old 02606 scenario.


def get_default_company() -> str:
    company = frappe.defaults.get_global_default("company")
    if company:
        return company

    companies = frappe.get_all("Company", pluck="name", limit=1)
    if companies:
        return companies[0]

    frappe.throw("Не удалось определить Company для тестового сценария ISS-2026-03288")


def get_default_project_type_name() -> str:
    for candidate in ("Внутренний", "Internal", "Коммерческий", "External"):
        if frappe.db.exists("Project Type", candidate):
            return candidate

    project_types = frappe.get_all("Project Type", pluck="name", limit=1)
    if project_types:
        return project_types[0]

    frappe.throw("Не найден Project Type для тестового сценария ISS-2026-03288")


def get_default_project_payment_scheme_name() -> str:
    for candidate in ("Неоплачиваемый", "Время и затраты (T&M)", "Фикс. стоимость"):
        if frappe.db.exists("Project Payment Scheme", candidate):
            return candidate

    payment_schemes = frappe.get_all("Project Payment Scheme", pluck="name", limit=1)
    if payment_schemes:
        return payment_schemes[0]

    frappe.throw("Не найден Project Payment Scheme для тестового сценария ISS-2026-03288")


def get_default_task_type_name() -> str:
    for candidate in ("Stage", "Task"):
        if frappe.db.exists("Task Type", candidate):
            return candidate

    task_types = frappe.get_all("Task Type", filters={"name": ["!=", "Issue"]}, pluck="name", limit=1)
    if task_types:
        return task_types[0]

    frappe.throw("Не найден Task Type для тестового сценария ISS-2026-03288")


def _apply_project_required_fields(project) -> None:
    project.company = get_default_company()
    if not project.project_type:
        project.project_type = get_default_project_type_name()
    if not project.custom_payment_scheme:
        project.custom_payment_scheme = get_default_project_payment_scheme_name()


def get_holiday_list_name() -> str:
    holiday_list = frappe.db.get_value(
        "Holiday List",
        {
            "from_date": ("<=", TIMESHEET_VALID_FROM),
            "to_date": (">=", TIMESHEET_VALID_FOR),
        },
        "name",
    )
    if holiday_list:
        return holiday_list

    holiday_lists = frappe.get_all("Holiday List", pluck="name", limit=1)
    if holiday_lists:
        return holiday_lists[0]

    frappe.throw("Не найден Holiday List для тестового сценария ISS-2026-03288")


def get_timesheet_template_name() -> str:
    template_name = frappe.db.get_value("Timesheet Template", {}, "name")
    if template_name:
        return template_name

    frappe.throw("Не найден Timesheet Template для тестового сценария ISS-2026-03288")


def ensure_business_user() -> str:
    if frappe.db.exists("User", BUSINESS_USER):
        user = frappe.get_doc("User", BUSINESS_USER)
        user.first_name = BUSINESS_USER_FULL_NAME
        user.enabled = 1
        user.save(ignore_permissions=True)
        return user.name

    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": BUSINESS_USER,
            "first_name": BUSINESS_USER_FULL_NAME,
            "enabled": 1,
            "send_welcome_email": 0,
            "user_type": "System User",
        }
    )
    user.insert(ignore_permissions=True)
    return user.name


def ensure_worker(user_id: str) -> str:
    holiday_list_name = get_holiday_list_name()
    template_name = get_timesheet_template_name()
    existing_name = frappe.db.get_value("Worker", {"wuser": user_id}, "name")

    if existing_name:
        worker = frappe.get_doc("Worker", existing_name)
        worker.wuser = user_id
        worker.wholiday_list = holiday_list_name
        worker.wtimesheet_template = template_name
        worker.flags.ignore_mandatory = True
        worker.save(ignore_permissions=True, ignore_version=True)
        return worker.name

    worker = frappe.get_doc(
        {
            "doctype": "Worker",
            "name": WORKER_NAME,
            "wuser": user_id,
            "wholiday_list": holiday_list_name,
            "wtimesheet_template": template_name,
        }
    )
    worker.insert(ignore_permissions=True, ignore_mandatory=True)
    return worker.name


def ensure_project_role() -> str:
    existing_name = frappe.db.get_value("Project Role", {"role_name": PROJECT_ROLE_NAME}, "name")
    if existing_name:
        return existing_name

    role = frappe.get_doc(
        {
            "doctype": "Project Role",
            "role_name": PROJECT_ROLE_NAME,
        }
    )
    role.insert(ignore_permissions=True)
    return role.name


def _save_without_test_side_effects(doc) -> None:
    old_in_test = getattr(frappe.flags, "in_test", False)
    try:
        frappe.flags.in_test = False
        doc.save(ignore_permissions=True, ignore_version=True)
    finally:
        frappe.flags.in_test = old_in_test


def ensure_issue_type() -> str:
    if frappe.db.exists("Issue Type", ISSUE_TYPE_NAME):
        return ISSUE_TYPE_NAME

    issue_type = frappe.new_doc("Issue Type")
    issue_type.name = ISSUE_TYPE_NAME
    issue_type.insert(ignore_permissions=True)
    return issue_type.name


def ensure_project() -> str:
    existing_name = frappe.db.get_value("Project", {"project_name": PROJECT_NAME}, "name")
    if existing_name:
        project = frappe.get_doc("Project", existing_name)
        project.status = "Open"
        project.is_active = "Yes"
        _apply_project_required_fields(project)
        _save_without_test_side_effects(project)
        return project.name

    project = frappe.get_doc(
        {
            "doctype": "Project",
            "name": PROJECT_NAME,
            "project_name": PROJECT_NAME,
            "status": "Open",
            "is_active": "Yes",
            "company": get_default_company(),
            "project_type": get_default_project_type_name(),
            "custom_payment_scheme": get_default_project_payment_scheme_name(),
        }
    )
    old_in_test = getattr(frappe.flags, "in_test", False)
    try:
        frappe.flags.in_test = False
        project.insert(ignore_permissions=True)
    finally:
        frappe.flags.in_test = old_in_test
    return project.name


def ensure_project_issue_setting(project_name: str, issue_type_name: str, parent_task_name: str) -> None:
    project = frappe.get_doc("Project", project_name)

    for row in project.get("custom_issue_setting", []):
        if row.issue_type == issue_type_name:
            row.enable_virtual_task = 1
            row.parent_task = parent_task_name
            _save_without_test_side_effects(project)
            return

    project.append(
        "custom_issue_setting",
        {
            "issue_type": issue_type_name,
            "enable_virtual_task": 1,
            "parent_task": parent_task_name,
        },
    )
    _save_without_test_side_effects(project)


def ensure_task(
    *,
    subject: str,
    project_name: str,
    parent_task: str | None = None,
    issue: str | None = None,
    is_group: bool = False,
    use_db_insert: bool = False,
    status: str = "Open",
    exp_start_date: str | None = None,
    exp_end_date: str | None = None,
    act_start_date: str | None = None,
    act_end_date: str | None = None,
    completed_on: str | None = None,
    task_type: str | None = None,
    custom_linked_issue: str | None = None,
) -> str:
    filters = {"project": project_name, "subject": subject}
    if custom_linked_issue:
        filters = {"custom_linked_issue": custom_linked_issue}

    existing_name = frappe.db.get_value("Task", filters, "name")
    if existing_name:
        task = frappe.get_doc("Task", existing_name)
    else:
        task = frappe.new_doc("Task")
        task.subject = subject
        task.project = project_name

    task.subject = subject
    task.project = project_name
    task.status = status
    task.parent_task = parent_task
    task.issue = issue
    task.is_group = 1 if is_group else 0
    task.exp_start_date = exp_start_date
    task.exp_end_date = exp_end_date
    task.act_start_date = act_start_date
    task.act_end_date = act_end_date
    task.completed_on = completed_on
    task.custom_include = 1

    if task_type:
        task.set("type", task_type)
    else:
        current_type = (task.get("type") or "").strip()
        if not current_type:
            current_type = get_default_task_type_name()
        task.set("type", current_type)
    if custom_linked_issue:
        task.custom_linked_issue = custom_linked_issue

    if existing_name:
        task.save(ignore_permissions=True)
    else:
        if use_db_insert:
            task.flags.ignore_permissions = True
            task._set_defaults()
            task.set_user_and_timestamp()
            task.set_docstatus()
            task.check_if_latest()
            task._validate_links()
            task.set_new_name(set_child_names=True)
            task.db_insert()
        else:
            task.insert(ignore_permissions=True)

    if is_group:
        frappe.db.set_value("Task", task.name, "is_group", 1)

    return task.name


def ensure_timesheet(user_id: str) -> str:
    existing_name = frappe.db.get_value(
        "User Timesheet",
        {
            "timesheet_from": user_id,
            "ts_valid_from": TIMESHEET_VALID_FROM,
            "ts_valid_for": TIMESHEET_VALID_FOR,
        },
        "name",
    )
    if existing_name:
        timesheet = frappe.get_doc("User Timesheet", existing_name)
        timesheet.ut_status = "Черновик"
        timesheet.save(ignore_permissions=True, ignore_version=True)
        return timesheet.name

    timesheet = frappe.get_doc(
        {
            "doctype": "User Timesheet",
            "timesheet_from": user_id,
            "timesheet_from_name": BUSINESS_USER_FULL_NAME,
            "ts_valid_from": TIMESHEET_VALID_FROM,
            "ts_valid_for": TIMESHEET_VALID_FOR,
            "ut_status": "Черновик",
        }
    )
    timesheet.insert(ignore_permissions=True, ignore_mandatory=True)
    return timesheet.name


def create_timesheet_position(
    *,
    timesheet_name: str,
    task_name: str,
    project_name: str,
    role_name: str,
    user_id: str,
    status: str,
    rows: tuple[tuple[str, float], ...],
) -> str:
    position = frappe.get_doc(
        {
            "doctype": "User Timesheet Position",
            "user_timesheet": timesheet_name,
            "document_type": "Task",
            "document_name": task_name,
            "project": project_name,
            "project_role": role_name,
            "user": user_id,
            "status": status,
            "workflow_state": status,
            "table": [
                {
                    "doctype": "User Timesheet Position Details",
                    "date": row_date,
                    "hours": hours,
                }
                for row_date, hours in rows
            ],
        }
    )
    position.set("__islocal", True)
    position.flags.ignore_permissions = True
    position.flags.ignore_mandatory = True
    position._set_defaults()
    position.set_user_and_timestamp()
    position.set_docstatus()
    position.check_if_latest()
    position._validate_links()
    position.set_new_name(set_child_names=True)
    position.set_parent_in_children()
    position.db_insert()
    for row in position.get("table", []):
        row.db_insert()
    return position.name


def ensure_project_workload_assignment(
    *,
    task_name: str,
    role_name: str,
    user_id: str,
    date_from: str = PWA_INITIAL_FROM,
    date_to: str = PWA_INITIAL_TO,
    task_dates: int = 1,
    workload: str = DEFAULT_WORKLOAD,
    wl_value: float = DEFAULT_WORKLOAD_VALUE,
) -> str:
    existing_name = frappe.db.get_value(
        "Project Workload Assignment",
        {
            "task": task_name,
            "role": role_name,
            "user": user_id,
        },
        "name",
    )

    if existing_name:
        pwa_doc = frappe.get_doc("Project Workload Assignment", existing_name)
    else:
        pwa_doc = frappe.new_doc("Project Workload Assignment")
        pwa_doc.task = task_name
        pwa_doc.role = role_name
        pwa_doc.user = user_id

    pwa_doc.task = task_name
    pwa_doc.role = role_name
    pwa_doc.user = user_id
    pwa_doc.task_dates = task_dates
    pwa_doc.date_from = date_from
    pwa_doc.date_to = date_to
    pwa_doc.workload = workload
    pwa_doc.wl_value = wl_value

    if existing_name:
        pwa_doc.save(ignore_permissions=True)
        return pwa_doc.name

    pwa_doc.insert(ignore_permissions=True)
    return pwa_doc.name


def ensure_issue(project_name: str, issue_type_name: str) -> str:
    """Create Issue without DocType hooks (db_insert), so tests control when ITVT runs."""
    existing_name = frappe.db.get_value(
        "Issue",
        {"project": project_name, "subject": ISSUE_SUBJECT},
        "name",
    )

    if existing_name:
        issue = frappe.get_doc("Issue", existing_name)
    else:
        issue = frappe.new_doc("Issue")

    issue.subject = ISSUE_SUBJECT
    issue.project = project_name
    issue.issue_type = issue_type_name
    issue.priority = "Medium"
    issue.status = "Open"
    issue.description = ISSUE_SUBJECT
    issue.raised_by = BUSINESS_USER
    issue.opening_date = ISSUE_OPENING_DATE
    issue.custom_expected_resolution_date = ISSUE_EXPECTED_RESOLUTION_DATE
    issue.company = get_default_company()
    issue.custom_include = 1

    if existing_name:
        frappe.db.set_value(
            "Issue",
            issue.name,
            {
                "subject": issue.subject,
                "project": issue.project,
                "issue_type": issue.issue_type,
                "priority": issue.priority,
                "status": issue.status,
                "description": issue.description,
                "raised_by": issue.raised_by,
                "opening_date": issue.opening_date,
                "custom_expected_resolution_date": issue.custom_expected_resolution_date,
                "company": issue.company,
                "custom_include": issue.custom_include,
            },
            update_modified=False,
        )
        return issue.name

    issue.flags.ignore_permissions = True
    issue.flags.ignore_mandatory = True
    issue._set_defaults()
    issue.set_user_and_timestamp()
    issue.set_docstatus()
    issue.check_if_latest()
    issue._validate_links()
    issue.set_new_name(set_child_names=True)
    issue.db_insert()
    return issue.name


def change_position_status(position_name: str, status: str) -> str:
    from dinext_projects.dinext_projects.user_timesheet.events.status_rollup import (
        rollup_ut_status_and_task_dates,
    )

    old_doc = frappe.get_doc("User Timesheet Position", position_name)
    frappe.db.set_value(
        "User Timesheet Position",
        position_name,
        {"status": status, "workflow_state": status},
        update_modified=False,
    )
    position = frappe.get_doc("User Timesheet Position", position_name)
    position._doc_before_save = old_doc
    rollup_ut_status_and_task_dates(position)
    return position.name


def _apply_issue_fields(
    issue,
    *,
    opening_date: str | None = None,
    status: str | None = None,
    custom_expected_resolution_date: str | None = None,
    resolution_date: str | None = None,
) -> None:
    if opening_date is not None:
        issue.opening_date = opening_date
    if status is not None:
        issue.status = status
    if custom_expected_resolution_date is not None:
        issue.custom_expected_resolution_date = custom_expected_resolution_date
    if resolution_date is not None:
        if issue.meta.has_field("resolution_date"):
            issue.resolution_date = resolution_date
        if issue.meta.has_field("sla_resolution_date"):
            issue.sla_resolution_date = resolution_date


def run_issue_virtual_task_sync(
    issue_name: str,
    *,
    opening_date: str | None = None,
    status: str | None = None,
    custom_expected_resolution_date: str | None = None,
    resolution_date: str | None = None,
) -> str:
    from dinext_project_tasks_gantt.virtual_task.sync.issue_to_task import (
        sync_issue_to_virtual_task,
    )

    issue = frappe.get_doc("Issue", issue_name)
    _apply_issue_fields(
        issue,
        opening_date=opening_date,
        status=status,
        custom_expected_resolution_date=custom_expected_resolution_date,
        resolution_date=resolution_date,
    )
    sync_issue_to_virtual_task(issue)
    return issue.name


def save_issue_via_doctype_hooks(
    issue_name: str,
    *,
    opening_date: str | None = None,
    status: str | None = None,
    custom_expected_resolution_date: str | None = None,
    resolution_date: str | None = None,
) -> str:
    issue = frappe.get_doc("Issue", issue_name)
    _apply_issue_fields(
        issue,
        opening_date=opening_date,
        status=status,
        custom_expected_resolution_date=custom_expected_resolution_date,
        resolution_date=resolution_date,
    )
    _save_without_test_side_effects(issue)
    return issue.name


def run_task_actual_dates_sync(
    task_name: str,
    *,
    status: str | None = None,
    act_start_date: str | None = None,
    act_end_date: str | None = None,
    completed_on: str | None = None,
) -> str:
    task = frappe.get_doc("Task", task_name)
    if status is not None:
        task.status = status
    if act_start_date is not None:
        task.act_start_date = act_start_date
    if act_end_date is not None:
        task.act_end_date = act_end_date
    if completed_on is not None:
        task.completed_on = completed_on
    _save_without_test_side_effects(task)
    return task.name


def run_task_virtual_issue_sync(
    task_name: str,
    *,
    status: str | None = None,
    exp_end_date: str | None = None,
    act_end_date: str | None = None,
    subject: str | None = None,
    itvt_save_depth: int | None = None,
) -> str:
    from dinext_project_tasks_gantt.virtual_task.sync.task_to_issue import (
        sync_virtual_task_to_issue,
    )

    task = frappe.get_doc("Task", task_name)
    if status is not None:
        task.status = status
    if exp_end_date is not None:
        task.exp_end_date = exp_end_date
    if act_end_date is not None:
        task.act_end_date = act_end_date
    if subject is not None:
        task.subject = subject
    if itvt_save_depth is not None:
        task.flags.itvt_save_depth = itvt_save_depth
    sync_virtual_task_to_issue(task)
    return task.name


def get_virtual_task_name(issue_name: str) -> str | None:
    return frappe.db.get_value("Task", {"custom_linked_issue": issue_name}, "name")


def build_regular_task_scenario(
    *,
    include_narrow_position: bool = False,
    primary_rows: tuple[tuple[str, float], ...] = WIDE_FACT_ROWS,
    second_position_rows: tuple[tuple[str, float], ...] | None = None,
    second_position_key: str = "second_position",
    task_exp_start_date: str = REGULAR_TASK_EXP_START,
    task_exp_end_date: str = REGULAR_TASK_EXP_END,
    parent_exp_start_date: str = REGULAR_PARENT_EXP_START,
    parent_exp_end_date: str = REGULAR_PARENT_EXP_END,
) -> dict[str, str]:
    user_id = ensure_business_user()
    worker_name = ensure_worker(user_id)
    role_name = ensure_project_role()
    issue_type_name = ensure_issue_type()
    project_name = ensure_project()
    parent_task_name = ensure_task(
        subject=REGULAR_PARENT_SUBJECT,
        project_name=project_name,
        is_group=True,
        exp_start_date=parent_exp_start_date,
        exp_end_date=parent_exp_end_date,
    )
    ensure_project_issue_setting(project_name, issue_type_name, parent_task_name)
    task_name = ensure_task(
        subject=REGULAR_TASK_SUBJECT,
        project_name=project_name,
        parent_task=parent_task_name,
        exp_start_date=task_exp_start_date,
        exp_end_date=task_exp_end_date,
    )
    timesheet_name = ensure_timesheet(user_id)
    wide_position_name = create_timesheet_position(
        timesheet_name=timesheet_name,
        task_name=task_name,
        project_name=project_name,
        role_name=role_name,
        user_id=user_id,
        status="Редактирование",
        rows=primary_rows,
    )
    blocker_position_name = create_timesheet_position(
        timesheet_name=timesheet_name,
        task_name=task_name,
        project_name=project_name,
        role_name=role_name,
        user_id=user_id,
        status="Редактирование",
        rows=BLOCKER_ROWS,
    )

    bundle = {
        "user": user_id,
        "worker": worker_name,
        "role": role_name,
        "issue_type": issue_type_name,
        "project": project_name,
        "parent_task": parent_task_name,
        "task": task_name,
        "timesheet": timesheet_name,
        "wide_position": wide_position_name,
        "blocker_position": blocker_position_name,
    }

    if include_narrow_position and second_position_rows is None:
        second_position_rows = NARROW_FACT_ROWS
        second_position_key = "narrow_position"

    if second_position_rows:
        second_position_name = create_timesheet_position(
            timesheet_name=timesheet_name,
            task_name=task_name,
            project_name=project_name,
            role_name=role_name,
            user_id=user_id,
            status="Редактирование",
            rows=second_position_rows,
        )
        bundle[second_position_key] = second_position_name

    return bundle


def build_virtual_task_scenario() -> dict[str, str]:
    issue_type_name = ensure_issue_type()
    project_name = ensure_project()
    parent_task_name = ensure_task(
        subject=VIRTUAL_PARENT_SUBJECT,
        project_name=project_name,
        is_group=True,
        exp_start_date=VIRTUAL_PARENT_EXP_START,
        exp_end_date=VIRTUAL_PARENT_EXP_END,
    )
    ensure_project_issue_setting(project_name, issue_type_name, parent_task_name)
    issue_name = ensure_issue(project_name, issue_type_name)
    virtual_task_name = ensure_task(
        subject=ISSUE_SUBJECT,
        project_name=project_name,
        parent_task=parent_task_name,
        use_db_insert=True,
        status="Open",
        exp_start_date=ISSUE_OPENING_DATE,
        exp_end_date=ISSUE_EXPECTED_RESOLUTION_DATE,
        task_type="Issue",
        custom_linked_issue=issue_name,
    )

    return {
        "issue_type": issue_type_name,
        "project": project_name,
        "parent_task": parent_task_name,
        "issue": issue_name,
        "virtual_task": virtual_task_name,
    }


def build_virtual_task_utp_scenario(
    *,
    primary_rows: tuple[tuple[str, float], ...] = WIDE_FACT_ROWS,
    virtual_exp_start_date: str = REGULAR_TASK_EXP_START,
    virtual_exp_end_date: str = REGULAR_TASK_EXP_END,
) -> dict[str, str]:
    bundle = build_virtual_task_scenario()
    user_id = ensure_business_user()
    worker_name = ensure_worker(user_id)
    role_name = ensure_project_role()
    timesheet_name = ensure_timesheet(user_id)

    frappe.db.set_value(
        "Task",
        bundle["virtual_task"],
        {
            "exp_start_date": virtual_exp_start_date,
            "exp_end_date": virtual_exp_end_date,
            "status": "Open",
            "act_start_date": None,
            "act_end_date": None,
            "completed_on": None,
        },
        update_modified=False,
    )

    wide_position_name = create_timesheet_position(
        timesheet_name=timesheet_name,
        task_name=bundle["virtual_task"],
        project_name=bundle["project"],
        role_name=role_name,
        user_id=user_id,
        status="Редактирование",
        rows=primary_rows,
    )
    blocker_position_name = create_timesheet_position(
        timesheet_name=timesheet_name,
        task_name=bundle["virtual_task"],
        project_name=bundle["project"],
        role_name=role_name,
        user_id=user_id,
        status="Редактирование",
        rows=BLOCKER_ROWS,
    )

    bundle.update(
        {
            "user": user_id,
            "worker": worker_name,
            "role": role_name,
            "timesheet": timesheet_name,
            "wide_position": wide_position_name,
            "blocker_position": blocker_position_name,
        }
    )
    return bundle


def build_regular_task_pwa_scenario(
    *,
    primary_rows: tuple[tuple[str, float], ...] = WIDE_FACT_ROWS,
) -> dict[str, str]:
    bundle = build_regular_task_scenario(primary_rows=primary_rows)
    pwa_name = ensure_project_workload_assignment(
        task_name=bundle["task"],
        role_name=bundle["role"],
        user_id=bundle["user"],
    )
    bundle["pwa"] = pwa_name
    return bundle


def build_issue_without_virtual_task_pwa_scenario() -> dict[str, str]:
    user_id = ensure_business_user()
    role_name = ensure_project_role()
    issue_type_name = ensure_issue_type()
    project_name = ensure_project()
    issue_name = ensure_issue(project_name, issue_type_name)
    task_name = ensure_task(
        subject=REGULAR_TASK_SUBJECT,
        project_name=project_name,
        issue=issue_name,
        exp_start_date=ISSUE_OPENING_DATE,
        exp_end_date=ISSUE_EXPECTED_RESOLUTION_DATE,
    )
    pwa_name = ensure_project_workload_assignment(
        task_name=task_name,
        role_name=role_name,
        user_id=user_id,
    )

    return {
        "user": user_id,
        "role": role_name,
        "issue_type": issue_type_name,
        "project": project_name,
        "issue": issue_name,
        "task": task_name,
        "pwa": pwa_name,
    }


def build_virtual_task_pwa_scenario() -> dict[str, str]:
    bundle = build_virtual_task_scenario()
    user_id = ensure_business_user()
    role_name = ensure_project_role()
    pwa_name = ensure_project_workload_assignment(
        task_name=bundle["virtual_task"],
        role_name=role_name,
        user_id=user_id,
    )
    bundle["user"] = user_id
    bundle["role"] = role_name
    bundle["pwa"] = pwa_name
    return bundle


def build_task_hierarchy_scenario(
    *,
    grand_status: str = "Open",
    parent_status: str = "Open",
    grand_exp_start_date: str = REGULAR_PARENT_EXP_START,
    grand_exp_end_date: str = REGULAR_PARENT_EXP_END,
    parent_exp_start_date: str = REGULAR_PARENT_EXP_START,
    parent_exp_end_date: str = REGULAR_PARENT_EXP_END,
    leaf_exp_start_date: str = REGULAR_TASK_EXP_START,
    leaf_exp_end_date: str = REGULAR_TASK_EXP_END,
    parent_act_start_date: str | None = None,
    parent_act_end_date: str | None = None,
    parent_completed_on: str | None = None,
) -> dict[str, str]:
    project_name = ensure_project()
    grand_task_name = ensure_task(
        subject=HIERARCHY_GRAND_SUBJECT,
        project_name=project_name,
        is_group=True,
        status=grand_status,
        exp_start_date=grand_exp_start_date,
        exp_end_date=grand_exp_end_date,
    )
    parent_task_name = ensure_task(
        subject=HIERARCHY_PARENT_SUBJECT,
        project_name=project_name,
        parent_task=grand_task_name,
        is_group=True,
        status=parent_status,
        exp_start_date=parent_exp_start_date,
        exp_end_date=parent_exp_end_date,
        act_start_date=parent_act_start_date,
        act_end_date=parent_act_end_date,
        completed_on=parent_completed_on,
    )
    leaf_task_name = ensure_task(
        subject=HIERARCHY_LEAF_SUBJECT,
        project_name=project_name,
        parent_task=parent_task_name,
        status="Open",
        exp_start_date=leaf_exp_start_date,
        exp_end_date=leaf_exp_end_date,
    )

    return {
        "project": project_name,
        "grand_task": grand_task_name,
        "parent_task": parent_task_name,
        "leaf_task": leaf_task_name,
    }


def reset_scenario() -> None:
    timesheet_names = frappe.get_all(
        "User Timesheet",
        filters={
            "timesheet_from": BUSINESS_USER,
            "ts_valid_from": TIMESHEET_VALID_FROM,
            "ts_valid_for": TIMESHEET_VALID_FOR,
        },
        pluck="name",
    )

    for timesheet_name in timesheet_names:
        position_names = frappe.get_all(
            "User Timesheet Position",
            filters={"user_timesheet": timesheet_name},
            pluck="name",
        )
        for position_name in position_names:
            if frappe.db.exists("User Timesheet Position", position_name):
                frappe.delete_doc("User Timesheet Position", position_name, ignore_permissions=True, force=True)

    for timesheet_name in timesheet_names:
        if frappe.db.exists("User Timesheet", timesheet_name):
            frappe.delete_doc("User Timesheet", timesheet_name, ignore_permissions=True, force=True)

    task_rows = frappe.get_all(
        "Task",
        filters={"subject": ["like", f"{NAME_PREFIX}%"]},
        fields=["name", "is_group", "parent_task"],
    )
    task_names = [row.name for row in task_rows]
    issue_names = frappe.get_all(
        "Issue",
        filters={"subject": ISSUE_SUBJECT},
        pluck="name",
    )

    if task_names:
        for todo_name in frappe.get_all(
            "ToDo",
            filters={
                "reference_type": "Task",
                "reference_name": ["in", task_names],
            },
            pluck="name",
        ):
            if frappe.db.exists("ToDo", todo_name):
                frappe.delete_doc("ToDo", todo_name, ignore_permissions=True, force=True)

    if issue_names:
        for todo_name in frappe.get_all(
            "ToDo",
            filters={
                "reference_type": "Issue",
                "reference_name": ["in", issue_names],
            },
            pluck="name",
        ):
            if frappe.db.exists("ToDo", todo_name):
                frappe.delete_doc("ToDo", todo_name, ignore_permissions=True, force=True)

    if task_names:
        for pwa_name in frappe.get_all(
            "Project Workload Assignment",
            filters={"task": ["in", task_names]},
            pluck="name",
        ):
            if frappe.db.exists("Project Workload Assignment", pwa_name):
                frappe.delete_doc(
                    "Project Workload Assignment",
                    pwa_name,
                    ignore_permissions=True,
                    force=True,
                )

    for issue_name in issue_names:
        if frappe.db.exists("Issue", issue_name):
            frappe.delete_doc("Issue", issue_name, ignore_permissions=True, force=True)

    for row in sorted(
        task_rows,
        key=lambda item: (
            0 if not int(item.is_group or 0) else (1 if item.parent_task else 2),
            item.name,
        ),
    ):
        if frappe.db.exists("Task", row.name):
            frappe.delete_doc("Task", row.name, ignore_permissions=True, force=True)

    project_names = frappe.get_all("Project", filters={"project_name": PROJECT_NAME}, pluck="name")
    for project_name in project_names:
        if frappe.db.exists("Project", project_name):
            frappe.delete_doc("Project", project_name, ignore_permissions=True, force=True)

    role_name = frappe.db.get_value("Project Role", {"role_name": PROJECT_ROLE_NAME}, "name")
    if role_name and frappe.db.exists("Project Role", role_name):
        frappe.delete_doc("Project Role", role_name, ignore_permissions=True, force=True)

    worker_name = frappe.db.get_value("Worker", {"wuser": BUSINESS_USER}, "name")
    if worker_name and frappe.db.exists("Worker", worker_name):
        frappe.delete_doc("Worker", worker_name, ignore_permissions=True, force=True)

    if frappe.db.exists("User", BUSINESS_USER):
        frappe.delete_doc("User", BUSINESS_USER, ignore_permissions=True, force=True)

    if frappe.db.exists("Issue Type", ISSUE_TYPE_NAME):
        frappe.delete_doc("Issue Type", ISSUE_TYPE_NAME, ignore_permissions=True, force=True)
