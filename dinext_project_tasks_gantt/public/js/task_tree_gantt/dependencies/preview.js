/**
 * Downstream dependency preview dialog — port of try1 / Tree _tds_preview_tree path.
 */
import { applyPropagation, previewPropagation as apiPreview } from "../api.js";
import { getOnTreeMutate } from "../table/columns/context.js";
import { refreshConflicts } from "./check.js";

const LARGE_AMOUNT_THRESHOLD = 200;

function showPreviewDialog(previewList, refreshCtx) {
	if (!previewList?.length) {
		frappe.show_alert(
			__("Не выявлено нарушений зависимостей вниз по дереву задач")
		);
		return;
	}

	const d = new frappe.ui.Dialog({
		title: __(
			"Необходимые изменения для устранения нарушений зависимостей задач"
		),
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
						frappe.show_alert(
							__("Propagation enqueued — refresh tree after job finishes")
						);
						d.hide();
						return;
					}
					if (message?.success) {
						frappe.show_alert(
							__("Выполнены изменения: {0}", [message.changed])
						);
						d.hide();
						if (refreshCtx?.getArgs && refreshCtx?.table) {
							refreshConflicts(
								refreshCtx.getArgs,
								refreshCtx.table
							).catch(console.error);
						}
						getOnTreeMutate()?.();
					} else {
						frappe.msgprint(__("Error applying changes"));
					}
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
				void apply("sync");
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
 * @param {string} taskId
 * @param {"downstream"|"upstream"|"both"} [direction]
 * @param {{ getArgs?: Function, table?: object }} [refreshCtx]
 */
export async function previewPropagation(
	taskId,
	direction = "downstream",
	refreshCtx = null
) {
	if (!taskId) {
		frappe.show_alert({
			message: __("Select a task"),
			indicator: "orange",
		});
		return;
	}
	const message = await apiPreview({
		changed_task: taskId,
		direction,
	});
	if (!message) {
		return;
	}
	showPreviewDialog(message.preview || [], refreshCtx);
}
