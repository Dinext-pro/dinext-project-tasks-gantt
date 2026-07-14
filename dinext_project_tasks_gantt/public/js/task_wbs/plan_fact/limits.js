// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { calculateTimesheetLimits } from "../api.js";
import { collectLoadedRows } from "../dependencies/check.js";
import { showPlanFactDialog } from "./dialog.js";

const STATUS_RANK = {
	block: 5,
	message: 4,
	warning: 3,
	normal: 2,
	"no-plan": 1,
	"no-data": 0,
};

export function getMaxStatus(positions) {
	let max = "no-data";
	let maxRank = 0;
	for (const data of positions || []) {
		const status = data.status || "no-data";
		const rank = STATUS_RANK[status] ?? 0;
		if (rank > maxRank) {
			max = status;
			maxRank = rank;
		}
		if (status === "block") {
			return "block";
		}
	}
	return max;
}

function tooltipFor(status) {
	if (status === "normal") {
		return __("Трудозатраты в пределах планов/лимитов");
	}
	if (status === "no-data" || status === "no-plan") {
		return __("Не определены плановые трудозатраты");
	}
	return __("Контроль трудозатрат по задаче");
}

/**
 * @param {object} state
 * @param {object[]} [rows]
 */
export async function refreshPlanFact(state, rows) {
	if (!state?.project || !state.table) {
		return;
	}
	const list = rows?.length ? rows : collectLoadedRows(state.table);
	if (!list.length) {
		return;
	}

	let results = [];
	try {
		results = await calculateTimesheetLimits({
			timesheet_name: "",
			positions: JSON.stringify(
				list.map((row) => ({
					name: row.id,
					document_name: row.id,
					project: state.project,
				}))
			),
		});
	} catch (e) {
		console.warn("task_wbs plan_fact limits", e);
		results = [];
	}

	for (const row of list) {
		const taskData = results.filter(
			(result) =>
				result.position === row.id &&
				(result.planned_hours > 0 || result.total_hours > 0)
		);
		if (taskData.length) {
			row.plan_fact_status = getMaxStatus(taskData);
			row.plan_fact_data = taskData;
			row.plan_fact_title = tooltipFor(row.plan_fact_status);
		} else {
			row.plan_fact_status = "no-data";
			row.plan_fact_data = [];
			row.plan_fact_title = __("Нет данных по трудозатратам");
		}
	}

	state.table.api?.refreshCells?.({
		columns: ["plan_fact"],
		force: true,
	});
}

export function renderPlanFact(params) {
	const row = params.data;
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = `btn btn-xs plan-fact-button ${row?.plan_fact_status || "no-data"}`;
	btn.title = row?.plan_fact_title || __("Нет данных по трудозатратам");
	btn.dataset.docname = row?.id || "";
	btn.innerHTML = '<i class="fa fa-info-circle"></i>';
	btn.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		showPlanFactDialog(row);
	});
	return btn;
}
