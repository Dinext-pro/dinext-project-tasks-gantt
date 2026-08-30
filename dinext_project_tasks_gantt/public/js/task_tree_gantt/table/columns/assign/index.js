/**
 * Column «Ответств.»:
 * - single click → selection / fill-handle (no dialog)
 * - dblclick cell / avatar → PWA dialog
 * - fill / paste / bulk toolbar → silent PWA (dialog defaults) + ToDo
 * - avatars: PWA vs ToDo-only chrome
 */
import { el } from "../../format.js";
import { ensureAssignUserInfo } from "../../../api.js";
import { rowCanWrite } from "../../save.js";
import { getColumnsPage, getOnAssignSaved } from "../context.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { openAssignDialog } from "./dialog.js";
import {
	normalizeUsers,
	sameUsers,
	stampAssignMetaAfterPwa,
} from "./persist.js";

function assignUsers(row, value) {
	if (Array.isArray(value)) {
		return value;
	}
	return Array.isArray(row?.assign) ? row.assign : [];
}

function todoOnlySet(row) {
	return new Set(normalizeUsers(row?.assign_todo_only));
}

function renderAvatars(users, row) {
	const list = el(
		"div",
		"list-assignments tree-gantt-assign-avatars avatar-group overlap"
	);
	const todoOnly = todoOnlySet(row);
	const shown = users.slice(0, 3);
	for (const user of shown) {
		const fullName = frappe.user?.full_name?.(user) || user;
		const isTodoOnly = todoOnly.has(user);
		const tmp = document.createElement("div");
		tmp.innerHTML = frappe.avatar(user, "avatar-small");
		const avatarNode = tmp.firstElementChild;
		if (!avatarNode) {
			continue;
		}
		avatarNode.classList.add(
			"tree-gantt-assign-avatar",
			isTodoOnly
				? "tree-gantt-assign-avatar--todo"
				: "tree-gantt-assign-avatar--pwa"
		);
		const tip = isTodoOnly
			? __("{0}: assigned via ToDo only (no workload)", [fullName])
			: fullName;
		avatarNode.setAttribute("aria-label", tip);
		avatarNode.title = tip;
		const frame = avatarNode.querySelector(".avatar-frame");
		if (frame) {
			frame.title = tip;
		}
		list.appendChild(avatarNode);
	}
	if (users.length > 3) {
		const more = el("span", "avatar-group-more text-muted");
		more.textContent = `+${users.length - 3}`;
		list.appendChild(more);
	}
	return list;
}

/**
 * Route assign mutation through DinextTable pipeline (validate/save/undo).
 * @param {object} [oldUsers] capture before stampAssignMetaAfterPwa mutates row.assign
 * @returns {boolean}
 */
function commitAssignChange(params, row, nextUsers, oldUsers) {
	const table = params.context?.dinextTable;
	const oldValue = normalizeUsers(
		oldUsers !== undefined ? oldUsers : row?.assign
	);
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
	// Capture before stamp — stamp writes row.assign and would make sameUsers no-op.
	const oldValue = normalizeUsers(row?.assign);
	// Mark as PWA before save so ToDo-sync stamp keeps them in assign_pwa.
	stampAssignMetaAfterPwa(row, newValue);
	if (params.node?.data && params.node.data !== row) {
		stampAssignMetaAfterPwa(params.node.data, newValue);
	}
	const ok = commitAssignChange(params, row, newValue, oldValue);
	if (!ok) {
		// Meta-only change or commit skipped — still remount avatars.
		params.api?.refreshCells?.({
			rowNodes: params.node ? [params.node] : undefined,
			columns: ["assign"],
			force: true,
		});
	}
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
		avatarsEl = renderAvatars(users, row);
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
		filterValueGetter: (row) => {
			const users = Array.isArray(row?.assign) ? row.assign : [];
			const parts = [];
			for (const user of users) {
				if (!user) {
					continue;
				}
				parts.push(String(user));
				const fullName = frappe.user?.full_name?.(user);
				if (fullName && fullName !== user) {
					parts.push(fullName);
				}
			}
			return parts.join(" ");
		},
	};
}
