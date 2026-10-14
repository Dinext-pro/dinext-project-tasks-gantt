import { getChildren } from "../api.js";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../constants.js";
import { hasMulti, multiPayload, normalizeMulti } from "../filters/defaults.js";
import { dateFieldsAffectConflicts, refreshConflicts } from "../dependencies/check.js";
import {
	criticalPathToolbarItem,
	invalidateCriticalPath,
} from "../critical/index.js";
import { refreshPlanFact } from "./columns/plan_fact/limits.js";
import { bulkAssignToolbarItem } from "./columns/assign/bulk.js";
import { dateVisibilityToolbarItems } from "./columns/dates/visibility.js";
import { addRootTaskToolbarItem } from "./columns/subject/actions.js";
import { getColumns } from "./columns/index.js";
import {
	createOnBeforeDeleteRows,
	createOnDeleteRows,
} from "./delete.js";
import {
	ancestorExpandIds,
	collectPathById,
	collectRelatedTaskIds,
} from "./related.js";
import { applyTreeMerge } from "./merge.js";
import {
	clearRemovedIds,
	dropRemovedTasks,
	getRemovedIdList,
	installRemovedIdFilter,
	rememberRemovedIds,
	stripRemovedTree,
} from "./removed.js";
import { nestRows, toTableRows } from "./rows.js";
import {
	changesAffectGantt,
	onSaveCells,
	onValidateCells,
	writeDeniedTitle,
} from "./save.js";
import { SORT_COMPARATORS } from "./sort.js";
import { createOnRowReorder, canReorderTaskRow, validateTaskRowReorder } from "../dnd/index.js";

const ensureBundle = () => frappe.require(["dinext-table.bundle.js"]);

function getState(container) {
	return container._treeGanttTable ?? (container._treeGanttTable = {});
}

const HOST_LOADING = "task-tree-gantt-table-host--loading";

function clearHostChrome(container) {
	container.classList.remove("text-muted", HOST_LOADING);
}

function showPlaceholder(container, text) {
	clearHostChrome(container);
	container.classList.add("text-muted");
	container.textContent = text;
}

function showLoading(container) {
	clearHostChrome(container);
	container.classList.add(HOST_LOADING);
	container.replaceChildren();
	const spin = document.createElement("div");
	spin.className = "task-tree-gantt-table-spinner";
	spin.setAttribute("role", "status");
	spin.setAttribute("aria-label", __("Loading…"));
	container.appendChild(spin);
}

function showError(container, err) {
	clearHostChrome(container);
	container.classList.add("text-muted");
	container.textContent = err?.message || String(err);
}

function destroyState(state) {
	if (state?.table?.destroy) {
		state.table.destroy();
	}
	state.table = null;
	state.loadedProject = null;
	state.lastMerge = null;
	state.treeFullyLoaded = false;
}

function bindReorderDeniedHint(container) {
	if (container._writeDeniedHandleHint) {
		return;
	}
	container._writeDeniedHandleHint = true;
	container.addEventListener("pointerover", (e) => {
		const handle = e.target?.closest?.(".dinext-table-row-reorder-handle");
		if (!handle || !container.contains(handle)) {
			return;
		}
		const table = getState(container).table;
		const sortLocked =
			container.classList.contains("dinext-table--row-reorder-sort-locked") ||
			!!table?.isRowReorderSortLocked?.();
		const denied = handle
			.closest(".ag-row")
			?.classList.contains("tree-gantt-row--reorder-denied");
		const tip = sortLocked
			? (table?.getRowReorderSortLockTooltip?.() || __("Clear sort to move a task"))
			: denied
				? writeDeniedTitle()
				: __("Move");
		if (handle.getAttribute("title") !== tip) {
			handle.setAttribute("title", tip);
			handle.setAttribute("aria-label", tip);
		}
		const host = handle.parentElement;
		if (host?.classList.contains("dinext-table-row-reorder-handle-host")) {
			host.setAttribute("title", tip);
		}
	});
}

function readArgs(getArgs) {
	return typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
}

function childrenQuery(getArgs, parent_task = null, extra = {}) {
	const args = readArgs(getArgs);
	return {
		project: args.project || null,
		parent_task,
		task: multiPayload(args.task),
		status: multiPayload(args.status),
		priority: multiPayload(args.priority),
		assign: multiPayload(args.assign),
		tag: multiPayload(args.tag),
		limit: args.limit || null,
		...extra,
	};
}

async function fetchRootRows(getArgs) {
	const args = readArgs(getArgs);
	if (!args.project) {
		return [];
	}
	if (hasMulti(args.task)) {
		const flat = toTableRows(
			await getChildren(
				childrenQuery(getArgs, null, { all_tasks: 1, limit: null })
			)
		);
		return nestRows(flat);
	}
	return toTableRows(await getChildren(childrenQuery(getArgs, null)));
}

