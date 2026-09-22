/**
 * ТРЗ dialog — Tree show_plan_fact.
 */

function showForecastColumn() {
	return Boolean(frappe.boot?.dinext_timesheet_show_forecast);
}

/** Tree formatPlanField: color plan only when planned_hours is falsy. */
function formatPlanField(val, _field, _options, doc) {
	return doc.planned_hours ? val : `<span class="${doc.status}">${val}</span>`;
}

/** Tree formatField: color % only when planned_hours is truthy. */
function formatPctField(val, _field, _options, doc) {
	return doc.planned_hours ? `<span class="${doc.status}">${val}</span>` : val;
}

/**
 * @param {object} row grid row with plan_fact_data
 */
export function showPlanFactDialog(row) {
	const taskData = (row?.plan_fact_data || []).map((data) => ({
		...data,
		users: frappe.utils.comma_and(data.hours_data?.users || []),
	}));

	// Tree: click handler only when taskData exists — no msgprint path
	if (!taskData.length) {
		return;
	}

	const showForecast = showForecastColumn();
	const fields = [
		{
			label: __("Role"),
			fieldname: "role",
			fieldtype: "Data",
			read_only: 1,
			in_list_view: 1,
			columns: 3,
		},
		{
			label: __("Plan"),
			fieldname: "planned_hours",
			fieldtype: "Float",
			precision: 1,
			read_only: 1,
			in_list_view: 1,
			columns: 1,
			formatter: formatPlanField,
		},
	];
	if (showForecast) {
		fields.push({
			label: __("Forecast"),
			fieldname: "forecast_hours",
			fieldtype: "Float",
			precision: 1,
			read_only: 1,
			in_list_view: 1,
			columns: 1,
		});
	}
	fields.push(
		{
			label: __("Actual"),
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
			label: __("Work efforts included from"),
			fieldname: "users",
			fieldtype: "Data",
			read_only: 1,
			in_list_view: 1,
			columns: showForecast ? 3 : 4,
		}
	);

	const d = new frappe.ui.Dialog({
		title: __("Work Efforts Plan vs Actual"),
		fields: [
			{
				label: __("Task"),
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
				fields,
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
			<div><strong>${__("Attention!")}</strong>
			${__("Planned work efforts are required for this task")}</div>`;
		d.$wrapper.find(".modal-body").prepend(warning);
	}

	d.show();
}
