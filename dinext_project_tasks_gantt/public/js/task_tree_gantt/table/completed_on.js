/**
 * Form-save completed_on: same as Python resolve_completed_on
 * (task_dates.actual / virtual_task.sync.dates). Tree applies this before
 * mandatoryPrecheck so status → Completed is not blocked solely on an empty date.
 */

function toIso(value) {
	if (value == null || value === "") {
		return null;
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getFullYear();
		const m = String(value.getMonth() + 1).padStart(2, "0");
		const d = String(value.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}
	const s = String(value).trim();
	if (!s) {
		return null;
	}
	return s.slice(0, 10);
}

/** act_end if present (then cap today); else today when empty. Never future. */
export function resolveCompletedOn(actEndDate, completedOnDate, today) {
	const todayS = toIso(today);
	const actEnd = toIso(actEndDate);
	let out = toIso(completedOnDate);
	if (actEnd) {
		if (!out || out < actEnd) {
			out = actEnd;
		}
	} else if (!out) {
		out = todayS;
	}
	if (out && todayS && out > todayS) {
		out = todayS;
	}
	return out;
}

/**
 * When a change sets status to Completed and completed_on is empty, append a
 * completed_on change (same batch). Does not clear when leaving Completed —
 * ERPNext Task form does not.
 * @returns {object[]} injected changes
 */
export function applyCompletedOnSideEffects(changes, { today, getDoc } = {}) {
	if (!changes?.length) {
		return [];
	}
	const injected = [];
	for (const change of changes) {
		if (change.field !== "status" || change.newValue !== "Completed") {
			continue;
		}
		if (changes.some((c) => c.row === change.row && c.field === "completed_on")) {
			continue;
		}
		const doc = getDoc ? getDoc(change.row) : { ...(change.row || {}) };
		if (toIso(doc.completed_on)) {
			continue;
		}
		const filled = resolveCompletedOn(doc.act_end_date, null, today);
		if (!filled) {
			continue;
		}
		injected.push({
			rowId: change.rowId,
			rowIndex: change.rowIndex,
			field: "completed_on",
			oldValue: doc.completed_on ?? null,
			newValue: filled,
			row: change.row,
		});
	}
	if (injected.length) {
		changes.push(...injected);
	}
	return injected;
}
