import { getChildren } from "../api.js";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../constants.js";
import { dateFieldsAffectConflicts, refreshConflicts } from "../dependencies/check.js";
import { refreshPlanFact } from "./columns/plan_fact/limits.js";
import { bulkAssignToolbarItem } from "./columns/assign/bulk.js";
import { addRootTaskToolbarItem } from "./columns/subject/actions.js";
import { getColumns } from "./columns/index.js";
import { nestRows, toTableRows } from "./rows.js";
import {
	changesAffectGantt,
	onSaveCells,
	onValidateCells,
} from "./save.js";
import { SORT_COMPARATORS } from "./sort.js";
import { createOnRowReorder } from "../dnd/index.js";

const ensureBundle = () => frappe.require(["dinext-table.bundle.js"]);

function getState(container) {
	return container._treeGanttTable ?? (container._treeGanttTable = {});
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

function snapshotExpandedIds(table, extraIds) {
	const ids = [];
	if (table?.expandedIds) {
		ids.push(...table.expandedIds);
	}
	if (extraIds?.length) {
		ids.push(...extraIds);
	}
	return ids;
}

function sortExpandedIds(ids) {
	return [...new Set((ids || []).map(String).filter(Boolean))].sort(
		(a, b) => a.split(":").length - b.split(":").length || a.localeCompare(b)
	);
}

/**
 * refresh(roots) drops lazy children. expandRow no-ops if id still in expandedIds —
 * clear, then re-expand shallow → deep so onExpandRow reloads each layer.
 */
async function restoreExpanded(table, ids, gen, state) {
	if (!table?.expandRow) {
		return;
	}
	const ordered = sortExpandedIds(ids);
	if (!ordered.length) {
		return;
	}
	table.expandedIds?.clear?.();
	for (const id of ordered) {
		if (gen != null && state?.loadGen !== gen) {
			return;
		}
		try {
			await table.expandRow(id);
		} catch (e) {
			console.error("[task_tree_gantt] restore expand", id, e);
		}
	}
}

function scheduleSideDataRefresh(getArgs, table, rows) {
	const ctx = sideDataCtx(getArgs, table);
	if (!ctx.project || !ctx.table) {
		return;
	}
	refreshPlanFact(ctx, rows).catch((e) => {
		console.error("[task_tree_gantt] plan_fact refresh", e);
	});
	// Always full loaded set — successors outside `rows` may gain/lose flags.
	refreshConflicts(getArgs, table).catch((e) => {
		console.error("[task_tree_gantt] deps conflict refresh", e);
	});
}

function createExpandHandler(getArgs, onTreeChange) {
	return async ({ rowId, row, table }) => {
		// API parent_task = business Task name; rowId is tree path (`A:B`).
		const parentTask =
			row?.id || String(rowId || "").split(":").filter(Boolean).pop() || null;
		const children = toTableRows(
			await getChildren(childrenQuery(getArgs, parentTask))
		);
		// Sort layer reorders children inside setRowChildren when sort active.
		table.setRowChildren(rowId, children);
		onTreeChange?.();
		// plan_fact: new children only; conflicts: full tree (see scheduleSideDataRefresh).
		scheduleSideDataRefresh(getArgs, table, children);
	};
}

/**
 * Fullscreen shell = page.main (page-form filters + Tree Gantt shell), WR pattern.
 * @param {HTMLElement} container
 * @param {HTMLElement | null | undefined} shell
 */
function resolveFullscreenOpts(container, shell) {
	const fsShell =
		shell ||
		container?.closest?.(".layout-main-section") ||
		container?.closest?.(".task-tree-gantt-shell");
	if (!fsShell) {
		return undefined;
	}
	return {
		target: "shell",
		shell: fsShell,
		onEnter: ({ element }) => {
			element?.classList.add("task-tree-gantt--fullscreen");
		},
		onExit: ({ element }) => {
			element?.classList.remove("task-tree-gantt--fullscreen");
		},
	};
}

/**
 * @param {HTMLElement} container
 * @param {() => object} getArgs
 * @param {{
 *   onTreeChange?: () => void,
 *   onCellsSaved?: (changes) => void,
 *   onSortChange?: (payload: { sort: object[], table: object }) => void,
 *   fullscreenShell?: HTMLElement | null,
 *   expandRowIds?: string[],
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
	const { onTreeChange, onCellsSaved, onSortChange, fullscreenShell, expandRowIds } =
		hooks;
	const fullscreen = resolveFullscreenOpts(container, fullscreenShell);

	container.classList.remove("text-muted");

	if (!args.project) {
		destroyState(state);
		delete container._treeGanttTable;
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
			const expanded = snapshotExpandedIds(state.table, expandRowIds);
			state.table.refresh?.(rows);
			await restoreExpanded(state.table, expanded, gen, state);
			if (gen !== state.loadGen) {
				return null;
			}
			onTreeChange?.();
			scheduleSideDataRefresh(getArgs, state.table);
			return state.table;
		}

		container.replaceChildren();
		const projectKey = args.project || "no-project";
		const taskKey = args.task ? `:${args.task}` : "";

		state.table = await DinextTable.create({
			container,
			data: rows,
			columns: getColumns(),
			edit: true,
			selection: { enabled: true },
			// Fill-handle / paste: dates, assign, status, priority, ТШ (custom_include).
			clipboard: { enabled: true },
			fillHandle: { enabled: true },
			rowCheck: { enabled: true },
			toolbar: {
				persistKey: `task-tree-gantt:${projectKey}${taskKey}`,
				items: [addRootTaskToolbarItem(), bulkAssignToolbarItem()],
			},
			rowReorder: {
				enabled: true,
				// Full tree DnD: sibling reorder + reparent / nest (DinextTable).
				allowTree: "reparent",
			},
			onRowReorder: createOnRowReorder(),
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
			...(fullscreen ? { fullscreen } : {}),
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
		delete container._treeGanttTable;
		showError(container, err);
		console.error("[task_tree_gantt] loadTable failed", err);
		return null;
	}
}

/**
 * Full project tree nested + expand UI (table toolbar Expand all).
 * @param {HTMLElement} [container] table host — used for loadGen abort
 * @param {() => void | Promise<void>} [expandUi] native table.expandAll (avoid recurse)
 */
export async function expandAllRows(table, getArgs, container, expandUi) {
	const args = readArgs(getArgs);
	if (!args.project || !table) return;
	const hostState = container?._treeGanttTable;
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
		const expand =
			typeof expandUi === "function"
				? expandUi
				: table.expandAll?.bind(table);
		if (expand) {
			await expand();
		}
		if (gen != null && hostState?.loadGen !== gen) {
			return;
		}
		scheduleSideDataRefresh(getArgs, table);
	} finally {
		frappe.dom.unfreeze();
	}
}
