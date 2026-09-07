/**
 * Date columns: plan / forecast / actual.
 * Forecast always visible. Plan + Actual toggled from toolbar.
 * Actual: display only. Plan / forecast: edit if fieldCanEdit.
 */
import {
	dateConflictClassRules,
	endDateConflictTooltip,
	startDateConflictTooltip,
} from "../../../dependencies/check.js";
import { formatDate } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { FrappeDateCellEditor } from "./frappe-date-editor.js";
import { isActualDatesVisible, isPlanDatesVisible } from "./visibility.js";

function dateColumnBase(field, headerName, opts = {}) {
	const {
		edit = "perm",
		tooltipValueGetter,
		hide = false,
		conflicts = false,
	} = opts;
	const col = {
		field,
		headerName,
		...fixedCol(TREE_COL_WIDTH[field] || TREE_COL_WIDTH.exp_start_date),
		type: "date",
		cellClass: "dinext-table-cell--align-center",
		wrapHeaderText: true,
		headerClass: "tree-gantt-header--wrap",
		filterValueGetter: (row) => formatDate(row?.[field]) || row?.[field] || "",
		hide: !!hide,
	};
	if (edit === false) {
		col.edit = false;
		return col;
	}
	col.edit = (row) => fieldCanEdit(row, field);
	col.cellEditor = FrappeDateCellEditor;
	if (conflicts) {
		col.cellClassRules = dateConflictClassRules();
	}
	if (tooltipValueGetter) {
		col.tooltipValueGetter = tooltipValueGetter;
	}
	return col;
}

export function plannedStartColumn() {
	return dateColumnBase("custom_planned_start_date", __("Plan Start"), {
		hide: !isPlanDatesVisible(),
	});
}

export function plannedEndColumn() {
	return dateColumnBase("custom_planned_end_date", __("Plan Completion"), {
		hide: !isPlanDatesVisible(),
	});
}

export function expStartColumn() {
	return dateColumnBase("exp_start_date", __("Forecast Start"), {
		conflicts: true,
		tooltipValueGetter: startDateConflictTooltip,
	});
}

export function expEndColumn() {
	return dateColumnBase("exp_end_date", __("Forecast Completion"), {
		conflicts: true,
		tooltipValueGetter: endDateConflictTooltip,
	});
}

export function actualStartColumn() {
	return dateColumnBase("act_start_date", __("Fact Start"), {
		edit: false,
		hide: !isActualDatesVisible(),
	});
}

export function actualEndColumn() {
	return dateColumnBase("act_end_date", __("Fact Completion"), {
		edit: false,
		hide: !isActualDatesVisible(),
	});
}
