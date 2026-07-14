import {
	dateValueFormatter,
	priorityCellClass,
	renderAssign,
	renderProgress,
	renderSubject,
	renderTags,
	statusCellClass,
} from "./render.js";
import { fieldCanEdit } from "./save.js";

function taskSelectValues(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	const raw = field?.options || "";
	return String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * Column parity + inline edit.
 * Sortable flags match Tree header (status/priority/dates/duration/progress).
 * With sort.enabled, default is sortable — explicit false for opt-out.
 */
export function getColumns() {
	const statusValues = taskSelectValues("status");
	const priorityValues = taskSelectValues("priority");

	return [
		{
			field: "subject",
			headerName: __("Задача"),
			flex: 1,
			minWidth: 240,
			tree: true,
			render: renderSubject,
			edit: (row) => fieldCanEdit(row, "subject"),
			sortable: false,
		},
		{
			field: "assign",
			headerName: __("Ответств."),
			width: 100,
			edit: false,
			sortable: false,
			cellRenderer: renderAssign,
			cellClass: "dinext-table-cell--align-center",
		},
		{
			field: "status",
			headerName: __("Статус"),
			width: 120,
			cellClass: statusCellClass,
			edit: (row) => fieldCanEdit(row, "status"),
			cellEditor: "agSelectCellEditor",
			cellEditorParams: { values: statusValues },
		},
		{
			field: "priority",
			headerName: __("Приоритет"),
			width: 110,
			cellClass: priorityCellClass,
			edit: (row) => fieldCanEdit(row, "priority"),
			cellEditor: "agSelectCellEditor",
			cellEditorParams: { values: priorityValues },
		},
		{
			field: "exp_start_date",
			headerName: __("Прогноз начала"),
			width: 130,
			type: "date",
			valueFormatter: dateValueFormatter,
			edit: (row) => fieldCanEdit(row, "exp_start_date"),
		},
		{
			field: "exp_end_date",
			headerName: __("Прогноз завершения"),
			width: 140,
			type: "date",
			valueFormatter: dateValueFormatter,
			edit: (row) => fieldCanEdit(row, "exp_end_date"),
		},
		{
			field: "expected_time",
			headerName: __("Длит-сть"),
			width: 90,
			type: "number",
			cellClass: "dinext-table-cell--align-right",
			edit: (row) => fieldCanEdit(row, "expected_time"),
		},
		{
			field: "progress",
			headerName: __("Прогресс"),
			width: 100,
			edit: false,
			cellRenderer: renderProgress,
		},
		{
			field: "custom_include",
			headerName: __("ТШ"),
			width: 56,
			type: "checkbox",
			sortable: false,
			edit: (row) => fieldCanEdit(row, "custom_include"),
		},
		{
			field: "type",
			headerName: __("Тип"),
			width: 110,
			sortable: false,
			edit: false,
		},
		{
			field: "user_tags",
			headerName: __("Метки"),
			width: 140,
			sortable: false,
			edit: false,
			cellRenderer: renderTags,
		},
	];
}
