import { GANTT_HEADER_HEIGHT, HEADER_HEIGHT } from "../constants.js";

const GANTT_BASE_TOP_PAD = 1.5;

function tableViewport(tableHost) {
	return tableHost?.querySelector?.(".ag-body-viewport") || null;
}

function ganttViewport(ganttEl) {
	return ganttEl?.querySelector?.(".gantt-container") || ganttEl || null;
}

/** Bidirectional vertical scroll: AG Grid ↔ .gantt-container. */
export function setupScrollSync(tableHost, ganttEl) {
	const left = tableViewport(tableHost);
	const right = ganttViewport(ganttEl);
	if (!left || !right) {
		return () => {};
	}

	let lock = false;

	function fromLeft() {
		if (lock) {
			return;
		}
		lock = true;
		right.scrollTop = left.scrollTop;
		requestAnimationFrame(() => {
			lock = false;
		});
	}

	function fromRight() {
		if (lock) {
			return;
		}
		lock = true;
		left.scrollTop = right.scrollTop;
		requestAnimationFrame(() => {
			lock = false;
		});
	}

	left.addEventListener("scroll", fromLeft, { passive: true });
	right.addEventListener("scroll", fromRight, { passive: true });

	return function cleanup() {
		left.removeEventListener("scroll", fromLeft);
		right.removeEventListener("scroll", fromRight);
	};
}

function topHScrollHeight(tableHost) {
	const el = tableHost?.querySelector?.(".dinext-table-hscroll-top");
	if (!el || el.classList.contains("is-idle")) {
		return 0;
	}
	return el.offsetHeight || 0;
}

const FILTER_ROW_FALLBACK = 28;

/** Second AG header row (column search). 0 when filter UI closed. */
function filterRowHeight(tableHost) {
	const row = tableHost?.querySelector?.(".ag-header-row-column-filter");
	if (row) {
		return row.offsetHeight || FILTER_ROW_FALLBACK;
	}
	if (tableHost?.classList?.contains("dinext-table--filter-row")) {
		return FILTER_ROW_FALLBACK;
	}
	return 0;
}

function parkParent(ganttEl) {
	return (
		ganttEl?.closest?.(".task-tree-gantt-panel--right") ||
		ganttEl?.parentElement ||
		null
	);
}

function findGanttHScroll(ganttEl, parked) {
	if (parked?.isConnected || parked) {
		return parked;
	}
	return (
		ganttEl?.querySelector?.("[data-role=gantt-hscroll-top]") ||
		parkParent(ganttEl)?.querySelector?.("[data-role=gantt-hscroll-top]") ||
		null
	);
}

function createGanttHScroll() {
	const bar = document.createElement("div");
	bar.className = "task-tree-gantt-hscroll-top is-idle";
	bar.dataset.role = "gantt-hscroll-top";
	bar.setAttribute("aria-hidden", "true");
	bar.innerHTML = [
		'<div class="task-tree-gantt-hscroll-top-viewport">',
		'<div class="task-tree-gantt-hscroll-top-content"></div>',
		"</div>",
	].join("");
	return bar;
}

function placeGanttHScroll(ganttEl, bar) {
	if (!bar) {
		return null;
	}
	const header = ganttEl?.querySelector?.(".grid-header");
	if (header) {
		header.after(bar);
		return bar;
	}
	const container = ganttEl?.querySelector?.(".gantt-container");
	if (container) {
		container.prepend(bar);
	}
	return bar;
}

function parkGanttHScroll(ganttEl, bar) {
	const host = parkParent(ganttEl);
	if (!bar || !host) {
		return;
	}
	bar.classList.add("is-idle");
	if (bar.parentElement !== host) {
		host.appendChild(bar);
	}
}

function tableTitleHeaderHeight(tableHost) {
	const row = tableHost?.querySelector?.(
		".ag-header-row:not(.ag-header-row-column-filter)"
	);
	return row?.offsetHeight || HEADER_HEIGHT;
}

/**
 * Toolbar + column-search sit above both panes.
 * Gantt calendar is taller than the table title row — subtract that
 * delta so bars line up with rows (calendar hangs into the toolbar gap).
 */
