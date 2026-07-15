import { fieldCanEdit } from "../save.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

export function includeColumn() {
	return {
		field: "custom_include",
		headerName: __("ТШ"),
		...fixedCol(TREE_COL_WIDTH.custom_include),
		type: "checkbox",
		sortable: false,
		edit: (row) => fieldCanEdit(row, "custom_include"),
	};
}
