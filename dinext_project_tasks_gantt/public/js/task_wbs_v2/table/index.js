import { getChildren } from "../api.js";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../constants.js";
import { dateFieldsAffectConflicts, refreshConflicts } from "../dependencies/check.js";
import { refreshPlanFact } from "./columns/plan_fact/limits.js";
import { getColumns } from "./columns/index.js";
import { nestRows, toTableRows } from "./rows.js";
import {
	changesAffectGantt,
	onSaveCells,
	onValidateCells,
} from "./save.js";
import { SORT_COMPARATORS } from "./sort.js";

const ensureBundle = () => frappe.require(["dinext-table.bundle.js"]);

function getState(container) {
	return container._twbTable ?? (container._twbTable = {});
}

function showPlaceholder(container, text) {
	container.classList.add("text-muted");
	container.textContent = text;
}

function showError(container, err) {
	container.classList.add("text-muted");
	container.textContent = err?.message || String(err);
}

function destroyState(state) {
	if (state?.table?.destroy) {
		state.table.destroy();
	}
	state.table = null;
}

export function destroyTable(container) {
	if (!container) {
		return;
	}
	const state = container._twbTable;
	if (!state) {
		return;
	}
	destroyState(state);
	delete container._twbTable;
	container.replaceChildren();
}

function readArgs(getArgs) {
	return typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
}

function childrenQuery(getArgs, parent_task = null, extra = {}) {
	const args = readArgs(getArgs);
	return {
		project: args.project || null,
		parent_task,
		status: args.status || null,
		priority: args.priority || null,
		assign: args.assign || null,
		tag: args.tag || null,
		limit: args.limit || null,
		...extra,
	};
}

async function fetchRootRows(getArgs) {
	const args = readArgs(getArgs);
	if (!args.project) {
		return [];
	}
	// Task filter = group: show its children as top-level rows.
	return toTableRows(
		await getChildren(childrenQuery(getArgs, args.task || null))
	);
}

function sideDataCtx(getArgs, table) {
	const args = readArgs(getArgs);
	return { project: args.project || null, table };
}

function scheduleSideDataRefresh(getArgs, table, rows) {
	const ctx = sideDataCtx(getArgs, table);
	if (!ctx.project || !ctx.table) {
		return;
	}
	refreshPlanFact(ctx, rows).catch((e) => {
		console.error("[task_wbs_v2] plan_fact refresh", e);
	});
	refreshConflicts(getArgs, table, rows).catch((e) => {
		console.error("[task_wbs_v2] deps conflict refresh", e);
	});
}

function createExpandHandler(getArgs, onTreeChange) {
	return async ({ rowId, table }) => {
		const children = toTableRows(
			await getChildren(childrenQuery(getArgs, rowId))
		);
		// Sort layer reorders children inside setRowChildren when sort active.
		table.setRowChildren(rowId, children);
		onTreeChange?.();
		scheduleSideDataRefresh(getArgs, table, children);
	};
}

/**
 * @param {HTMLElement} container
 * @param {() => object} getArgs
 * @param {{
 *   onTreeChange?: () => void,
 *   onCellsSaved?: (changes) => void,
 *   onSortChange?: (payload: { sort: object[], table: object }) => void,
 * }} [hooks]
 */
export async function loadTable(container, getArgs, hooks = {}) {
	if (!container) {
		throw new Error("loadTable: container required");
	}

	await ensureBundle();

	const state = getState(container);
	const gen = (state.loadGen = (state.loadGen || 0) + 1);
	const args = readArgs(getArgs);
	const { onTreeChange, onCellsSaved, onSortChange } = hooks;

	container.classList.remove("text-muted");

	if (!args.project) {
		destroyState(state);
		delete container._twbTable;
		showPlaceholder(container, __("Select a project"));
		return null;
	}

	if (!state.table) {
		showPlaceholder(container, __("Loading..."));
	}

	try {
		const rows = await fetchRootRows(getArgs);
		if (gen !== state.loadGen) {
			return null;
		}

		state.rows = rows;

		if (state.table) {
			state.table.refresh?.(rows);
			onTreeChange?.();
			scheduleSideDataRefresh(getArgs, state.table);
			return state.table;
		}

		container.replaceChildren();
		state.table = await DinextTable.create({
			container,
			data: rows,
			columns: getColumns(),
			edit: true,
			selection: { enabled: true },
			// Client source-tree sort (dinext_common sort layer) — not AG flat sort.
			sort: {
				enabled: true,
				multi: false,
				nulls: "last",
				comparators: SORT_COMPARATORS,
			},
			onSortChange: (payload) => {
				onSortChange?.(payload);
			},
			// Tree: no vertical rules; horizontal = 1px dashed gray.
			theme: {
				cellHorizontalPadding: 4,
				spacing: 4,
				columnBorder: false,
				headerColumnBorder: false,
				pinnedColumnBorder: false,
				rowBorder: {
					style: "dashed",
					width: 1,
					color: "gray",
				},
			},
			// Resize only subject — others fixed (Tree parity).
			defaultColDef: {
				resizable: false,
			},
			gridOptions: {
				rowHeight: ROW_HEIGHT,
				headerHeight: HEADER_HEIGHT,
				tooltipShowDelay: 0,
			},
			onExpandRow: createExpandHandler(getArgs, onTreeChange),
			onValidateCells,
			onSaveCells: async (ctx) => {
				const ok = await onSaveCells(ctx);
				if (ok) {
					if (changesAffectGantt(ctx.changes)) {
						onCellsSaved?.(ctx.changes);
					}
					if (dateFieldsAffectConflicts(ctx.changes)) {
						// Full loaded set — successors may gain/lose conflicts.
						scheduleSideDataRefresh(getArgs, state.table);
					}
				}
				return ok;
			},
		});

		if (gen !== state.loadGen) {
			destroyState(state);
			return null;
		}

		onTreeChange?.();
		scheduleSideDataRefresh(getArgs, state.table, rows);
		return state.table;
	} catch (err) {
		if (gen !== state.loadGen) return null;
		destroyState(state);
		delete container._twbTable;
		showError(container, err);
		console.error("[task_wbs_v2] loadTable failed", err);
		return null;
	}
}

/**
 * Full project tree nested + expandAll UI.
 * @param {HTMLElement} [container] table host — used for loadGen abort
 */
export async function expandAllRows(table, getArgs, container) {
	const args = readArgs(getArgs);
	if (!args.project || !table) return;
	const hostState = container?._twbTable;
	const gen = hostState?.loadGen;
	frappe.dom.freeze(__("Loading…"));
	try {
		const flat = toTableRows(
			await getChildren(
				childrenQuery(getArgs, null, {
					all_tasks: 1,
					limit: null,
				})
			)
		);
		if (gen != null && hostState?.loadGen !== gen) {
			return;
		}
		const nested = nestRows(flat);
		// refresh() re-applies active client sort to new source.
		table.refresh?.(nested);
		if (typeof table.expandAll === "function") {
			await table.expandAll();
		}
		if (gen != null && hostState?.loadGen !== gen) {
			return;
		}
		scheduleSideDataRefresh(getArgs, table);
	} finally {
		frappe.dom.unfreeze();
	}
}

export function collapseAllRows(table) {
	table?.collapseAll?.();
}
