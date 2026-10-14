import { CRITICAL_RING_CLASS, isTaskCritical } from "../critical/index.js";
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

const SVG_NS = "http://www.w3.org/2000/svg";
/** Gap between the bar stroke and the dashed critical outline. */
const RING_PAD = 2;

function criticalRingBox(bar) {
	const x = Number(bar.getAttribute("x"));
	const y = Number(bar.getAttribute("y"));
	const w = Number(bar.getAttribute("width"));
	const h = Number(bar.getAttribute("height"));
	if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
		return null;
	}
	const rx = Number(bar.getAttribute("rx"));
	return {
		x: x - RING_PAD,
		y: y - RING_PAD,
		width: w + RING_PAD * 2,
		height: h + RING_PAD * 2,
		rx: (Number.isFinite(rx) ? rx : 0) + RING_PAD,
	};
}

/**
 * Dashed rect outside `.bar`. Does not change the bar stroke.
 * frappe-gantt refresh clears `.bar-group`, so this runs after every refresh.
 */
export function applyCriticalRings(ganttEl) {
	if (!ganttEl?.querySelectorAll) {
		return;
	}
	ganttEl.querySelectorAll(".bar-wrapper[data-id]").forEach((wrap) => {
		const id = wrap.getAttribute("data-id");
		const group = wrap.querySelector(":scope > .bar-group") || wrap;
		const bar = group.querySelector("rect.bar");
		const ring = group.querySelector(`:scope > rect.${CRITICAL_RING_CLASS}`);
		const show =
			isTaskCritical(id) && bar && !bar.classList.contains("bar-invalid");
		if (!show) {
			ring?.remove();
			return;
		}
		const box = criticalRingBox(bar);
		if (!box) {
			ring?.remove();
			return;
		}
		const node =
			ring ||
			document.createElementNS(SVG_NS, "rect");
		if (!ring) {
			node.setAttribute("class", CRITICAL_RING_CLASS);
			group.insertBefore(node, group.firstChild);
		}
		node.setAttribute("x", String(box.x));
		node.setAttribute("y", String(box.y));
		node.setAttribute("width", String(box.width));
		node.setAttribute("height", String(box.height));
		node.setAttribute("rx", String(box.rx));
		node.setAttribute("ry", String(box.rx));
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
