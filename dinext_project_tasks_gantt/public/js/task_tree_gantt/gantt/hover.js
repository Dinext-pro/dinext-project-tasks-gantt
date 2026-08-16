const ROW_HOVER = "tree-gantt-row--hover";
const BAR_HOVER = "tree-gantt-bar--hover";

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
	// Pinned left + center keep separate `.ag-row` nodes — highlight all.
	const rows = tableHost.querySelectorAll(
		`.ag-row[row-id="${CSS.escape(id)}"]`
	);
	if (rows.length) {
		rows.forEach((row) => row.classList.add(ROW_HOVER));
		return;
	}
	if (!table?.api?.getRowNode) {
		return;
	}
	const node = table.api.getRowNode(id);
	const idx = node?.rowIndex;
	if (idx == null || !table.api.getDisplayedRowAtIndex) {
		return;
	}
	const displayed = table.api.getDisplayedRowAtIndex(idx);
	if (displayed?.rowIndex == null) {
		return;
	}
	tableHost
		.querySelectorAll(`.ag-row[row-index="${displayed.rowIndex}"]`)
		.forEach((row) => row.classList.add(ROW_HOVER));
}

function highlightGanttBar(ganttEl, rowId, on) {
	if (!ganttEl || !rowId) {
		return;
	}
	clearGanttHover(ganttEl);
	if (!on) {
		return;
	}
	const bar = ganttEl.querySelector(
		`.bar-wrapper[data-id="${CSS.escape(String(rowId))}"]`
	);
	bar?.classList.add(BAR_HOVER);
}

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
