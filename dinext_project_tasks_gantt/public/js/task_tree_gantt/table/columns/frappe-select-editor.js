/**
 * AG Grid in-cell editor — Frappe ControlSelect.
 * Core `type: "select"` supplies key | null + fill/paste; this is Desk UX only.
 */

import { cachedTaskDoc, openNativeSelect } from "./select-edit.js";

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

function fieldIsWritable(doc, taskId, fieldname) {
	if (frappe.workflow?.is_read_only?.("Task", taskId)) return false;
	const df = frappe.meta.get_field("Task", fieldname, taskId);
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

function resolveValues(params) {
	const cep = params?.colDef?.cellEditorParams;
	const spec = typeof cep === "function" ? cep(params) : cep;
	let values = spec?.values;
	if (typeof values === "function") {
		values = values(params);
	}
	if (!Array.isArray(values)) {
		return [];
	}
	return values.map((v) => String(v).trim()).filter(Boolean);
}

function parseKey(raw, values) {
	if (typeof DinextTable?.parseSelectValue === "function") {
		return DinextTable.parseSelectValue(raw, values);
	}
	if (raw == null || raw === "") {
		return null;
	}
	const s = String(raw).trim();
	return values.includes(s) ? s : null;
}

export class FrappeSelectCellEditor {
	init(params) {
		this.params = params;
		this._stopped = false;
		this._cancel = false;
		this._values = resolveValues(params);
		this._field = params.colDef?.field || "select";

		this.host = document.createElement("div");
		this.host.className = "tree-gantt-frappe-select-editor";

		const initial = params.value == null ? "" : String(params.value);

		this.control = frappe.ui.form.make_control({
			parent: $(this.host),
			doctype: "Task",
			docname: params.data?.id,
			only_input: true,
			df: {
				fieldname: this._field,
				fieldtype: "Select",
				label: "",
				options: this._values.join("\n"),
			},
			value: initial,
			render_input: true,
		});

		this.control.$wrapper?.addClass?.("tree-gantt-frappe-select-control");
		this.control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
		this.control.$input?.addClass?.(
			"dinext-table-select-editor tree-gantt-frappe-select-input"
		);

		this.control.$input?.on?.("change", () => {
			this.stopEditing(false);
		});
		this.control.$input?.on?.("keydown", (ev) => {
			if (ev.key === "Escape") {
				ev.preventDefault();
				ev.stopPropagation();
				this.stopEditing(true);
			}
		});
	}

	getGui() {
		return this.host;
	}

	afterGuiAttached() {
		openNativeSelect(this.control?.$input);
		void this._checkWritable();
	}

	async _checkWritable() {
		const taskId = this.params?.data?.id;
		if (!taskId || this._stopped) {
			return;
		}
		let doc = cachedTaskDoc(taskId);
		if (!doc) {
			try {
				doc = await frappe.model.with_doc("Task", taskId);
			} catch (e) {
				console.error("[task_tree_gantt] select with_doc", e);
				return;
			}
		}
		if (this._stopped) {
			return;
		}
		if (doc && !fieldIsWritable(doc, taskId, this._field)) {
			this.stopEditing(true);
		}
	}

	getValue() {
		if (this._cancel) {
			return this.params?.value ?? null;
		}
		return parseKey(this.control?.get_value?.(), this._values);
	}

	isCancelAfterEnd() {
		return this._cancel;
	}

	stopEditing(cancel = false) {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		this._cancel = !!cancel;
		this.params?.stopEditing?.(cancel);
	}

	destroy() {
		this.control = null;
		this.host = null;
		this.params = null;
		this._values = null;
	}
}
