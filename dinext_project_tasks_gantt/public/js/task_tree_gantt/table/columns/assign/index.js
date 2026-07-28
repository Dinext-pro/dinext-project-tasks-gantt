/**
 * Column «Ответств.»:
 * - single click → selection / fill-handle (no dialog)
 * - dblclick cell → PWA dialog
 * - click avatar → PWA dialog (shortcut)
 * - dialog / fill / paste → commitCellChanges (undo/redo + onSaveCells)
 */
import { el } from "../../format.js";
import { ensureAssignUserInfo } from "../../../api.js";
import { rowCanWrite } from "../../save.js";
import { getColumnsPage, getOnAssignSaved } from "../context.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { openAssignDialog } from "./dialog.js";
import { normalizeUsers, sameUsers } from "./persist.js";

function assignUsers(row, value) {
	if (Array.isArray(value)) {
		return value;
	}
	return Array.isArray(row?.assign) ? row.assign : [];
}

function renderAvatars(users) {
	const list = el("div", "list-assignments tree-gantt-assign-avatars d-flex align-items-center");
	// frappe.avatar_group → jQuery; Tree uses [0].outerHTML
	const node = frappe.avatar_group(users, 3, { filterable: false })[0];
	if (node) {
		list.appendChild(node);
	}
	return list;
}

/**
 * Route assign mutation through DinextTable pipeline (validate/save/undo).
 * @returns {boolean}
 */
function commitAssignChange(params, row, nextUsers) {
	const table = params.context?.dinextTable;
	const oldValue = normalizeUsers(row?.assign);
	const newValue = normalizeUsers(nextUsers);
	if (sameUsers(oldValue, newValue)) {
		return false;
	}
	if (!params.node || typeof table?.commitCellChanges !== "function") {
		console.error("[task_tree_gantt] assign commit: table/node missing");
		return false;
	}

	const source =
		typeof DinextTable?.CELL_CHANGE_SOURCES?.EDIT === "string"
			? DinextTable.CELL_CHANGE_SOURCES.EDIT
			: "edit";

	const { applied } = table.commitCellChanges({
		source,
		changes: [
			{
				node: params.node,
				field: "assign",
				oldValue,
				newValue,
				rowIndex: params.node.rowIndex,
				colId: params.column?.getColId?.() || "assign",
			},
		],
	});
	return applied > 0;
}

async function applyAssignFromDialog(row, params, users) {
	const newValue = normalizeUsers(users);
	await ensureAssignUserInfo(newValue);
	const ok = commitAssignChange(params, row, newValue);
	if (ok) {
		getOnAssignSaved?.(row.id, newValue);
	}
}

function openAssign(row, params) {
	const page = getColumnsPage();
	const project = page?.fields_dict?.project?.get_value?.() || null;
	openAssignDialog({
		row,
		project,
		onSaved: (users) => {
			void applyAssignFromDialog(row, params, users);
		},
	});
}

function wireAssignActions(wrap, params, row, avatarsEl) {
	if (!row.can_write) {
		return;
	}
	wrap.classList.add("tree-gantt-assign--editable");
	wrap.title = [wrap.title, __("Double-click to assign")].filter(Boolean).join(" — ");

	wrap.addEventListener("dblclick", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		openAssign(row, params);
	});

	if (avatarsEl) {
		avatarsEl.classList.add("tree-gantt-assign-avatars--action");
		avatarsEl.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			openAssign(row, params);
		});
	}
}

/** Display / clipboard label for assign user list. */
export function assignValueFormatter(params) {
	const users = assignUsers(params.data, params.value);
	return users.length ? users.join(", ") : "";
}

/** Paste / fill path — array of user ids. */
export function assignValueParser(params) {
	const raw = params.newValue;
	if (Array.isArray(raw)) {
		return raw.map(String).map((s) => s.trim()).filter(Boolean);
	}
	if (raw == null || raw === "") {
		return [];
	}
	if (typeof raw === "string") {
		return raw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return Array.isArray(params.oldValue) ? params.oldValue : [];
}

export function renderAssign(params) {
	const row = params.data || {};
	const users = assignUsers(row, params.value);
	const wrap = el("div", "tree-gantt-assign");
	const label = assignValueFormatter(params);
	wrap.title = label || "-";

	let avatarsEl = null;
	if (!users.length) {
		wrap.classList.add("text-muted");
		wrap.textContent = "-";
	} else {
		avatarsEl = renderAvatars(users);
		wrap.appendChild(avatarsEl);
	}

	wireAssignActions(wrap, params, row, avatarsEl);
	return wrap;
}

export function assignColumn() {
	return {
		field: "assign",
		headerName: __("Resp."),
		...fixedCol(TREE_COL_WIDTH.assign),
		edit: (row) => rowCanWrite(row),
		suppressClickEdit: true,
		sortable: false,
		cellDataType: false,
		cellRenderer: renderAssign,
		valueFormatter: assignValueFormatter,
		valueParser: assignValueParser,
		cellClass: "dinext-table-cell--align-center",
	};
}
