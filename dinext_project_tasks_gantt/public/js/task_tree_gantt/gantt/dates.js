import { rowCanWrite, saveCells } from "../table/save.js";

const DEBOUNCE_MS = 1000;

function toDateStr(value) {
	if (value == null || value === "") {
		return null;
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return frappe.datetime.obj_to_str(value);
	}
	if (typeof DinextTable?.toIsoDateString === "function") {
		return DinextTable.toIsoDateString(value);
	}
	const s = String(value).trim();
	if (!s) {
		return null;
	}
	if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
		return s.slice(0, 10);
	}
	return null;
}

async function persistGanttDates(state, { id, row, start, end }, onDone) {
	const startIso = toDateStr(start);
	const endIso = toDateStr(end);
	const payload = [];
	if (startIso && startIso !== (row?.exp_start_date || null)) {
		payload.push({ id, field: "exp_start_date", value: startIso });
	}
	if (endIso && endIso !== (row?.exp_end_date || null)) {
		payload.push({ id, field: "exp_end_date", value: endIso });
	}
	if (!payload.length) {
		return;
	}
	await saveCells(payload, { table: state.table });
	onDone?.();
}

export function clearGanttDateTimers(state) {
	const timers = state?._ganttDateTimers;
	if (timers) {
		for (const id of Object.keys(timers)) {
			clearTimeout(timers[id]);
		}
	}
	if (state) {
		state._ganttDateTimers = null;
		state._ganttDatePending = null;
	}
}

/** Original V2: debounce ~1s → save exp_start_date / exp_end_date. */
export function createGanttDateChangeHandler(state, onDone) {
	clearGanttDateTimers(state);
	const timers = Object.create(null);
	const pending = Object.create(null);
	state._ganttDateTimers = timers;
	state._ganttDatePending = pending;

	return function onDateChange(task, start, end) {
		const id = task?.id;
		if (!id) {
			return;
		}
		if (!rowCanWrite(task.row)) {
			onDone?.();
			return;
		}
		pending[id] = { id, row: task.row, start, end };
		if (timers[id]) {
			clearTimeout(timers[id]);
		}
		timers[id] = setTimeout(() => {
			delete timers[id];
			const item = pending[id];
			delete pending[id];
			if (item) {
				void persistGanttDates(state, item, onDone);
			}
		}, DEBOUNCE_MS);
	};
}
