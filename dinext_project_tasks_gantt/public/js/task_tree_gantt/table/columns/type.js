import { searchableTranslated } from "../format.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

/** Display label; Task.type in row/API stays English. */
function typeLabel(value) {
	if (!value) {
		return "";
	}
	return __(String(value));
}

export function typeColumn() {
	return {
		field: "type",
		headerName: __("Type"),
		...fixedCol(TREE_COL_WIDTH.type),
		sortable: false,
		edit: false,
		cellClass: "dinext-table-cell--align-center",
		valueFormatter: (params) => typeLabel(params.value),
		filterValueGetter: (row) => searchableTranslated(row?.type),
	};
}
