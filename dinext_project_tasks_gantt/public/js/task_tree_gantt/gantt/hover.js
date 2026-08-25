const ROW_HOVER = "tree-gantt-row--hover";
const BAR_HOVER = "tree-gantt-bar--hover";
const ROW_SELECT = "tree-gantt-row--select";
const BAR_SELECT = "tree-gantt-bar--select";
const BAR_RELATED = "tree-gantt-bar--related";
const ARROW_RELATED = "tree-gantt-arrow--related";

const INTERACTIVE =
	"button, a, input, select, textarea, .ag-checkbox, .ag-selection-checkbox, .ag-header, .dinext-table-toolbar, .tree-gantt-subject-toolbar, .tree-gantt-frappe-date-editor, .ag-floating-filter, .ag-header-cell-resize, .tree-gantt-relations";

function clearTableClass(tableHost, className) {
	tableHost
		?.querySelectorAll?.(".ag-row." + className)
		.forEach((el) => el.classList.remove(className));
}

function clearGanttClass(ganttEl, className) {
	ganttEl
		?.querySelectorAll?.(".bar-wrapper." + className)
		.forEach((el) => el.classList.remove(className));
}

/** AG `row-id` is tree path `PARENT:CHILD`; gantt `data-id` is Task name. */
export function taskIdFromAgRow(table, rowEl) {
	const pathId = rowEl?.getAttribute?.("row-id");
	if (!pathId) {
		return "";
	}
	const node = table?.api?.getRowNode?.(pathId);
	if (node?.data?.id) {
		return String(node.data.id);
	}
	const parts = String(pathId).split(":");
	return parts[parts.length - 1] || pathId;
}

function highlightTableRow(tableHost, table, taskId, on, className) {
	if (!tableHost) {
		return;
	}
	clearTableClass(tableHost, className);
	if (!on || !taskId) {
		return;
	}
	const id = String(taskId);
	const indexes = new Set();
	table?.api?.forEachNode?.((node) => {
		if (node?.data && String(node.data.id) === id && node.rowIndex != null) {
			indexes.add(node.rowIndex);
		}
	});
	if (indexes.size) {
		indexes.forEach((idx) => {
			tableHost
				.querySelectorAll(`.ag-row[row-index="${idx}"]`)
				.forEach((row) => row.classList.add(className));
		});
		return;
	}
	tableHost.querySelectorAll(".ag-row[row-id]").forEach((row) => {
		const rid = row.getAttribute("row-id") || "";
		if (rid === id || rid.endsWith(`:${id}`)) {
			row.classList.add(className);
		}
	});
}

function highlightGanttBars(ganttEl, taskIds, className) {
	clearGanttClass(ganttEl, className);
	if (!ganttEl || !taskIds?.length) {
		return;
	}
	for (const taskId of taskIds) {
		const bar = ganttEl.querySelector(
			`.bar-wrapper[data-id="${CSS.escape(String(taskId))}"]`
		);
		bar?.classList.add(className);
	}
}

function stripRelatedGanttPaint(ganttEl) {
	if (!ganttEl) {
		return;
	}
	ganttEl.querySelectorAll(`.bar-wrapper.${BAR_RELATED}`).forEach((el) => {
		el.classList.remove(BAR_RELATED);
	});
	ganttEl
		.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`)
		.forEach((el) => {
			el.classList.remove(ARROW_RELATED);
		});
}

function paintRelatedArrows(ganttEl, taskIds, originId) {
	if (!ganttEl) {
		return;
	}
	ganttEl
		.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`)
		.forEach((el) => {
			el.classList.remove(ARROW_RELATED);
		});
	const ids = new Set((taskIds || []).map(String).filter(Boolean));
	const origin = originId ? String(originId) : "";
	if (!ids.size && !origin) {
		return;
	}
	ganttEl.querySelectorAll("path[data-from][data-to]").forEach((path) => {
		const from = path.getAttribute("data-from");
		const to = path.getAttribute("data-to");
		if (!from || !to) {
			return;
		}
		const both = ids.has(from) && ids.has(to);
		const originHop = origin && (from === origin || to === origin);
		if (!both && !originHop) {
			return;
		}
		path.classList.add(ARROW_RELATED);
		path.closest("g.arrow")?.classList.add(ARROW_RELATED);
	});
}

export function applyRelatedGanttPaint(ganttEl, taskIds, originId) {
	stripRelatedGanttPaint(ganttEl);
	highlightGanttBars(ganttEl, taskIds, BAR_RELATED);
	paintRelatedArrows(ganttEl, taskIds, originId);
}

function highlightGanttBar(ganttEl, taskId, on, className) {
	highlightGanttBars(ganttEl, on && taskId ? [taskId] : [], className);
}