/** One request: full project (or Task-filter path), nested. */
async function fetchFullTreeRows(getArgs) {
	const args = readArgs(getArgs);
	if (!args.project) {
		return [];
	}
	const flat = toTableRows(
		await getChildren(
			childrenQuery(getArgs, null, {
				all_tasks: 1,
				limit: null,
			})
		)
	);
	return nestRows(flat);
}

function taskPathExpandIds(rows, taskIds) {
	const ids = normalizeMulti(taskIds);
	if (!ids.length) {
		return [];
	}
	const map = collectPathById(rows);
	const out = [];
	for (const id of ids) {
		out.push(...ancestorExpandIds(map.get(String(id))));
	}
	return [...new Set(out)];
}

function shouldFetchFullTree(state, expandedIds) {
	if (state?.treeFullyLoaded && expandedIds.length) {
		return true;
	}
	// Nested path (`A:B`): roots-only fetch has no child row to merge.
	if ((expandedIds || []).some((id) => String(id).includes(":"))) {
		return true;
	}
	return expandedIds.length > 1;
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

function seedExpandedIds(table, ids) {
	if (!table?.expandedIds) {
		return;
	}
	table.expandedIds.clear();
	for (const id of sortExpandedIds(ids)) {
		table.expandedIds.add(id);
	}
}

/** Path ids for every expandable node in a nested source tree (parents before children). */
function collectExpandablePathIds(rows, parentPath = null, out = []) {
	for (const row of rows || []) {
		const id = parentPath ? `${parentPath}:${row.id}` : String(row.id);
		const kids = row.children;
		const expandable =
			row.hasChildren === true || (Array.isArray(kids) && kids.length > 0);
		if (expandable) {
			out.push(id);
			if (Array.isArray(kids) && kids.length) {
				collectExpandablePathIds(kids, id, out);
			}
		}
	}
	return out;
}

function rowHasVisibleDescendants(table, rowId) {
	const prefix = `${String(rowId)}:`;
	let found = false;
	table.api?.forEachNode?.((node) => {
		if (found) {
			return;
		}
		const id = String(node.data?._rowId || "");
		if (id.startsWith(prefix)) {
			found = true;
		}
	});
	return found;
}

/**
 * expandRow no-ops if id already in expandedIds. Drop from the set and expand
 * until source children exist and are visible (Add Child: leaf → group).
 */
async function ensureExpanded(table, ids, gen, state) {
	if (!table?.expandRow || !ids?.length) {
		return;
	}
	for (const id of sortExpandedIds(ids)) {
		if (gen != null && state?.loadGen !== gen) {
			return;
		}
		const kids = table.getSourceChildren?.(id) || [];
		const visible = rowHasVisibleDescendants(table, id);
		if (kids.length && visible && table.isRowExpanded?.(id)) {
			continue;
		}
		if (table.expandedIds?.has?.(id)) {
			table.expandedIds.delete(id);
		}
		try {
			await table.expandRow(id);
		} catch (e) {
			console.error("[task_tree_gantt] ensure expand", id, e);
		}
	}
	table.refreshAllTreeToggles?.();
}

/** Shallow reload cannot see a new child — refetch that parent layer. */
async function refetchParentLayers(table, getArgs, parentRowIds) {
	for (const rowId of sortExpandedIds(parentRowIds)) {
		const parentTask =
			table.findTreeSourceRow?.(rowId)?.id ||
			String(rowId).split(":").filter(Boolean).pop() ||
			null;
		const children = toTableRows(
			await getChildren(childrenQuery(getArgs, parentTask))
		).filter((child) => String(child?.id || "") !== String(parentTask || ""));
		table.setRowChildren(rowId, children);
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
		).filter((child) => String(child?.id || "") !== String(parentTask || ""));
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
 *   onFilterChange?: () => void,
 *   fullscreenShell?: HTMLElement | null,
 *   expandRowIds?: string[],
 *   removeIds?: string[],
 * }} [hooks]
 */
