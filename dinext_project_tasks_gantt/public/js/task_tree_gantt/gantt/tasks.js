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

/** Visible exp_* on the row after strip — not today/creation. */
export function ganttDatesVisible(row) {
	return !!(row?.exp_start_date || row?.exp_end_date);
}

function placeholderDay(rows) {
	for (const row of rows || []) {
		const day = row.exp_start_date || row.exp_end_date;
		if (day) {
			return day;
		}
	}
	return frappe.datetime.get_today();
}

/**
 * Prod V2 `_get_task`: bar from exp_start_date / exp_end_date (either).
 * Both empty → no bar (lib still needs dates for row alignment; mark invalid).
 */
export function rowToGanttTask(row, dummyDay) {
	const startDay = row.exp_start_date || null;
	const endDay = row.exp_end_date || null;
	const hasBar = !!(startDay || endDay);
	const start = startDay || endDay || dummyDay;
	const end = endDay || startDay || dummyDay;
	const milestone = !!row.is_milestone;

	return {
		id: row.id,
		name: row.subject || row.id,
		start: `${start} 00:00:00`,
		end: `${end}${milestone || !endDay ? " 00:00:00" : " 23:59:59"}`,
		progress: Number(row.progress) || 0,
		dependencies: (row.relations || [])
			.map((r) => r.predecessor)
			.filter(Boolean),
		thumbnail: milestone ? "/files/rhombus.png" : null,
		custom_class: row.priority || "",
		color: statusColor(row.status),
		color_progress: "var(--bg-green)",
		invalid: !hasBar,
		row,
	};
}

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
	const list = rows || [];
	const dummy = placeholderDay(list);
	return list.map((row) => rowToGanttTask(row, dummy));
}
