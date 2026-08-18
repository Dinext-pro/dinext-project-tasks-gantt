const ROW_HOVER = "tree-gantt-row--hover";
const BAR_HOVER = "tree-gantt-bar--hover";
const ROW_SELECT = "tree-gantt-row--select";
const BAR_SELECT = "tree-gantt-bar--select";

const INTERACTIVE =
	"button, a, input, select, textarea, .ag-checkbox, .ag-selection-checkbox, .ag-header, .dinext-table-toolbar, .tree-gantt-subject-toolbar, .tree-gantt-frappe-date-editor, .ag-floating-filter, .ag-header-cell-resize";

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

function highlightGanttBar(ganttEl, taskId, on, className) {
	if (!ganttEl || !taskId) {
		return;
	}
	clearGanttClass(ganttEl, className);
	if (!on) {
		return;
	}
	const bar = ganttEl.querySelector(
		`.bar-wrapper[data-id="${CSS.escape(String(taskId))}"]`
	);
	bar?.classList.add(className);
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

function firstTimelineDate(ganttEl) {
	const el = ganttEl?.querySelector?.(".lower-text[class*='date_']");
	const cls = el && [...el.classList].find((c) => c.startsWith("date_"));
	if (!cls) {
		return "";
	}
	const raw = cls.slice(5).replace(/_/g, "-");
	return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
}

function scrollGanttToDate(gantt, ganttEl, date) {
	const day = String(date || "").slice(0, 10);
	const box = ganttViewportEl(ganttEl);
	if (!box || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return;
	}
	const origin = firstTimelineDate(ganttEl);
	if (origin) {
		const days = Math.round(
			(Date.parse(`${day}T00:00:00`) - Date.parse(`${origin}T00:00:00`)) /
				86400000
		);
		if (Number.isFinite(days)) {
			lockGanttHProg(box);
			box.scrollTo({
				left: Math.max(0, days * GANTT_COL_W - GANTT_COL_W / 6),
				behavior: "smooth",
			});
			return;
		}
	}
	lockGanttHProg(box);
	gantt?.set_scroll_position?.(day);
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

function scrollGanttToTask(gantt, ganttEl, table, taskId, dateHint) {
	if (dateHint) {
		scrollGanttToDate(gantt, ganttEl, dateHint);
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

export function setupHoverSync(tableHost, ganttEl, table, gantt, initialSelect) {
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
	};
}
