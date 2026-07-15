/**
 * Column «Статус» — DinextTable: fill on `.ag-cell` via cellClassRules
 * (not child renderer). Renderer = label + click → Frappe Select.
 */
import { el, slugClass } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { startStatusInlineEdit } from "./edit.js";

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
	return "twb-v2-status dinext-table-cell--align-center";
}

/** Paint fill on outer `.ag-cell` — see dinext_common table README / columns-and-formatting. */
export function statusCellClassRules() {
	const rules = {};
	for (const slug of STATUS_SLUGS) {
		rules[`twb-v2-status--${slug}`] = (params) => rowStatusSlug(params) === slug;
	}
	return rules;
}

function wireClick(wrap, params, row) {
	if (!fieldCanEdit(row, "status")) {
		return;
	}
	wrap.classList.add("twb-v2-status--editable");
	wrap.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		void startStatusInlineEdit({ wrap, row, params });
	});
}

export function renderStatus(params) {
	const row = params.data || {};
	const value = row.status || params.value || "";
	const wrap = el("div", "twb-v2-status-cell");
	const label = statusLabel(value);
	wrap.textContent = label;
	wrap.title = label;
	wrap.dataset.status = value;
	wireClick(wrap, params, row);
	return wrap;
}

export function statusColumn() {
	return {
		field: "status",
		headerName: __("Статус"),
		...fixedCol(TREE_COL_WIDTH.status),
		edit: false,
		cellRenderer: renderStatus,
		cellClass: statusCellClass,
		cellClassRules: statusCellClassRules(),
	};
}
