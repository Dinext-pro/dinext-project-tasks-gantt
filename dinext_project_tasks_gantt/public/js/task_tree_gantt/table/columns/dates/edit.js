/**
 * Tree createControl(Date) for exp_start_date / exp_end_date — Frappe calendar.
 */
import { fieldCanEdit, saveCells } from "../../save.js";
import { getOnGanttRefresh } from "../context.js";

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

function fieldIsWritable(doc, taskId, field) {
	if (frappe.workflow?.is_read_only?.("Task", taskId)) return false;
	const df = frappe.meta.get_field("Task", field, taskId);
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

function toSysDate(value) {
	if (value == null || value === "") {
		return null;
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

function stampDate(row, params, field, next) {
	row[field] = next;
	if (params.node?.data) {
		params.node.data[field] = next;
	}
}

function datepickerOpen(control) {
	const picker = control?.datepicker;
	if (!picker) {
		return false;
	}
	return !!picker.visible;
}

/**
 * @param {{
 *   wrap: HTMLElement,
 *   row: object,
 *   params: object,
 *   field: "exp_start_date" | "exp_end_date",
 * }} opts
 */
export async function startDateInlineEdit({ wrap, row, params, field }) {
	if (!fieldCanEdit(row, field)) return;
	if (wrap.querySelector(".tree-gantt-date-edit")) return;

	const taskId = row.id;
	let doc;
	try {
		doc = await frappe.model.with_doc("Task", taskId);
	} catch (e) {
		console.error("[task_tree_gantt] date with_doc", e);
		return;
	}
	if (!fieldIsWritable(doc, taskId, field)) return;

	const oldValue = toSysDate(row[field] || "");

	wrap.replaceChildren();
	const host = document.createElement("div");
	host.className = "tree-gantt-date-edit";
	wrap.appendChild(host);

	let finished = false;
	const finish = async (commit) => {
		if (finished) return;
		finished = true;
		const control = host._control;
		const next = toSysDate(control ? control.get_value() : oldValue);

		if (commit && String(next || "") !== String(oldValue || "")) {
			const ok = await saveCells([{ id: taskId, field, value: next }]);
			if (ok) {
				stampDate(row, params, field, next);
				frappe.model.clear_doc?.("Task", taskId);
				getOnGanttRefresh()?.();
			}
		}

		host._control = null;
		control?.datepicker?.destroy?.();
		params.api?.refreshCells?.({
			rowNodes: params.node ? [params.node] : undefined,
			columns: [field],
			force: true,
		});
	};

	const control = frappe.ui.form.make_control({
		parent: $(host),
		doctype: "Task",
		docname: taskId,
		only_input: true,
		df: {
			fieldname: field,
			fieldtype: "Date",
			label: "",
		},
		value: oldValue || "",
		render_input: true,
	});
	host._control = control;
	control.$wrapper?.addClass?.("tree-gantt-date-control");
	control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();

	const prevOnHide = control.datepicker?.opts?.onHide;
	control.datepicker?.update?.({
		onHide: (...args) => {
			if (typeof prevOnHide === "function") {
				prevOnHide(...args);
			}
			// Select → change → finish(true) first; hide without change → cancel.
			setTimeout(() => {
				if (!finished) {
					void finish(false);
				}
			}, 0);
		},
	});

	control.$input?.trigger?.("focus");
	control.datepicker?.show?.();

	control.$input?.on?.("change", () => {
		void finish(true);
	});
	control.$input?.on?.("keydown", (ev) => {
		if (ev.key === "Escape") {
			ev.preventDefault();
			ev.stopPropagation();
			control.datepicker?.hide?.();
			void finish(false);
		}
	});
	control.$input?.on?.("blur", () => {
		setTimeout(() => {
			if (datepickerOpen(control)) {
				return;
			}
			void finish(false);
		}, 200);
	});
}
