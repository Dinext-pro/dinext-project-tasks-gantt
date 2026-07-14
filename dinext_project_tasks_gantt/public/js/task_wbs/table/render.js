// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { formatDate, formatPercent, parseTags, slugClass } from "./format.js";

function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text != null && text !== "") {
		node.textContent = text;
	}
	return node;
}

/** Tree col subject: milestone mark + text. */
export function renderSubject(params) {
	const row = params.data;
	const wrap = el("span", "task-wbs-subject");
	if (row?.is_milestone) {
		const mark = el("span", "task-wbs-milestone", "◆");
		mark.title = __("Milestone");
		wrap.appendChild(mark);
	}
	wrap.appendChild(el("span", "task-wbs-subject-text", row?.subject || params.value || ""));
	if (row?.dep_conflict) {
		wrap.classList.add("task-wbs-dep-conflict");
		wrap.title = row.dep_conflict_start || row.dep_conflict_end || __("Dependency conflict");
	}
	if (row?.color) {
		wrap.style.boxShadow = `inset 3px 0 0 ${row.color}`;
		wrap.style.paddingLeft = "6px";
	}
	return wrap;
}

export function renderAssign(params) {
	const users = Array.isArray(params.value) ? params.value : [];
	if (!users.length) {
		return el("span", "text-muted", "—");
	}
	const wrap = el("div", "task-wbs-assign");
	try {
		const group = frappe.avatar_group(users, 3, { filterable: false });
		const node = Array.isArray(group) ? group[0] : group;
		if (node?.outerHTML != null) {
			wrap.innerHTML = node.outerHTML;
		} else if (node instanceof HTMLElement) {
			wrap.appendChild(node);
		} else {
			wrap.textContent = users.join(", ");
		}
	} catch (e) {
		wrap.textContent = users.join(", ");
	}
	return wrap;
}

export function renderProgress(params) {
	const value = Number(params.value) || 0;
	const wrap = el("div", "task-wbs-progress");
	wrap.title = formatPercent(value);
	const bar = el("div", "task-wbs-progress-bar");
	bar.style.width = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
	wrap.appendChild(bar);
	return wrap;
}

export function renderTags(params) {
	const tags = parseTags(params.value).slice(0, 3);
	if (!tags.length) {
		return el("span", "text-muted", "");
	}
	const wrap = el("div", "task-wbs-tags");
	for (const tag of tags) {
		const pill = el("span", "task-wbs-tag-pill ellipsis", tag);
		pill.title = tag;
		try {
			const palette = frappe.get_palette?.(tag);
			if (palette) {
				pill.style.backgroundColor = `var(${palette[0]})`;
				pill.style.color = `var(${palette[1]})`;
			}
		} catch (e) {
			/* palette optional */
		}
		wrap.appendChild(pill);
	}
	return wrap;
}

export function renderInclude(params) {
	const input = document.createElement("input");
	input.type = "checkbox";
	input.checked = !!params.value;
	input.disabled = true;
	input.className = "task-wbs-include";
	input.setAttribute("aria-label", __("ТШ"));
	return input;
}

export function statusCellClass(params) {
	const slug = slugClass(params.value);
	return slug ? `task-wbs-status task-wbs-status--${slug}` : "task-wbs-status";
}

export function priorityCellClass(params) {
	const slug = slugClass(params.value);
	return slug ? `task-wbs-priority task-wbs-priority--${slug}` : "task-wbs-priority";
}

export function dateValueFormatter(params) {
	return formatDate(params.value);
}
