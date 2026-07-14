// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

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
import { dateConflictClass, subjectConflictClass } from "../dependencies/check.js";
import { renderPlanFact } from "../plan_fact/limits.js";

const SORTABLE = {
	sortable: true,
	comparator: () => 0,
};

function taskSelectValues(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	const raw = field?.options || "";
	return String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

function editIfWritable(row, field) {
	return fieldCanEdit(row, field);
}

/**
 * WBS columns — render/edit + plan-fact + dep conflict classes.
 * @param {object} [state]
 */
export function getColumns(state) {
	void state;
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
			cellClass: subjectConflictClass,
			edit: (row) => editIfWritable(row, "subject"),
			...SORTABLE,
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
			edit: (row) => editIfWritable(row, "status"),
			cellEditor: "agSelectCellEditor",
			cellEditorParams: { values: statusValues },
			...SORTABLE,
		},
		{
			field: "priority",
			headerName: __("Приоритет"),
			width: 110,
			cellClass: priorityCellClass,
			edit: (row) => editIfWritable(row, "priority"),
			cellEditor: "agSelectCellEditor",
			cellEditorParams: { values: priorityValues },
			...SORTABLE,
		},
		{
			field: "exp_start_date",
			headerName: __("Прогноз начала"),
			width: 130,
			type: "date",
			valueFormatter: dateValueFormatter,
			cellClass: dateConflictClass,
			edit: (row) => editIfWritable(row, "exp_start_date"),
			tooltipValueGetter: (p) => p.data?.dep_conflict_start || null,
			...SORTABLE,
		},
		{
			field: "exp_end_date",
			headerName: __("Прогноз завершения"),
			width: 140,
			type: "date",
			valueFormatter: dateValueFormatter,
			cellClass: dateConflictClass,
			edit: (row) => editIfWritable(row, "exp_end_date"),
			tooltipValueGetter: (p) => p.data?.dep_conflict_end || null,
			...SORTABLE,
		},
		{
			field: "expected_time",
			headerName: __("Длит-сть"),
			width: 90,
			type: "number",
			cellClass: "dinext-table-cell--align-right",
			edit: (row) => editIfWritable(row, "expected_time"),
			...SORTABLE,
		},
		{
			field: "plan_fact",
			headerName: __("ТРЗ"),
			width: 56,
			sortable: false,
			edit: false,
			cellRenderer: renderPlanFact,
			cellClass: "dinext-table-cell--align-center",
		},
		{
			field: "progress",
			headerName: __("Прогресс"),
			width: 100,
			sortable: false,
			edit: false,
			cellRenderer: renderProgress,
		},
		{
			field: "custom_include",
			headerName: __("ТШ"),
			width: 56,
			type: "checkbox",
			sortable: false,
			edit: (row) => editIfWritable(row, "custom_include"),
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
