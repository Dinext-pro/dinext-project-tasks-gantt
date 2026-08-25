/**
 * Post-process frappe-gantt SVG arrows by Task Relation.type.
 * Library always draws pred-center → succ-left. We rewrite `d` after refresh/drag.
 * Does not patch frappe-gantt.umd.js.
 */
import { shortRelationType } from "../table/columns/relations/options.js";

const STUB = 10;
const NS = "http://www.w3.org/2000/svg";
const MK_START = "tree-gantt-mk-start";
const MK_END = "tree-gantt-mk-end";
const MK_START_REL = "tree-gantt-mk-start-rel";
const MK_END_REL = "tree-gantt-mk-end-rel";
const HIT_CLASS = "tree-gantt-arrow-hit";
const HOVER_CLASS = "tree-gantt-arrow--hover";

function n(v) {
	return Math.round(Number(v) * 10) / 10;
}

function d(...parts) {
	return parts.join(" ").replace(/\s+/g, " ").trim();
}

function midY(box) {
	return box.y + box.h / 2;
}

function sameRow(a, b) {
	return Math.abs(midY(a) - midY(b)) < 2;
}

function loopY(from, to) {
	return Math.max(from.y + from.h, to.y + to.h) + STUB;
}

/** FS: pred right → succ left. No right-then-back-left hook. */
function pathFS(from, to) {
	const x1 = from.x + from.w;
	const y1 = midY(from);
	const x2 = to.x;
	const y2 = midY(to);
	const goLeft = x2 < x1 + STUB;
	if (sameRow(from, to)) {
		if (!goLeft) {
			return d("M", n(x1), n(y1), "H", n(x2));
		}
		const ly = loopY(from, to);
		return d(
			"M",
			n(x1),
			n(y1),
			"V",
			n(ly),
			"H",
			n(x2 - STUB),
			"V",
			n(y2),
			"H",
			n(x2)
		);
	}
	if (!goLeft) {
		const sx = x1 + STUB;
		return d("M", n(x1), n(y1), "H", n(sx), "V", n(y2), "H", n(x2));
	}
	return d("M", n(x1), n(y1), "V", n(y2), "H", n(x2));
}

/** SS: pred left → succ left. */
function pathSS(from, to) {
	const x1 = from.x;
	const y1 = midY(from);
	const x2 = to.x;
	const y2 = midY(to);
	const left = Math.min(x1, x2) - STUB;
	if (sameRow(from, to)) {
		const ly = loopY(from, to);
		return d(
			"M",
			n(x1),
			n(y1),
			"H",
			n(left),
			"V",
			n(ly),
			"H",
			n(x2 - STUB),
			"V",
			n(y2),
			"H",
			n(x2)
		);
	}
	return d("M", n(x1), n(y1), "H", n(left), "V", n(y2), "H", n(x2));
}

/** FF: pred right → succ right. */
function pathFF(from, to) {
	const x1 = from.x + from.w;
	const y1 = midY(from);
	const x2 = to.x + to.w;
	const y2 = midY(to);
	const right = Math.max(x1, x2) + STUB;
	if (sameRow(from, to)) {
		const ly = loopY(from, to);
		return d(
			"M",
			n(x1),
			n(y1),
			"H",
			n(right),
			"V",
			n(ly),
			"H",
			n(x2 + STUB),
			"V",
			n(y2),
			"H",
			n(x2)
		);
	}
	return d("M", n(x1), n(y1), "H", n(right), "V", n(y2), "H", n(x2));
}

/** SF: pred left → succ right. */
function pathSF(from, to) {
	const x1 = from.x;
	const y1 = midY(from);
	const x2 = to.x + to.w;
	const y2 = midY(to);
	const sx = x1 - STUB;
	const ex = x2 + STUB;
	if (sameRow(from, to)) {
		const ly = loopY(from, to);
		return d(
			"M",
			n(x1),
			n(y1),
			"H",
			n(sx),
			"V",
			n(ly),
			"H",
			n(ex),
			"V",
			n(y2),
			"H",
			n(x2)
		);
	}
	return d(
		"M",
		n(x1),
		n(y1),
		"H",
		n(sx),
		"V",
		n(y2),
		"H",
		n(ex),
		"H",
		n(x2)
	);
}

const PATH_BY_TYPE = {
	FS: pathFS,
	SS: pathSS,
	FF: pathFF,
	SF: pathSF,
};

export function relationPath(fromBox, toBox, type) {
	const fn = PATH_BY_TYPE[type] || pathFS;
	return fn(fromBox, toBox);
}

function svgEl(name, attrs) {
	const el = document.createElementNS(NS, name);
	for (const [key, value] of Object.entries(attrs || {})) {
		el.setAttribute(key, value);
	}
	return el;
}

