import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

export function typeColumn() {
	return {
		field: "type",
		headerName: __("Type"),
		...fixedCol(TREE_COL_WIDTH.type),
		sortable: false,
		edit: false,
		cellClass: "dinext-table-cell--align-center",
	};
}
