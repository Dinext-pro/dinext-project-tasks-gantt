import { CRITICAL_BAR_CLASS, isTaskCritical } from "../critical/index.js";
import { fieldIsHidden } from "../table/save.js";

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
	const start = fieldIsHidden(row, "exp_start_date") ? null : row?.exp_start_date;
	const end = fieldIsHidden(row, "exp_end_date") ? null : row?.exp_end_date;
	return !!(start || end);
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
	const startDay = fieldIsHidden(row, "exp_start_date")
		? null
		: row.exp_start_date || null;
	const endDay = fieldIsHidden(row, "exp_end_date")
		? null
		: row.exp_end_date || null;
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
		// frappe-gantt refresh does classList.add(custom_class) as one token.
		custom_class: row.priority || "",
		color: statusColor(row.status),
		color_progress: "var(--bg-green)",
		invalid: !hasBar,
		row,
	};
}

/** Second class on `.bar-wrapper`. Priority stays the only `custom_class` token. */
export function applyCriticalBarClasses(ganttEl) {
	if (!ganttEl?.querySelectorAll) {
		return;
	}
	ganttEl.querySelectorAll(".bar-wrapper[data-id]").forEach((wrap) => {
		const id = wrap.getAttribute("data-id");
		wrap.classList.toggle(CRITICAL_BAR_CLASS, isTaskCritical(id));
	});
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
