// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

frappe.provide("dinext_project_tasks_gantt.burndown_navigation");

frappe.ui.form.on("Project", {
	refresh(frm) {
		if (frm.is_new() || !frm.doc?.name) {
			return;
		}

		const navigation = dinext_project_tasks_gantt.burndown_navigation;
		frm.add_custom_button(
			navigation.ICON + " " + navigation.LABEL,
			() => navigation.open_report(frm.doc.name, frm.doc),
			__("View")
		);
	},
});
