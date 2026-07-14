// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import {
	LAYOUT_WIDTH_KEY,
	MIN_LEFT_PCT,
	MIN_RIGHT_PCT,
	DEFAULT_LEFT_PCT,
} from "../constants.js";

function applyPanelWidths(left, right, leftPct) {
	const rightPct = 100 - leftPct;
	left.style.flex = `0 0 ${leftPct}%`;
	right.style.flex = `0 0 ${rightPct}%`;
}

function restoreLayoutWidth(left, right) {
	const stored = localStorage.getItem(LAYOUT_WIDTH_KEY);
	if (!stored) {
		applyPanelWidths(left, right, DEFAULT_LEFT_PCT);
		return;
	}

	const leftPct = parseFloat(stored);
	if (Number.isNaN(leftPct)) {
		applyPanelWidths(left, right, DEFAULT_LEFT_PCT);
		return;
	}

	const rightPct = 100 - leftPct;
	if (leftPct < MIN_LEFT_PCT || rightPct < MIN_RIGHT_PCT) {
		applyPanelWidths(left, right, DEFAULT_LEFT_PCT);
		return;
	}

	applyPanelWidths(left, right, leftPct);
}

/**
 * @returns {{ shell, left, border, right, gantt, tableHost }}
 */
export function buildShell(page) {
	const shell = document.createElement("div");
	shell.className = "task-wbs-shell";

	const left = document.createElement("div");
	left.className = "task-wbs-panel task-wbs-panel--left";

	const tableHost = document.createElement("div");
	tableHost.className = "task-wbs-table-host";
	left.appendChild(tableHost);

	const border = document.createElement("div");
	border.className = "task-wbs-resize-border";
	border.setAttribute("aria-hidden", "true");

	const right = document.createElement("div");
	right.className = "task-wbs-panel task-wbs-panel--right";

	const gantt = document.createElement("div");
	gantt.id = "task-gantt";
	gantt.className = "task-wbs-gantt";
	right.appendChild(gantt);

	shell.appendChild(left);
	shell.appendChild(border);
	shell.appendChild(right);

	page.main.get(0).appendChild(shell);

	restoreLayoutWidth(left, right);

	return { shell, left, border, right, gantt, tableHost };
}

export function setupResize({ shell, left, right, border }) {
	let dragging = false;

	function onMouseDown(e) {
		e.preventDefault();
		dragging = true;
	}

	function onMouseUp() {
		dragging = false;
	}

	function onMouseMove(e) {
		if (!dragging) {
			return;
		}

		const rect = shell.getBoundingClientRect();
		const offset = e.clientX - rect.left;
		const newLeftWidth = (offset / rect.width) * 100;
		const newRightWidth = 100 - newLeftWidth;

		if (newLeftWidth < MIN_LEFT_PCT || newRightWidth < MIN_RIGHT_PCT) {
			return;
		}

		applyPanelWidths(left, right, newLeftWidth);
		localStorage.setItem(LAYOUT_WIDTH_KEY, String(newLeftWidth));
	}

	border.addEventListener("mousedown", onMouseDown);
	document.addEventListener("mouseup", onMouseUp);
	document.addEventListener("mousemove", onMouseMove);

	return function cleanup() {
		border.removeEventListener("mousedown", onMouseDown);
		document.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("mousemove", onMouseMove);
	};
}