const GANTT_COL_W = 25;

function ganttViewportEl(ganttEl) {
	return ganttEl?.querySelector?.(".gantt-container") || null;
}

function lockGanttHProg(box) {
	if (!box) {
		return;
	}
	box.dataset.ganttHProg = "1";
	let done = false;
	const unlock = () => {
		if (done) {
			return;
		}
		done = true;
		delete box.dataset.ganttHProg;
		box.removeEventListener("scrollend", unlock);
	};
	box.addEventListener("scrollend", unlock);
	setTimeout(unlock, 2500);
}

function syncGanttHScroll(ganttEl) {
	const vp = ganttViewportEl(ganttEl);
	const bar = ganttEl?.querySelector?.(
		".task-tree-gantt-hscroll-top-viewport"
	);
	if (vp && bar) {
		bar.scrollLeft = vp.scrollLeft;
	}
}

function ganttColumnWidth(gantt, ganttEl) {
	const fromCfg = Number(gantt?.config?.column_width);
	if (fromCfg > 0) {
		return fromCfg;
	}
	const box = ganttViewportEl(ganttEl);
	const raw = box && getComputedStyle(box).getPropertyValue("--gv-column-width");
	const css = parseFloat(raw);
	return css > 0 ? css : GANTT_COL_W;
}

function ganttDateScrollLeft(gantt, ganttEl, day) {
	if (typeof gantt?.set_scroll_position === "function") {
		gantt.set_scroll_position(day);
		return true;
	}
	const col = ganttColumnWidth(gantt, ganttEl);
	const step = Number(gantt?.config?.step) || 1;
	const start = gantt?.gantt_start;
	if (start instanceof Date && col > 0 && step > 0) {
		const days =
			(Date.parse(`${day}T00:00:00`) - start.getTime()) / 86400000;
		if (Number.isFinite(days)) {
			ganttViewportEl(ganttEl)?.scrollTo?.({
				left: Math.max(0, (days / step) * col - col / 6),
				behavior: "smooth",
			});
			return true;
		}
	}
	return false;
}

function scrollGanttToDate(gantt, ganttEl, date) {
	const day = String(date || "").slice(0, 10);
	const box = ganttViewportEl(ganttEl);
	if (!box || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return;
	}
	lockGanttHProg(box);
	if (!ganttDateScrollLeft(gantt, ganttEl, day)) {
		box.scrollTo({
			left: 0,
			behavior: "smooth",
		});
	}
	requestAnimationFrame(() => syncGanttHScroll(ganttEl));
}

function taskRowData(table, taskId) {
	if (!taskId || !table?.api?.forEachNode) {
		return null;
	}
	const id = String(taskId);
	let data = null;
	table.api.forEachNode((node) => {
		if (!data && node?.data && String(node.data.id) === id) {
			data = node.data;
		}
	});
	return data;
}

