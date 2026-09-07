import { el, formatPercent } from "../format.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

export function renderProgress(params) {
	const value = Number(params.value) || 0;
	const pct = Math.max(0, Math.min(100, Math.round(value)));
	const wrap = el("div", "tree-gantt-progress");
	wrap.title = formatPercent(value);
	// Tree creareProgress: .progress-bar.progress-bar-success
	const bar = el("div", "progress-bar progress-bar-success tree-gantt-progress-bar");
	bar.setAttribute("role", "progressbar");
	bar.setAttribute("aria-valuenow", String(pct));
	bar.setAttribute("aria-valuemin", "0");
	bar.setAttribute("aria-valuemax", "100");
	bar.style.width = `${pct}%`;
	wrap.appendChild(bar);
	return wrap;
}

export function progressColumn() {
	return {
		field: "progress",
		headerName: __("Progress"),
		...fixedCol(TREE_COL_WIDTH.progress),
		edit: false,
		cellRenderer: renderProgress,
		cellClass: "dinext-table-cell--align-center",
		filterKind: "number",
		filterValueGetter: (row) => row?.progress ?? 0,
	};
}
