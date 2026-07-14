export function toTableRow(row) {
	return {
		id: row.id,
		subject: row.subject || "",
		assign: Array.isArray(row.assign) ? row.assign : [],
		status: row.status || "",
		priority: row.priority || "",
		exp_start_date: row.exp_start_date || null,
		exp_end_date: row.exp_end_date || null,
		expected_time: row.expected_time ?? null,
		progress: row.progress ?? 0,
		custom_include: row.custom_include ? 1 : 0,
		type: row.task_type_label || row.task_type || "",
		user_tags: row.user_tags || "",
		is_milestone: row.is_milestone ? 1 : 0,
		color: row.color || null,
		relations: Array.isArray(row.relations) ? row.relations : [],
		parent_task: row.parent_task || null,
		can_write: row.can_write ? 1 : 0,
		hasChildren: !!row.has_children,
	};
}

export function toTableRows(rows) {
	return (rows || []).map(toTableRow);
}

/** Flat list → nested tree by parent_task (Expand All). */
export function nestRows(flat) {
	const byId = {};
	for (const row of flat || []) {
		byId[row.id] = { ...row, children: [] };
	}
	const roots = [];
	for (const row of flat || []) {
		const node = byId[row.id];
		const parentId = row.parent_task;
		if (parentId && byId[parentId]) {
			byId[parentId].children.push(node);
			byId[parentId].hasChildren = true;
		} else {
			roots.push(node);
		}
	}
	for (const node of Object.values(byId)) {
		if (!node.children.length) {
			delete node.children;
		} else {
			node.hasChildren = true;
		}
	}
	return roots;
}
