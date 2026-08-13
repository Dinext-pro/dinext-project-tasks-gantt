# Copyright (c) 2026, Dinext and contributors
# See license.txt
"""ISS-2026-03288 live-site scenario. Port of ISS-2025-02606 after SS → app hooks."""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate, today

from .data_setup import (
    COMPLETED_TASK_ACT_END,
    COMPLETED_TASK_ACT_START,
    COMPLETED_TASK_OLD_COMPLETED_ON,
    ISSUE_CLOSED_RESOLUTION_DATE,
    VIRTUAL_TASK_ACT_END,
    VIRTUAL_TASK_ACT_START,
    WIDE_FACT_ROWS,
    build_regular_task_scenario,
    build_task_hierarchy_scenario,
    build_virtual_task_scenario,
    build_virtual_task_utp_scenario,
    change_position_status,
    run_issue_virtual_task_sync,
    run_task_actual_dates_sync,
    run_task_virtual_issue_sync,
    save_issue_via_doctype_hooks,
    reset_scenario,
)


class TestIss202603288TaskDatesVirtual(FrappeTestCase):
    @classmethod
    def tearDownClass(cls):
        reset_scenario()
        super().tearDownClass()

    def setUp(self):
        reset_scenario()

    def test_approved_utp_updates_regular_task_and_parent_dates(self):
        bundle = build_regular_task_scenario()

        change_position_status(bundle["wide_position"], "Согласовано")

        task = frappe.get_doc("Task", bundle["task"])
        parent_task = frappe.get_doc("Task", bundle["parent_task"])

        expected_start = getdate(WIDE_FACT_ROWS[0][0])
        expected_end = getdate(WIDE_FACT_ROWS[1][0])

        self.assertEqual(expected_start, task.act_start_date)
        self.assertEqual(expected_end, task.act_end_date)
        self.assertEqual(expected_start, task.exp_start_date)
        self.assertEqual(expected_end, task.exp_end_date)
        self.assertEqual(expected_start, parent_task.exp_start_date)
        self.assertEqual(expected_end, parent_task.exp_end_date)

    def test_completed_task_syncs_completed_on_and_plan_dates_from_fact(self):
        bundle = build_regular_task_scenario()

        task = frappe.get_doc("Task", bundle["task"])
        task.act_start_date = COMPLETED_TASK_ACT_START
        task.act_end_date = COMPLETED_TASK_ACT_END
        task.completed_on = COMPLETED_TASK_OLD_COMPLETED_ON
        task.status = "Completed"
        task.save(ignore_permissions=True)

        task.reload()
        self.assertEqual(getdate(COMPLETED_TASK_ACT_START), task.exp_start_date)
        self.assertEqual(getdate(COMPLETED_TASK_ACT_END), task.exp_end_date)
        self.assertEqual(getdate(COMPLETED_TASK_ACT_END), task.completed_on)

    def test_virtual_task_syncs_completed_fields_without_losing_issue_link(self):
        bundle = build_virtual_task_scenario()

        run_task_actual_dates_sync(
            bundle["virtual_task"],
            status="Completed",
            act_start_date=VIRTUAL_TASK_ACT_START,
            act_end_date=VIRTUAL_TASK_ACT_END,
            completed_on=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        virtual_task.reload()
        self.assertEqual("Issue", virtual_task.type)
        self.assertEqual(bundle["issue"], virtual_task.custom_linked_issue)
        self.assertEqual("Completed", virtual_task.status)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.act_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.exp_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)

    def test_virtual_task_uses_same_utp_fact_rules_as_regular_task(self):
        bundle = build_virtual_task_utp_scenario(primary_rows=WIDE_FACT_ROWS)

        change_position_status(bundle["wide_position"], "Согласовано")

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])

        self.assertEqual("Issue", virtual_task.type)
        self.assertEqual(bundle["issue"], virtual_task.custom_linked_issue)
        self.assertEqual(getdate(WIDE_FACT_ROWS[0][0]), virtual_task.act_start_date)
        self.assertEqual(getdate(WIDE_FACT_ROWS[1][0]), virtual_task.act_end_date)
        self.assertEqual(getdate(WIDE_FACT_ROWS[0][0]), virtual_task.exp_start_date)
        self.assertEqual(getdate(WIDE_FACT_ROWS[1][0]), virtual_task.exp_end_date)

    def test_issue_resave_does_not_clear_virtual_task_actual_dates(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            opening_date="2026-04-20",
            custom_expected_resolution_date="2026-04-16",
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.act_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)

    def test_issue_expected_resolution_date_affects_virtual_task_only_before_act_end_exists(self):
        bundle = build_virtual_task_scenario()

        run_issue_virtual_task_sync(
            bundle["issue"],
            custom_expected_resolution_date="2026-04-16",
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate("2026-04-16"), virtual_task.exp_end_date)

        reset_scenario()

        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {"act_end_date": VIRTUAL_TASK_ACT_END},
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            custom_expected_resolution_date="2026-04-16",
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)

    def test_closing_issue_sets_virtual_task_completed_on_from_act_end_or_today(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            status="Closed",
            resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
            custom_expected_resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual("Completed", virtual_task.status)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)

        reset_scenario()

        bundle = build_virtual_task_scenario()
        run_issue_virtual_task_sync(
            bundle["issue"],
            status="Closed",
            resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
            custom_expected_resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual("Completed", virtual_task.status)
        self.assertEqual(getdate(today()), virtual_task.completed_on)

    def test_issue_resolution_date_can_only_extend_virtual_task_act_end_date(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": "2026-04-16",
            },
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            status="Closed",
            resolution_date=VIRTUAL_TASK_ACT_END,
            custom_expected_resolution_date="2026-04-17",
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)

        reset_scenario()

        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            status="Closed",
            resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
            custom_expected_resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)

    def test_issue_after_save_cascade_keeps_virtual_task_fact_and_completes_by_act_end(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        save_issue_via_doctype_hooks(
            bundle["issue"],
            status="Closed",
            resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
            custom_expected_resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        issue = frappe.get_doc("Issue", bundle["issue"])
        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])

        self.assertEqual("Closed", issue.status)
        self.assertEqual("Completed", virtual_task.status)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.act_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.exp_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.exp_end_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)

    def test_virtual_task_reverse_sync_updates_issue_when_issue_hook_isolated(self):
        bundle = build_virtual_task_scenario()

        run_task_virtual_issue_sync(
            bundle["virtual_task"],
            status="Completed",
            exp_end_date="2026-04-16",
            act_end_date=VIRTUAL_TASK_ACT_END,
            subject="TEST ISS-2026-03288 REVERSE SYNC",
        )

        issue = frappe.get_doc("Issue", bundle["issue"])

        self.assertEqual("Closed", issue.status)
        self.assertEqual(getdate("2026-04-16"), issue.custom_expected_resolution_date)
        self.assertEqual("TEST ISS-2026-03288 REVERSE SYNC", issue.subject)

    def test_itvt_save_depth_blocks_reverse_sync_from_virtual_task_to_issue(self):
        bundle = build_virtual_task_scenario()
        issue = frappe.get_doc("Issue", bundle["issue"])
        original_status = issue.status
        original_exp_end = issue.custom_expected_resolution_date
        original_subject = issue.subject

        run_task_virtual_issue_sync(
            bundle["virtual_task"],
            status="Completed",
            exp_end_date="2026-04-16",
            act_end_date=VIRTUAL_TASK_ACT_END,
            subject="TEST ISS-2026-03288 DEPTH GUARD",
            itvt_save_depth=1,
        )

        issue.reload()
        self.assertEqual(original_status, issue.status)
        self.assertEqual(getdate(original_exp_end), issue.custom_expected_resolution_date)
        self.assertEqual(original_subject, issue.subject)

    def test_full_issue_task_issue_loop_completes_without_recursion(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["virtual_task"],
            {
                "act_start_date": VIRTUAL_TASK_ACT_START,
                "act_end_date": VIRTUAL_TASK_ACT_END,
            },
            update_modified=False,
        )

        save_issue_via_doctype_hooks(
            bundle["issue"],
            status="Closed",
            resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
            custom_expected_resolution_date=ISSUE_CLOSED_RESOLUTION_DATE,
        )

        issue = frappe.get_doc("Issue", bundle["issue"])
        virtual_task = frappe.get_doc("Task", bundle["virtual_task"])

        self.assertEqual("Closed", issue.status)
        self.assertEqual(getdate(ISSUE_CLOSED_RESOLUTION_DATE), issue.custom_expected_resolution_date)
        self.assertEqual("Completed", virtual_task.status)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.completed_on)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_START), virtual_task.act_start_date)
        self.assertEqual(getdate(VIRTUAL_TASK_ACT_END), virtual_task.act_end_date)

    def test_leaf_fact_expands_expected_dates_through_all_parents(self):
        bundle = build_task_hierarchy_scenario()

        leaf_task = frappe.get_doc("Task", bundle["leaf_task"])
        leaf_task.act_start_date = WIDE_FACT_ROWS[0][0]
        leaf_task.act_end_date = WIDE_FACT_ROWS[1][0]
        leaf_task.save(ignore_permissions=True)

        leaf_task = frappe.get_doc("Task", bundle["leaf_task"])
        parent_task = frappe.get_doc("Task", bundle["parent_task"])
        grand_task = frappe.get_doc("Task", bundle["grand_task"])

        expected_start = getdate(WIDE_FACT_ROWS[0][0])
        expected_end = getdate(WIDE_FACT_ROWS[1][0])

        self.assertEqual(expected_start, leaf_task.exp_start_date)
        self.assertEqual(expected_end, leaf_task.exp_end_date)
        self.assertEqual(expected_start, parent_task.exp_start_date)
        self.assertEqual(expected_end, parent_task.exp_end_date)
        self.assertEqual(expected_start, grand_task.exp_start_date)
        self.assertEqual(expected_end, grand_task.exp_end_date)

    def test_completed_parent_only_expands_expected_dates(self):
        bundle = build_task_hierarchy_scenario(
            parent_status="Completed",
            parent_exp_start_date="2026-04-09",
            parent_exp_end_date="2026-04-11",
            parent_act_start_date="2026-04-09",
            parent_act_end_date="2026-04-11",
            parent_completed_on="2026-04-11",
        )

        leaf_task = frappe.get_doc("Task", bundle["leaf_task"])
        leaf_task.act_start_date = WIDE_FACT_ROWS[0][0]
        leaf_task.act_end_date = WIDE_FACT_ROWS[1][0]
        leaf_task.save(ignore_permissions=True)

        parent_task = frappe.get_doc("Task", bundle["parent_task"])

        self.assertEqual("Completed", parent_task.status)
        self.assertEqual(getdate(WIDE_FACT_ROWS[0][0]), parent_task.exp_start_date)
        self.assertEqual(getdate(WIDE_FACT_ROWS[1][0]), parent_task.exp_end_date)
        self.assertEqual(getdate("2026-04-09"), parent_task.act_start_date)
        self.assertEqual(getdate("2026-04-11"), parent_task.act_end_date)
        self.assertEqual(getdate("2026-04-11"), parent_task.completed_on)

    def test_cancelled_parent_does_not_change_when_leaf_fact_expands(self):
        bundle = build_task_hierarchy_scenario(
            parent_status="Cancelled",
            parent_exp_start_date="2026-04-09",
            parent_exp_end_date="2026-04-11",
        )

        leaf_task = frappe.get_doc("Task", bundle["leaf_task"])
        leaf_task.act_start_date = WIDE_FACT_ROWS[0][0]
        leaf_task.act_end_date = WIDE_FACT_ROWS[1][0]
        with self.assertRaises(Exception) as ctx:
            leaf_task.save(ignore_permissions=True)

        parent_task = frappe.get_doc("Task", bundle["parent_task"])
        grand_task = frappe.get_doc("Task", bundle["grand_task"])

        self.assertIn("Expected End Date should be less than or equal to parent task", str(ctx.exception))
        self.assertEqual("Cancelled", parent_task.status)
        self.assertEqual(getdate("2026-04-09"), parent_task.exp_start_date)
        self.assertEqual(getdate("2026-04-11"), parent_task.exp_end_date)
        self.assertEqual(getdate("2026-04-09"), grand_task.exp_start_date)
        self.assertEqual(getdate("2026-04-11"), grand_task.exp_end_date)

    def test_issue_expected_resolution_date_matches_direct_task_save_for_valid_date(self):
        bundle = build_virtual_task_scenario()

        run_issue_virtual_task_sync(
            bundle["issue"],
            custom_expected_resolution_date="2026-04-16",
        )

        via_issue_task = frappe.get_doc("Task", bundle["virtual_task"])
        self.assertEqual(getdate("2026-04-16"), via_issue_task.exp_end_date)

        reset_scenario()

        bundle = build_virtual_task_scenario()
        direct_task = frappe.get_doc("Task", bundle["virtual_task"])
        direct_task.exp_end_date = "2026-04-16"
        direct_task.save(ignore_permissions=True)
        direct_task.reload()

        self.assertEqual(getdate("2026-04-16"), direct_task.exp_end_date)

    def test_issue_expected_resolution_date_expands_parent_like_direct_task_save(self):
        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["parent_task"],
            {"exp_end_date": "2026-04-15"},
            update_modified=False,
        )

        direct_task = frappe.get_doc("Task", bundle["virtual_task"])
        direct_task.exp_end_date = "2026-04-16"
        direct_task.save(ignore_permissions=True)
        direct_parent = frappe.get_doc("Task", bundle["parent_task"])

        self.assertEqual(getdate("2026-04-16"), direct_task.exp_end_date)
        self.assertEqual(getdate("2026-04-16"), direct_parent.exp_end_date)

        reset_scenario()

        bundle = build_virtual_task_scenario()
        frappe.db.set_value(
            "Task",
            bundle["parent_task"],
            {"exp_end_date": "2026-04-15"},
            update_modified=False,
        )

        run_issue_virtual_task_sync(
            bundle["issue"],
            custom_expected_resolution_date="2026-04-16",
        )

        via_issue_task = frappe.get_doc("Task", bundle["virtual_task"])
        via_issue_parent = frappe.get_doc("Task", bundle["parent_task"])
        self.assertEqual(getdate("2026-04-16"), via_issue_task.exp_end_date)
        self.assertEqual(getdate("2026-04-16"), via_issue_parent.exp_end_date)
