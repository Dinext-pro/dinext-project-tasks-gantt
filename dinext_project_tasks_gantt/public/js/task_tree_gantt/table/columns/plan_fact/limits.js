/**
 * ТРЗ limits — Tree refresh_tree_limits / apply_tree_limit_styles.
 *
 * DinextTable tree uses makeVisibleRow({...row}) copies in AG Grid.
 * Must stamp plan_fact_* onto source AND visible node.data.
 */
import { calculateTimesheetLimits } from "../../../api.js";

const STATUS_RANK = {
	block: 5,
	message: 4,
	warning: 3,
	normal: 2,
	"no-plan": 1,
	"no-data": 0,
};

function walkRows(rows, out) {
	for (const row of rows || []) {
		if (row?.id) {
			out.push(row);
		}
		if (row.children?.length) {
			walkRows(row.children, out);
		}
	}
	return out;
}

/** All loaded tree rows (roots + expanded children in sourceData). */
export function collectLoadedRows(table) {
	const source = table?.sourceData || table?.options?.data || [];
	return walkRows(source, []);
}

/** Tree get_max_status: block > message > warning > normal > no-plan/no-data. */
export function getMaxStatus(positions) {
	let max = "no-data";
	let maxRank = 0;
	for (const data of positions || []) {
		const status = data.status || "no-data";
		if (status === "block") {
			return "block";
		}
		const rank = STATUS_RANK[status] ?? 0;
		if (rank > maxRank) {
			max = status;
			maxRank = rank;
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

function applyPlanFactFields(row, status, taskData, title) {
	row.plan_fact_status = status;
	row.plan_fact_data = taskData;
	row.plan_fact_title = title;
}

/** Copy plan_fact_* from source rows onto AG Grid visible copies. */
function stampVisiblePlanFact(table, byId) {
	const stamp = (data) => {
		if (!data?.id) {
			return;
		}
		const src = byId[data.id];
		if (!src) {
			return;
		}
		applyPlanFactFields(
			data,
			src.plan_fact_status,
			src.plan_fact_data,
			src.plan_fact_title
		);
	};

	if (typeof table.api?.forEachNode === "function") {
		table.api.forEachNode((node) => stamp(node.data));
	} else {
		for (const row of table.rowData || []) {
			stamp(row);
		}
	}

	table.api?.refreshCells?.({
		columns: ["plan_fact"],
		force: true,
	});
}

/**
 * @param {{ project: string, table: object }} ctx
 * @param {object[]} [rows] subset of source rows; default all loaded
 */
export async function refreshPlanFact(ctx, rows) {
	const { project, table } = ctx || {};
	if (!project || !table) {
		return;
	}

	const loaded = collectLoadedRows(table);
	const idFilter = rows?.length ? new Set(rows.map((r) => r.id).filter(Boolean)) : null;
	const list = idFilter ? loaded.filter((r) => idFilter.has(r.id)) : loaded;
	if (!list.length) {
		return;
	}

	let results = [];
	try {
		// Tree / WE pass array; frappe.call JSON.stringifies once for form_dict.
		results = await calculateTimesheetLimits({
			timesheet_name: "",
			positions: list.map((row) => ({
				name: row.id,
				document_name: row.id,
				project,
			})),
		});
	} catch (e) {
		console.warn("[task_tree_gantt] plan_fact limits", e);
		results = [];
	}

	if (!Array.isArray(results)) {
		results = [];
	}

	const byId = {};
	for (const row of list) {
		const taskData = results.filter(
			(result) =>
				result.position === row.id &&
				(Number(result.planned_hours) > 0 || Number(result.total_hours) > 0)
		);
		if (taskData.length) {
			const status = getMaxStatus(taskData);
			applyPlanFactFields(row, status, taskData, tooltipFor(status));
		} else {
			applyPlanFactFields(
				row,
				"no-data",
				[],
				__("Нет данных по трудозатратам")
			);
		}
		byId[row.id] = row;
	}

	stampVisiblePlanFact(table, byId);
}
