/**
 * AG Grid in-cell editor — Frappe ControlDate (Desk calendar).
 * Core `type: "date"` supplies ISO contract + fill/paste; this is display/edit UX only.
 *
 * In-cell (not cellEditorPopup): editor fills the cell like other AG editors.
 * Datepicker stays on body unless native fullscreen is active — then core
 * `DinextTable.adoptOverlay` moves it into `fullscreenElement`.
 * mousedown preventDefault keeps input focus so
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
	if (s.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(s)) {
		return s.slice(0, 10);
	}
	const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
	if (dmy) {
		return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
		return s;
	}
	return null;
}

export class FrappeDateCellEditor {
	init(params) {
		this.params = params;
		this._stopped = false;
		this._parsed = null;
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
		this.control.$input?.addClass?.(
			"dinext-table-date-editor tree-gantt-frappe-date-input"
		);

		this._bindDatepicker();

		this.control.$input?.on?.("change", () => {
			this._parsed = null;
			const parsed = this._readValidated();
			if (parsed.invalid) {
				this.stopEditing(true);
				return;
			}
			this._value = parsed.iso;
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
		this._adoptDatepicker();
	}

	_adoptDatepicker() {
		const node = this.control?.datepicker?.$datepicker?.[0];
		if (!node || typeof DinextTable?.adoptOverlay !== "function") {
			return;
		}
		DinextTable.adoptOverlay(node, { anchor: this.control?.$input?.[0] });
	}

	getGui() {
		return this.host;
	}

	afterGuiAttached() {
		this.control?.$input?.trigger?.("focus");
		this._bindDatepicker();
		this.control?.datepicker?.show?.();
		this._adoptDatepicker();
	}

	_readValidated() {
		if (this._parsed) {
			return this._parsed;
		}
		const raw = this.control?.get_value?.();
		if (raw == null || raw === "") {
			this._parsed = { iso: null, invalid: false };
			return this._parsed;
		}
		const validated = this.control.validate?.(raw);
		if (validated === "" || validated == null) {
			this._parsed = { iso: null, invalid: true };
			return this._parsed;
		}
		const iso = toIso(validated);
		this._parsed = { iso, invalid: !iso };
		return this._parsed;
	}

	getValue() {
		const parsed = this._readValidated();
		if (parsed.invalid) {
			return this.params?.value ?? null;
		}
		if (parsed.iso !== undefined) {
			return parsed.iso;
		}
		if (this._value !== undefined) {
			return this._value;
		}
		return toIso(this.control?.get_value?.());
	}

	isCancelAfterEnd() {
		return this._readValidated().invalid;
	}

	stopEditing(cancel = false) {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		if (!cancel) {
			this._parsed = null;
			const parsed = this._readValidated();
			if (!parsed.invalid) {
				this._value = parsed.iso;
			}
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
