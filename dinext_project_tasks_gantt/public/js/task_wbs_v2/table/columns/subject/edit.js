/**
 * Tree parity: single-click subject → frappe Control(Data), save via save_cells.
 * dblclick → Form (handled in index.js with click delay).
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
	if (mainEl.querySelector(".twb-v2-subject-edit")) return;

	const taskId = row.id;
	let doc;
	try {
		doc = await frappe.model.with_doc("Task", taskId);
	} catch (e) {
		console.error("[task_wbs_v2] subject with_doc", e);
		return;
	}
	if (!fieldIsWritable(doc, taskId)) return;

	const oldValue = row.subject || "";
	textEl.style.display = "none";

	const host = document.createElement("span");
	host.className = "twb-v2-subject-edit";
	mainEl.appendChild(host);

	let finished = false;
	const finish = async (commit) => {
		if (finished) return;
		finished = true;
		const control = host._control;
		const raw = control ? control.get_value() : oldValue;
		const next = String(raw ?? "").trim();

		if (commit) {
			if (!next) {
				frappe.show_alert({
					message: __("Subject is required"),
					indicator: "orange",
				});
			} else if (next !== oldValue) {
				const ok = await saveCells([
					{ id: taskId, field: "subject", value: next },
				]);
				if (ok) {
					row.subject = next;
					if (params.node?.data) {
						params.node.data.subject = next;
					}
					getOnGanttRefresh()?.();
				}
			}
		}

		host._control = null;
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
	control.$wrapper?.addClass?.("twb-v2-subject-control");
	control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
	control.$input?.attr?.("autocomplete", "off");
	control.$input?.trigger?.("focus");
	control.$input?.trigger?.("select");

	control.$input?.on?.("keydown", (ev) => {
		if (ev.key === "Enter") {
			ev.preventDefault();
			ev.stopPropagation();
			void finish(true);
		} else if (ev.key === "Escape") {
			ev.preventDefault();
			ev.stopPropagation();
			void finish(false);
		}
	});

	control.$input?.on?.("blur", () => {
		setTimeout(() => void finish(true), 120);
	});
}
