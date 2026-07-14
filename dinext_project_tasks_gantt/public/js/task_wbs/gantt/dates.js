// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { saveCells } from "../table/save.js";

const pending = {};
const timers = {};

function toDateStr(value) {
	if (value == null || value === "") {
		return null;
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return frappe.datetime.obj_to_str(value);
	}
	const s = String(value).trim();
	if (!s) {
		return null;
	}
	if (s.includes("T") || s.includes(" ")) {
		return s.slice(0, 10);
	}
	return s;
}

function patchRowDates(row, start, end) {
	if (!row) {
		return;
	}
	if (start != null) {
		row.exp_start_date = start;
	}
	if (end != null) {
		row.exp_end_date = end;
	}
}

/**
 * Debounced gantt drag → save_cells (exp_start/end only).
 * @param {object} task frappe-gantt task
 * @param {Date|string} start
 * @param {Date|string} end
 * @param {{ onSaved?: (taskId: string) => void }} [hooks]
 */
export function onGanttDateChange(task, start, end, hooks = {}) {
	if (!task?.id) {
		return;
	}
	pending[task.id] = { task, start, end };
	if (timers[task.id]) {
		clearTimeout(timers[task.id]);
	}
	timers[task.id] = setTimeout(() => {
		saveGanttDates(task.id, hooks).catch((e) => {
			console.error("task_wbs gantt date save", e);
		});
	}, 1000);
}

async function saveGanttDates(taskId, hooks = {}) {
	const pack = pending[taskId];
	delete timers[taskId];
	if (!pack) {
		return;
	}

	const { task, start, end } = pack;
	const changes = [];
	const newStart = toDateStr(start);
	const newEnd = toDateStr(end);
	const oldStart = toDateStr(task.start);
	const oldEnd = toDateStr(task.end);

	if (newStart && frappe.datetime.get_day_diff(oldStart, newStart)) {
		changes.push({ id: taskId, field: "exp_start_date", value: newStart });
	}
	if (newEnd && frappe.datetime.get_day_diff(oldEnd, newEnd)) {
		changes.push({ id: taskId, field: "exp_end_date", value: newEnd });
	}
	if (!changes.length) {
		delete pending[taskId];
		return;
	}

	const prevStart = task.row?.exp_start_date;
	const prevEnd = task.row?.exp_end_date;
	patchRowDates(task.row, newStart, newEnd);
	task.start = newStart ? `${newStart} 00:00:00` : task.start;
	task.end = newEnd
		? `${newEnd}${task.row?.is_milestone ? " 00:00:00" : " 23:59:59"}`
		: task.end;

	const ok = await saveCells(changes);
	if (ok) {
		hooks.onSaved?.(taskId);
	} else {
		patchRowDates(task.row, prevStart, prevEnd);
	}
	delete pending[taskId];
}
