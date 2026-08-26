/**
 * Subject inline edit: Frappe Control(Data).
 * Persist via commitCellChanges (fill/paste/undo share the same path).
 */
import { fieldCanEdit } from "../../save.js";
import { cachedTaskDoc } from "../select-edit.js";

function evaluateReadOnlyDependsOn(expression, doc) {
	if (typeof expression === "boolean") return expression;
	if (!expression) return false;
	const expr = String(expression);
	if (expr.startsWith("eval:")) {
		try {
			return !!frappe.utils.eval(expr.slice(5), { doc });
		} catch (e) {
			return false;
		}
	}
	const value = doc?.[expr];
	if (Array.isArray(value)) return !!value.length;
	return !!value;
}

function fieldIsWritable(doc, taskId) {
	if (frappe.workflow?.is_read_only?.("Task", taskId)) return false;
	const df = frappe.meta.get_field("Task", "subject", taskId);
	if (!df) return true;
	let status = frappe.perm.get_field_display_status(df, doc, null, false);
	if (
		status === "Write" &&
		df.read_only_depends_on &&
		evaluateReadOnlyDependsOn(df.read_only_depends_on, doc)
	) {
		status = "Read";
	}
	return status === "Write";
}

function commitSubjectChange(params, row, next) {
	const table = params.context?.dinextTable;
	const oldValue = row.subject || "";
	const newValue = String(next ?? "").trim();
	if (String(oldValue) === String(newValue)) {
		return false;
	}
	if (!params.node || typeof table?.commitCellChanges !== "function") {
		console.error("[task_tree_gantt] subject commit: table/node missing");
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
				field: "subject",
				oldValue,
				newValue,
				rowIndex: params.node.rowIndex,
				colId: params.column?.getColId?.() || "subject",
			},
		],
	});
	return applied > 0;
}

/**
 * @param {{
 *   mainEl: HTMLElement,
 *   textEl: HTMLElement,
 *   row: object,
 *   params: object,
 * }} opts
 */
export async function startSubjectInlineEdit({ mainEl, textEl, row, params }) {
	if (!fieldCanEdit(row, "subject")) return;
	if (mainEl.dataset.subjectEditing === "1" || mainEl.querySelector(".tree-gantt-subject-edit")) {
		return;
	}

	const taskId = row.id;
	let doc = cachedTaskDoc(taskId);
	if (doc && !fieldIsWritable(doc, taskId)) {
		return;
	}

	mainEl.dataset.subjectEditing = "1";
	const oldValue = row.subject || "";
	textEl.style.display = "none";

	const host = document.createElement("span");
	host.className = "tree-gantt-subject-edit";
	mainEl.appendChild(host);

	let finished = false;
	let unbindKeys = () => {};
	const finish = (commit) => {
		if (finished) return;
		finished = true;
		unbindKeys();
		const control = host._control;
		const next = control ? control.get_value() : oldValue;

		if (commit && next != null && String(next).trim() !== String(oldValue)) {
			const ok = commitSubjectChange(params, row, next);
			if (ok) {
				frappe.model.clear_doc?.("Task", taskId);
			}
		}

		host._control = null;
		delete mainEl.dataset.subjectEditing;
		params.api?.refreshCells?.({
			rowNodes: params.node ? [params.node] : undefined,
			columns: ["subject"],
			force: true,
		});
	};

	const control = frappe.ui.form.make_control({
		parent: $(host),
		doctype: "Task",
		docname: taskId,
		only_input: true,
		df: {
			fieldname: "subject",
			fieldtype: "Data",
			label: "",
			reqd: 1,
		},
		value: oldValue,
		render_input: true,
	});
	host._control = control;
	control.$wrapper?.addClass?.("tree-gantt-subject-control");
	control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
	control.$input?.attr?.("autocomplete", "off");

	const inputEl = control.$input?.get?.(0);
	if (inputEl) {
		const onKey = (ev) => {
			if (ev.key === "Enter") {
				ev.preventDefault();
				ev.stopPropagation();
				finish(true);
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				ev.stopPropagation();
				finish(false);
			}
		};
		inputEl.addEventListener("keydown", onKey, true);
		unbindKeys = () => inputEl.removeEventListener("keydown", onKey, true);
	}

	const focusInput = () => {
		if (!inputEl || mainEl.dataset.subjectEditing !== "1") {
			return;
		}
		inputEl.focus();
		inputEl.select();
	};
	requestAnimationFrame(focusInput);

	if (!doc) {
		try {
			doc = await frappe.model.with_doc("Task", taskId);
			if (doc && !fieldIsWritable(doc, taskId)) {
				finish(false);
			}
		} catch (e) {
			console.error("[task_tree_gantt] subject with_doc", e);
		}
	}

	control.$input?.on?.("blur", () => {
		setTimeout(() => finish(true), 120);
	});
}
