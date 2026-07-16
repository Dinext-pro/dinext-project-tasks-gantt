export function el(tag, className, text) {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text != null && text !== "") {
		node.textContent = text;
	}
	return node;
}

export function slugClass(value) {
	if (!value) {
		return "";
	}
	return String(value)
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_\-]/g, "");
}

/**
 * Frappe _user_tags: leading comma, then tags.
 * Tree: split(",").slice(1, limit+1).
 */
export function parseTags(raw, limit = null) {
	if (!raw) {
		return [];
	}
	if (Array.isArray(raw)) {
		const tags = raw.map(String).map((s) => s.trim()).filter(Boolean);
		return limit == null ? tags : tags.slice(0, limit);
	}
	const parts = String(raw).split(",");
	const tags = parts
		.slice(1)
		.map((s) => s.trim())
		.filter(Boolean);
	return limit == null ? tags : tags.slice(0, limit);
}

export function formatDate(value) {
	if (!value) {
		return "";
	}
	return frappe.format(value, { fieldtype: "Date" });
}

export function formatPercent(value) {
	if (value == null || value === "") {
		return "";
	}
	const n = Number(value);
	if (Number.isNaN(n)) {
		return "";
	}
	return `${Math.round(n)}%`;
}