export async function loadTable(container, getArgs, hooks = {}) {
	if (!container) {
		throw new Error("loadTable: container required");
	}

	const state = getState(container);
	const args = readArgs(getArgs);
	const {
		onTreeChange,
		onCellsSaved,
		onSortChange,
		onFilterChange,
		fullscreenShell,
		expandRowIds,
		removeIds,
	} = hooks;
	const fullscreen = resolveFullscreenOpts(container, fullscreenShell);

	clearHostChrome(container);

	if (!args.project) {
		clearRemovedIds();
		destroyState(state);
		delete container._treeGanttTable;
		showPlaceholder(container, __("Select a project"));
		return null;
	}

	// Cached Tree page keeps the old grid. Drop it before fetch or stale rows flash.
	if (state.table && state.loadedProject && state.loadedProject !== args.project) {
		clearRemovedIds();
		destroyState(state);
	}

	rememberRemovedIds(removeIds);
	// Bump before prune so an in-flight merge without removeIds aborts.
	const gen = (state.loadGen = (state.loadGen || 0) + 1);
	const removed = getRemovedIdList();
	if (state.table && removed.length) {
		installRemovedIdFilter(state.table);
		dropRemovedTasks(state.table, removed);
		onTreeChange?.();
	}

	if (!state.table) {
		showLoading(container);
	}

	await ensureBundle();
	if (gen !== state.loadGen) {
		return null;
	}

	try {
		const expanded = hasMulti(args.task)
			? [...(expandRowIds || [])]
			: state.table
				? snapshotExpandedIds(state.table, expandRowIds)
				: [...(expandRowIds || [])];
		const wantFull = Boolean(state.table) && shouldFetchFullTree(state, expanded);
		const rows = stripRemovedTree(
			wantFull
				? await fetchFullTreeRows(getArgs)
				: await fetchRootRows(getArgs)
		);
		if (gen !== state.loadGen) {
			return null;
		}

		const pathExpand = taskPathExpandIds(rows, args.task);
		if (pathExpand.length) {
			for (const id of pathExpand) {
				if (!expanded.includes(id)) {
					expanded.push(id);
				}
			}
		}
		state.treeFullyLoaded = wantFull || hasMulti(args.task);

		if (state.table) {
			if (state.table._lastClickedCell !== undefined) {
				state.table._lastClickedCell = null;
			}
			state.table.api?.stopEditing?.();
			const deep = wantFull || hasMulti(args.task);
			installRemovedIdFilter(state.table);
			const merge = applyTreeMerge(state.table, rows, {
				deep,
				removeIds: getRemovedIdList(),
			});
			state.lastMerge = merge;
			if (pathExpand.length) {
				for (const id of pathExpand) {
					state.table.expandedIds?.add(id);
				}
			}
			if (expandRowIds?.length) {
				if (!deep) {
					await refetchParentLayers(state.table, getArgs, expandRowIds);
					merge.ganttChanged = true;
					merge.sideChanged = true;
					merge.changed = true;
				}
				await ensureExpanded(state.table, expanded, gen, state);
			} else if (pathExpand.length) {
				await ensureExpanded(state.table, pathExpand, gen, state);
			}
			if (gen !== state.loadGen) {
				return null;
			}
			if (merge.ganttChanged) {
				onTreeChange?.();
			}
			if (merge.sideChanged) {
				scheduleSideDataRefresh(getArgs, state.table);
			}
			state.loadedProject = args.project;
			return state.table;
		}

		clearHostChrome(container);
		container.replaceChildren();
		bindReorderDeniedHint(container);
		const projectKey = args.project || "no-project";
		const taskKey = hasMulti(args.task)
			? `:${normalizeMulti(args.task).join(",")}`
			: "";

		state.table = await DinextTable.create({
			container,
			data: rows,
			expandedIds: expanded,
			columns: getColumns(),
			edit: true,
			selection: { enabled: true },
			// Fill-handle / paste: dates, assign, status, priority, ТШ (custom_include).
			clipboard: { enabled: true },
			fillHandle: { enabled: true },
			rowCheck: { enabled: true },
			toolbar: {
				persistKey: `task-tree-gantt:${projectKey}${taskKey}`,
				defaultPinned: true,
				lockPinned: true,
				// "rows" → delete (+ move when rowReorder on). Add Child stays domain item.
				presets: ["history", "tree", "rows", "fullscreen"],
				items: [
					addRootTaskToolbarItem(),
					bulkAssignToolbarItem(),
					...dateVisibilityToolbarItems(),
					criticalPathToolbarItem({
						getProject: () => getArgs()?.project || null,
					}),
				],
			},
			onBeforeDeleteRows: createOnBeforeDeleteRows(),
			onDeleteRows: createOnDeleteRows(),
			rowReorder: {
				enabled: true,
				// Full tree DnD: sibling reorder + reparent / nest (DinextTable).
				allowTree: "reparent",
				// Tree: gutter DnD only — toolbar ↑↓ nudge is sibling-flat and wrong here.
				toolbarMove: false,
				blockWhenSorted: true,
				blockWhenSortedTooltip: "Clear sort to move a task",
			},
			canReorderRow: canReorderTaskRow,
			onValidateRowReorder: validateTaskRowReorder,
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
			onFilterChange: (ctx) => {
				onFilterChange?.(ctx);
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
			gridOptions: {
				rowHeight: ROW_HEIGHT,
				headerHeight: HEADER_HEIGHT,
				// Core FilterMixin also sets 28; keep explicit so search ≠ 76px header.
				floatingFiltersHeight: 28,
				enableBrowserTooltips: true,
				getRowClass: (params) => {
					const classes = [];
					if (!canReorderTaskRow({ row: params.data })) {
						classes.push("tree-gantt-row--reorder-denied");
					}
					const ids = getState(container).relatedTaskIds;
					if (
						ids?.has?.(String(params.data?.id || "")) &&
						params.data?.id
					) {
						classes.push("tree-gantt-row--related");
					}
					return classes.length ? classes : undefined;
				},
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
					if (
						dateFieldsAffectConflicts(ctx.changes) ||
						(ctx.changes || []).some((c) => c.field === "status")
					) {
						void invalidateCriticalPath(getArgs()?.project || null);
					}
				}
				return ok;
			},
		});
		installRemovedIdFilter(state.table);

		if (gen !== state.loadGen) {
			destroyState(state);
			return null;
		}

		if (expandRowIds?.length) {
			await ensureExpanded(state.table, expandRowIds, gen, state);
			if (gen !== state.loadGen) {
				destroyState(state);
				return null;
			}
		}

		state.lastMerge = { changed: true, ganttChanged: true, sideChanged: true };
		state.loadedProject = args.project;
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
 * One `all_tasks` request, merge into source, seed expandedIds, reveal roots.
 * @param {HTMLElement} [container] table host — used for loadGen abort
 */
export async function expandAllRows(table, getArgs, container) {
	const args = readArgs(getArgs);
	if (!args.project || !table) return;
	const hostState = container?._treeGanttTable;
	const gen = hostState?.loadGen;
	frappe.dom.freeze(__("Loading…"));
	try {
		const nested = await fetchFullTreeRows(getArgs);
		if (gen != null && hostState?.loadGen !== gen) {
			return;
		}
		if (hostState) {
			hostState.treeFullyLoaded = true;
		}
		const tree = stripRemovedTree(nested);
		applyTreeMerge(table, tree, {
			deep: true,
			removeIds: getRemovedIdList(),
		});
		seedExpandedIds(table, collectExpandablePathIds(tree));
		for (const root of table.sourceData || []) {
			if (root.children?.length) {
				table.setRowChildren(String(root.id), root.children);
			}
		}
		table.refreshAllTreeToggles?.();
		if (gen != null && hostState?.loadGen !== gen) {
			return;
		}
		scheduleSideDataRefresh(getArgs, table);
	} finally {
		frappe.dom.unfreeze();
	}
}

/**
 * Reveal related tasks: one `all_tasks=1` the first time, then local expand only.
 * @returns {{ related: string[], treeChanged: boolean } | null}
 */
export async function revealRelatedTasks(table, getArgs, container, originId) {
	const args = readArgs(getArgs);
	if (!args.project || !table || !originId) {
		return null;
	}
	const hostState = container?._treeGanttTable;
	const gen = hostState?.loadGen;

	let fetched = false;
	let nested = hostState?.treeFullyLoaded ? table.sourceData : null;
	if (!Array.isArray(nested) || !nested.length) {
		frappe.dom.freeze(__("Loading…"));
		try {
			nested = await fetchFullTreeRows(getArgs);
			fetched = true;
			if (gen != null && hostState?.loadGen !== gen) {
				return null;
			}
			if (hostState) {
				hostState.treeFullyLoaded = true;
			}
		} finally {
			frappe.dom.unfreeze();
		}
	}

	const related = collectRelatedTaskIds(nested, originId);
	const pathById = collectPathById(nested);
	const ancestors = [];
	for (const id of related) {
		const path = pathById.get(String(id));
		if (path) {
			ancestors.push(...ancestorExpandIds(path));
		}
	}
	const needed = sortExpandedIds(ancestors);

	if (hostState) {
		hostState.relatedTaskIds = new Set(related.map(String));
	}

	if (fetched) {
		applyTreeMerge(table, stripRemovedTree(nested), {
			deep: true,
			removeIds: getRemovedIdList(),
		});
		seedExpandedIds(table, snapshotExpandedIds(table, needed));
		for (const id of needed) {
			const kids = table.getSourceChildren?.(id) || [];
			if (kids.length) {
				table.setRowChildren(id, kids);
			}
		}
		table.refreshAllTreeToggles?.();
		if (gen != null && hostState?.loadGen !== gen) {
			return null;
		}
		scheduleSideDataRefresh(getArgs, table);
		return { related, treeChanged: true };
	}

	const missing = needed.filter((id) => !table.expandedIds?.has(String(id)));
	for (const id of missing) {
		if (gen != null && hostState?.loadGen !== gen) {
			return null;
		}
		try {
			await table.expandRow?.(id);
		} catch (e) {
			console.error("[task_tree_gantt] related expand", id, e);
		}
	}
	if (missing.length) {
		table.refreshAllTreeToggles?.();
	}
	return { related, treeChanged: missing.length > 0 };
}
