/**
 * Task ids deleted this Tree visit.
 * Survives overlapping reload/onShow (shallow merge has no children)
 * and in-flight expand setRowChildren.
 *
 * Add only after server delete succeeds — except toolbar persist,
 * which adds before xcall and forgets on failure (core reverts rows).
 */

const removedIds = new Set();

export function rememberRemovedIds(ids) {
	for (const id of ids || []) {
		if (id) {
			removedIds.add(String(id));
		}
	}
	return removedIds;
}

export function forgetRemovedIds(ids) {
	for (const id of ids || []) {
		if (id) {
			removedIds.delete(String(id));
		}
	}
}

export function clearRemovedIds() {
	removedIds.clear();
}

export function getRemovedIdSet() {
	return removedIds;
}

export function getRemovedIdList() {
	return [...removedIds];
}

export function filterRemovedRows(rows, dropSet = removedIds) {
	if (!dropSet?.size || !rows?.length) {
		return rows || [];
	}
	return rows.filter((row) => !dropSet.has(String(row?.id)));
}

/** Drop tombstoned nodes from a nested get_children tree. */
export function stripRemovedTree(rows, dropSet = removedIds) {
	if (!dropSet?.size || !rows?.length) {
		return rows || [];
	}
	const next = [];
	for (const row of rows) {
		if (dropSet.has(String(row?.id))) {
			continue;
		}
		if (!row.children?.length) {
			next.push(row);
			continue;
		}
		const children = stripRemovedTree(row.children, dropSet);
		next.push(children === row.children ? row : { ...row, children });
	}
	return next;
}

function pathTouchesRemoved(path, dropSet) {
	return String(path || "")
		.split(":")
		.some((part) => dropSet.has(part));
}

/** Mutates remaining rows' children. Drops by business Task name. */
export function pruneSourceByRemovedIds(rows, dropSet = removedIds) {
	if (!dropSet?.size || !Array.isArray(rows)) {
		return rows || [];
	}
	const next = [];
	for (const row of rows) {
		if (dropSet.has(String(row?.id))) {
			continue;
		}
		if (row.children?.length) {
			row.children = pruneSourceByRemovedIds(row.children, dropSet);
			if (!row.children.length) {
				row.hasChildren = false;
			}
		}
		next.push(row);
	}
	return next;
}

/**
 * Hide deleted tasks now — source + AG Grid.
 * Do not wait for get_children / setRowChildren (path id mismatch leaves the row).
 */
export function dropRemovedTasks(table, ids) {
	if (ids?.length) {
		rememberRemovedIds(ids);
	}
	const dropSet = getRemovedIdSet();
	if (!table || !dropSet.size) {
		return false;
	}

	if (Array.isArray(table.sourceData)) {
		const next = pruneSourceByRemovedIds(table.sourceData, dropSet);
		table.sourceData = next;
		if (table.options) {
			table.options.data = next;
		}
	}

	if (table.expandedIds?.size) {
		for (const id of [...table.expandedIds]) {
			if (pathTouchesRemoved(id, dropSet)) {
				table.expandedIds.delete(id);
			}
		}
	}

	table.pruneSortBaseline?.([...dropSet]);

	const toRemove = [];
	table.api?.forEachNode?.((node) => {
		const data = node?.data;
		if (!data) {
			return;
		}
		const biz = String(data.id || "");
		const path = String(data._rowId || "");
		if (dropSet.has(biz) || pathTouchesRemoved(path, dropSet)) {
			toRemove.push(data);
		}
	});
	if (toRemove.length) {
		table.api.applyTransaction({ remove: toRemove });
	}
	table.syncRowDataFromGrid?.();
	table.refreshAllTreeToggles?.();
	return true;
}

/** Expand / refetch / DnD must not put deleted Task ids back. */
export function installRemovedIdFilter(table) {
	if (!table?.setRowChildren || table._removedIdFilter) {
		return;
	}
	table._removedIdFilter = true;
	const orig = table.setRowChildren.bind(table);
	table.setRowChildren = (rowId, children) =>
		orig(rowId, filterRemovedRows(children));
}
