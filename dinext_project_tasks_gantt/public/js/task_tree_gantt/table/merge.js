/**
 * Patch DinextTable source + visible rows from a fresh get_children tree.
 * Field diffs → applyExternalCellValues. Sibling add/remove → setRowChildren /
 * applyTransaction. No table.refresh unless existing roots only reordered.
 */

const ROW_FIELDS = [
	"subject",
	"assign",
	"assign_pwa",
	"assign_todo_only",
	"status",
	"priority",
	"custom_planned_start_date",
	"custom_planned_end_date",
	"exp_start_date",
	"exp_end_date",
	"act_start_date",
	"act_end_date",
	"completed_on",
	"expected_time",
	"duration",
	"progress",
	"custom_include",
	"type",
	"user_tags",
	"is_milestone",
	"color",
	"relations",
	"predecessors",
	"parent_task",
	"custom_tree_order",
	"can_read",
	"can_write",
	"confirm",
	"owner",
	"hasChildren",
	"_doc",
];

const GANTT_FIELDS = new Set([
	"exp_start_date",
	"exp_end_date",
	"status",
	"priority",
	"subject",
	"progress",
	"assign",
	"relations",
]);

const SIDE_FIELDS = new Set(["exp_start_date", "exp_end_date", "relations"]);

function sameValue(left, right) {
	let a = left;
	let b = right;
	if (a == null || a === "") {
		a = null;
	}
	if (b == null || b === "") {
		b = null;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
	}
	if ((a && typeof a === "object") || (b && typeof b === "object")) {
		// `_doc`: server document snapshot
		return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	}
	if (typeof a === "boolean" || typeof b === "boolean") {
		return Boolean(a) === Boolean(b);
	}
	return Object.is(a, b);
}

function indexById(rows, map = new Map()) {
	for (const row of rows || []) {
		if (row?.id) {
			map.set(String(row.id), row);
		}
		if (row.children?.length) {
			indexById(row.children, map);
		}
	}
	return map;
}

function cloneNewRow(row) {
	const copy = { ...row };
	if (Array.isArray(row.children)) {
		copy.children = row.children.map(cloneNewRow);
	}
	return copy;
}

function collectFieldChanges(existing, incoming, acc) {
	const id = String(existing.id);
	for (const field of ROW_FIELDS) {
		if (sameValue(existing[field], incoming[field])) {
			continue;
		}
		acc.fieldChanges.push({ id, field, value: incoming[field] });
		if (GANTT_FIELDS.has(field)) {
			acc.ganttChanged = true;
		}
		if (SIDE_FIELDS.has(field)) {
			acc.sideChanged = true;
		}
	}
}

function mergeLevel(oldList, newList, parentPath, deep, oldById, acc) {
	const prev = oldList || [];
	const next = newList || [];
	const oldIds = prev.map((row) => String(row.id));
	const newIds = next.map((row) => String(row.id));
	const merged = [];

	for (const incoming of next) {
		const id = String(incoming.id);
		const existing = oldById.get(id);
		if (!existing) {
			merged.push(cloneNewRow(incoming));
			continue;
		}
		collectFieldChanges(existing, incoming, acc);
		if (deep) {
			const childPath = parentPath ? `${parentPath}:${id}` : id;
			mergeLevel(
				existing.children || [],
				incoming.children || [],
				childPath,
				true,
				oldById,
				acc
			);
		}
		merged.push(existing);
	}

	const structChanged =
		oldIds.length !== newIds.length ||
		oldIds.some((id, i) => id !== newIds[i]);
	if (structChanged) {
		acc.structureOps.push({ parentPath, children: merged });
		acc.ganttChanged = true;
		acc.sideChanged = true;
	}
	return merged;
}

function pathDepth(parentPath) {
	if (!parentPath) {
		return 0;
	}
	return String(parentPath).split(":").length;
}

function visibleCount(row, path, expandedIds) {
	let count = 1;
	const kids = row?.children;
	if (expandedIds?.has(path) && Array.isArray(kids)) {
		for (const child of kids) {
			count += visibleCount(child, `${path}:${child.id}`, expandedIds);
		}
	}
	return count;
}

function visibleIndexForRoot(roots, rootIndex, expandedIds) {
	let index = 0;
	for (let i = 0; i < rootIndex; i++) {
		index += visibleCount(roots[i], String(roots[i].id), expandedIds);
	}
	return index;
}

