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
							const createdCompleted = z(d.created_completed || d.same_period_completed);
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
								if (segment === "created_completed") {
									return `+/-${text}`;
								}
								if (segment === "completed") {
									return `-${text}`;
								}
								return text;
							};
							const segmentColors = {
								created: "#0b2f5a",
								open: "#1f77b4",
								completed: "#6fdc6f",
								created_completed: "#0f5b5b",
							};
							const segmentLabelColor = {
								created: "#ffffff",
								open: "#ffffff",
								completed: "#0a5c0a",
								created_completed: "#a8ffb0",
							};
							const waterfallData = [];
							let previousOpenTop = null;
							let yMin = 0;
							let yMax = 0;

							for (let i = 0; i < cats.length; i++) {
								const createdValue = created[i] || 0;
								const openValue = open[i] || 0;
								const completedValue = completed[i] || 0;
								const createdCompletedValue = createdCompleted[i] || 0;
								const total = createdValue + openValue + completedValue + createdCompletedValue;

								let barTop;
								let openTop;
								let openBottom;
								let completedTop;
								let completedBottom;
								let createdTop;
								let createdBottom;
								let createdCompletedTop;
								let createdCompletedBottom;
								let barBottom;

								if (i === 0) {
									createdCompletedBottom = 0;
									createdCompletedTop = createdCompletedBottom + createdCompletedValue;
									createdBottom = createdCompletedTop;
									createdTop = createdBottom + createdValue;
									openBottom = createdTop;
									openTop = openBottom + openValue;
									completedBottom = openTop;
									completedTop = completedBottom + completedValue;
									barTop = completedTop;
									barBottom = 0;
								} else {
									barTop = previousOpenTop == null ? open[i - 1] || 0 : previousOpenTop;
									completedTop = barTop;
									completedBottom = completedTop - completedValue;
									openTop = completedBottom;
									openBottom = openTop - openValue;
									createdTop = openBottom;
									createdBottom = createdTop - createdValue;
									createdCompletedTop = createdBottom;
									createdCompletedBottom = createdCompletedTop - createdCompletedValue;
									barBottom = Math.min(openBottom, createdBottom, createdCompletedBottom);
								}

								previousOpenTop = openValue > 0 ? openTop : barTop;
								yMin = Math.min(
									yMin,
									openBottom,
									completedBottom,
									createdBottom,
									createdCompletedBottom,
									barBottom
								);
								yMax = Math.max(
									yMax,
									openTop,
									completedTop,
									createdTop,
									createdCompletedTop,
									barTop
								);

								waterfallData.push({
									value: i,
									category: cats[i],
									created: createdValue,
									open: openValue,
									completed: completedValue,
									created_completed: createdCompletedValue,
									total,
									geometry: {
										barTop,
										barBottom,
										openTop,
										openBottom,
										completedTop,
										completedBottom,
										createdTop,
										createdBottom,
										createdCompletedTop,
										createdCompletedBottom,
									},
								});
							}

							const dom = $wrap.get(0);
							if (!chart) {
								chart = echarts.init(dom, null, { renderer: "canvas" });
							}

							chart.setOption(
								{
									tooltip: {
										trigger: "item",
										formatter: function (params) {
											if (!params || !params.data) {
												return "";
											}
											const rowData = params.data;
											const lines = [
												rowData.category +
													'<table style="margin-top:4px;border-collapse:collapse;">',
											];
											const row = (k, v) =>
												"<tr><td style=\"padding:2px 8px 2px 0\">" +
												k +
												'</td><td style="text-align:right;font-weight:600">' +
												v +
												"</td></tr>";
											lines.push(
												row(
													__("Completed in period"),
													segmentLabel("completed", rowData.completed || 0)
												)
											);
											lines.push(
												row(__("Open at period end"), segmentLabel("open", rowData.open || 0))
											);
											lines.push(
												row(__("Created in period"), segmentLabel("created", rowData.created || 0))
											);
											lines.push(
												row(
													__("Created and completed"),
													segmentLabel("created_completed", rowData.created_completed || 0)
												)
											);
											lines.push(row(__("Total visible volume"), formatValue(rowData.total || 0)));
											lines.push("</table>");
											return lines.join("");
										},
									},
									legend: {
										data: [
											__("Completed in period"),
											__("Open at period end"),
											__("Created in period"),
											__("Created and completed"),
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
										scale: true,
										min: yMin,
										max: yMax,
									},
									series: [
										{
											name: __("Task epic flow"),
											type: "custom",
											data: waterfallData,
											renderItem: function (params, api) {
												const rowData = waterfallData[params.dataIndex];
												const geometry = rowData.geometry;
												const xCenter = api.coord([params.dataIndex, 0])[0];
												const bandWidth = api.size([1, 0])[0] * 0.72;
												const left = xCenter - bandWidth / 2;
												const coord = (value) => api.coord([params.dataIndex, value])[1];
												const segmentRect = (segment, topValue, bottomValue) => {
													const topY = coord(topValue);
													const bottomY = coord(bottomValue);
													const rect = echarts.graphic.clipRectByRect(
														{
															x: left,
															y: Math.min(topY, bottomY),
															width: bandWidth,
															height: Math.max(1, Math.abs(bottomY - topY)),
														},
														{
															x: params.coordSys.x,
															y: params.coordSys.y,
															width: params.coordSys.width,
															height: params.coordSys.height,
														}
													);
													if (!rect) {
														return null;
													}
													return {
														type: "rect",
														name: segment,
														info: { segment },
														style: {
															fill: segmentColors[segment],
														},
														shape: rect,
													};
												};
												const segmentText = (segment, topValue, bottomValue, rawValue) => {
													if (!rawValue) {
														return null;
													}
													const topY = coord(topValue);
													const bottomY = coord(bottomValue);
													const height = Math.abs(bottomY - topY);
													if (height < 16) {
														return null;
													}
													return {
														type: "text",
														silent: true,
														style: {
															x: xCenter,
															y: Math.min(topY, bottomY) + height / 2,
															text: segmentLabel(segment, rawValue),
															textAlign: "center",
															textVerticalAlign: "middle",
															fill: segmentLabelColor[segment],
															fontSize: 12,
															fontWeight: 600,
														},
													};
												};
												const children = [
													segmentRect("completed", geometry.completedTop, geometry.completedBottom),
													segmentRect("open", geometry.openTop, geometry.openBottom),
													segmentRect("created", geometry.createdTop, geometry.createdBottom),
													segmentRect(
														"created_completed",
														geometry.createdCompletedTop,
														geometry.createdCompletedBottom
													),
													segmentText(
														"completed",
														geometry.completedTop,
														geometry.completedBottom,
														rowData.completed
													),
													segmentText("open", geometry.openTop, geometry.openBottom, rowData.open),
													segmentText(
														"created",
														geometry.createdTop,
														geometry.createdBottom,
														rowData.created
													),
													segmentText(
														"created_completed",
														geometry.createdCompletedTop,
														geometry.createdCompletedBottom,
														rowData.created_completed
													),
												].filter(Boolean);
												return {
													type: "group",
													children,
												};
											},
										},
									],
								},
								true
							);
							chart.off("click");
							chart.on("click", function (params) {
								const segment = params.info && params.info.segment;
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
