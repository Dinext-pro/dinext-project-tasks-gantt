import {
	dateConflictClass,
	endDateConflictTooltip,
	startDateConflictTooltip,
} from "../../dependencies/check.js";
import { formatDate } from "../format.js";
import { fieldCanEdit } from "../save.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

export function dateValueFormatter(params) {
	if (!params.value) {
		return "\u00a0";
	}
	return formatDate(params.value);
}

function dateColumnBase(field, headerName, tooltipValueGetter) {
	return {
		field,
		headerName,
		...fixedCol(TREE_COL_WIDTH[field]),
		type: "date",
		valueFormatter: dateValueFormatter,
		cellClass: dateConflictClass,
		tooltipValueGetter,
		edit: (row) => fieldCanEdit(row, field),
		// Tree long date headers — wrap inside fixed HEADER_HEIGHT (gantt sync).
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
