// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

function formatPlanField(val, _field, _options, doc) {
	return doc.planned_hours ? val : `<span class="${doc.status}">${val}</span>`;
}

function formatPctField(val, _field, _options, doc) {
	return `<span class="${doc.status}">${val}</span>`;
}

/**
 * @param {object} row grid row with plan_fact_data
 */
export function showPlanFactDialog(row) {
	const taskData = (row?.plan_fact_data || []).map((data) => ({
		...data,
		users: frappe.utils.comma_and(data.hours_data?.users || []),
	}));

	if (!taskData.length) {
		frappe.msgprint(__("Нет данных для отображения."));
		return;
	}

	const d = new frappe.ui.Dialog({
		title: __("План-факт трудозатрат"),
		fields: [
			{
				label: __("Задача"),
				fieldname: "name",
				fieldtype: "Data",
				read_only: 1,
				default: row.subject || row.id,
			},
			{
				fieldname: "plan_fact_table",
				fieldtype: "Table",
				cannot_add_rows: 1,
				cannot_delete_rows: 1,
				in_place_edit: true,
				fields: [
					{
						label: __("Роль"),
						fieldname: "role",
						fieldtype: "Data",
						read_only: 1,
						in_list_view: 1,
						columns: 3,
					},
					{
						label: __("План"),
						fieldname: "planned_hours",
						fieldtype: "Float",
						precision: 1,
						read_only: 1,
						in_list_view: 1,
						columns: 1,
						formatter: formatPlanField,
					},
					{
						label: __("Факт"),
						fieldname: "total_hours",
						fieldtype: "Float",
						precision: 1,
						read_only: 1,
						in_list_view: 1,
						columns: 1,
					},
					{
						label: __("%"),
						fieldname: "completion_percentage",
						fieldtype: "Percent",
						precision: 1,
						read_only: 1,
						in_list_view: 1,
						columns: 1,
						formatter: formatPctField,
					},
					{
						label: __("Учтены трудозатраты от"),
						fieldname: "users",
						fieldtype: "Data",
						read_only: 1,
						in_list_view: 1,
						columns: 4,
					},
				],
				data: taskData,
			},
		],
		size: "large",
		primary_action_label: __("Done"),
		primary_action() {
			d.hide();
			document.activeElement?.blur?.();
		},
	});

	const missing = taskData.filter((data) => data.plan_required && data.planned_hours <= 0);
	if (missing.length) {
		const warning = document.createElement("div");
		warning.className = "alert alert-danger";
		warning.style.cssText = "margin: 15px 0; display: flex; align-items: center; gap: 8px;";
		warning.innerHTML = `<i class="fa fa-exclamation-triangle" style="font-size: 1.2em;"></i>
			<div><strong>${__("Внимание!")}</strong>
			${__("Для данной задачи обязательно указание плановых трудозатрат")}</div>`;
		d.$wrapper.find(".modal-body").prepend(warning);
	}

	d.show();
}
