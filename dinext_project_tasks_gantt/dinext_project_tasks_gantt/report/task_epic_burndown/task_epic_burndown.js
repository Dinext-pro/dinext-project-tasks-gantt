// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

frappe.query_reports["Task Epic Burndown"] = {
	filters: [
		{
			fieldname: "project",
			label: __("Project"),
			fieldtype: "Link",
			options: "Project",
			reqd: 1,
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -6),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "group_by",
			label: __("X Axis Period"),
			fieldtype: "Select",
			options: ["month", "week", "day", "Sprint", "Stage", "Phase"],
			default: "month",
		},
		{
			fieldname: "measure",
			label: __("Measure"),
			fieldtype: "Select",
			options: ["hours", "story_points", "task_count"],
			default: "hours",
		},
		{
			fieldname: "exclude_group_tasks",
			label: __("Exclude group tasks"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "use_progress",
			label: __("Use task progress"),
			fieldtype: "Check",
			default: 1,
		},
		{
			fieldname: "forecast_periods",
			label: __("Forecast periods"),
			fieldtype: "Int",
			default: 6,
		},
	],

	onload: function (report) {
		const $wrap = $('<div class="task-epic-burndown-chart" style="width:100%;min-height:460px;margin-bottom:12px;"></div>');
		report.$chart_area = $wrap;
		if (report.page && report.page.main) {
			report.page.main.prepend($wrap);
		} else if (report.parent) {
			$(report.parent).prepend($wrap);
		}

		let chart = null;

		function renderBurndown() {
			const filters = frappe.query_report.get_filter_values();
			if (!filters.project) {
				return;
			}
			const toBool = (value, defaultValue) => {
				if (value === undefined || value === null || value === "") {
					return defaultValue;
				}
				if (typeof value === "string") {
					return !["0", "false", "no", "off"].includes(value.toLowerCase());
				}
				return !!value;
			};
			const useProgress = toBool(filters.use_progress, true);

			frappe.require(
				["/assets/dinext_common/js/echarts.min.js"],
				function () {
					frappe.call({
						method: "dinext_project_tasks_gantt.burndown.get_burndown_series",
						args: {
							project: filters.project,
							from_date: filters.from_date,
							to_date: filters.to_date,
							group_by: filters.group_by || "month",
							measure: filters.measure || "hours",
							exclude_group_tasks: filters.exclude_group_tasks ? 1 : 0,
							use_progress: useProgress ? 1 : 0,
							forecast_periods: filters.forecast_periods || 6,
						},
						callback: function (r) {
							if (!r.message || r.exc) {
								return;
							}
							const d = r.message;
							const z = (a) => (a || []).map((x) => (x === null || x === undefined ? 0 : x));
							const cats = d.categories || [];
							const created = z(d.created || d.added);
							const open = z(d.open || d.remaining || d.end_scope);
							const completed = z(d.completed);
							const barTotal = cats.map(
								(_, i) => (created[i] || 0) + (open[i] || 0) + (completed[i] || 0)
							);
							const baseline = barTotal.map((total, i) => {
								const topTarget = i === 0 ? total : open[i - 1] || 0;
								return Math.max(0, topTarget - total);
							});
							const formatValue = (value) => {
								if ((d.measure || "") === "task_count" && !d.use_progress) {
									return Math.round(value).toString();
								}
								return value.toFixed(2);
							};
							const segmentLabel = (segment, value) => {
								const v = Number(value) || 0;
								if (v <= 0) {
									return "";
								}
								const text = formatValue(v);
								if (segment === "created") {
									return `+${text}`;
								}
								if (segment === "completed") {
									return `-${text}`;
								}
								return text;
							};
							const segmentBySeriesIndex = [null, "created", "open", "completed"];
							const segmentColors = {
								created: "#0b2f5a",
								open: "#1f77b4",
								completed: "#6fdc6f",
							};
							const segmentLabelColor = {
								created: "#ffffff",
								open: "#ffffff",
								completed: "#0a5c0a",
							};

							const dom = $wrap.get(0);
							if (!chart) {
								chart = echarts.init(dom, null, { renderer: "canvas" });
							}

							chart.setOption(
								{
									tooltip: {
										trigger: "axis",
										axisPointer: { type: "shadow" },
										formatter: function (params) {
											if (!params || !params.length) {
												return "";
											}
											const i = params[0].dataIndex;
											const total =
												(created[i] || 0) + (open[i] || 0) + (completed[i] || 0);
											const lines = [
												params[0].axisValue +
													'<table style="margin-top:4px;border-collapse:collapse;">',
											];
											const row = (k, v) =>
												"<tr><td style=\"padding:2px 8px 2px 0\">" +
												k +
												'</td><td style="text-align:right;font-weight:600">' +
												v +
												"</td></tr>";
											lines.push(
												row(__("Created in period"), segmentLabel("created", created[i] || 0))
											);
											lines.push(row(__("Open at period end"), segmentLabel("open", open[i] || 0)));
											lines.push(
												row(
													__("Completed in period"),
													segmentLabel("completed", completed[i] || 0)
												)
											);
											lines.push(row(__("Total visible volume"), formatValue(total)));
											lines.push("</table>");
											return lines.join("");
										},
									},
									legend: {
										data: [
											__("Created in period"),
											__("Open at period end"),
											__("Completed in period"),
										],
									},
									grid: { left: 48, right: 24, top: 48, bottom: 80 },
									xAxis: {
										type: "category",
										data: cats,
										axisLabel: { rotate: cats.length > 8 ? 35 : 0 },
									},
									yAxis: {
										type: "value",
										name: d.y_axis_label || "",
										scale: false,
									},
									series: [
										{
											name: "__baseline",
											type: "bar",
											stack: "volume",
											data: baseline,
											silent: true,
											tooltip: { show: false },
											itemStyle: { color: "transparent" },
											emphasis: { disabled: true },
										},
										{
											name: __("Created in period"),
											type: "bar",
											stack: "volume",
											data: created,
											itemStyle: { color: segmentColors.created },
											label: {
												show: true,
												position: "inside",
												color: segmentLabelColor.created,
												formatter: (p) => segmentLabel("created", p.value),
											},
										},
										{
											name: __("Open at period end"),
											type: "bar",
											stack: "volume",
											data: open,
											itemStyle: { color: segmentColors.open },
											label: {
												show: true,
												position: "inside",
												color: segmentLabelColor.open,
												formatter: (p) => segmentLabel("open", p.value),
											},
										},
										{
											name: __("Completed in period"),
											type: "bar",
											stack: "volume",
											data: completed,
											itemStyle: { color: segmentColors.completed },
											label: {
												show: true,
												position: "inside",
												color: segmentLabelColor.completed,
												formatter: (p) => segmentLabel("completed", p.value),
											},
										},
									],
								},
								true
							);
							chart.off("click");
							chart.on("click", function (params) {
								const segment = segmentBySeriesIndex[params.seriesIndex];
								if (!segment || params.dataIndex === undefined) {
									return;
								}
								const taskNames =
									((d.task_filters || {})[segment] || [])[params.dataIndex] || [];
								if (!taskNames.length) {
									return;
								}
								frappe.route_options = {
									project: ["=", filters.project],
									name: ["in", taskNames],
								};
								frappe.set_route("List", "Task");
							});
						},
					});
				}
			);
		}

		window.__task_epic_burndown_render = renderBurndown;
		setTimeout(renderBurndown, 400);
		if (report.page && report.page.add_inner_button) {
			report.page.add_inner_button(__("Refresh chart"), renderBurndown);
		}

		$(window).on("resize.task_epic_burndown", function () {
			if (chart) {
				chart.resize();
			}
		});
	},

	after_datatable_refresh: function () {
		if (window.__task_epic_burndown_render) {
			window.__task_epic_burndown_render();
		}
	},
};
