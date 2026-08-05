import { saveCells as apiSaveCells } from "../api.js";
import { ensureAssignUserInfo } from "../api.js";
import {
	normalizeUsers,
	sameUsers,
	stampAssignMetaAfterPwa,
	syncTaskAssignMany,
} from "./columns/assign/persist.js";
import { getColumnsPage } from "./columns/context.js";
import { isValidPriorityValue } from "./columns/priority/options.js";
import {
	normalizeRelations,
	sameRelations,
	stampRelationsOnRow,
	syncTaskRelationsMany,
} from "./columns/relations/persist.js";
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

const EDITABLE_FIELDS = new Set([...TASK_FIELDS, "assign", "relations"]);

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
	if (field === "relations") {
		return normalizeRelations(value);
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
		if (change.field === "relations") {
			const next = normalizeRelations(change.newValue);
			const taskId = taskIdFromChange(change);
			if (next.some((r) => r.predecessor === taskId)) {
				frappe.show_alert({
					message: __("Predecessor can't be same as successor"),
					indicator: "orange",
				});
				return false;
			}
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

async function saveRelationChanges(changes) {
	const relChanges = (changes || []).filter((c) => c.field === "relations");
	if (!relChanges.length) {
		return true;
	}

	try {
		const pageProject =
			getColumnsPage()?.fields_dict?.project?.get_value?.() || null;
		const ops = [];
		for (const change of relChanges) {
			const taskId = taskIdFromChange(change);
			const next = normalizeRelations(change.newValue);
			const prev = normalizeRelations(change.oldValue);
			if (sameRelations(prev, next)) {
				continue;
			}
			ops.push({
				taskId,
				relations: next,
				project: change.row?.project || pageProject,
				row: change.row || null,
			});
		}
		if (!ops.length) {
			return true;
		}
		await syncTaskRelationsMany(ops);
		for (const op of ops) {
			if (op.row) {
				stampRelationsOnRow(op.row, op.relations);
			}
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
				message: e.message || __("Relations update failed"),
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
		const pageProject =
			getColumnsPage()?.fields_dict?.project?.get_value?.() || null;
		const ops = [];
		const usersForInfo = new Set();
		for (const change of assignChanges) {
			const taskId = taskIdFromChange(change);
			const next = normalizeUsers(change.newValue);
			const prev = normalizeUsers(change.oldValue);
			if (sameUsers(prev, next)) {
				continue;
			}
			ops.push({
				taskId,
				users: next,
				project: change.row?.project || pageProject,
				exp_start_date: change.row?.exp_start_date ?? null,
				exp_end_date: change.row?.exp_end_date ?? null,
				row: change.row || null,
			});
			next.forEach((u) => usersForInfo.add(u));
		}
		if (!ops.length) {
			return true;
		}
		await syncTaskAssignMany(ops);
		for (const op of ops) {
			if (op.row) {
				stampAssignMetaAfterPwa(op.row, op.users);
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

export async function onSaveCells({ changes, table }) {
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
	if ((changes || []).some((c) => c.field === "assign")) {
		table?.api?.refreshCells?.({
			columns: ["assign"],
			force: true,
		});
	}

	const relationsOk = await saveRelationChanges(changes);
	if (!relationsOk) {
		return false;
	}
	if ((changes || []).some((c) => c.field === "relations")) {
		table?.api?.refreshCells?.({
			columns: ["relations"],
			force: true,
		});
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
			c.field === "assign" ||
			c.field === "relations"
	);
}
