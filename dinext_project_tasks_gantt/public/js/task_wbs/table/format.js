// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

/** CSS-safe slug for status/priority classes. */
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

export function parseTags(raw) {
	if (!raw) {
		return [];
	}
	if (Array.isArray(raw)) {
		return raw.map(String).map((s) => s.trim()).filter(Boolean);
	}
	return String(raw)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
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
