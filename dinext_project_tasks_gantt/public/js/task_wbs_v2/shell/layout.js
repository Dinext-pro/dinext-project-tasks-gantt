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
	shell.className = "task-wbs-v2-shell";
	shell.dataset.role = "shell";

	const left = document.createElement("div");
	left.className = "task-wbs-v2-panel task-wbs-v2-panel--left";

	const tableHost = document.createElement("div");
	tableHost.className = "task-wbs-v2-table-host";
	tableHost.dataset.role = "table";
	left.appendChild(tableHost);

	const border = document.createElement("div");
	border.className = "task-wbs-v2-resize";
	border.setAttribute("role", "separator");
	border.setAttribute("aria-orientation", "vertical");

	const right = document.createElement("div");
	right.className = "task-wbs-v2-panel task-wbs-v2-panel--right";

	const gantt = document.createElement("div");
	gantt.id = "task-gantt";
	gantt.className = "task-wbs-v2-gantt";
	gantt.dataset.role = "gantt";
	right.appendChild(gantt);

	shell.append(left, border, right);
	parent.appendChild(shell);

	applyWidths(left, right, readStoredLeftPct());

	return { shell, left, border, right, tableHost, gantt };
}

export function setupResize({ shell, left, right, border }) {
	let dragging = false;

	const onMouseDown = (e) => {
		e.preventDefault();
		dragging = true;
		document.body.classList.add("task-wbs-v2-resizing");
	};

	const onMouseUp = () => {
		if (!dragging) {
			return;
		}
		dragging = false;
		document.body.classList.remove("task-wbs-v2-resizing");
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
		document.body.classList.remove("task-wbs-v2-resizing");
		border.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("mousemove", onMouseMove);
	};
}
