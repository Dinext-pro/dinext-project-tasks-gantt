/**
 * Tree getPriorities — Task.priority Select options (English values).
 * Frappe Select translates labels via __(value, null, doctype).
 */

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
