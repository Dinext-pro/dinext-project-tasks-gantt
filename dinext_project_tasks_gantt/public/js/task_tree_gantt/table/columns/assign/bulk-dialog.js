/**
 * Bulk ToDo assign for rowCheck selection — MultiSelectPills, no PWA.
 */
import { normalizeUsers } from "./persist.js";

function parseDialogUsers(raw) {
	if (Array.isArray(raw)) {
		return normalizeUsers(raw);
	}
	if (raw == null || raw === "") {
		return [];
	}
	// MultiSelectPills often returns comma / newline separated names.
	return normalizeUsers(String(raw).split(/[,\n]/));
}

/**
 * @param {{
 *   rows: object[],
 *   onConfirm: (users: string[]) => void,
 * }} opts
 */
export function openBulkTodoAssignDialog({ rows, onConfirm }) {
	const writable = (rows || []).filter((r) => r?.id && r.can_write);
	if (!writable.length) {
		frappe.show_alert({
			message: __("No writable tasks selected"),
			indicator: "orange",
		});
		return;
	}

	const dialog = new frappe.ui.Dialog({
		title: __("Assign users"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "hint",
				options: `<p class="text-muted small">${__(
					"Add users to {0} selected task(s). Assignments are saved as ToDo only (not workload).",
					[writable.length]
				)}</p>`,
			},
			{
				label: __("Users"),
				fieldname: "users",
				fieldtype: "MultiSelectPills",
				reqd: 1,
				get_data(txt) {
					return frappe.db.get_link_options("User", txt, {
						user_type: "System User",
						enabled: 1,
					});
				},
			},
		],
		primary_action_label: __("Assign"),
		primary_action(values) {
			const users = parseDialogUsers(values?.users);
			if (!users.length) {
				frappe.show_alert({
					message: __("Select at least one user"),
					indicator: "orange",
				});
				return;
			}
			dialog.hide();
			onConfirm?.(users);
		},
	});
	dialog.show();
}
