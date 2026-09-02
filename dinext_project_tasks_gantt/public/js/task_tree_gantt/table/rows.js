export function toTableRow(row) {
	return {
		id: row.id,
		subject:
			row.can_read === 0 ? row.subject || row.id || "" : row.subject || "",
		assign: Array.isArray(row.assign) ? row.assign : [],
		assign_pwa: Array.isArray(row.assign_pwa) ? row.assign_pwa : [],
		assign_todo_only: Array.isArray(row.assign_todo_only)
			? row.assign_todo_only
			: [],
		status: row.status || "",
		priority: row.priority || "",
		custom_planned_start_date: row.custom_planned_start_date || null,
		custom_planned_end_date: row.custom_planned_end_date || null,
		exp_start_date: row.exp_start_date || null,
		exp_end_date: row.exp_end_date || null,
		act_start_date: row.act_start_date || null,
		act_end_date: row.act_end_date || null,
		expected_time: row.expected_time ?? null,
		duration: row.duration ?? null,
		progress: row.progress == null || row.progress === "" ? null : row.progress,
		// AG checkbox (cellDataType boolean) needs true/false, not 1/0
		custom_include: row.custom_include == null ? null : !!row.custom_include,
		type: row.task_type_label || row.task_type || "",
		user_tags: row.user_tags || "",
		is_milestone: row.is_milestone ? 1 : 0,
		color: row.color || null,
		relations: Array.isArray(row.relations) ? row.relations : [],
		predecessors: Array.isArray(row.relations)
			? row.relations.map((r) => r.predecessor).filter(Boolean)
			: [],
		parent_task: row.parent_task || null,
		custom_tree_order: row.custom_tree_order ?? 0,
		can_read: row.can_read === 0 || row.can_read === false ? 0 : 1,
		can_write: row.can_write ? 1 : 0,
		can_write_fields: Array.isArray(row.can_write_fields)
			? row.can_write_fields
			: undefined,
		hidden_fields: Array.isArray(row.hidden_fields) ? row.hidden_fields : [],
		confirm: row.confirm ? 1 : 0,
		owner: row.owner || null,
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
		if (parentId && parentId !== row.id && byId[parentId]) {
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