export function setupToolbarOffsetSync(tableHost, ganttEl, parkedBar) {
	if (!ganttEl) {
		return () => {};
	}
	const toolbar = tableHost?.querySelector?.(".dinext-table-toolbar");
	const bar = findGanttHScroll(ganttEl, parkedBar) || createGanttHScroll();
	const viewport = bar.querySelector(".task-tree-gantt-hscroll-top-viewport");
	const content = bar.querySelector(".task-tree-gantt-hscroll-top-content");
	const ganttVp = ganttViewport(ganttEl);

	let hLock = false;
	const onBarScroll = () => {
		if (hLock || !ganttVp || !viewport || ganttVp.dataset.ganttHProg) {
			return;
		}
		hLock = true;
		ganttVp.scrollLeft = viewport.scrollLeft;
		requestAnimationFrame(() => {
			hLock = false;
		});
	};
	const onGanttHScroll = () => {
		if (hLock || !ganttVp || !viewport) {
			return;
		}
		hLock = true;
		viewport.scrollLeft = ganttVp.scrollLeft;
		requestAnimationFrame(() => {
			hLock = false;
		});
	};

	let headerEl = null;
	let ro;
	const apply = () => {
		const toolbarH = toolbar?.offsetHeight || 0;
		const filterH = filterRowHeight(tableHost);
		const header = ganttEl.querySelector(".grid-header");
		if (ro && header && header !== headerEl) {
			if (headerEl) {
				ro.unobserve(headerEl);
			}
			headerEl = header;
			ro.observe(header);
		}
		const ganttHeaderH = header?.offsetHeight || GANTT_HEADER_HEIGHT;
		const tableHeaderH = tableTitleHeaderHeight(tableHost);
		const headerDelta = Math.max(0, ganttHeaderH - tableHeaderH);
		ganttEl.style.paddingTop = `${GANTT_BASE_TOP_PAD + toolbarH + filterH - headerDelta}px`;

		const scrollH = topHScrollHeight(tableHost);
		ganttEl.style.setProperty("--gantt-top-scroll-h", `${scrollH}px`);
		ganttEl.style.setProperty("--gantt-header-h", `${ganttHeaderH}px`);

		placeGanttHScroll(ganttEl, bar);
		bar.classList.toggle("is-idle", scrollH === 0);
		if (scrollH > 0 && content && ganttVp) {
			content.style.width = `${ganttVp.scrollWidth || 0}px`;
			if (viewport) {
				viewport.scrollLeft = ganttVp.scrollLeft;
			}
		}
	};

	viewport?.addEventListener("scroll", onBarScroll, { passive: true });
	ganttVp?.addEventListener("scroll", onGanttHScroll, { passive: true });

	ro = new ResizeObserver(apply);
	if (toolbar) {
		ro.observe(toolbar);
	}
	const hscroll = tableHost?.querySelector?.(".dinext-table-hscroll-top");
	if (hscroll) {
		ro.observe(hscroll);
	}
	const agHeader = tableHost?.querySelector?.(".ag-header");
	if (agHeader) {
		ro.observe(agHeader);
	}
	if (ganttVp) {
		ro.observe(ganttVp);
	}
	apply();

	const mo = tableHost
		? new MutationObserver(() => {
				requestAnimationFrame(apply);
			})
		: null;
	mo?.observe(tableHost, { attributes: true, attributeFilter: ["class"] });

	function cleanup() {
		ro.disconnect();
		mo?.disconnect();
		viewport?.removeEventListener("scroll", onBarScroll);
		ganttVp?.removeEventListener("scroll", onGanttHScroll);
		ganttEl.style.paddingTop = "";
		ganttEl.style.removeProperty("--gantt-top-scroll-h");
		ganttEl.style.removeProperty("--gantt-header-h");
		parkGanttHScroll(ganttEl, bar);
		ganttEl.querySelector(".task-tree-gantt-hscroll-spacer")?.remove();
	}
	cleanup.apply = apply;
	return cleanup;
}
