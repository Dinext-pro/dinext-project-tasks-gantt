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

/** Column id → Task fieldname. Inverse of server TaskRow.ALIASES mismatches only. */
const COLUMN_TO_DOCTYPE = {
	task_type: "type",
	task_type_label: "type",
	assign: "_assign",
	assign_pwa: "_assign",
	assign_todo_only: "_assign",
	relations: "custom_relations",
	user_tags: "_user_tags",
};

export function toDocTypeField(field) {
	return COLUMN_TO_DOCTYPE[field] || field;
}

export function rowCanRead(row) {
	if (!row?.id) return false;
	if (row.can_read === 0 || row.can_read === false) return false;
	return true;
}

export function rowCanWrite(row) {
	if (!row?.id) return false;
	return row.can_write === 1 || row.can_write === true;
}

/** Gate before editor / gantt date-drag. Backend always sends can_write_fields. */
export function fieldCanEdit(row, field) {
	if (!rowCanRead(row)) return false;
	if (!rowCanWrite(row)) return false;
	const allowed = row.can_write_fields;
	if (!Array.isArray(allowed)) return false;
	return allowed.includes(toDocTypeField(field));
}

/** Native title / SVG <title> when click/drag is gated. */
export function writeDeniedTitle() {
	return __("Not permitted");
}

export function deniedTitle(row, field) {
	return fieldCanEdit(row, field) ? "" : writeDeniedTitle();
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

/** ISO YYYY-MM-DD or null. Never pass through unparseable input. */
export function toFrappeDate(value) {
	if (typeof DinextTable?.toIsoDateString === "function") {
		return DinextTable.toIsoDateString(value);
	}
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
	if (s.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(s)) {
		return s.slice(0, 10);
	}
	const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
	if (dmy) {
		return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		return s;
	}
	return null;
}

function clearTaskDocs(ids) {
	for (const id of ids) {
		if (id) {
			frappe.model.clear_doc?.("Task", id);
		}
	}
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
		if (!rowCanRead(change.row) || !rowCanWrite(change.row)) {
			frappe.show_alert({
				message: __("Not permitted to write Task {0}", [
					taskIdFromChange(change),
				]),
				indicator: "red",
			});
			return false;
		}
		if (!fieldCanEdit(change.row, change.field)) {
			frappe.show_alert({
				message: __("Field {0} is not editable", [change.field]),
				indicator: "orange",
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
		if (change.field === "exp_start_date" || change.field === "exp_end_date") {
			const raw = change.newValue;
			if (raw != null && raw !== "" && !toFrappeDate(raw)) {
				frappe.show_alert({
					message: __("Invalid date"),
					indicator: "orange",
				});
				return false;
			}
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

function toIsoDate(value) {
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
	return s.slice(0, 10);
}

/**
 * Apply save_cells side-effect `rows` (saved task + ancestors after parent
 * exp_* cascade) through DinextTable.applyExternalCellValues — grid copy +
 * sourceData, no second onSaveCells.
 * @returns {boolean} true if any field write applied
 */
export function applySideEffectDateRows(table, rows) {
	if (!table || !rows?.length) {
		return false;
	}
	if (typeof table.applyExternalCellValues !== "function") {
		console.error(
			"[task_tree_gantt] DinextTable.applyExternalCellValues missing — rebuild dinext_common"
		);
		return false;
	}

	const changes = [];
	for (const row of rows) {
		if (!row?.id) {
			continue;
		}
		for (const field of ["exp_start_date", "exp_end_date"]) {
			changes.push({
				id: String(row.id),
				field,
				value: toIsoDate(row[field]),
			});
		}
	}
	if (!changes.length) {
		return false;
	}
	return table.applyExternalCellValues(changes) > 0;
}

/** Persist cell changes. Shared path for grid (and later gantt drag). */
export async function saveCells(payload, { table } = {}) {
	if (!payload?.length) return true;

	try {
		const message = await apiSaveCells(payload);
		applySideEffectDateRows(table, message?.rows);
		const write = message?.write;
		if (write && table) {
			const flagChanges = [];
			for (const id of Object.keys(write)) {
				const flags = write[id];
				flagChanges.push({
					id,
					field: "can_write",
					value: flags.can_write,
				});
				flagChanges.push({
					id,
					field: "can_write_fields",
					value: flags.can_write_fields,
				});
			}
			table.applyExternalCellValues?.(flagChanges);
		}
		const savedIds = new Set(
			payload.map((p) => p.id).filter(Boolean).map(String)
		);
		for (const row of message?.rows || []) {
			if (row?.id) {
				savedIds.add(String(row.id));
			}
		}
		clearTaskDocs(savedIds);
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
		clearTaskDocs(ops.map((op) => op.taskId));
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
		clearTaskDocs(ops.map((op) => op.taskId));
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
	return saveCells(taskPayload, { table });
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
