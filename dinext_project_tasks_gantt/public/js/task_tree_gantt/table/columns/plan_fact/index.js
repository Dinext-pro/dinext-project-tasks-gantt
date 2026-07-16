/**
 * Column «ТРЗ» — Tree hours cell:
 * plan-fact-button + status class, click → dialog only when data.
 */
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { showPlanFactDialog } from "./dialog.js";

function renderPlanFactButton(row) {
	const status = row?.plan_fact_status || "no-data";
	const hasData = Array.isArray(row?.plan_fact_data) && row.plan_fact_data.length > 0;

	const btn = document.createElement("button");
	btn.type = "button";
	// Tree: .plan-fact-button.{status} (hex colors + dialog formatters share status class)
	btn.className = `btn btn-xs plan-fact-button tree-gantt-plan-fact-btn ${status}`;
	btn.title = row?.plan_fact_title || __("Нет данных по трудозатратам");
	btn.dataset.docname = row?.id || "";
	btn.innerHTML = '<i class="fa fa-info-circle"></i>';

	// Tree: click only when taskData present
	if (hasData) {
		btn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			showPlanFactDialog(row);
		});
	}

	return btn;
}

export function renderPlanFact(params) {
	const wrap = document.createElement("div");
	wrap.className = "tree-gantt-plan-fact";
	wrap.appendChild(renderPlanFactButton(params.data || {}));
	return wrap;
}

export function planFactColumn() {
	return {
		field: "plan_fact",
		headerName: __("ТРЗ"),
		...fixedCol(TREE_COL_WIDTH.plan_fact),
		sortable: false,
		edit: false,
		cellRenderer: renderPlanFact,
		cellClass: "dinext-table-cell--align-center",
	};
}
