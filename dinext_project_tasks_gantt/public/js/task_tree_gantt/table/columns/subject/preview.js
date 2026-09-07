/**
 * Hover preview: Task.description (Text Editor) readonly, panel to the RIGHT.
 *
 * Reliability rules:
 * - Never cancel-open without a path to re-open if pointer still on the same task.
 * - Close only after elementFromPoint says pointer left subject + panel.
 * - Do not trust leave event clientX/Y (often 0) — use last pointermove coords.
 * - Empty description: show placeholder; do not permanently block re-open.
 */
const OPEN_MS = 1000;
const CLOSE_MS = 300;

/** @type {Map<string, string>} */
const descriptionCache = new Map();

/** @type {{ destroy: () => void, taskId: string, panel: HTMLElement, wrap: HTMLElement } | null} */
let activePreview = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let openTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let closeTimer = null;
/** @type {number} */
let fetchSeq = 0;

/** Task currently targeted by hover. */
let hoverKey = null;

let lastPointerX = Number.NaN;
let lastPointerY = Number.NaN;
let pointerTracking = false;

function clearOpenTimer() {
	if (openTimer) {
		clearTimeout(openTimer);
		openTimer = null;
	}
}

function clearCloseTimer() {
	if (closeTimer) {
		clearTimeout(closeTimer);
		closeTimer = null;
	}
}

function onPointerMoveTrack(ev) {
	lastPointerX = ev.clientX;
	lastPointerY = ev.clientY;
}

function startPointerTracking() {
	if (pointerTracking) {
		return;
	}
	pointerTracking = true;
	document.addEventListener("pointermove", onPointerMoveTrack, { passive: true });
}

function stopPointerTracking() {
	if (!pointerTracking) {
		return;
	}
	pointerTracking = false;
	document.removeEventListener("pointermove", onPointerMoveTrack);
}

function closeActivePreview() {
	clearOpenTimer();
	clearCloseTimer();
	if (activePreview) {
		activePreview.destroy();
		activePreview = null;
	}
	if (!hoverKey) {
		stopPointerTracking();
	}
}

function getPopoverMountParent() {
	return (
		document.fullscreenElement ||
		document.webkitFullscreenElement ||
		document.mozFullScreenElement ||
		document.msFullscreenElement ||
		document.body
	);
}

function placeNearAnchor(panel, anchorEl) {
	if (!anchorEl?.isConnected) {
		return;
	}
	const rect = anchorEl.getBoundingClientRect();
	const pad = 8;
	const gap = 10;
	const w = panel.offsetWidth || 360;
	const h = panel.offsetHeight || 120;

	let left = rect.right + gap;
	if (left + w > window.innerWidth - pad) {
		left = rect.left - w - gap;
	}
	if (left < pad) {
		left = pad;
	}

	let top = rect.top;
	if (top + h > window.innerHeight - pad) {
		top = Math.max(pad, window.innerHeight - h - pad);
	}
	if (top < pad) {
		top = pad;
	}

	panel.style.left = `${left}px`;
	panel.style.top = `${top}px`;
}

function isEmptyDescription(html) {
	return !strip_html(cstr(html || "")).trim();
}

/**
 * @param {string} html
 * @returns {string}
 */
function formatDescriptionHtml(html) {
	let content = cstr(html || "");
	const tmp = document.createElement("div");
	tmp.innerHTML = content;
	const editor = tmp.querySelector(".ql-editor");
	if (editor) {
		content = editor.innerHTML;
	}
	content = frappe.dom.remove_script_and_style(content);
	return `<div class="tree-gantt-subject-preview__richtext">${content}</div>`;
}

/**
 * @param {unknown} r
 * @returns {string}
 */
function descriptionFromResponse(r) {
	const msg = r?.message !== undefined ? r.message : r;
	if (typeof msg === "string") {
		return msg;
	}
	if (msg && typeof msg === "object") {
		return msg.description ?? "";
	}
	return "";
}

/**
 * @param {string} taskId
 * @returns {Promise<string>}
 */
function fetchDescription(taskId) {
	if (descriptionCache.has(taskId)) {
		return Promise.resolve(descriptionCache.get(taskId) || "");
	}
	return frappe.db
		.get_value("Task", taskId, "description")
		.then((r) => {
			const html = descriptionFromResponse(r);
			descriptionCache.set(taskId, html);
			return html;
		})
		.catch((err) => {
			console.warn("[task_tree_gantt] description fetch failed", taskId, err);
			// Do not cache failures — allow retry on next hover.
			return null;
		});
}

