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
