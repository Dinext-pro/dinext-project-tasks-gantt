/**
 * Tree createControl(Select) for priority — English values in/out.
 * Persist via commitCellChanges (fill/paste/undo share the same path).
 */
import { fieldCanEdit } from "../../save.js";
import { getPriorityOptions } from "./options.js";

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
	const df = frappe.meta.get_field("Task", "priority", taskId);
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

function commitPriorityChange(params, row, next) {
	const table = params.context?.dinextTable;
	const oldValue = row.priority || "";
	const newValue = next || "";
	if (String(oldValue) === String(newValue)) {
		return false;
	}
	if (!params.node || typeof table?.commitCellChanges !== "function") {
		console.error("[task_tree_gantt] priority commit: table/node missing");
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
				field: "priority",
				oldValue,
				newValue,
				rowIndex: params.node.rowIndex,
				colId: params.column?.getColId?.() || "priority",
			},
		],
	});
	return applied > 0;
}

/**
 * @param {{
 *   wrap: HTMLElement,
 *   row: object,
 *   params: object,
 * }} opts
 */
export async function startPriorityInlineEdit({ wrap, row, params }) {
	if (!fieldCanEdit(row, "priority")) return;
	if (wrap.querySelector(".tree-gantt-priority-edit")) return;

	const taskId = row.id;
	let doc;
	try {
		doc = await frappe.model.with_doc("Task", taskId);
	} catch (e) {
		console.error("[task_tree_gantt] priority with_doc", e);
		return;
	}
	if (!fieldIsWritable(doc, taskId)) return;

	const options = getPriorityOptions();
	const oldValue = row.priority || "";

	wrap.replaceChildren();
	const host = document.createElement("div");
	host.className = "tree-gantt-priority-edit";
	wrap.appendChild(host);

	let finished = false;
	const finish = (commit) => {
		if (finished) return;
		finished = true;
		const control = host._control;
		const next = control ? control.get_value() : oldValue;

		if (commit && next != null && String(next) !== String(oldValue)) {
			// Save English Select value only (never translated label).
			const ok = commitPriorityChange(params, row, next);
			if (ok) {
				frappe.model.clear_doc?.("Task", taskId);
			}
		}

		host._control = null;
		params.api?.refreshCells?.({
			rowNodes: params.node ? [params.node] : undefined,
			columns: ["priority"],
			force: true,
		});
	};

	const control = frappe.ui.form.make_control({
		parent: $(host),
		doctype: "Task",
		docname: taskId,
		only_input: true,
		df: {
			fieldname: "priority",
			fieldtype: "Select",
			label: "",
			options: options.join("\n"),
		},
		value: oldValue,
		render_input: true,
	});
	host._control = control;
	control.$wrapper?.addClass?.("tree-gantt-priority-control");
	control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
	control.$input?.trigger?.("focus");

	control.$input?.on?.("change", () => {
		finish(true);
	});
	control.$input?.on?.("keydown", (ev) => {
		if (ev.key === "Escape") {
			ev.preventDefault();
			ev.stopPropagation();
			finish(false);
		}
	});
	control.$input?.on?.("blur", () => {
		setTimeout(() => finish(false), 150);
	});
}
