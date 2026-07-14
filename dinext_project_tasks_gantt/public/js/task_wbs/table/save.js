// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { saveCells as apiSaveCells } from "../api.js";

const EDITABLE_FIELDS = new Set([
	"subject",
	"status",
	"priority",
	"exp_start_date",
	"exp_end_date",
	"expected_time",
	"custom_include",
]);

export function rowCanWrite(row) {
	if (!row?.id) {
		return false;
	}
	return row.can_write === 1 || row.can_write === true;
}

export function fieldCanEdit(row, field) {
	return EDITABLE_FIELDS.has(field) && rowCanWrite(row);
}

function toFrappeDate(value) {
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
	// AG Grid / ISO may send datetime — Task date fields want YYYY-MM-DD
	if (s.includes("T")) {
		return s.slice(0, 10);
	}
	return s;
}

function normalizeSaveValue(field, value) {
	if (field === "custom_include") {
		return value ? 1 : 0;
	}
	if (field === "exp_start_date" || field === "exp_end_date") {
		return toFrappeDate(value);
	}
	if (field === "expected_time") {
		if (value == null || value === "") {
			return null;
		}
		const n = Number(value);
		return Number.isFinite(n) ? n : value;
	}
	return value;
}

export function onValidateCells({ changes }) {
	for (const change of changes) {
		if (!EDITABLE_FIELDS.has(change.field)) {
			frappe.show_alert({
				message: __("Field {0} is not editable", [change.field]),
				indicator: "orange",
			});
			return false;
		}
		if (!rowCanWrite(change.row)) {
			frappe.show_alert({
				message: __("Not permitted to write Task {0}", [change.rowId]),
				indicator: "red",
			});
			return false;
		}
		if (change.field === "subject" && !String(change.newValue || "").trim()) {
			frappe.show_alert({
				message: __("Subject is required"),
				indicator: "orange",
			});
			return false;
		}
	}
	return true;
}

/**
 * Persist cell changes via api.saveCells. Shared by grid edit and gantt drag.
 * @param {object[]} payload [{ id, field, value }, ...]
 * @returns {Promise<boolean>}
 */
export async function saveCells(payload) {
	if (!payload?.length) {
		return true;
	}

	try {
		await apiSaveCells(payload);
		frappe.show_alert(
			{
				message: __("Данные успешно обновлены"),
				indicator: "green",
			},
			5
		);
		return true;
	} catch (e) {
		frappe.show_alert(
			{
				message: e.message || __("Save failed"),
				indicator: "red",
			},
			7
		);
		return false;
	}
}

export async function onSaveCells({ changes }) {
	const payload = changes
		.filter((c) => EDITABLE_FIELDS.has(c.field))
		.map((c) => ({
			id: c.rowId,
			field: c.field,
			value: normalizeSaveValue(c.field, c.newValue),
		}));

	return saveCells(payload);
}
