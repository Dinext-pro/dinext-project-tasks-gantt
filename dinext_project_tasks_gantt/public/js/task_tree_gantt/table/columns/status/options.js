/**
 * Tree getStatuses — meta options; confirm + non-owner → drop Completed.
 */
import {
	isAllowedSelectOption,
	resolveSelectOption,
} from "../select-value.js";

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

/** Paste / typed → English key (labels via __). Unmatched kept for validate. */
export function parseStatusValue(params) {
	return resolveSelectOption(params.newValue, getStatusOptions());
}

/** Per-row options (Completed rule) for fill/paste/edit validate. */
export function isValidStatusValue(value, row) {
	return isAllowedSelectOption(value, getStatusOptions(row));
}
