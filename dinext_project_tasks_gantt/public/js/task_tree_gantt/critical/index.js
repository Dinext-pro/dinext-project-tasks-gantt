/**
 * Critical-path toggle and paint cache.
 * The path is fetched only while the toolbar checkbox is on.
 */
import { getCriticalPath } from "../api.js";

const STORAGE_SUFFIX = ":tree:critical-path";

export const CRITICAL_ROW_CLASS = "tree-gantt-row--critical";
export const CRITICAL_BAR_CLASS = "tree-gantt-bar--critical";
export const CRITICAL_ARROW_CLASS = "tree-gantt-arrow--critical";

const ICON_SVG =
	'<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">' +
	'<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
	'<rect x="1" y="4" width="5" height="3" rx="0.6"/>' +
	'<rect x="10" y="9" width="5" height="3" rx="0.6"/>' +
	'<path d="M6 5.5h2.2a2 2 0 0 1 2 2V9"/>' +
	"</g></svg>";

let cache = emptyCache();
let requestGen = 0;
let painter = () => {};

function emptyCache() {
	return {
		project: "",
		valid: false,
		tasks: new Set(),
		edges: new Set(),
	};
}

function storageKey() {
	const user = frappe.user?.name || "";
	return `${user}${STORAGE_SUFFIX}`;
}

function readFlag() {
	try {
		return localStorage.getItem(storageKey()) === "1";
	} catch {
		return false;
	}
}

function writeFlag(on) {
	try {
		localStorage.setItem(storageKey(), on ? "1" : "0");
	} catch {
		/* quota / private mode */
	}
}

export function isCriticalPathVisible() {
	return readFlag();
}

export function isTaskCritical(taskId) {
	if (!taskId || !cache.valid || !isCriticalPathVisible()) {
		return false;
	}
	return cache.tasks.has(String(taskId));
}

export function isCriticalEdge(fromId, toId) {
	if (!fromId || !toId || !cache.valid || !isCriticalPathVisible()) {
		return false;
	}
	return cache.edges.has(`${fromId}\0${toId}`);
}

export function setCriticalPathPainter(fn) {
	painter = typeof fn === "function" ? fn : () => {};
}

function notify() {
	painter();
}

function applyPayload(project, message) {
	const tasks = new Set((message?.tasks || []).map(String));
	const edges = new Set(
		(message?.edges || [])
			.filter((edge) => edge?.from && edge?.to)
			.map((edge) => `${edge.from}\0${edge.to}`)
	);
	cache = { project: project || "", valid: true, tasks, edges };
}

export async function reloadCriticalPath(project) {
	if (!isCriticalPathVisible() || !project) {
		cache = emptyCache();
		notify();
		return;
	}
	const gen = ++requestGen;
	try {
		const message = await getCriticalPath(project);
		if (gen !== requestGen || !isCriticalPathVisible()) {
			return;
		}
		applyPayload(project, message);
		notify();
	} catch (e) {
		if (gen !== requestGen) {
			return;
		}
		console.warn("[task_tree_gantt] critical path", e);
		cache = emptyCache();
		notify();
	}
}

/** Drop a cached path. Refetch only while the checkbox is on. */
export function invalidateCriticalPath(project) {
	const wasValid = cache.valid;
	cache = emptyCache();
	if (!isCriticalPathVisible()) {
		if (wasValid) {
			notify();
		}
		return Promise.resolve();
	}
	return reloadCriticalPath(project);
}

function paintToggle(host, getProject) {
	const title = __("Show critical path");
	const wrap = document.createElement("label");
	wrap.className = "dinext-table-toolbar-item dinext-table-toolbar-item--checkbox";
	wrap.title = title;

	const input = document.createElement("input");
	input.type = "checkbox";
	input.id = "tree-gantt-critical-path";
	input.className = "dinext-table-toolbar-checkbox-input";
	input.checked = isCriticalPathVisible();
	input.setAttribute("aria-label", title);

	const icon = document.createElement("span");
	icon.className = "tree-gantt-critical-toggle-icon";
	icon.innerHTML = ICON_SVG;

	input.addEventListener("click", (event) => {
		event.stopPropagation();
	});
	input.addEventListener("change", (event) => {
		event.stopPropagation();
		writeFlag(input.checked);
		void reloadCriticalPath(input.checked ? getProject?.() : null);
	});

	wrap.appendChild(input);
	wrap.appendChild(icon);
	host.replaceChildren(wrap);
}

/** Toolbar item: checkbox + icon, no text label. */
export function criticalPathToolbarItem({ getProject }) {
	return {
		type: "custom",
		id: "tree-gantt-critical-path",
		render({ host }) {
			paintToggle(host, getProject);
		},
	};
}
