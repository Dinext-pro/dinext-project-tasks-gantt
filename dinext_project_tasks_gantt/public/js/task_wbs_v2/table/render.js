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

export function renderSubject(params) {
	const row = params.data;
	const wrap = el("span", "twb-v2-subject");
	if (row?.is_milestone) {
		const mark = el("span", "twb-v2-milestone", "◆");
		mark.title = __("Milestone");
		wrap.appendChild(mark);
	}
	wrap.appendChild(el("span", "twb-v2-subject-text", row?.subject || params.value || ""));
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
	const wrap = el("div", "twb-v2-assign");
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
	const wrap = el("div", "twb-v2-progress");
	wrap.title = formatPercent(value);
	const bar = el("div", "twb-v2-progress-bar");
	bar.style.width = `${Math.max(0, Math.min(100, Math.round(value)))}%`;
	wrap.appendChild(bar);
	return wrap;
}

export function renderTags(params) {
	const tags = parseTags(params.value).slice(0, 3);
	if (!tags.length) {
		return el("span", "text-muted", "");
	}
	const wrap = el("div", "twb-v2-tags");
	for (const tag of tags) {
		const pill = el("span", "twb-v2-tag-pill ellipsis", tag);
		pill.title = tag;
		try {
			const palette = frappe.get_palette?.(tag);
			if (palette) {
				pill.style.backgroundColor = `var(${palette[0]})`;
				pill.style.color = `var(${palette[1]})`;
			}
		} catch (e) {
			/* optional */
		}
		wrap.appendChild(pill);
	}
	return wrap;
}

export function statusCellClass(params) {
	const slug = slugClass(params.value);
	return slug ? `twb-v2-status twb-v2-status--${slug}` : "twb-v2-status";
}

export function priorityCellClass(params) {
	const slug = slugClass(params.value);
	return slug ? `twb-v2-priority twb-v2-priority--${slug}` : "twb-v2-priority";
}

export function dateValueFormatter(params) {
	return formatDate(params.value);
}
