import { slugClass } from "../format.js";
import { fieldCanEdit } from "../save.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

function taskSelectValues(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	const raw = field?.options || "";
	return String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function priorityCellClass(params) {
	const slug = slugClass(params.value);
	return slug ? `twb-v2-priority twb-v2-priority--${slug}` : "twb-v2-priority";
}

export function priorityColumn() {
	return {
		field: "priority",
		headerName: __("Приоритет"),
		...fixedCol(TREE_COL_WIDTH.priority),
		cellClass: priorityCellClass,
		edit: (row) => fieldCanEdit(row, "priority"),
		cellEditor: "agSelectCellEditor",
		cellEditorParams: { values: taskSelectValues("priority") },
	};
}
