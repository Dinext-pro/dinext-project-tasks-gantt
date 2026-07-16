import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

export function durationValueFormatter(params) {
	const value = params.data?.duration;
	if (value == null || value === "") {
		return "-";
	}
	return String(value);
}

export function durationColumn() {
	return {
		field: "expected_time",
		headerName: __("Длит-сть"),
		...fixedCol(TREE_COL_WIDTH.expected_time),
		type: "number",
		// Tree centers duration; override number preset align-right.
		cellClass: "dinext-table-cell--align-center",
		valueFormatter: durationValueFormatter,
		edit: false,
	};
}
