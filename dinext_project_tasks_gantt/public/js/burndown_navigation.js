// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

frappe.provide("dinext_project_tasks_gantt.burndown_navigation");

dinext_project_tasks_gantt.burndown_navigation = {
	REPORT: "Task Epic Burndown",
	ICON: "🔥",
	LABEL: __("Burndown Chart"),

	compute_date_range(project_start) {
		const today = frappe.datetime.get_today();
		const to_date = frappe.datetime.add_months(today, 2);
		const twelve_months_ago = frappe.datetime.add_months(today, -12);

		let from_date = project_start || null;
		if (!from_date || from_date < twelve_months_ago) {
			from_date = twelve_months_ago;
		}

		return { from_date, to_date };
	},

	compute_date_range_from_doc(doc) {
		const project_start = doc?.expected_start_date || doc?.actual_start_date || null;
		return this.compute_date_range(project_start);
	},

	fetch_date_range(project) {
		return frappe.db
			.get_value("Project", project, ["expected_start_date", "actual_start_date"])
			.then((response) => {
				const project_data = response?.message || {};
				const project_start =
					project_data.expected_start_date || project_data.actual_start_date || null;
				return this.compute_date_range(project_start);
			});
	},

	build_route_options(project, dates) {
		return {
			project,
			from_date: dates.from_date,
			to_date: dates.to_date,
			group_by: "week",
			use_task_weight: false,
		};
	},

	open_report(project, doc) {
		if (!project) {
			return;
		}

		const dates = doc
			? this.compute_date_range_from_doc(doc)
			: null;

		const open_with_dates = (resolved_dates) => {
			frappe.route_options = this.build_route_options(project, resolved_dates);
			frappe.set_route("query-report", this.REPORT);
		};

		if (dates) {
			open_with_dates(dates);
			return;
		}

		return this.fetch_date_range(project).then(open_with_dates);
	},
};
