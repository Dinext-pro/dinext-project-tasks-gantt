/**
 * Related-task focus: path ids + predecessor/successor set on a nested tree.
 */

/** Path id `ROOT:MID:LEAF` for each Task name in nested source. */
export function collectPathById(rows, parentPath = null, map = new Map()) {
	for (const row of rows || []) {
		if (!row?.id) {
			continue;
		}
		const path = parentPath ? `${parentPath}:${row.id}` : String(row.id);
		map.set(String(row.id), path);
		if (Array.isArray(row.children) && row.children.length) {
			collectPathById(row.children, path, map);
		}
	}
	return map;
}

/** Parent path ids to expand so `pathId` becomes a visible row. */
export function ancestorExpandIds(pathId) {
	const parts = String(pathId || "")
		.split(":")
		.filter(Boolean);
	const ids = [];
	for (let i = 1; i < parts.length; i++) {
		ids.push(parts.slice(0, i).join(":"));
	}
	return ids;
}

/**
 * Origin + predecessors of origin + successors (rows that list origin as predecessor).
 * @param {object[]} nested
 * @param {string} originId
 * @returns {string[]}
 */
export function collectRelatedTaskIds(nested, originId) {
	const origin = String(originId || "");
	const ids = new Set();
	if (origin) {
		ids.add(origin);
	}

	function walk(rows) {
		for (const row of rows || []) {
			const rowId = row?.id != null ? String(row.id) : "";
			const rels = Array.isArray(row?.relations) ? row.relations : [];
			for (const rel of rels) {
				const pred = String(rel?.predecessor || "").trim();
				if (!pred) {
					continue;
				}
				if (rowId === origin) {
					ids.add(pred);
				}
				if (pred === origin && rowId) {
					ids.add(rowId);
				}
			}
			if (Array.isArray(row?.children) && row.children.length) {
				walk(row.children);
			}
		}
	}
	walk(nested);
	return [...ids];
}
