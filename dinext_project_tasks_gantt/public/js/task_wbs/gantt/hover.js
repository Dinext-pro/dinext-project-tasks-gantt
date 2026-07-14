// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

const ROW_HOVER = "task-wbs-row--hover";
const BAR_HOVER = "task-wbs-bar--hover";

function clearTableHover(tableHost) {
	tableHost
		?.querySelectorAll?.(`.ag-row.${ROW_HOVER}`)
		.forEach((el) => el.classList.remove(ROW_HOVER));
}

function clearGanttHover(ganttEl) {
	ganttEl
		?.querySelectorAll?.(`.bar-wrapper.${BAR_HOVER}`)
		.forEach((el) => el.classList.remove(BAR_HOVER));
}

function highlightTableRow(tableHost, table, rowId, on) {
	if (!tableHost) {
		return;
	}
	clearTableHover(tableHost);
	if (!on || !rowId) {
		return;
	}
	const id = String(rowId);
	let row = tableHost.querySelector(`.ag-row[row-id="${CSS.escape(id)}"]`);
	if (!row && table?.api?.getRowNode) {
		const node = table.api.getRowNode(id);
		const idx = node?.rowIndex;
		if (idx != null && table.api.getDisplayedRowAtIndex) {
			const displayed = table.api.getDisplayedRowAtIndex(idx);
			if (displayed?.rowIndex != null) {
				row = tableHost.querySelector(
					`.ag-center-cols-container .ag-row[row-index="${displayed.rowIndex}"]`
				);
			}
		}
	}
	row?.classList.add(ROW_HOVER);
}

function highlightGanttBar(ganttEl, rowId, on) {
	if (!ganttEl || !rowId) {
		return;
	}
	clearGanttHover(ganttEl);
	if (!on) {
		return;
	}
	const bar = ganttEl.querySelector(`.bar-wrapper[data-id="${CSS.escape(String(rowId))}"]`);
	bar?.classList.add(BAR_HOVER);
}

/**
 * Bidirectional hover: AG Grid row ↔ gantt bar-wrapper[data-id].
 * Own classes: task-wbs-row--hover / task-wbs-bar--hover.
 * @returns {() => void} cleanup
 */
export function setupHoverSync(tableHost, ganttEl, table) {
	if (!tableHost || !ganttEl) {
		return () => {};
	}

	let lastId = null;
	let leaveTimer = null;

	function setHover(rowId) {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
		if (lastId === rowId) {
			return;
		}
		lastId = rowId;
		if (!rowId) {
			clearTableHover(tableHost);
			clearGanttHover(ganttEl);
			return;
		}
		highlightTableRow(tableHost, table, rowId, true);
		highlightGanttBar(ganttEl, rowId, true);
	}

	function scheduleClear() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
		}
		leaveTimer = setTimeout(() => setHover(null), 80);
	}

	function onTableOver(e) {
		const row = e.target?.closest?.(".ag-row");
		const id = row?.getAttribute?.("row-id");
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

	tableHost.addEventListener("mouseover", onTableOver, { passive: true });
	tableHost.addEventListener("mouseleave", scheduleClear, { passive: true });
	ganttEl.addEventListener("mouseover", onGanttOver, { passive: true });
	ganttEl.addEventListener("mouseleave", scheduleClear, { passive: true });

	return function cleanup() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
		}
		tableHost.removeEventListener("mouseover", onTableOver);
		tableHost.removeEventListener("mouseleave", scheduleClear);
		ganttEl.removeEventListener("mouseover", onGanttOver);
		ganttEl.removeEventListener("mouseleave", scheduleClear);
		clearTableHover(tableHost);
		clearGanttHover(ganttEl);
	};
}