const MARKER_VER = "2";

function makeStartMarker(id, fill) {
	const marker = svgEl("marker", {
		id,
		markerWidth: "12",
		markerHeight: "12",
		refX: "6",
		refY: "6",
		orient: "auto",
		markerUnits: "userSpaceOnUse",
		overflow: "visible",
	});
	marker.appendChild(
		svgEl("circle", {
			cx: "6",
			cy: "6",
			r: "3.6",
			fill,
			stroke: "none",
		})
	);
	return marker;
}

function makeEndMarker(id, fill) {
	const marker = svgEl("marker", {
		id,
		markerWidth: "14",
		markerHeight: "12",
		refX: "13",
		refY: "6",
		orient: "auto",
		markerUnits: "userSpaceOnUse",
		overflow: "visible",
	});
	marker.appendChild(
		svgEl("path", {
			d: "M 0 1 L 14 6 L 0 11 Z",
			fill,
			stroke: "none",
		})
	);
	return marker;
}

function ensureArrowMarkers(ganttEl) {
	const svg = ganttEl?.querySelector?.("svg");
	if (!svg) {
		return;
	}
	let defs = svg.querySelector("defs.tree-gantt-arrow-defs");
	if (defs?.getAttribute("data-ver") === MARKER_VER) {
		return;
	}
	defs?.remove();
	defs = svgEl("defs", {
		class: "tree-gantt-arrow-defs",
		"data-ver": MARKER_VER,
	});
	const muted = "#a4a4a4";
	const related = "#39ff14";
	defs.appendChild(makeStartMarker(MK_START, muted));
	defs.appendChild(makeEndMarker(MK_END, muted));
	defs.appendChild(makeStartMarker(MK_START_REL, related));
	defs.appendChild(makeEndMarker(MK_END_REL, related));
	svg.insertBefore(defs, svg.firstChild);
}

function raiseArrowLayer(ganttEl) {
	const svg =
		ganttEl?.querySelector?.("svg.gantt") || ganttEl?.querySelector?.("svg");
	const layer = svg?.querySelector?.(":scope > g.arrow");
	if (svg && layer && svg.lastElementChild !== layer) {
		svg.appendChild(layer);
	}
}

function syncHitPath(path) {
	const group = path.parentNode;
	if (!group) {
		return;
	}
	let hit = group.querySelector(`:scope > path.${HIT_CLASS}`);
	if (!hit) {
		hit = svgEl("path", { class: HIT_CLASS });
		group.insertBefore(hit, path);
	}
	const next = path.getAttribute("d") || "";
	if (hit.getAttribute("d") !== next) {
		hit.setAttribute("d", next);
	}
}

function barBox(ganttEl, taskId) {
	if (!ganttEl || !taskId) {
		return null;
	}
	const esc =
		typeof CSS !== "undefined" && CSS.escape
			? CSS.escape(String(taskId))
			: String(taskId).replace(/"/g, '\\"');
	const wrap = ganttEl.querySelector(`.bar-wrapper[data-id="${esc}"]`);
	const bar = wrap?.querySelector?.("rect.bar");
	if (!bar) {
		return null;
	}
	const x = Number(bar.getAttribute("x"));
	const y = Number(bar.getAttribute("y"));
	const w = Number(bar.getAttribute("width"));
	const h = Number(bar.getAttribute("height"));
	if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
		return null;
	}
	return { x, y, w, h };
}

function relationTypeMap(table) {
	const map = new Map();
	table?.api?.forEachNode?.((node) => {
		const row = node?.data;
		if (!row?.id || !Array.isArray(row.relations)) {
			return;
		}
		for (const rel of row.relations) {
			if (!rel?.predecessor) {
				continue;
			}
			const key = `${rel.predecessor}\0${row.id}`;
			if (!map.has(key)) {
				map.set(key, shortRelationType(rel.type));
			}
		}
	});
	return map;
}

function isArrowPathNode(el) {
	return (
		el?.nodeType === 1 &&
		el.getAttribute?.("data-from") &&
		el.getAttribute?.("data-to") &&
		!el.classList?.contains?.(HIT_CLASS)
	);
}

function mutationTouchesArrows(mutations) {
	for (const m of mutations) {
		if (m.type === "attributes" && m.attributeName === "d") {
			if (isArrowPathNode(m.target)) {
				return true;
			}
			continue;
		}
		if (m.type !== "childList") {
			continue;
		}
		for (const node of m.addedNodes) {
			if (node?.nodeType !== 1) {
				continue;
			}
			if (node.classList?.contains?.(HIT_CLASS)) {
				continue;
			}
			if (node.classList?.contains?.("tree-gantt-arrow-defs")) {
				continue;
			}
			if (
				isArrowPathNode(node) ||
				node.matches?.("svg.gantt, g.arrow") ||
				node.querySelector?.("path[data-from][data-to]")
			) {
				return true;
			}
		}
	}
	return false;
}

