/** Base gantt top offset (px). Live value set by setupToolbarOffsetSync (overrides CSS). */
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

/**
 * When DinextTable toolbar opens/pins, grid shifts down in-flow.
 * Mirror that offset on gantt (base 3px + toolbar height).
 */
export function setupToolbarOffsetSync(tableHost, ganttEl) {
	const toolbar = tableHost?.querySelector?.(".dinext-table-toolbar");
	if (!toolbar || !ganttEl) {
		return () => {};
	}

	const apply = () => {
		const h = toolbar.offsetHeight || 0;
		ganttEl.style.paddingTop = `${GANTT_BASE_TOP_PAD + h}px`;
	};

	apply();

	const ro = new ResizeObserver(apply);
	ro.observe(toolbar);

	return function cleanup() {
		ro.disconnect();
		ganttEl.style.paddingTop = "";
	};
}
