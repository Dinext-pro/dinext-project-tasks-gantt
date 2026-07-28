import { saveCells as apiSaveCells } from "../api.js";
import { ensureAssignUserInfo } from "../api.js";
import {
	normalizeUsers,
	sameUsers,
	syncTaskAssign,
} from "./columns/assign/persist.js";
import { isValidPriorityValue } from "./columns/priority/options.js";
import { isValidStatusValue } from "./columns/status/options.js";

const TASK_FIELDS = new Set([
	"subject",
	"status",
	"priority",
	"exp_start_date",
	"exp_end_date",
	"expected_time",
	"custom_include",
]);

const EDITABLE_FIELDS = new Set([...TASK_FIELDS, "assign"]);

export function rowCanWrite(row) {
	if (!row?.id) return false;
	return row.can_write === 1 || row.can_write === true;
}

export function fieldCanEdit(row, field) {
	return EDITABLE_FIELDS.has(field) && rowCanWrite(row);
}

/** Task name — not tree `_rowId` path. */
export function taskIdFromChange(change) {
	if (change?.row?.id) {
		return String(change.row.id);
	}
	const raw = String(change?.rowId || "");
	if (!raw) {
		return "";
	}
	const parts = raw.split(":");
	return parts[parts.length - 1] || raw;
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
	if (field === "assign") {
		return normalizeUsers(value);
	}
	return value;
}

function rejectSelectValue(fieldLabel, value) {
	const shown =
		value == null || value === "" ? __("(empty)") : String(value);
	frappe.show_alert({
		message: __("Invalid {0}: {1}", [fieldLabel, shown]),
		indicator: "orange",
	});
	return false;
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
				message: __("Not permitted to write Task {0}", [
					taskIdFromChange(change),
				]),
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
		if (change.field === "status" && !isValidStatusValue(change.newValue, change.row)) {
			return rejectSelectValue(__("Status"), change.newValue);
		}
		if (change.field === "priority" && !isValidPriorityValue(change.newValue)) {
			return rejectSelectValue(__("Priority"), change.newValue);
		}
	}
	return true;
}

/** Persist cell changes. Shared path for grid (and later gantt drag). */
export async function saveCells(payload) {
	if (!payload?.length) return true;

	try {
		await apiSaveCells(payload);
		frappe.show_alert(
			{
				message: __("Data updated successfully"),
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

async function saveAssignChanges(changes) {
	const assignChanges = (changes || []).filter((c) => c.field === "assign");
	if (!assignChanges.length) {
		return true;
	}

	try {
		const usersForInfo = new Set();
		for (const change of assignChanges) {
			const taskId = taskIdFromChange(change);
			const next = normalizeUsers(change.newValue);
			const prev = normalizeUsers(change.oldValue);
			if (sameUsers(prev, next)) {
				continue;
			}
			await syncTaskAssign(taskId, next);
			next.forEach((u) => usersForInfo.add(u));
			if (change.row) {
				change.row.assign = next;
			}
		}
		if (usersForInfo.size) {
			await ensureAssignUserInfo([...usersForInfo]);
		}
		frappe.show_alert(
			{
				message: __("Data updated successfully"),
				indicator: "green",
			},
			5
		);
		return true;
	} catch (e) {
		frappe.show_alert(
			{
				message: e.message || __("Assign failed"),
				indicator: "red",
			},
			7
		);
		return false;
	}
}

export async function onSaveCells({ changes }) {
	const taskPayload = (changes || [])
		.filter((c) => TASK_FIELDS.has(c.field))
		.map((c) => ({
			id: taskIdFromChange(c),
			field: c.field,
			value: normalizeSaveValue(c.field, c.newValue),
		}))
		.filter((c) => c.id);

	const assignOk = await saveAssignChanges(changes);
	if (!assignOk) {
		return false;
	}

	if (!taskPayload.length) {
		return true;
	}
	return saveCells(taskPayload);
}

export function changesAffectGantt(changes) {
	return (changes || []).some(
		(c) =>
			c.field === "exp_start_date" ||
			c.field === "exp_end_date" ||
			c.field === "status" ||
			c.field === "priority" ||
			c.field === "subject" ||
			c.field === "progress" ||
			c.field === "assign"
	);
}
