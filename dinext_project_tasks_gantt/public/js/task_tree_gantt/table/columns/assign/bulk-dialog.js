/**
 * Bulk assign for rowCheck selection — MultiSelectPills, project team filter.
 * Persist creates PWA (silent defaults) + ToDo; no PWA dialog.
 */
import { fetchProjectTeamUsers, normalizeUsers } from "./persist.js";
import { getColumnsPage } from "../context.js";

function parseDialogUsers(raw) {
	if (Array.isArray(raw)) {
		return normalizeUsers(raw);
	}
	if (raw == null || raw === "") {
		return [];
	}
	return normalizeUsers(String(raw).split(/[,\n]/));
}

function projectFromPage() {
	const page = getColumnsPage();
	return page?.fields_dict?.project?.get_value?.() || null;
}

/**
 * @param {{
 *   rows: object[],
 *   project?: string | null,
 *   onConfirm: (users: string[]) => void,
 * }} opts
 */
export async function openBulkAssignDialog({ rows, project, onConfirm }) {
	const writable = (rows || []).filter((r) => r?.id && r.can_write);
	if (!writable.length) {
		frappe.show_alert({
			message: __("No writable tasks selected"),
			indicator: "orange",
		});
		return;
	}

	const projectName = project || projectFromPage();
	if (!projectName) {
		frappe.show_alert({
			message: __("Select a project"),
			indicator: "orange",
		});
		return;
	}

	let teamUsers = [];
	try {
		teamUsers = normalizeUsers(await fetchProjectTeamUsers(projectName));
	} catch (e) {
		frappe.show_alert({
			message: e.message || __("Failed to load project team"),
			indicator: "red",
		});
		return;
	}

	if (!teamUsers.length) {
		frappe.show_alert({
			message: __("No users in the project team"),
			indicator: "orange",
		});
		return;
	}

	const teamSet = new Set(teamUsers);

	const dialog = new frappe.ui.Dialog({
		title: __("Assign users"),
		fields: [
			{
				fieldtype: "HTML",
				fieldname: "hint",
				options: `<p class="text-muted small">${__(
					"Add users to {0} selected task(s). Creates workload (PWA) with default dates and first project role; no assignment dialog.",
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
						name: ["in", teamUsers],
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
			const outside = users.filter((u) => !teamSet.has(u));
			if (outside.length) {
				frappe.show_alert({
					message: __("User {0} is not in the project team", [
						frappe.user?.full_name?.(outside[0]) || outside[0],
					]),
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

/** @deprecated alias */
export const openBulkTodoAssignDialog = openBulkAssignDialog;