export function applyRelationArrowGeometry(ganttEl, table) {
	if (!ganttEl) {
		return;
	}
	ganttEl._arrowGeomApplying = true;
	try {
		ensureArrowMarkers(ganttEl);
		const types = relationTypeMap(table);
		ganttEl.querySelectorAll("path[data-from][data-to]").forEach((path) => {
			const fromId = path.getAttribute("data-from");
			const toId = path.getAttribute("data-to");
			if (!fromId || !toId) {
				return;
			}
			const from = barBox(ganttEl, fromId);
			const to = barBox(ganttEl, toId);
			if (!from || !to) {
				return;
			}
			const type = types.get(`${fromId}\0${toId}`) || "FS";
			const next = relationPath(from, to, type);
			if (path.getAttribute("data-rel-type") !== type) {
				path.setAttribute("data-rel-type", type);
			}
			if (path.getAttribute("d") !== next) {
				path.setAttribute("d", next);
			}
			syncHitPath(path);
		});
		raiseArrowLayer(ganttEl);
	} finally {
		queueMicrotask(() => {
			ganttEl._arrowGeomApplying = false;
		});
	}
}

export function watchRelationArrowGeometry(ganttEl, apply) {
	if (!ganttEl || typeof MutationObserver === "undefined") {
		return () => {};
	}
	let raf = 0;
	const obs = new MutationObserver((mutations) => {
		if (ganttEl._arrowGeomApplying || raf) {
			return;
		}
		if (!mutationTouchesArrows(mutations)) {
			return;
		}
		raf = requestAnimationFrame(() => {
			raf = 0;
			apply();
		});
	});
	obs.observe(ganttEl, {
		attributes: true,
		attributeFilter: ["d"],
		childList: true,
		subtree: true,
	});
	return () => {
		obs.disconnect();
		if (raf) {
			cancelAnimationFrame(raf);
			raf = 0;
		}
	};
}

function visualArrowPath(target) {
	if (!target) {
		return null;
	}
	const direct = target.closest?.("path[data-from][data-to]");
	if (direct) {
		return direct;
	}
	const hit = target.classList?.contains?.(HIT_CLASS)
		? target
		: target.closest?.(`path.${HIT_CLASS}`);
	if (!hit) {
		return null;
	}
	const next = hit.nextElementSibling;
	if (next?.getAttribute?.("data-from")) {
		return next;
	}
	const prev = hit.previousElementSibling;
	if (prev?.getAttribute?.("data-from")) {
		return prev;
	}
	return null;
}

function raiseArrowPath(path) {
	const parent = path?.parentNode;
	if (!parent) {
		return;
	}
	const hit = path.previousElementSibling;
	if (hit?.classList?.contains?.(HIT_CLASS)) {
		parent.appendChild(hit);
	}
	parent.appendChild(path);
}

function clearArrowHover(ganttEl) {
	ganttEl
		?.querySelectorAll?.(`path.${HOVER_CLASS}`)
		.forEach((el) => el.classList.remove(HOVER_CLASS));
}

function bindArrowHover(ganttEl) {
	if (!ganttEl) {
		return () => {};
	}
	let current = null;

	function setHover(path) {
		if (current === path) {
			return;
		}
		clearArrowHover(ganttEl);
		current = path || null;
		if (!path) {
			return;
		}
		path.classList.add(HOVER_CLASS);
		raiseArrowPath(path);
	}

	function onOver(e) {
		const path = visualArrowPath(e.target);
		if (!path || !ganttEl.contains(path)) {
			return;
		}
		setHover(path);
	}

	function onOut(e) {
		const path = visualArrowPath(e.target) || current;
		if (!path || current !== path) {
			return;
		}
		const next = visualArrowPath(e.relatedTarget);
		if (next === path) {
			return;
		}
		if (e.relatedTarget && path.parentNode?.contains?.(e.relatedTarget)) {
			const relatedPath = visualArrowPath(e.relatedTarget);
			if (relatedPath === path) {
				return;
			}
		}
		setHover(null);
	}

	ganttEl.addEventListener("mouseover", onOver);
	ganttEl.addEventListener("mouseout", onOut);
	return () => {
		ganttEl.removeEventListener("mouseover", onOver);
		ganttEl.removeEventListener("mouseout", onOut);
		clearArrowHover(ganttEl);
		current = null;
	};
}

export function bindRelationArrowGeometry(ganttEl, apply) {
	apply();
	const unwatch = watchRelationArrowGeometry(ganttEl, apply);
	const unhover = bindArrowHover(ganttEl);
	return () => {
		unwatch();
		unhover();
	};
}
