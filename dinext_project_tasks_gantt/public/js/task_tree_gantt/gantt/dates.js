import { ganttDatesVisible } from "./tasks.js";
import { fieldCanEdit, saveCells, writeDeniedTitle } from "../table/save.js";

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

function ganttRowFromBarWrap(state, wrap) {
	const id = wrap?.getAttribute?.("data-id");
	if (!id) {
		return null;
	}
	return state.gantt?.get_bar?.(id)?.task?.row || null;
}

/** Drag moves both expected dates; left/right handle resizes one side. */
function ganttDateDragAllowed(row, eventTarget) {
	if (!ganttDatesVisible(row)) {
		return false;
	}
	const handle = eventTarget?.closest?.(".handle");
	if (handle?.classList?.contains("left")) {
		return fieldCanEdit(row, "exp_start_date");
	}
	if (handle?.classList?.contains("right")) {
		return fieldCanEdit(row, "exp_end_date");
	}
	return (
		fieldCanEdit(row, "exp_start_date") && fieldCanEdit(row, "exp_end_date")
	);
}

const BAR_DENIED_CLASS = "tree-gantt-bar--write-denied";

function markGanttBarWriteDenied(bar) {
	const group = bar?.bar_group;
	if (!group) {
		return;
	}
	const denied = !ganttDateDragAllowed(bar.task?.row, null);
	group.classList.toggle(BAR_DENIED_CLASS, denied);
	const existing = group.querySelector(":scope > title");
	if (denied) {
		if (!existing) {
			const title = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"title"
			);
			title.textContent = writeDeniedTitle();
			group.insertBefore(title, group.firstChild);
		} else {
			existing.textContent = writeDeniedTitle();
		}
	} else if (existing) {
		existing.remove();
	}
}

function stripGanttDateHandles(state) {
	const bars = state.gantt?.bars;
	if (!bars?.length) {
		return;
	}
	for (const bar of bars) {
		markGanttBarWriteDenied(bar);
		const row = bar.task?.row;
		const group = bar.handle_group;
		if (!group) {
			continue;
		}
		if (!fieldCanEdit(row, "exp_start_date")) {
			group.querySelector(".handle.left")?.remove();
		}
		if (!fieldCanEdit(row, "exp_end_date")) {
			group.querySelector(".handle.right")?.remove();
		}
	}
}

/** Block frappe-gantt date drag/resize before it starts. Re-run after refresh. */
export function bindGanttDateDragGuard(state) {
	stripGanttDateHandles(state);
	const el = state?.ganttEl;
	if (!el || el._ganttDateDragGuard) {
		return;
	}
	el._ganttDateDragGuard = true;
	el.addEventListener(
		"mousedown",
		(ev) => {
			const wrap = ev.target?.closest?.(".bar-wrapper");
			if (!wrap || !el.contains(wrap)) {
				return;
			}
			const row = ganttRowFromBarWrap(state, wrap);
			if (!ganttDateDragAllowed(row, ev.target)) {
				ev.stopPropagation();
			}
		},
		true
	);
}

async function persistGanttDates(state, { id, row, start, end }, onDone) {
	const startIso = toDateStr(start);
	const endIso = toDateStr(end);
	const payload = [];
	if (
		startIso &&
		startIso !== (row?.exp_start_date || null) &&
		fieldCanEdit(row, "exp_start_date")
	) {
		payload.push({ id, field: "exp_start_date", value: startIso });
	}
	if (
		endIso &&
		endIso !== (row?.exp_end_date || null) &&
		fieldCanEdit(row, "exp_end_date")
	) {
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
		if (
			!fieldCanEdit(task.row, "exp_start_date") &&
			!fieldCanEdit(task.row, "exp_end_date")
		) {
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