/**
 * @param {string} [taskId]
 */
export function invalidateSubjectDescriptionCache(taskId) {
	if (taskId) {
		descriptionCache.delete(taskId);
	} else {
		descriptionCache.clear();
	}
}

/** Current subject wrap under pointer for taskId (survives AG remount via data-task-id). */
function subjectWrapUnderPointer(taskId) {
	if (!Number.isFinite(lastPointerX) || !Number.isFinite(lastPointerY)) {
		return null;
	}
	const el = document.elementFromPoint(lastPointerX, lastPointerY);
	if (!el) {
		return null;
	}
	if (activePreview?.taskId === taskId && activePreview.panel?.contains?.(el)) {
		return activePreview.wrap || null;
	}
	const subject = el.closest?.(".tree-gantt-subject");
	if (subject?.dataset?.taskId === taskId) {
		return subject;
	}
	return null;
}

function pointerOnTaskOrPanel(taskId) {
	if (!Number.isFinite(lastPointerX) || !Number.isFinite(lastPointerY)) {
		return false;
	}
	const el = document.elementFromPoint(lastPointerX, lastPointerY);
	if (!el) {
		return false;
	}
	if (activePreview?.taskId === taskId && activePreview.panel?.contains?.(el)) {
		return true;
	}
	return el.closest?.(".tree-gantt-subject")?.dataset?.taskId === taskId;
}

/**
 * Schedule open for task. Safe to call repeatedly.
 * @param {string} taskId
 * @param {HTMLElement} wrap
 */
function ensureOpenScheduled(taskId, wrap) {
	clearCloseTimer();
	clearOpenTimer();
	hoverKey = taskId;

	if (activePreview?.taskId === taskId && activePreview.panel?.isConnected) {
		activePreview.wrap = wrap;
		placeNearAnchor(activePreview.panel, wrap);
		return;
	}

	openTimer = setTimeout(() => {
		openTimer = null;
		if (hoverKey !== taskId) {
			return;
		}
		// Wrap may have been remounted — prefer live node under pointer.
		const liveWrap = subjectWrapUnderPointer(taskId) || wrap;
		if (!liveWrap?.isConnected) {
			return;
		}
		openPreview({
			wrap: liveWrap,
			taskId,
		});
	}, OPEN_MS);
}

/**
 * After leave: close only if pointer really left; otherwise keep / re-open.
 * @param {string} taskId
 */
function scheduleCloseCheck(taskId) {
	clearCloseTimer();
	closeTimer = setTimeout(() => {
		closeTimer = null;

		if (pointerOnTaskOrPanel(taskId)) {
			hoverKey = taskId;
			const wrap = subjectWrapUnderPointer(taskId) || activePreview?.wrap;
			if (wrap?.isConnected) {
				// Open was cancelled by spurious leave — restart.
				if (!activePreview || activePreview.taskId !== taskId) {
					ensureOpenScheduled(taskId, wrap);
				}
			}
			return;
		}

		if (hoverKey && hoverKey !== taskId) {
			return;
		}

		if (hoverKey === taskId) {
			hoverKey = null;
		}
		if (activePreview?.taskId === taskId) {
			closeActivePreview();
		} else if (!hoverKey) {
			stopPointerTracking();
		}
	}, CLOSE_MS);
}

/**
 * @param {{
 *   wrap: HTMLElement,
 *   taskId: string,
 * }} opts
 */
