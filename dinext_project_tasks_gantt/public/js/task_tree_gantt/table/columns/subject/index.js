/**
 * Column «Задача» — Tree onrender parity:
 * pin left, milestone, color, title=id, dep conflict, hover toolbar.
 * Click-when-active / dblclick → Control(Data). Form — toolbar pencil.
 * Text click must bubble: hover.js capture scrolls gantt.
 */
import {
	subjectConflictClassRules,
	subjectTreeContentKey,
} from "../../../dependencies/check.js";
import { el } from "../../format.js";
import { fieldCanEdit } from "../../save.js";
import { startSubjectInlineEdit } from "./edit.js";
import { wireSubjectPreview } from "./preview.js";
import { buildSubjectToolbar } from "./toolbar.js";

const MILESTONE_SRC = "/files/rhombus.png";

function subjectTitle(row) {
	if (row?.dep_conflict) {
		return (
			row.dep_conflict_start ||
			row.dep_conflict_end ||
			__("Dependency conflict")
		);
	}
	return row?.id || "";
}

function subjectEditEls(event) {
	const target = event?.event?.target;
	if (target?.closest?.(".tree-gantt-subject-toolbar, .dinext-table-tree-toggle")) {
		return null;
	}
	const cell = target?.closest?.(".ag-cell");
	const main = cell?.querySelector?.(".tree-gantt-subject-main");
	const text = cell?.querySelector?.(".tree-gantt-subject-text");
	if (!main || !text) {
		return null;
	}
	return { main, text };
}

function startSubjectFromEvent(event) {
	const els = subjectEditEls(event);
	if (!els) {
		return;
	}
	const row = event.data || event.node?.data || {};
	if (!fieldCanEdit(row, "subject")) {
		return;
	}
	void startSubjectInlineEdit({
		mainEl: els.main,
		textEl: els.text,
		row,
		params: event,
	});
}

function wireEdit(wrap, main, text, row, params) {
	if (!fieldCanEdit(row, "subject")) {
		return;
	}
	wrap.classList.add("tree-gantt-subject--editable");
	// No wrap.title — native tooltip fights hover preview (mouseleave / flash dismiss).
	// Single click → selection / gantt scroll; active click / dblclick → edit.
	wrap.addEventListener("dblclick", (ev) => {
		if (ev.target.closest?.(".tree-gantt-subject-toolbar")) {
			return;
		}
		ev.preventDefault();
		ev.stopPropagation();
		void startSubjectInlineEdit({
			mainEl: main,
			textEl: text,
			row,
			params,
		});
	});
}

export function renderSubject(params) {
	const row = params.data || {};
	const wrap = el("span", "tree-gantt-subject");
	// Browser tooltip only for dep conflict — description uses hover preview.
	if (row.dep_conflict) {
		wrap.title = subjectTitle(row);
		wrap.classList.add("tree-gantt-dep-conflict");
	}
	if (row.color) {
		wrap.style.boxShadow = `inset 3px 0 0 ${row.color}`;
		wrap.classList.add("tree-gantt-subject--colored");
	}

	const main = el("span", "tree-gantt-subject-main");

	if (row.is_milestone) {
		const mark = el("img", "tree-gantt-milestone");
		mark.src = MILESTONE_SRC;
		mark.alt = __("Milestone");
		mark.width = 14;
		mark.height = 14;
		main.appendChild(mark);
	}

	const text = el(
		"span",
		"tree-gantt-subject-text",
		row.subject || params.value || ""
	);
	main.appendChild(text);
	wrap.appendChild(main);

	const toolbar = buildSubjectToolbar(row);
	if (toolbar) {
		wrap.appendChild(toolbar);
	}

	wireEdit(wrap, main, text, row, params);
	wireSubjectPreview(wrap, row);
	return wrap;
}

export function subjectColumn() {
	return {
		field: "subject",
		headerName: __("Task"),
		// Tree .tree-link is position:sticky left — AG pin left.
		pinned: "left",
		suppressMovable: true,
		lockPinned: true,
		resizable: true,
		flex: 1,
		minWidth: 280,
		maxWidth: 600,
		width: 360,
		tree: true,
		render: renderSubject,
		// Remount body when dep flags change (value/subject may stay same).
		treeContentKey: subjectTreeContentKey,
		cellClassRules: subjectConflictClassRules(),
		edit: (row) => fieldCanEdit(row, "subject"),
		suppressClickEdit: true,
		onActiveClickEdit: startSubjectFromEvent,
		sortable: false,
	};
}
