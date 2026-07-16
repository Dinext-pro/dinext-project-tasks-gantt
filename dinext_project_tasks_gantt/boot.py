# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import cint


def boot_session(bootinfo):
	"""Expose site_config.task_wbs_tree_cutover to Desk (Tree adapter)."""
	bootinfo.task_wbs_tree_cutover = cint(
		frappe.conf.get("task_wbs_tree_cutover") or 0
	)
