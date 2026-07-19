/**
 * Columns «Прогноз начала/завершения» — display + click → Frappe Date calendar.
 */
import {
	dateConflictClass,
	endDateConflictTooltip,
	startDateConflictTooltip,
} from "../../../dependencies/check.js";
import { el, formatDate } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { startDateInlineEdit } from "./edit.js";

export function dateValueFormatter(params) {
	if (!params.value) {
		return "\u00a0";
	}
	return formatDate(params.value);
}

function wireClick(wrap, params, row, field) {
	if (!fieldCanEdit(row, field)) {
		return;
	}
	wrap.classList.add("tree-gantt-date--editable");
	wrap.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		void startDateInlineEdit({ wrap, row, params, field });
	});
}

function renderDateCell(params, field) {
	const row = params.data || {};
	const value = row[field] || params.value || "";
	const wrap = el("div", "tree-gantt-date-cell");
	const label = value ? formatDate(value) : "\u00a0";
	wrap.textContent = label;
	wrap.title = value ? formatDate(value) : "";
	wireClick(wrap, params, row, field);
	return wrap;
}

function dateColumnBase(field, headerName, tooltipValueGetter) {
	return {
		field,
		headerName,
		...fixedCol(TREE_COL_WIDTH[field]),
		// Inline Frappe ControlDate (calendar); not AG date editor.
		edit: false,
		cellRenderer: (params) => renderDateCell(params, field),
		valueFormatter: dateValueFormatter,
		cellClass: dateConflictClass,
		tooltipValueGetter,
		wrapHeaderText: true,
		headerClass: "tree-gantt-header--wrap",
	};
}

export function expStartColumn() {
	return dateColumnBase(
		"exp_start_date",
		__("Прогноз начала"),
		startDateConflictTooltip
	);
}

export function expEndColumn() {
	return dateColumnBase(
		"exp_end_date",
		__("Прогноз завершения"),
		endDateConflictTooltip
	);
}
