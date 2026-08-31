/**
 * Column «Статус»:
 * - core `type: select` → option key + fill/paste
 * - domain `FrappeSelectCellEditor` + colors
 */
import { el, slugClass, searchableTranslated } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { FrappeSelectCellEditor } from "../frappe-select-editor.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { getStatusOptions } from "./options.js";

const STATUS_SLUGS = [
	"completed",
	"overdue",
	"cancelled",
	"working",
	"pending_review",
];

/** Display label; value in DB stays English. */
export function statusLabel(value) {
	if (!value) {
		return "";
	}
	return __(String(value));
}

function rowStatusSlug(params) {
	const value = params?.data?.status || params?.value || "";
	return slugClass(value);
}

/** Base + align utility (dinext-table.css). */
export function statusCellClass() {
	return "tree-gantt-status dinext-table-cell--align-center";
}

/** Paint fill on outer `.ag-cell` — see dinext_common table README / columns-and-formatting. */
export function statusCellClassRules() {
	const rules = {};
	for (const slug of STATUS_SLUGS) {
		rules[`tree-gantt-status--${slug}`] = (params) => rowStatusSlug(params) === slug;
	}
	return rules;
}

export function renderStatus(params) {
	const row = params.data || {};
	const value = row.status || params.value || "";
	const wrap = el("div", "tree-gantt-status-cell");
	const label = statusLabel(value);
	wrap.textContent = label;
	wrap.title = label;
	wrap.dataset.status = value;
	if (fieldCanEdit(row, "status")) {
		wrap.classList.add("tree-gantt-status--editable");
	}
	return wrap;
}

export function statusColumn() {
	return {
		field: "status",
		headerName: __("Status"),
		...fixedCol(TREE_COL_WIDTH.status),
		type: "select",
		edit: (row) => fieldCanEdit(row, "status"),
		cellEditor: FrappeSelectCellEditor,
		cellEditorParams: {
			values: (params) => getStatusOptions(params.data),
		},
		cellRenderer: renderStatus,
		valueFormatter: (params) => statusLabel(params.value),
		cellClass: statusCellClass,
		cellClassRules: statusCellClassRules(),
		filterValueGetter: (row) => searchableTranslated(row?.status),
	};
}
