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

	function hideClassicTreeChrome(page) {
		page?.remove_inner_button?.(__("Expand All"));
		page?.remove_inner_button?.(__("Collapse All"));
		page?.clear_primary_action?.();
	}

	/**
	 * Cached Tree/Task: Factory.show → container.change_to → $(page).trigger("show").
	 * post_render / router.change can miss if make_tree throws after change_to.
	 * Bind after first mount so the initial show (already painted) is not a second reload.
	 */
	async function refreshOnShow(page) {
		const applied = await page.__task_tree_gantt_apply_route?.();
		if (!applied) {
			await page.__task_tree_gantt_on_show?.();
		}
	}

	function bindPageShow(page) {
		if (page.__task_tree_gantt_show_bound) {
			return;
		}
		const $wrap = page.wrapper;
		if (!$wrap?.on) {
			return;
		}
		page.__task_tree_gantt_show_bound = true;
		$wrap.on("show", function (evt) {
			if (evt.target !== this) {
				return;
			}
			void refreshOnShow(page);
		});
	}

	/** Classic TreeView menu: Refresh / Rebuild Tree still call make_tree — remap to Gantt. */
	function wireTreeMenuToGantt(treeview, page) {
		if (!treeview || treeview.__task_tree_gantt_menu) {
			return;
		}
		treeview.__task_tree_gantt_menu = true;
		treeview.make_tree = function () {
			$(this.parent).find(".tree").remove();
			void page.__task_tree_gantt_on_show?.();
		};
		treeview.rebuild_tree = function () {
			const me = this;
			frappe.call({
				method: "frappe.utils.nestedset.rebuild_tree",
				args: { doctype: me.doctype },
				callback(r) {
					if (!r.exc) {
						void page.__task_tree_gantt_on_show?.();
					}
				},
			});
		};
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
			await page.__task_tree_gantt_apply_route?.();
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
		page.__task_tree_gantt_apply_route = () =>
			mounted?.state?.applyRouteProject?.() || Promise.resolve(false);
		page.__task_tree_gantt_on_show = () =>
			mounted?.onShow?.() || Promise.resolve();
		setupBurndown(page, mounted?.state?.getArgs);
		hideClassicTreeChrome(page);
		wireTreeMenuToGantt(treeview, page);
		bindPageShow(page);
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
		settings.show_expand_all = false;
		settings.disable_add_node = true;
		settings.root_label = __("Project Structure Plan");

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

		settings.post_render = function (treeview) {
			// Factory.on_show → make_tree builds classic .tree; strip it.
			$(treeview?.parent).find(".tree").remove();
		};
	}

	install();
})();
