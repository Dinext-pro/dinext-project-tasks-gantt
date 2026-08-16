/**
 * «Прогноз начала/завершения»:
 * - core `type: date` → ISO + fill/paste
 * - domain `FrappeDateCellEditor` → Desk calendar
 */
import {
	dateConflictClassRules,
	endDateConflictTooltip,
	startDateConflictTooltip,
} from "../../../dependencies/check.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { FrappeDateCellEditor } from "./frappe-date-editor.js";

function dateColumnBase(field, headerName, tooltipValueGetter) {
	return {
		field,
		headerName,
		...fixedCol(TREE_COL_WIDTH[field]),
		type: "date",
		edit: (row) => fieldCanEdit(row, field),
		cellEditor: FrappeDateCellEditor,
		cellClass: "dinext-table-cell--align-center",
		cellClassRules: dateConflictClassRules(),
		tooltipValueGetter,
		wrapHeaderText: true,
		headerClass: "tree-gantt-header--wrap",
	};
}

export function expStartColumn() {
	return dateColumnBase(
		"exp_start_date",
		__("Forecast Start"),
		startDateConflictTooltip
	);
}

export function expEndColumn() {
	return dateColumnBase(
		"exp_end_date",
		__("Forecast Completion"),
		endDateConflictTooltip
	);
}
