/**
 * Tree getPriorities — Task.priority Select options (English values).
 * Frappe Select translates labels via __(value, null, doctype).
 */
import {
	isAllowedSelectOption,
	resolveSelectOption,
} from "../select-value.js";

export function getPriorityOptions() {
	const field =
		frappe.meta.get_field("Task", "priority") ||
		frappe.meta.get_docfield("Task", "priority");
	const raw = field?.options || "";
	return String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Paste / typed → English key (labels via __). Unmatched kept for validate. */
export function parsePriorityValue(params) {
	return resolveSelectOption(params.newValue, getPriorityOptions());
}

export function isValidPriorityValue(value) {
	return isAllowedSelectOption(value, getPriorityOptions());
}
