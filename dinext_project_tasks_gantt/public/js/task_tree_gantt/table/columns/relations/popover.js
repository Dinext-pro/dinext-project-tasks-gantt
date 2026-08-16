/**
 * Cell popover: mini-table Task Relation rows (predecessor, type, delete).
 * Save commits; Escape / outside click discards.
 * Link awesomplete stays in-place (Frappe default).
 */
import {
	DEFAULT_RELATION_TYPE,
	normalizeRelations,
	relationKey,
} from "./persist.js";
import { getRelationTypeOptions } from "./options.js";

const POPOVER_SCROLL_MAX_PX = 500;

let activePopover = null;

function closeActivePopover() {
	if (activePopover) {
		activePopover.destroy();
		activePopover = null;
	}
}

/** Native fullscreen only shows descendants of fullscreenElement. */
function getPopoverMountParent() {
	return (
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement ||
		document.msFullscreenElement ||
		document.body
	);
}

function placeNearAnchor(panel, anchorEl) {
	const rect = anchorEl.getBoundingClientRect();
	const pad = 8;
	const w = panel.offsetWidth || 420;
	const h = panel.offsetHeight || 200;
	let left = rect.left;
	let top = rect.bottom + 4;
	if (left + w > window.innerWidth - pad) {
		left = Math.max(pad, window.innerWidth - w - pad);
	}
	if (top + h > window.innerHeight - pad) {
		top = Math.max(pad, rect.top - h - 4);
	}
	panel.style.left = `${Math.max(pad, left)}px`;
	panel.style.top = `${Math.max(pad, top)}px`;
}

/**
 * @param {{
 *   anchorEl: HTMLElement,
 *   taskId: string,
 *   project?: string | null,
 *   relations: object[],
 *   onSave: (relations: object[]) => void,
 * }} opts
 */
