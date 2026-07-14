frappe.pages["task-wbs-v2"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Структурный план проекта"),
		single_column: true,
	});

	frappe.require(
		[
			"/assets/dinext_project_tasks_gantt/css/task_wbs_v2.css",
			"dinext-table.bundle.js",
			"task_wbs_v2.bundle.js",
		],
		() => {
			const api = dinext_project_tasks_gantt.task_wbs_v2;
			if (!api?.mount) {
				frappe.throw(__("task_wbs_v2 bundle failed to load"));
			}
			api.mount({ wrapper, page });
		}
	);
};
