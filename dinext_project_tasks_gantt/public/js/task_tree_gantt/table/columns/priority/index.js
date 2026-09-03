/**
 * Column «Приоритет»:
 * - core `type: select` → option key + fill/paste
 * - domain `FrappeSelectCellEditor` + colors
 */
import { el, slugClass, searchableTranslated } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { FrappeSelectCellEditor } from "../frappe-select-editor.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { getPriorityOptions } from "./options.js";

const PRIORITY_SLUGS = ["urgent", "high", "medium", "low"];

/** Display label; value in DB stays English. */
export function priorityLabel(value) {
	if (!value) {
		return "";
	}
	return __(String(value));
}

function rowPrioritySlug(params) {
	const value = params?.data?.priority || params?.value || "";
	return slugClass(value);
}

export function priorityCellClass() {
	return "tree-gantt-priority dinext-table-cell--align-center";
}

export function priorityCellClassRules() {
	const rules = {};
	for (const slug of PRIORITY_SLUGS) {
		rules[`tree-gantt-priority--${slug}`] = (params) =>
			rowPrioritySlug(params) === slug;
	}
	return rules;
}

export function renderPriority(params) {
	const row = params.data || {};
	const value = row.priority || params.value || "";
	const wrap = el("div", "tree-gantt-priority-cell");
	const label = priorityLabel(value);
	wrap.textContent = label;
	wrap.title = label;
	wrap.dataset.priority = value;
	if (fieldCanEdit(row, "priority")) {
		wrap.classList.add("tree-gantt-priority--editable");
	}
	return wrap;
}

export function priorityColumn() {
	return {
		field: "priority",
		headerName: __("Priority"),
		...fixedCol(TREE_COL_WIDTH.priority),
		type: "select",
		edit: (row) => fieldCanEdit(row, "priority"),
		cellEditor: FrappeSelectCellEditor,
		cellEditorParams: {
			values: (params) => getPriorityOptions(params.data),
		},
		cellRenderer: renderPriority,
		valueFormatter: (params) => priorityLabel(params.value),
		cellClass: priorityCellClass,
		cellClassRules: priorityCellClassRules(),
		filterValueGetter: (row) => searchableTranslated(row?.priority),
	};
}
