/**
 * Column «Приоритет» — same pattern as status:
 * cell shows __(English value); click → Frappe Select; DB stays English.
 */
import { el, slugClass } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { startPriorityInlineEdit } from "./edit.js";
import { parsePriorityValue } from "./options.js";

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

function wireEdit(wrap, params, row) {
	if (!fieldCanEdit(row, "priority")) {
		return;
	}
	wrap.classList.add("tree-gantt-priority--editable");
	wrap.title = [wrap.title, __("Double-click to edit")].filter(Boolean).join(" — ");
	// Single click → selection / fill-handle; dblclick → Select.
	wrap.addEventListener("dblclick", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		void startPriorityInlineEdit({ wrap, row, params });
	});
}

export function renderPriority(params) {
	const row = params.data || {};
	const value = row.priority || params.value || "";
	const wrap = el("div", "tree-gantt-priority-cell");
	const label = priorityLabel(value);
	wrap.textContent = label;
	wrap.title = label;
	wrap.dataset.priority = value;
	wireEdit(wrap, params, row);
	return wrap;
}

export function priorityColumn() {
	return {
		field: "priority",
		headerName: __("Приоритет"),
		...fixedCol(TREE_COL_WIDTH.priority),
		edit: (row) => fieldCanEdit(row, "priority"),
		suppressClickEdit: true,
		cellRenderer: renderPriority,
		valueFormatter: (params) => priorityLabel(params.value),
		valueParser: parsePriorityValue,
		cellClass: priorityCellClass,
		cellClassRules: priorityCellClassRules(),
	};
}
