/**
 * «Прогноз начала/завершения»:
 * - core `type: date` → ISO + fill/paste
 * - domain `FrappeDateCellEditor` → Desk calendar
 */
import {
	dateConflictClass,
	endDateConflictTooltip,
	startDateConflictTooltip,
} from "../../../dependencies/check.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { FrappeDateCellEditor } from "./frappe-date-editor.js";

function dateCellClass(params) {
	const conflict = dateConflictClass(params);
	return ["dinext-table-cell--align-center", conflict].filter(Boolean).join(" ");
}

function dateColumnBase(field, headerName, tooltipValueGetter) {
	return {
		field,
		headerName,
		...fixedCol(TREE_COL_WIDTH[field]),
		type: "date",
		edit: (row) => fieldCanEdit(row, field),
		cellEditor: FrappeDateCellEditor,
		cellClass: dateCellClass,
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
