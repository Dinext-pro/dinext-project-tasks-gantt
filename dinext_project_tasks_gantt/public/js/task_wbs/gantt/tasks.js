// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

function statusColor(status) {
	switch (status) {
		case "Pending Review":
			return "var(--bg-dark-blue)";
		case "Overdue":
			return "var(--alert-bg-danger)";
		case "Completed":
			return "var(--bg-green)";
		case "Cancelled":
			return "var(--bg-light-gray)";
		default:
			return null;
	}
}

function fallbackDate(row) {
	return row.exp_start_date || row.modified || row.creation || frappe.datetime.get_today();
}

/**
 * Grid row → frappe-gantt task.
 * @param {object} row
 */
export function rowToGanttTask(row) {
	const startDay = row.exp_start_date || fallbackDate(row);
	const endDay = row.exp_end_date || startDay;
	const milestone = !!row.is_milestone;

	return {
		id: row.id,
		name: row.subject || row.id,
		start: `${startDay} 00:00:00`,
		end: `${endDay}${milestone ? " 00:00:00" : " 23:59:59"}`,
		progress: Number(row.progress) || 0,
		dependencies: (row.relations || []).map((r) => r.predecessor).filter(Boolean),
		thumbnail: milestone ? "/files/rhombus.png" : null,
		custom_class: row.priority || "",
		color: statusColor(row.status),
		color_progress: "var(--bg-green)",
		row,
	};
}

/**
 * Visible AG Grid rows (expanded tree order).
 * @param {object} table DinextTable instance
 */
export function collectVisibleRows(table) {
	const out = [];
	const api = table?.api;
	if (!api?.forEachNodeAfterFilterAndSort) {
		return out;
	}
	api.forEachNodeAfterFilterAndSort((node) => {
		if (node?.data?.id) {
			out.push(node.data);
		}
	});
	return out;
}

export function rowsToGanttTasks(rows) {
	return (rows || []).map(rowToGanttTask);
}
