frappe.pages["task-wbs"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Структурный план (dev)"),
		single_column: true,
	});

	frappe.require(
		[
			"/assets/dinext_project_tasks_gantt/css/task_wbs.css",
			"/assets/dinext_project_tasks_gantt/js/burndown_navigation.js",
			"task_wbs.bundle.js",
		],
		() => {
			const api = dinext_project_tasks_gantt.task_wbs;
			if (!api?.isReady?.() || typeof api.mount !== "function") {
				frappe.msgprint(__("task_wbs bundle not ready"));
				return;
			}
			api.mount({ wrapper, page });
		}
	);
};
