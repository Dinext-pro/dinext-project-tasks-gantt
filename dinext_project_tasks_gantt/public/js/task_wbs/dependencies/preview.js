// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { applyPropagation, previewPropagation as apiPreviewPropagation } from "../api.js";
import { refreshDependencies } from "./check.js";
import { scheduleGanttRefresh } from "../gantt/index.js";

const LARGE_AMOUNT_THRESHOLD = 200;

function patchRowsFromChanges(state, changes) {
	const byId = {};
	const walk = (rows) => {
		for (const row of rows || []) {
			byId[row.id] = row;
			if (row.children?.length) {
				walk(row.children);
			}
		}
	};
	walk(state.table?.sourceData || state.rows);

	for (const c of changes) {
		const row = byId[c.task];
		if (!row) {
			continue;
		}
		if (c.proposed_start) {
			row.exp_start_date = c.proposed_start;
		}
		if (c.proposed_end) {
			row.exp_end_date = c.proposed_end;
		}
	}
	state.table?.api?.refreshCells?.({ force: true });
	scheduleGanttRefresh(state);
}

function showPreviewDialog(state, previewList) {
	if (!previewList?.length) {
		frappe.show_alert(__("Не выявлено нарушений зависимостей вниз по дереву задач"));
		return;
	}

	const d = new frappe.ui.Dialog({
		title: __("Необходимые изменения для устранения нарушений зависимостей задач"),
		size: "extra-large",
		fields: [
			{
				fieldname: "dependencies_rows",
				fieldtype: "Table",
				cannot_add_rows: 1,
				cannot_delete_rows: 1,
				in_place_edit: true,
				fields: [
					{
						label: __("Задача"),
						fieldname: "subject",
						fieldtype: "Data",
						read_only: 1,
						in_list_view: 1,
						columns: 2,
					},
					{
						label: __("Текущ. начало"),
						fieldname: "current_start",
						fieldtype: "Date",
						read_only: 1,
						in_list_view: 1,
						columns: 1,
					},
					{
						label: __("Текущ. окончание"),
						fieldname: "current_end",
						fieldtype: "Date",
						read_only: 1,
						in_list_view: 1,
						columns: 1,
					},
					{
						label: __("Предл. начало"),
						fieldname: "proposed_start",
						fieldtype: "Date",
						read_only: 1,
						in_list_view: 1,
						columns: 1,
					},
					{
						label: __("Предл. окончание"),
						fieldname: "proposed_end",
						fieldtype: "Date",
						read_only: 1,
						in_list_view: 1,
						columns: 1,
					},
					{
						label: __("Причины"),
						fieldname: "reasons",
						fieldtype: "Data",
						read_only: 1,
						in_list_view: 1,
						columns: 4,
					},
				],
				data: previewList,
			},
		],
		primary_action_label: __("Выполнить выбранные"),
		primary_action() {
			const selected =
				this.fields_dict.dependencies_rows.grid.get_selected_children();
			if (!selected.length) {
				frappe.msgprint(__("Необходимо выбрать изменения"));
				return;
			}
			const changes = selected.map((p) => ({
				task: p.task,
				proposed_start: p.proposed_start,
				proposed_end: p.proposed_end,
			}));

			const apply = async (mode) => {
				try {
					const message = await applyPropagation({ changes, mode });
					if (mode === "async") {
						const job = message?.job_id;
						frappe.show_alert(
							job
								? __("Propagation started in background (job {0})", [job])
								: __("Propagation enqueued")
						);
						d.hide();
						setTimeout(() => {
							refreshDependencies(state).catch(console.error);
						}, 5000);
						return;
					}
					if (message?.success) {
						frappe.show_alert(
							__("Выполнены изменения: {0}", [message.changed])
						);
						patchRowsFromChanges(state, changes);
						refreshDependencies(state).catch(console.error);
					} else {
						frappe.msgprint(__("Error applying changes"));
					}
					d.hide();
				} catch (e) {
					frappe.msgprint(e.message || __("Error applying changes"));
				}
			};

			if (changes.length > LARGE_AMOUNT_THRESHOLD) {
				frappe.confirm(
					__(
						"This operation affects {0} tasks and may take a long time. Run in background?",
						[changes.length]
					),
					() => apply("async")
				);
			} else {
				apply("sync");
			}
		},
		secondary_action_label: __("Закрыть"),
		secondary_action() {
			d.hide();
		},
	});
	d.show();
}

/**
 * @param {object} state
 * @param {string} taskId
 * @param {"downstream"|"upstream"|"both"} [direction]
 */
export async function previewPropagation(state, taskId, direction = "downstream") {
	if (!taskId) {
		frappe.show_alert({
			message: __("Select a task"),
			indicator: "orange",
		});
		return;
	}
	try {
		const message = await apiPreviewPropagation({
			changed_task: taskId,
			direction,
		});
		if (!message) {
			return;
		}
		showPreviewDialog(state, message.preview || []);
	} catch (e) {
		console.error("task_wbs previewPropagation", e);
		frappe.msgprint(e.message || __("Error"));
	}
}
