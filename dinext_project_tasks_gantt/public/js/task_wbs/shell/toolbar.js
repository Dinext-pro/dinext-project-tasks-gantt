// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { previewPropagation } from "../dependencies/preview.js";
import { rowCanWrite } from "../table/save.js";
import { loadAllRows } from "../table/data.js";
import { scheduleGanttRefresh } from "../gantt/index.js";
import { refreshSideData } from "../side_data.js";

function getSelectedRows(state) {
	const api = state.table?.api;
	if (!api?.getSelectedRows) {
		return [];
	}
	return api.getSelectedRows() || [];
}

function getPrimarySelected(state) {
	const selected = getSelectedRows(state);
	return selected[0] || null;
}

function openBurndown(state) {
	const nav = dinext_project_tasks_gantt.burndown_navigation;
	if (!nav?.open_report) {
		frappe.msgprint(__("Burndown navigation not loaded"));
		return;
	}
	if (!state.project) {
		frappe.show_alert({ message: __("Select a project"), indicator: "orange" });
		return;
	}
	nav.open_report(state.project);
}

function addMultipleTasks(state) {
	const row = getPrimarySelected(state);
	if (!row?.id) {
		frappe.show_alert({
			message: __("Select a parent task"),
			indicator: "orange",
		});
		return;
	}
	if (!frappe.model.can_create("Task") || !rowCanWrite(row)) {
		frappe.throw(__("Not permitted"));
	}

	const dialog = new frappe.ui.Dialog({
		title: __("Add Multiple Tasks"),
		fields: [
			{
				fieldname: "tasks",
				fieldtype: "Table",
				label: __("Tasks"),
				cannot_add_rows: 0,
				in_place_edit: true,
				reqd: 1,
				fields: [
					{
						fieldname: "subject",
						fieldtype: "Data",
						label: __("Subject"),
						in_list_view: 1,
						reqd: 1,
					},
				],
				data: [{ subject: "" }],
			},
		],
		primary_action_label: __("Create"),
		primary_action(values) {
			const tasks = (values.tasks || [])
				.map((t) => t.subject)
				.filter(Boolean);
			if (!tasks.length) {
				frappe.msgprint(__("Add at least one subject"));
				return;
			}
			frappe.call({
				method: "erpnext.projects.doctype.task.task.add_multiple_tasks",
				args: {
					data: JSON.stringify(tasks.map((subject) => ({ subject }))),
					parent: row.id,
				},
				callback() {
					dialog.hide();
					frappe.show_alert(__("Tasks created"));
					state._reload?.(state);
				},
			});
		},
	});
	dialog.show();
}

function openSelectedForm(state) {
	const row = getPrimarySelected(state);
	if (!row?.id) {
		frappe.show_alert({ message: __("Select a task"), indicator: "orange" });
		return;
	}
	frappe.set_route("Form", "Task", row.id);
}

function previewSelectedDeps(state) {
	const row = getPrimarySelected(state);
	previewPropagation(state, row?.id, "downstream").catch(console.error);
}

async function expandAll(state) {
	if (!state.project || !state.table) {
		return;
	}
	frappe.dom.freeze(__("Loading…"));
	try {
		await loadAllRows(state);
		state.table.refresh?.(state.rows);
		if (typeof state.table.expandAll === "function") {
			await state.table.expandAll();
		}
		scheduleGanttRefresh(state);
		await refreshSideData(state);
	} finally {
		frappe.dom.unfreeze();
	}
}

async function collapseAll(state) {
	if (!state.table) {
		return;
	}
	state.table.collapseAll?.();
	scheduleGanttRefresh(state);
}

/**
 * Page toolbar buttons for WBS (no cutover / tree adapter).
 * @param {{ page: object, state: object, reload: Function }} opts
 */
export function setupToolbar({ page, state, reload }) {
	state._reload = () => reload();

	if (!page.__task_wbs_toolbar) {
		page.__task_wbs_toolbar = true;

		page.add_inner_button(__("Burndown Chart"), () => openBurndown(state));
		page.add_inner_button(__("Add Multiple"), () => addMultipleTasks(state));
		page.add_inner_button(__("Fix Dependencies"), () => previewSelectedDeps(state));
		page.add_inner_button(__("Open Task"), () => openSelectedForm(state));
		page.add_inner_button(__("Expand All"), () =>
			expandAll(state).catch((e) => {
				console.error(e);
				frappe.msgprint(e.message || String(e));
			})
		);
		page.add_inner_button(__("Collapse All"), () => collapseAll(state));
	}
}
