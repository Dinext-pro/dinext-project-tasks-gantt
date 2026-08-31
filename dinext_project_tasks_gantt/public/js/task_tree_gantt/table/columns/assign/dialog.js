/**
 * Assign via Project Workload Assignment dialog (product path).
 * No AssignmentDialog fallback — PWA is required on this site.
 */
import { fieldCanEdit } from "../../save.js";

/**
 * @param {{
 *   row: object,
 *   project?: string | null,
 *   onSaved?: (users: string[]) => void,
 * }} opts
 */
export function openAssignDialog({ row, project = null, onSaved }) {
	if (!fieldCanEdit(row, "assign")) {
		return;
	}
	if (typeof start_pwa_dialog !== "function") {
		frappe.msgprint(__("Workload assignment function is unavailable"));
		return;
	}

	const task = {
		name: row.id,
		project: project || undefined,
		subject: row.subject || undefined,
		exp_start_date: row.exp_start_date || undefined,
		exp_end_date: row.exp_end_date || undefined,
	};

	start_pwa_dialog((pwas) => {
		const users = (pwas || [])
			.filter((pwa) => pwa && !pwa.__isRemove && pwa.user)
			.map((pwa) => pwa.user);
		onSaved?.(users);
	}, task);
}
