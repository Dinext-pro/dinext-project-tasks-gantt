import {
	LAYOUT_WIDTH_KEY,
	MIN_LEFT_PCT,
	MIN_RIGHT_PCT,
	DEFAULT_LEFT_PCT,
} from "../constants.js";

function applyWidths(left, right, leftPct) {
	left.style.width = `${leftPct}%`;
	right.style.width = `${100 - leftPct}%`;
}

function readStoredLeftPct() {
	const raw = localStorage.getItem(LAYOUT_WIDTH_KEY);
	if (!raw) {
		return DEFAULT_LEFT_PCT;
	}
	const leftPct = parseFloat(raw);
	if (Number.isNaN(leftPct)) {
		return DEFAULT_LEFT_PCT;
	}
	const rightPct = 100 - leftPct;
	if (leftPct < MIN_LEFT_PCT || rightPct < MIN_RIGHT_PCT) {
		return DEFAULT_LEFT_PCT;
	}
	return leftPct;
}

export function buildShell(parent) {
	const shell = document.createElement("div");
	shell.className = "task-tree-gantt-shell";
	shell.dataset.role = "shell";

	const left = document.createElement("div");
	left.className = "task-tree-gantt-panel task-tree-gantt-panel--left";

	const tableHost = document.createElement("div");
	tableHost.className = "task-tree-gantt-table-host";
	tableHost.dataset.role = "table";
	left.appendChild(tableHost);

	const border = document.createElement("div");
	border.className = "task-tree-gantt-resize";
	border.setAttribute("role", "separator");
	border.setAttribute("aria-orientation", "vertical");

	const right = document.createElement("div");
	right.className = "task-tree-gantt-panel task-tree-gantt-panel--right";

	const gantt = document.createElement("div");
	gantt.id = "task-gantt";
	gantt.className = "task-tree-gantt-chart";
	gantt.dataset.role = "gantt";

	/* Parked on the panel; sync.js moves it after .grid-header so stacks match. */
	const ganttHScroll = document.createElement("div");
	ganttHScroll.className = "task-tree-gantt-hscroll-top is-idle";
	ganttHScroll.dataset.role = "gantt-hscroll-top";
	ganttHScroll.setAttribute("aria-hidden", "true");
	ganttHScroll.innerHTML = [
		'<div class="task-tree-gantt-hscroll-top-viewport">',
		'<div class="task-tree-gantt-hscroll-top-content"></div>',
		"</div>",
	].join("");

	right.append(gantt, ganttHScroll);

	shell.append(left, border, right);
	parent.appendChild(shell);

	applyWidths(left, right, readStoredLeftPct());

	return { shell, left, border, right, tableHost, gantt, ganttHScroll };
}

export function setupResize({ shell, left, right, border }) {
	let dragging = false;

	const onMouseDown = (e) => {
		e.preventDefault();
		dragging = true;
		document.body.classList.add("task-tree-gantt-resizing");
	};

	const onMouseUp = () => {
		if (!dragging) {
			return;
		}
		dragging = false;
		document.body.classList.remove("task-tree-gantt-resizing");
	};

	const onMouseMove = (e) => {
		if (!dragging) {
			return;
		}
		const rect = shell.getBoundingClientRect();
		const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
		const rightPct = 100 - leftPct;
		if (leftPct < MIN_LEFT_PCT || rightPct < MIN_RIGHT_PCT) {
			return;
		}
		applyWidths(left, right, leftPct);
		localStorage.setItem(LAYOUT_WIDTH_KEY, String(leftPct));
	};

	border.addEventListener("mousedown", onMouseDown);
	document.addEventListener("mouseup", onMouseUp);
	document.addEventListener("mousemove", onMouseMove);

	return () => {
		dragging = false;
		document.body.classList.remove("task-tree-gantt-resizing");
		border.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("mousemove", onMouseMove);
	};
}
