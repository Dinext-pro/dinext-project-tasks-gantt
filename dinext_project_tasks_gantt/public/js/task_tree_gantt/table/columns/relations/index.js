/**
 * Column «Связи» / Relations:
 * - display: subject[FS] (+N−1)
 * - dblclick → popover mini-table (predecessor, type, delete)
 * - single click → selection / fill-handle
 */
import { el } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { getColumnsPage } from "../context.js";
import { fixedCol, TREE_COL_WIDTH } from "../widths.js";
import { shortRelationType } from "./options.js";
import {
	enrichPredecessorSubjects,
	normalizeRelations,
	predecessorLabel,
	relationsFromRow,
	sameRelations,
	stampRelationsOnRow,
	withResolvedSubjects,
} from "./persist.js";
import { openRelationsPopover } from "./popover.js";

function formatRelationLine(rel) {
	const label = predecessorLabel(rel);
	if (!label) {
		return "";
	}
	return `${label}[${shortRelationType(rel.type)}]`;
}

function relsForParams(params) {
	return relationsFromRow(params.data, params.value, params.api);
}

export function relationsValueFormatter(params) {
	const rels = relsForParams(params);
	if (!rels.length) {
		return "";
	}
	const first = formatRelationLine(rels[0]);
	if (rels.length === 1) {
		return first;
	}
	return `${first} +${rels.length - 1}`;
}

export function relationsValueParser(params) {
	const raw = params.newValue;
	if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
		return normalizeRelations(raw);
	}
	return normalizeRelations(params.oldValue);
}

function commitRelationsChange(params, row, nextRelations) {
	const table = params.context?.dinextTable;
	const oldValue = relationsFromRow(row, null, params.api);
	const newValue = withResolvedSubjects(
		normalizeRelations(nextRelations),
		params.api
	);
	if (sameRelations(oldValue, newValue)) {
		return false;
	}
	if (!params.node || typeof table?.commitCellChanges !== "function") {
		console.error("[task_tree_gantt] relations commit: table/node missing");
		return false;
	}

	const source =
		typeof DinextTable?.CELL_CHANGE_SOURCES?.EDIT === "string"
			? DinextTable.CELL_CHANGE_SOURCES.EDIT
			: "edit";

	stampRelationsOnRow(row, newValue);
	if (params.node?.data && params.node.data !== row) {
		stampRelationsOnRow(params.node.data, newValue);
	}

	const { applied } = table.commitCellChanges({
		source,
		changes: [
			{
				node: params.node,
				field: "relations",
				oldValue,
				newValue,
				rowIndex: params.node.rowIndex,
				colId: params.column?.getColId?.() || "relations",
			},
		],
	});
	return applied > 0;
}

function openEditor(row, params, wrap) {
	const page = getColumnsPage();
	const project = page?.fields_dict?.project?.get_value?.() || null;
	openRelationsPopover({
		anchorEl: wrap,
		taskId: row.id,
		project,
		relations: relationsFromRow(row, params.value, params.api),
		onSave: (next) => {
			void (async () => {
				const enriched = await enrichPredecessorSubjects(next);
				const ok = commitRelationsChange(params, row, enriched);
				if (ok) {
					params.api?.refreshCells?.({
						rowNodes: params.node ? [params.node] : undefined,
						columns: ["relations"],
						force: true,
					});
				}
			})();
		},
	});
}

export function renderRelations(params) {
	const row = params.data || {};
	const rels = relsForParams(params);
	const wrap = el("div", "tree-gantt-relations");
	const tipLines = rels
		.map((r) => {
			const line = formatRelationLine(r);
			if (!line) {
				return "";
			}
			if (r.predecessor_subject && r.predecessor_subject !== r.predecessor) {
				return `${line}\n${r.predecessor}`;
			}
			return line;
		})
		.filter(Boolean);
	wrap.title = tipLines.length
		? `${tipLines.join("\n\n")}\n${__("Double-click to edit")}`
		: __("Double-click to edit");

	if (!rels.length) {
		wrap.classList.add("text-muted");
		wrap.textContent = "-";
	} else {
		wrap.textContent = relationsValueFormatter(params);
	}

	// Persist resolved subjects on row so later edits keep labels.
	if (rels.length && row.relations) {
		stampRelationsOnRow(row, rels);
	}

	if (fieldCanEdit(row, "relations")) {
		wrap.classList.add("tree-gantt-relations--editable");
		// Single click → selection / fill-handle; dblclick → popover.
		wrap.addEventListener("dblclick", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			openEditor(row, params, wrap);
		});
	}

	return wrap;
}

function startRelationsFromEvent(event) {
	const wrap = event?.event?.target
		?.closest?.(".ag-cell")
		?.querySelector?.(".tree-gantt-relations");
	if (!wrap) {
		return;
	}
	const row = event.data || event.node?.data || {};
	if (!fieldCanEdit(row, "relations")) {
		return;
	}
	openEditor(row, event, wrap);
}

export function relationsColumn() {
	return {
		field: "relations",
		headerName: __("Relations"),
		...fixedCol(TREE_COL_WIDTH.relations),
		edit: (row) => fieldCanEdit(row, "relations"),
		suppressClickEdit: true,
		onActiveClickEdit: startRelationsFromEvent,
		sortable: false,
		cellDataType: false,
		cellRenderer: renderRelations,
		valueFormatter: relationsValueFormatter,
		valueParser: relationsValueParser,
	};
}
