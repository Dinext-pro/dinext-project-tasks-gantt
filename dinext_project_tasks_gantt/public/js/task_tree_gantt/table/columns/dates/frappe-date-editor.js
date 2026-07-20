/**
 * AG Grid in-cell editor — Frappe ControlDate (Desk calendar).
 * Core `type: "date"` supplies ISO contract + fill/paste; this is display/edit UX only.
 *
 * In-cell (not cellEditorPopup): editor fills the cell like other AG editors.
 * Datepicker stays on body. mousedown preventDefault keeps input focus so
 * `stopEditingWhenCellsLoseFocus` does not commit before onSelect.
 */

function toIso(value) {
	if (typeof DinextTable?.toIsoDateString === "function") {
		return DinextTable.toIsoDateString(value);
	}
	if (value == null || value === "") {
		return null;
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return frappe.datetime.obj_to_str(value);
	}
	const s = String(value).trim();
	if (!s) {
		return null;
	}
	return s.includes("T") ? s.slice(0, 10) : s;
}

export class FrappeDateCellEditor {
	init(params) {
		this.params = params;
		this._stopped = false;
		this._value = toIso(params.value);

		this.host = document.createElement("div");
		this.host.className = "tree-gantt-frappe-date-editor";

		const field = params.colDef?.field || "date";
		const initial = this._value || "";

		this.control = frappe.ui.form.make_control({
			parent: $(this.host),
			only_input: true,
			df: {
				fieldname: field,
				fieldtype: "Date",
				label: "",
			},
			value: initial,
			render_input: true,
		});

		this.control.$wrapper?.addClass?.("tree-gantt-frappe-date-control");
		this.control.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();

		this._bindDatepicker();

		this.control.$input?.on?.("change", () => {
			this._value = toIso(this.control.get_value());
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

	_bindDatepicker() {
		const dp = this.control?.datepicker;
		if (!dp?.$datepicker) {
			return;
		}
		dp.$datepicker.addClass("tree-gantt-datepicker");
		dp.$datepicker.off(".treeGanttDate");
		// Keep focus on the cell input while using the calendar.
		dp.$datepicker.on("mousedown.treeGanttDate", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
		});
	}

	getGui() {
		return this.host;
	}

	afterGuiAttached() {
		this.control?.$input?.trigger?.("focus");
		this._bindDatepicker();
		this.control?.datepicker?.show?.();
	}

	getValue() {
		if (this._value !== undefined) {
			return this._value;
		}
		return toIso(this.control?.get_value?.());
	}

	isCancelAfterEnd() {
		return false;
	}

	stopEditing(cancel = false) {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		if (!cancel) {
			this._value = toIso(this.control?.get_value?.()) ?? this._value;
		}
		this.params?.stopEditing?.(cancel);
	}

	destroy() {
		try {
			this.control?.datepicker?.$datepicker?.off?.(".treeGanttDate");
			this.control?.datepicker?.hide?.();
			this.control?.datepicker?.destroy?.();
		} catch (e) {
			/* ignore teardown races */
		}
		this.control = null;
		this.host = null;
		this.params = null;
	}
}