function openPreview({ wrap, taskId }) {
	if (!wrap || !taskId || hoverKey !== taskId) {
		return;
	}
	if (wrap.querySelector?.(".tree-gantt-subject-edit")) {
		return;
	}

	if (activePreview?.taskId === taskId && activePreview.panel?.isConnected) {
		activePreview.wrap = wrap;
		placeNearAnchor(activePreview.panel, wrap);
		return;
	}

	if (activePreview) {
		activePreview.destroy();
		activePreview = null;
	}

	startPointerTracking();

	const panel = document.createElement("div");
	panel.className = "tree-gantt-subject-preview";
	panel.setAttribute("role", "dialog");
	panel.dataset.taskId = taskId;

	const body = document.createElement("div");
	body.className = "tree-gantt-subject-preview__body";
	body.innerHTML = `<div class="text-muted tree-gantt-subject-preview__loading">${__(
		"Loading…"
	)}</div>`;
	panel.appendChild(body);

	getPopoverMountParent().appendChild(panel);
	placeNearAnchor(panel, wrap);

	const seq = ++fetchSeq;

	function destroy() {
		document.removeEventListener("pointerdown", onDocDown, true);
		document.removeEventListener("keydown", onKey, true);
		window.removeEventListener("resize", onReposition);
		panel.removeEventListener("pointerenter", onPanelEnter);
		panel.removeEventListener("pointerleave", onPanelLeave);
		panel.remove();
		if (activePreview?.panel === panel) {
			activePreview = null;
		}
	}

	function onDocDown(ev) {
		const t = ev.target;
		if (panel.contains(t)) {
			return;
		}
		const otherId = t?.closest?.(".tree-gantt-subject")?.dataset?.taskId;
		if (otherId === taskId) {
			return;
		}
		hoverKey = otherId || null;
		closeActivePreview();
	}

	function onKey(ev) {
		if (ev.key === "Escape") {
			ev.preventDefault();
			hoverKey = null;
			closeActivePreview();
		}
	}

	function onReposition() {
		const anchor = activePreview?.wrap?.isConnected
			? activePreview.wrap
			: subjectWrapUnderPointer(taskId) || wrap;
		placeNearAnchor(panel, anchor);
	}

	function onPanelEnter() {
		hoverKey = taskId;
		clearCloseTimer();
	}

	function onPanelLeave() {
		scheduleCloseCheck(taskId);
	}

	function renderBody(html) {
		if (html == null) {
			body.innerHTML = `<div class="text-muted">${__("Could not load description")}</div>`;
		} else if (isEmptyDescription(html)) {
			body.innerHTML = `<div class="text-muted tree-gantt-subject-preview__empty">${__(
				"No description"
			)}</div>`;
		} else {
			body.innerHTML = formatDescriptionHtml(html);
		}
		onReposition();
	}

	const cached = descriptionCache.has(taskId) ? descriptionCache.get(taskId) || "" : null;
	if (cached !== null) {
		renderBody(cached);
	} else {
		fetchDescription(taskId).then((html) => {
			if (seq !== fetchSeq || activePreview?.panel !== panel) {
				return;
			}
			renderBody(html);
		});
	}

	document.addEventListener("pointerdown", onDocDown, true);
	document.addEventListener("keydown", onKey, true);
	window.addEventListener("resize", onReposition);
	panel.addEventListener("pointerenter", onPanelEnter);
	panel.addEventListener("pointerleave", onPanelLeave);

	activePreview = { destroy, taskId, panel, wrap };
}

/**
 * @param {HTMLElement} wrap
 * @param {object} row
 */
export function wireSubjectPreview(wrap, row) {
	const taskId = row?.id;
	if (!wrap || !taskId) {
		return;
	}

	bindRouteCacheInvalidation();
	wrap.dataset.taskId = taskId;

	const onWrapEnter = (ev) => {
		if (ev.target?.closest?.(".tree-gantt-subject-toolbar")) {
			return;
		}
		lastPointerX = ev.clientX;
		lastPointerY = ev.clientY;
		startPointerTracking();

		if (activePreview && activePreview.taskId !== taskId) {
			activePreview.destroy();
			activePreview = null;
		}

		ensureOpenScheduled(taskId, wrap);
	};

	const onWrapLeave = (ev) => {
		// Do NOT trust leave coordinates (often 0,0) — pointermove tracker is source of truth.
		void ev;
		scheduleCloseCheck(taskId);
	};

	wrap.addEventListener("pointerenter", onWrapEnter);
	wrap.addEventListener("pointerleave", onWrapLeave);

	wrap.addEventListener(
		"pointerdown",
		(ev) => {
			if (ev.target.closest?.(".tree-gantt-subject-toolbar")) {
				clearOpenTimer();
				if (hoverKey === taskId) {
					hoverKey = null;
				}
				closeActivePreview();
			}
		},
		true
	);
}

export function closeSubjectPreview() {
	hoverKey = null;
	closeActivePreview();
	stopPointerTracking();
}

let routeInvalidateBound = false;

/** Form save + browser back leaves module cache; next hover must refetch. */
function bindRouteCacheInvalidation() {
	if (routeInvalidateBound) return;

	routeInvalidateBound = true;
	window.addEventListener("popstate", () => {
		invalidateSubjectDescriptionCache();
		closeSubjectPreview();
	});
	$(document).on("page-change.treeGanttSubjectPreview", () => {
		invalidateSubjectDescriptionCache();
		closeSubjectPreview();
	});
}
