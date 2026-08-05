import { checkDependencies } from "../api.js";

export const DEP_CONFLICT_CLASS = "tree-gantt-dep-conflict";

const CONFLICT_COLUMNS = ["subject", "exp_start_date", "exp_end_date"];

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

function clearConflict(row) {
	row.dep_conflict = 0;
	row.dep_conflict_start = "";
	row.dep_conflict_end = "";
}

function applyConflictFields(row, src) {
	row.dep_conflict = src?.dep_conflict || 0;
	row.dep_conflict_start = src?.dep_conflict_start || "";
	row.dep_conflict_end = src?.dep_conflict_end || "";
}

function applyResults(rowsById, results) {
	for (const row of Object.values(rowsById)) {
		clearConflict(row);
	}
	for (const item of results || []) {
		const row = rowsById[item.checked_task];
		if (!row || !item.violations?.length) {
			continue;
		}
		row.dep_conflict = 1;
		for (const v of item.violations) {
			if (v.violated_field === "start") {
				row.dep_conflict_start = v.message || __("Conflict");
			} else if (v.violated_field === "end") {
				row.dep_conflict_end = v.message || __("Conflict");
			}
		}
	}
}

/**
 * DinextTable tree uses makeVisibleRow({...row}) copies in AG Grid.
 * Must stamp dep_conflict* onto source AND visible node.data (same as plan_fact).
 */
function stampVisibleConflicts(table, rowsById) {
	const stamp = (data) => {
		if (!data?.id || !rowsById[data.id]) {
			return;
		}
		applyConflictFields(data, rowsById[data.id]);
	};

	if (typeof table.api?.forEachNode === "function") {
		table.api.forEachNode((node) => stamp(node.data));
	} else {
		for (const row of table.rowData || []) {
			stamp(row);
		}
	}

	table?.api?.refreshCells?.({
		columns: CONFLICT_COLUMNS,
		force: true,
	});
}

export function dateFieldsAffectConflicts(changes) {
	return (changes || []).some(
		(c) =>
			c.field === "exp_start_date" ||
			c.field === "exp_end_date" ||
			c.field === "relations"
	);
}

function resolveProject(getArgs) {
	const args = typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
	return args.project || null;
}

/**
 * Call SS check_dependencies_for_tasks and stamp conflict flags on rows.
 * @param {() => object} getArgs filter args (project required)
 * @param {object} table DinextTable instance
 * @param {object[]} [rows] subset; default all loaded
 */
export async function refreshConflicts(getArgs, table, rows) {
	const project = resolveProject(getArgs);
	if (!project || !table) {
		return;
	}
	const list = rows?.length ? rows : collectLoadedRows(table);
	if (!list.length) {
		return;
	}

	const rowsById = {};
	for (const row of list) {
		rowsById[row.id] = row;
		clearConflict(row);
	}

	const results = await checkDependencies({
		project,
		tasks: list.map((row) => ({
			name: row.id,
			project,
			subject: row.subject,
			exp_start_date: row.exp_start_date,
			exp_end_date: row.exp_end_date,
		})),
	});

	applyResults(rowsById, results);
	stampVisibleConflicts(table, rowsById);
}

export function dateConflictClass(params) {
	const row = params.data;
	const field = params.colDef?.field;
	if (!row || !field) {
		return "";
	}
	if (field === "exp_start_date" && row.dep_conflict_start) {
		return DEP_CONFLICT_CLASS;
	}
	if (field === "exp_end_date" && row.dep_conflict_end) {
		return DEP_CONFLICT_CLASS;
	}
	return "";
}

/** Reactive on refreshCells — plain cellClass does not re-apply. */
export function subjectConflictClassRules() {
	return {
		[DEP_CONFLICT_CLASS]: (params) => !!params.data?.dep_conflict,
	};
}

/** Reactive on refreshCells — plain cellClass does not re-apply. */
export function dateConflictClassRules() {
	return {
		[DEP_CONFLICT_CLASS]: (params) => !!dateConflictClass(params),
	};
}

/** Remount subject tree body when conflict chrome changes (same subject value). */
export function subjectTreeContentKey(params) {
	const row = params?.data || {};
	return `${row.dep_conflict || 0}\0${row.dep_conflict_start || ""}\0${
		row.dep_conflict_end || ""
	}`;
}

export function startDateConflictTooltip(params) {
	return params.data?.dep_conflict_start || null;
}

export function endDateConflictTooltip(params) {
	return params.data?.dep_conflict_end || null;
}