export function openRelationsPopover({
	anchorEl,
	taskId,
	project = null,
	relations = [],
	onSave,
}) {
	closeActivePopover();
	if (!anchorEl || !taskId) {
		return;
	}

	const typeOptions = getRelationTypeOptions();
	const draft = normalizeRelations(relations).map((r) => ({ ...r }));
	/** @type {{ el: HTMLElement, predCtrl: object, typeCtrl: object }[]} */
	const rowCtrls = [];

	const panel = document.createElement("div");
	panel.className = "tree-gantt-relations-popover";
	panel.setAttribute("role", "dialog");

	const rowsWrap = document.createElement("div");
	rowsWrap.className = "tree-gantt-relations-popover__rows";
	const table = document.createElement("table");
	table.className = "tree-gantt-relations-popover__table";
	table.innerHTML = `<thead><tr>
		<th>${__("Predecessor")}</th>
		<th>${__("Link type")}</th>
		<th></th>
	</tr></thead>`;
	const tbody = document.createElement("tbody");
	table.appendChild(tbody);
	rowsWrap.appendChild(table);
	panel.appendChild(rowsWrap);

	const footer = document.createElement("div");
	footer.className = "tree-gantt-relations-popover__footer";
	const addBtn = document.createElement("button");
	addBtn.type = "button";
	addBtn.className = "btn btn-xs btn-default";
	addBtn.textContent = __("Add row");
	const spacer = document.createElement("span");
	spacer.className = "tree-gantt-relations-popover__spacer";
	const saveBtn = document.createElement("button");
	saveBtn.type = "button";
	saveBtn.className = "btn btn-xs btn-primary";
	saveBtn.textContent = __("Save");
	footer.append(addBtn, spacer, saveBtn);
	panel.appendChild(footer);

	const mountParent = getPopoverMountParent();
	mountParent.appendChild(panel);

	function updateScrollMode() {
		// Measure unconstrained height; scroll rows only if panel > 500px.
		rowsWrap.classList.remove("tree-gantt-relations-popover__rows--scrollable");
		rowsWrap.style.maxHeight = "";
		void panel.offsetHeight;
		if (panel.offsetHeight > POPOVER_SCROLL_MAX_PX) {
			const chrome = footer.offsetHeight + 28; /* padding + gap */
			rowsWrap.style.maxHeight = `${Math.max(
				120,
				POPOVER_SCROLL_MAX_PX - chrome
			)}px`;
			rowsWrap.classList.add("tree-gantt-relations-popover__rows--scrollable");
		}
		placeNearAnchor(panel, anchorEl);
	}

	function collectDraft() {
		const out = [];
		const seen = new Set();
		for (const row of rowCtrls) {
			const predecessor = String(row.predCtrl?.get_value?.() || "").trim();
			if (!predecessor) {
				throw new Error(__("Predecessor is required"));
			}
			const type =
				String(row.typeCtrl?.get_value?.() || "").trim() ||
				DEFAULT_RELATION_TYPE;
			const key = relationKey(predecessor, type);
			if (seen.has(key)) {
				throw new Error(__("Duplicate relation exists"));
			}
			seen.add(key);
			if (predecessor === taskId) {
				throw new Error(__("Predecessor can't be same as successor"));
			}
			const prevExact = draft.find(
				(d) => relationKey(d.predecessor, d.type) === key
			);
			const prevPred = draft.find((d) => d.predecessor === predecessor);
			let subject =
				prevExact?.predecessor_subject ||
				prevPred?.predecessor_subject ||
				"";
			try {
				subject =
					frappe.utils.get_link_title?.("Task", predecessor) ||
					subject;
			} catch (e) {
				/* ignore */
			}
			if (subject === predecessor) {
				subject =
					prevExact?.predecessor_subject ||
					prevPred?.predecessor_subject ||
					"";
			}
			out.push({
				predecessor,
				predecessor_subject: subject || undefined,
				type,
				buffer_days:
					prevExact?.buffer_days ?? prevPred?.buffer_days ?? 0,
				is_active: 1,
				name: prevExact?.name,
				project:
					prevExact?.project ||
					prevPred?.project ||
					project ||
					undefined,
			});
		}
		return out;
	}

	function removeRow(entry) {
		const idx = rowCtrls.indexOf(entry);
		if (idx < 0) {
			return;
		}
		rowCtrls.splice(idx, 1);
		entry.el.remove();
		try {
			entry.predCtrl?.$wrapper?.remove?.();
		} catch (e) {
			/* ignore */
		}
		try {
			entry.typeCtrl?.$wrapper?.remove?.();
		} catch (e) {
			/* ignore */
		}
		updateScrollMode();
	}

	function addRow(initial = {}) {
		const tr = document.createElement("tr");
		const tdPred = document.createElement("td");
		const tdType = document.createElement("td");
		const tdDel = document.createElement("td");
		tdDel.className = "tree-gantt-relations-popover__del";

		const predHost = document.createElement("div");
		predHost.className = "tree-gantt-relations-popover__ctrl";
		tdPred.appendChild(predHost);

		const typeHost = document.createElement("div");
		typeHost.className = "tree-gantt-relations-popover__ctrl";
		tdType.appendChild(typeHost);

		const delBtn = document.createElement("button");
		delBtn.type = "button";
		delBtn.className = "btn btn-xs btn-default";
		delBtn.title = __("Delete");
		delBtn.innerHTML = `<i class="fa fa-trash"></i>`;
		tdDel.appendChild(delBtn);

		tr.append(tdPred, tdType, tdDel);
		tbody.appendChild(tr);

		const predCtrl = frappe.ui.form.make_control({
			parent: $(predHost),
			only_input: true,
			df: {
				fieldname: "predecessor",
				fieldtype: "Link",
				options: "Task",
				label: "",
				get_query: () => {
					const filters = [["Task", "name", "!=", taskId]];
					if (project) {
						filters.push(["Task", "project", "=", project]);
					}
					return { filters };
				},
			},
			render_input: true,
		});
		predCtrl.$wrapper?.addClass?.("tree-gantt-relations-popover-control");
		predCtrl.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
		if (initial.predecessor) {
			predCtrl.set_value?.(initial.predecessor);
		}

		const typeCtrl = frappe.ui.form.make_control({
			parent: $(typeHost),
			only_input: true,
			df: {
				fieldname: "type",
				fieldtype: "Select",
				label: "",
				options: typeOptions.join("\n"),
			},
			render_input: true,
		});
		typeCtrl.$wrapper?.addClass?.("tree-gantt-relations-popover-control");
		typeCtrl.$wrapper?.find?.(".control-label, .help-box, .clearfix")?.hide?.();
		typeCtrl.set_value?.(initial.type || DEFAULT_RELATION_TYPE);

		const entry = { el: tr, predCtrl, typeCtrl };
		delBtn.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			removeRow(entry);
		});
		rowCtrls.push(entry);
		updateScrollMode();
	}

	if (draft.length) {
		for (const r of draft) {
			addRow(r);
		}
	} else {
		addRow({});
	}

	function destroy() {
		document.removeEventListener("mousedown", onDocDown, true);
		document.removeEventListener("keydown", onKey, true);
		window.removeEventListener("resize", onReposition);
		window.removeEventListener("scroll", onReposition, true);
		for (const row of rowCtrls) {
			try {
				row.predCtrl?.$wrapper?.remove?.();
			} catch (e) {
				/* ignore */
			}
			try {
				row.typeCtrl?.$wrapper?.remove?.();
			} catch (e) {
				/* ignore */
			}
		}
		rowCtrls.length = 0;
		panel.remove();
		if (activePopover === api) {
			activePopover = null;
		}
	}

	function onDocDown(ev) {
		const t = ev.target;
		if (
			panel.contains(t) ||
			t?.closest?.(".awesomplete > ul") ||
			t?.closest?.('.awesomplete > [role="listbox"]') ||
			t?.closest?.(".datepicker") ||
			t?.closest?.(".modal")
		) {
			return;
		}
		destroy();
	}

	function onKey(ev) {
		if (ev.key === "Escape") {
			ev.preventDefault();
			destroy();
		}
	}

	function onReposition() {
		placeNearAnchor(panel, anchorEl);
	}

	addBtn.addEventListener("click", (ev) => {
		ev.preventDefault();
		addRow({});
	});
	saveBtn.addEventListener("click", (ev) => {
		ev.preventDefault();
		try {
			const next = collectDraft();
			onSave?.(next);
			destroy();
		} catch (e) {
			frappe.show_alert({
				message: e.message || __("Invalid relation"),
				indicator: "orange",
			});
		}
	});

	document.addEventListener("mousedown", onDocDown, true);
	document.addEventListener("keydown", onKey, true);
	window.addEventListener("resize", onReposition);
	window.addEventListener("scroll", onReposition, true);

	updateScrollMode();

	const api = { destroy };
	activePopover = api;
	return api;
}

export function closeRelationsPopover() {
	closeActivePopover();
}