function toVisibleRoot(row) {
	return {
		...row,
		_rowId: String(row.id),
		_level: 0,
		_hasChildren: !!(row.hasChildren || row.children?.length),
	};
}

function syncRootRows(table, nextRoots) {
	const oldRoots = table.sourceData || [];
	const oldIds = oldRoots.map((row) => String(row.id));
	const nextIds = nextRoots.map((row) => String(row.id));
	const oldSet = new Set(oldIds);
	const nextSet = new Set(nextIds);
	const added = nextIds.filter((id) => !oldSet.has(id));
	const removed = oldIds.filter((id) => !nextSet.has(id));
	const survivorOld = oldIds.filter((id) => nextSet.has(id));
	const survivorNext = nextIds.filter((id) => oldSet.has(id));
	const sameOrder = survivorOld.join("\0") === survivorNext.join("\0");

	table.sourceData = nextRoots;
	if (table.options) {
		table.options.data = nextRoots;
	}

	if (!added.length && !removed.length && sameOrder) {
		return;
	}

	if (!sameOrder) {
		table.refresh?.();
		return;
	}

	if (removed.length) {
		const toRemove = [];
		table.api?.forEachNode?.((node) => {
			const rowId = String(node.data?._rowId || "");
			const rootId = rowId.split(":")[0];
			if (rootId && !nextSet.has(rootId)) {
				toRemove.push(node.data);
			}
		});
		if (toRemove.length) {
			table.api.applyTransaction({ remove: toRemove });
		}
	}

	for (const id of added) {
		const row = nextRoots.find((item) => String(item.id) === id);
		if (!row) {
			continue;
		}
		const addIndex = visibleIndexForRoot(
			nextRoots,
			nextIds.indexOf(id),
			table.expandedIds
		);
		table.api?.applyTransaction?.({
			add: [toVisibleRoot(row)],
			addIndex,
		});
		if (table.expandedIds?.has(id) && row.children?.length) {
			table.setRowChildren?.(id, row.children);
		}
	}

	table.syncRowDataFromGrid?.();
}

function refreshHasChildrenToggles(table, changes) {
	for (const change of changes) {
		const node = table.findGridNodeByBusinessId?.(change.id);
		const rowId = node?.data?._rowId || change.id;
		table.refreshTreeToggle?.(rowId);
	}
}

/**
 * @param {object} table DinextTable
 * @param {object[]} nextRoots nested (deep) or flat roots (shallow)
 * @param {{ deep?: boolean }} [opts] deep=false keeps existing children on matched roots
 * @returns {{ changed: boolean, ganttChanged: boolean, sideChanged: boolean }}
 */
export function applyTreeMerge(table, nextRoots, { deep = false } = {}) {
	const acc = {
		fieldChanges: [],
		structureOps: [],
		ganttChanged: false,
		sideChanged: false,
	};
	const oldRoots = table.sourceData || [];
	mergeLevel(oldRoots, nextRoots || [], null, deep, indexById(oldRoots), acc);

	const cellChanges = acc.fieldChanges.filter((c) => c.field !== "hasChildren");
	const toggleChanges = acc.fieldChanges.filter((c) => c.field === "hasChildren");
	if (cellChanges.length) {
		table.applyExternalCellValues?.(cellChanges);
		// `_doc` feeds field status (depends_on & co.) — redraw those rows.
		const docNodes = cellChanges
			.filter((c) => c.field === "_doc")
			.map((c) => table.findGridNodeByBusinessId?.(c.id))
			.filter(Boolean);
		if (docNodes.length) {
			table.api?.refreshCells?.({ rowNodes: docNodes, force: true });
		}
	}
	if (toggleChanges.length) {
		table.applyExternalCellValues?.(toggleChanges);
		refreshHasChildrenToggles(table, toggleChanges);
	}

	const ops = [...acc.structureOps].sort(
		(a, b) => pathDepth(b.parentPath) - pathDepth(a.parentPath)
	);
	for (const op of ops) {
		if (!op.parentPath) {
			syncRootRows(table, op.children);
		} else {
			table.setRowChildren?.(op.parentPath, op.children);
		}
	}

	return {
		changed:
			acc.fieldChanges.length > 0 ||
			acc.structureOps.length > 0,
		ganttChanged: acc.ganttChanged,
		sideChanged: acc.sideChanged,
	};
}