export function scrollGanttToTask(gantt, ganttEl, table, taskId, dateHint) {
	if (dateHint) {
		scrollGanttToDate(gantt, ganttEl, dateHint);
		return;
	}
	const box = ganttViewportEl(ganttEl);
	const esc =
		typeof CSS !== "undefined" && CSS.escape
			? CSS.escape(String(taskId || ""))
			: String(taskId || "").replace(/"/g, '\\"');
	const bar = ganttEl?.querySelector?.(
		`.bar-wrapper[data-id="${esc}"] rect.bar`
	);
	const x = Number(bar?.getAttribute?.("x"));
	if (box && Number.isFinite(x) && x >= 0) {
		const col = ganttColumnWidth(gantt, ganttEl);
		lockGanttHProg(box);
		box.scrollTo({
			left: Math.max(0, x - col / 6),
			behavior: "smooth",
		});
		requestAnimationFrame(() => syncGanttHScroll(ganttEl));
		return;
	}
	const start = taskRowData(table, taskId)?.exp_start_date;
	if (start) {
		scrollGanttToDate(gantt, ganttEl, start);
	}
}

function dateFromHeaderEl(el) {
	const node = el?.closest?.(".lower-text, .upper-text");
	if (!node) {
		return "";
	}
	const cls = [...(node.classList || [])].find((c) => c.startsWith("date_"));
	if (!cls) {
		return "";
	}
	const raw = cls.slice(5).replace(/_/g, "-");
	return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}

function dateFromTableCell(target) {
	const cell = target?.closest?.(".ag-cell");
	const col = cell?.getAttribute?.("col-id") || "";
	if (col !== "exp_start_date" && col !== "exp_end_date") {
		return "";
	}
	const row = cell.closest(".ag-row");
	return row ? col : "";
}

export function setupHoverSync(tableHost, ganttEl, table, gantt, initialSelect, state) {
	if (!tableHost || !ganttEl) {
		return () => {};
	}

	let lastHover = null;
	let lastSelect = null;
	let leaveTimer = null;

	function paintHover(taskId) {
		if (!taskId) {
			clearTableClass(tableHost, ROW_HOVER);
			clearGanttClass(ganttEl, BAR_HOVER);
			return;
		}
		highlightTableRow(tableHost, table, taskId, true, ROW_HOVER);
		highlightGanttBar(ganttEl, taskId, true, BAR_HOVER);
	}

	function paintSelect(taskId) {
		if (!taskId) {
			clearTableClass(tableHost, ROW_SELECT);
			clearGanttClass(ganttEl, BAR_SELECT);
			return;
		}
		highlightTableRow(tableHost, table, taskId, true, ROW_SELECT);
		highlightGanttBar(ganttEl, taskId, true, BAR_SELECT);
	}

	function paintRelatedBars() {
		applyRelatedGanttPaint(
			ganttEl,
			state?.relatedTaskIds || [],
			state?.relatedOriginId
		);
	}

	function clearRelated() {
		if (state) {
			state.relatedTaskIds = [];
			state.relatedOriginId = "";
		}
		const host = tableHost._treeGanttTable;
		if (host) {
			host.relatedTaskIds = new Set();
		}
		tableHost
			.querySelectorAll?.(".ag-row.tree-gantt-row--related")
			.forEach((el) => el.classList.remove("tree-gantt-row--related"));
		table?.api?.redrawRows?.();
		applyRelatedGanttPaint(ganttEl, [], "");
	}

	function setHover(taskId) {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
		if (lastHover === taskId) {
			return;
		}
		lastHover = taskId;
		paintHover(taskId);
	}

	function setSelect(taskId) {
		if (lastSelect === taskId) {
			return;
		}
		lastSelect = taskId;
		paintSelect(taskId);
	}

	function scheduleClear() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
		}
		leaveTimer = setTimeout(() => setHover(null), 80);
	}

	function onTableOver(e) {
		const row = e.target?.closest?.(".ag-row");
		const id = taskIdFromAgRow(table, row);
		if (id) {
			setHover(id);
		}
	}

	function onGanttOver(e) {
		const wrap = e.target?.closest?.(".bar-wrapper[data-id]");
		const id = wrap?.getAttribute?.("data-id");
		if (id) {
			setHover(id);
		}
	}

	function onTableClick(e) {
		if (e.target?.closest?.(INTERACTIVE)) {
			return;
		}
		const row = e.target?.closest?.(".ag-row");
		const id = taskIdFromAgRow(table, row);
		if (!id) {
			return;
		}
		clearRelated();
		setSelect(id);
		const dateCol = dateFromTableCell(e.target);
		const rowData = taskRowData(table, id);
		const hint = dateCol && rowData ? rowData[dateCol] : null;
		scrollGanttToTask(gantt, ganttEl, table, id, hint);
	}

	function onGanttClick(e) {
		const headerDate = dateFromHeaderEl(e.target);
		if (headerDate) {
			scrollGanttToDate(gantt, ganttEl, headerDate);
			return;
		}
		const wrap = e.target?.closest?.(".bar-wrapper[data-id]");
		const id = wrap?.getAttribute?.("data-id");
		if (!id) {
			return;
		}
		clearRelated();
		setSelect(id);
	}

	tableHost.addEventListener("mouseover", onTableOver, { passive: true });
	tableHost.addEventListener("mouseleave", scheduleClear, { passive: true });
	tableHost.addEventListener("click", onTableClick, true);
	ganttEl.addEventListener("mouseover", onGanttOver, { passive: true });
	ganttEl.addEventListener("mouseleave", scheduleClear, { passive: true });
	ganttEl.addEventListener("click", onGanttClick, true);

	if (initialSelect) {
		setSelect(initialSelect);
	}
	paintRelatedBars();

	return function cleanup() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
		}
		tableHost.removeEventListener("mouseover", onTableOver);
		tableHost.removeEventListener("mouseleave", scheduleClear);
		tableHost.removeEventListener("click", onTableClick, true);
		ganttEl.removeEventListener("mouseover", onGanttOver);
		ganttEl.removeEventListener("mouseleave", scheduleClear);
		ganttEl.removeEventListener("click", onGanttClick, true);
		clearTableClass(tableHost, ROW_HOVER);
		clearTableClass(tableHost, ROW_SELECT);
		clearGanttClass(ganttEl, BAR_HOVER);
		clearGanttClass(ganttEl, BAR_SELECT);
		clearGanttClass(ganttEl, BAR_RELATED);
		ganttEl
			.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`)
			.forEach((el) => {
				el.classList.remove(ARROW_RELATED);
			});
	};
}
