frappe.provide("dinext_project_tasks_gantt");

window.dinext_fit_depend_task_dates = function (args) {
	frappe.call({
		method: "dinext_project_tasks_gantt.api.fit_depend_task_dates",
		args: { args: args },
		freeze: true,
		freeze_message: __("Подгонка прогнозных дат"),
		callback: function (r) {
			frappe.hide_msgprint();
			if (r.exc) {
				return;
			}
			frappe.show_alert({
				message: __("Прогнозные даты связанных задач подогнаны под выбранный период."),
				indicator: "green",
			});
			if (cur_frm && cur_frm.doctype === "Task" && args && cur_frm.docname === args.task) {
				cur_frm.reload_doc();
			}
		},
	});
};
