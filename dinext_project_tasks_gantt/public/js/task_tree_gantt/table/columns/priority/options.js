/**
 * Tree getPriorities — Task.priority Select options (English values),
 * narrowed per row by `dinext.fieldRules` when a row is given.
 * Frappe Select translates labels via __(value, null, doctype).
 */
import { fieldOptions } from "../../field_status.js";

export function getPriorityOptions(row) {
	const field =
		frappe.meta.get_field("Task", "priority") ||
		frappe.meta.get_docfield("Task", "priority");
	const raw = field?.options || "";
	const options = String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	if (!row) {
		return options;
	}
	return fieldOptions(row, "priority", options);
}

export function isValidPriorityValue(value, row) {
	if (value == null || value === "") {
		return false;
	}
	return getPriorityOptions(row).includes(String(value));
}
