/**
 * Column «Задача» — Tree onrender parity:
 * pin left, milestone, color, title=id, dep conflict, hover toolbar,
 * single-click → Control(Data), dblclick → Form.
 */
import {
	subjectConflictClassRules,
	subjectTreeContentKey,
} from "../../../dependencies/check.js";
import { el } from "../../format.js";
import { openTaskForm } from "./actions.js";
import { startSubjectInlineEdit } from "./edit.js";
import { buildSubjectToolbar } from "./toolbar.js";

const MILESTONE_SRC = "/files/rhombus.png";
const CLICK_EDIT_DELAY_MS = 280;

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

function wireSubjectTextInteractions(text, main, row, params) {
	let clickTimer = null;

	text.addEventListener("click", (ev) => {
		if (ev.target.closest?.(".tree-gantt-subject-toolbar")) {
			return;
		}
		ev.stopPropagation();
		if (!row.can_write) {
			return;
		}
		// Wait — dblclick cancels and opens Form (Tree parity).
		clearTimeout(clickTimer);
		clickTimer = setTimeout(() => {
			clickTimer = null;
			void startSubjectInlineEdit({
				mainEl: main,
				textEl: text,
				row,
				params,
			});
		}, CLICK_EDIT_DELAY_MS);
	});

	text.addEventListener("dblclick", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		clearTimeout(clickTimer);
		clickTimer = null;
		openTaskForm(row.id);
	});
}

export function renderSubject(params) {
	const row = params.data || {};
	const wrap = el("span", "tree-gantt-subject");
	wrap.title = subjectTitle(row);

	if (row.dep_conflict) {
		wrap.classList.add("tree-gantt-dep-conflict");
	}
	if (row.can_write) {
		wrap.classList.add("tree-gantt-subject--editable");
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
	wireSubjectTextInteractions(text, main, row, params);
	main.appendChild(text);
	wrap.appendChild(main);

	const toolbar = buildSubjectToolbar(row);
	if (toolbar) {
		wrap.appendChild(toolbar);
	}

	return wrap;
}

export function subjectTooltip(params) {
	return subjectTitle(params.data);
}

export function subjectColumn() {
	return {
		field: "subject",
		headerName: __("Task"),
		// Tree .tree-link is position:sticky left — AG pin left.
		pinned: "left",
		suppressMovable: true,
		lockPinned: true,
		// Only resizable column (defaultColDef.resizable = false).
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
		tooltipValueGetter: subjectTooltip,
		// Inline edit = Frappe Control on click (Tree), not AG editor.
		edit: false,
		sortable: false,
	};
}
