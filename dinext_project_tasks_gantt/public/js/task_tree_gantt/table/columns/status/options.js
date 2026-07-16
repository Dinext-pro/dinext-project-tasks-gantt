/**
 * Tree getStatuses — meta options; confirm + non-owner → drop Completed.
 */

export function getStatusOptions(row) {
	const field = frappe.meta.get_field("Task", "status") || frappe.meta.get_docfield("Task", "status");
	const raw = field?.options || "";
	const options = String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);

	if (!row) {
		return options;
	}

	const confirm = row.confirm === 1 || row.confirm === true;
	if (confirm && row.owner && row.owner !== frappe.session.user) {
		const idx = options.indexOf("Completed");
		if (idx > -1) {
			options.splice(idx, 1);
		}
	}

	return options;
}
