/**
 * Toolbar checkboxes: toggle Plan / Actual date columns.
 * Persist per user (same pattern as tree project filter).
 */

const PLAN_FIELDS = ["custom_planned_start_date", "custom_planned_end_date"];
const ACTUAL_FIELDS = ["act_start_date", "act_end_date"];

function storageKey(kind) {
	return `${frappe.user.name}:tree:dates:${kind}`;
}

function readFlag(kind) {
	try {
		return localStorage.getItem(storageKey(kind)) === "1";
	} catch {
		return false;
	}
}

function writeFlag(kind, on) {
	try {
		localStorage.setItem(storageKey(kind), on ? "1" : "0");
	} catch {
		/* quota / private mode */
	}
}

export function isPlanDatesVisible() {
	return readFlag("plan");
}

export function isActualDatesVisible() {
	return readFlag("actual");
}

export function setDateColumnsVisible(table, fields, visible) {
	const api = table?.api;
	if (!api || !fields?.length) {
		return;
	}
	if (typeof api.setColumnsVisible === "function") {
		api.setColumnsVisible(fields, !!visible);
		return;
	}
	api.applyColumnState?.({
		state: fields.map((colId) => ({ colId, hide: !visible })),
	});
}

function dateToggleItem({ id, kind, fields, label, title }) {
	return {
		type: "checkbox",
		id,
		label,
		title,
		checked: () => readFlag(kind),
		onChange: ({ table, checked }) => {
			writeFlag(kind, checked);
			setDateColumnsVisible(table, fields, checked);
		},
	};
}

/** Toolbar items: Actual then Plan. */
export function dateVisibilityToolbarItems() {
	return [
		dateToggleItem({
			id: "tree-gantt-dates-actual",
			kind: "actual",
			fields: ACTUAL_FIELDS,
			label: __("Fact"),
			title: __("Show fact start and completion dates"),
		}),
		dateToggleItem({
			id: "tree-gantt-dates-plan",
			kind: "plan",
			fields: PLAN_FIELDS,
			label: __("Plan"),
			title: __("Show plan start and completion dates"),
		}),
	];
}
