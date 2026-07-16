// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt
/**
 * /app/tree/Task → task_tree_gantt (DinextTable + Gantt).
 */
(function () {
	const TASK_DOCTYPE = "Task";

	function clearMainExceptPageForm(page) {
		const main = page?.main?.get?.(0);
		if (!main) {
			return;
		}
		const pageForm = page.page_form?.get?.(0);
		[...main.children].forEach((child) => {
			if (child === pageForm || child.classList?.contains("page-form")) {
				return;
			}
			main.removeChild(child);
		});
	}

	function setupBurndown(page, getArgs) {
		if (page.__task_tree_gantt_burndown) {
			return;
		}
		const nav = dinext_project_tasks_gantt.burndown_navigation;
		if (!nav?.open_report) {
			return;
		}
		page.__task_tree_gantt_burndown = true;
		const label = `${nav.ICON || ""} ${nav.LABEL || __("Burndown Chart")}`.trim();
		page.add_inner_button(label, () => {
			const project = getArgs?.()?.project;
			if (!project) {
				frappe.show_alert({
					message: __("Select a project"),
					indicator: "orange",
				});
				return;
			}
			nav.open_report(project);
		});
	}

	async function mountTreeGantt(treeview) {
		const page = treeview?.page;
		if (!page) {
			return;
		}
		if (page.__task_tree_gantt_mounted) {
			return;
		}
		page.__task_tree_gantt_mounted = true;

		page.wrapper?.addClass?.("task-tree-gantt-page");
		clearMainExceptPageForm(page);

		await frappe.require([
			"/assets/dinext_project_tasks_gantt/css/task_tree_gantt.css",
			"dinext-table.bundle.js",
			"/assets/dinext_project_tasks_gantt/js/burndown_navigation.js",
			"task_tree_gantt.bundle.js",
		]);

		const api = dinext_project_tasks_gantt.treeGantt;
		if (!api?.mount) {
			frappe.throw(__("task_tree_gantt bundle failed to load"));
		}

		const mounted = await api.mount({ page });
		setupBurndown(page, mounted?.state?.getArgs);
	}

	function install() {
		frappe.provide("frappe.treeview_settings");
		let settings = frappe.treeview_settings[TASK_DOCTYPE];
		if (!settings) {
			settings = frappe.treeview_settings[TASK_DOCTYPE] = {};
		}
		if (settings.__task_tree_gantt) {
			return;
		}
		settings.__task_tree_gantt = true;

		// TreeView must not add ERPNext filters — mount owns page-form.
		settings.filters = [];
		settings.toolbar = [];
		settings.extend_toolbar = false;
		settings.get_tree_root = false;
		settings.root_label = __("Структурный план проекта");

		settings.onload = function (treeview) {
			void mountTreeGantt(treeview).catch((e) => {
				console.error("[task_tree_gantt]", e);
				frappe.msgprint({
					title: __("Error"),
					indicator: "red",
					message: e.message || String(e),
				});
			});
		};

		settings.post_render = function () {
			/* classic tree unused */
		};
	}

	install();
})();
