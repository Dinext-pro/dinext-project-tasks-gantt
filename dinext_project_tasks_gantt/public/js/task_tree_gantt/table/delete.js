/**
 * Toolbar bulk delete for Task tree тАФ uses core rowCheck delete + server hooks.
 * ERPNext Task.on_trash blocks parents with children; delete deepest-first.
 */
import { getOnTreeMutate } from "./columns/context.js";

function canDeleteTask(row) {
	if (!row?.id) {
		return false;
	}
	if (!frappe.model.can_delete("Task")) {
		return false;
	}
	if (!frappe.perm.has_perm("Task", 0, "delete", row.id)) {
		return false;
	}
	return true;
}

function depthByParentChain(row, byId) {
	let depth = 0;
	let pid = row.parent_task;
	const seen = new Set();
	while (pid && !seen.has(pid)) {
		seen.add(pid);
		depth += 1;
		pid = byId.get(pid)?.parent_task || null;
	}
	return depth;
}

function sortDeepestFirst(rows) {
	const byId = new Map((rows || []).map((r) => [r.id, r]));
	return [...(rows || [])].sort(
		(a, b) => depthByParentChain(b, byId) - depthByParentChain(a, byId)
	);
}

function confirmDelete(rows) {
	return new Promise((resolve) => {
		const n = rows.length;
		const message =
			n === 1
				? __("Permanently delete {0}?", [
						String(rows[0].subject || rows[0].id).bold(),
					])
				: __("Permanently delete {0} tasks?", [String(n)]);
		frappe.confirm(
			message,
			() => resolve(true),
			() => resolve(false)
		);
	});
}

/** Runs before optimistic UI remove тАФ confirm + permission gate. */
export function createOnBeforeDeleteRows() {
	return async ({ rows }) => {
		if (!rows?.length) {
			return false;
		}
		const blocked = rows.filter((r) => !canDeleteTask(r));
		if (blocked.length) {
			frappe.msgprint(__("Not permitted to delete selected task(s)"));
			return false;
		}
		return confirmDelete(rows);
	};
}

/**
 * Persist after optimistic remove. `false` тЖТ core reverts rows.
 * Hooks: Task.on_trash / after_delete (progress, virtual_task Issue mirror).
 */
export function createOnDeleteRows() {
	return async ({ rows }) => {
		const ordered = sortDeepestFirst(rows);
		frappe.dom.freeze(__("Deleting…"));
		try {
			for (const row of ordered) {
				await frappe.xcall("frappe.client.delete", {
					doctype: "Task",
					name: row.id,
				});
			}
			frappe.utils.play_sound("delete");
			getOnTreeMutate()?.({
				removeIds: ordered.map((row) => row.id).filter(Boolean),
			});
			return true;
		} catch (e) {
			console.error("[task_tree_gantt] delete tasks", e);
			frappe.msgprint({
				title: __("Delete failed"),
				indicator: "red",
				message:
					e?.message ||
					e?.exc ||
					__(
						"Could not delete task(s). Parents with child tasks cannot be deleted until children are removed."
					),
			});
			return false;
		} finally {
			frappe.dom.unfreeze();
		}
	};
}
