/**
 * Column «Ответств.» — Tree assign cell:
 * avatar_group(max 3), empty "-", click → start_pwa_dialog when can_write.
 */
import { el } from "../../format.js";
import { ensureAssignUserInfo } from "../../../api.js";
import { getColumnsPage, getOnAssignSaved } from "../context.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { openAssignDialog } from "./dialog.js";

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

async function applyAssignToRow(row, params, users) {
	await ensureAssignUserInfo(users);
	row.assign = users;
	if (params.node?.data) {
		params.node.data.assign = users;
	}
	params.api?.refreshCells?.({
		rowNodes: params.node ? [params.node] : undefined,
		columns: ["assign"],
		force: true,
	});
	getOnAssignSaved?.(row.id, users);
}

function wireClick(wrap, params, row) {
	if (!row.can_write) {
		return;
	}
	wrap.classList.add("tree-gantt-assign--editable");
	wrap.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const page = getColumnsPage();
		const project = page?.fields_dict?.project?.get_value?.() || null;
		openAssignDialog({
			row,
			project,
			onSaved: (users) => applyAssignToRow(row, params, users),
		});
	});
}

/** Display / clipboard label for assign user list. */
export function assignValueFormatter(params) {
	const users = assignUsers(params.data, params.value);
	return users.length ? users.join(", ") : "";
}

/** Paste path — column edit:false, but AG still wants a parser for object type. */
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

	if (!users.length) {
		wrap.classList.add("text-muted");
		wrap.textContent = "-";
	} else {
		wrap.appendChild(renderAvatars(users));
	}

	wireClick(wrap, params, row);
	return wrap;
}

export function assignColumn() {
	return {
		field: "assign",
		headerName: __("Ответств."),
		...fixedCol(TREE_COL_WIDTH.assign),
		edit: false,
		sortable: false,
		// Array field — disable AG inference (warning #48 Formatter/Parser).
		cellDataType: false,
		cellRenderer: renderAssign,
		valueFormatter: assignValueFormatter,
		valueParser: assignValueParser,
		cellClass: "dinext-table-cell--align-center",
	};
}
