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
		{
			fieldname: "show_completion_forecast",
			label: __("Прогноз выполнения"),
			fieldtype: "Check",
			default: 0,
		},
	],

	onload: function (report) {
		let $wrap = null;
		if (report.page && report.page.main) {
			$wrap = report.page.main.find(".task-epic-burndown-chart").first();
			if (!$wrap.length) {
				$wrap = $('<div class="task-epic-burndown-chart" style="width:100%;min-height:460px;margin-bottom:12px;"></div>');
				report.page.main.prepend($wrap);
			}
		} else if (report.parent) {
			$wrap = $(report.parent).find(".task-epic-burndown-chart").first();
			if (!$wrap.length) {
				$wrap = $('<div class="task-epic-burndown-chart" style="width:100%;min-height:460px;margin-bottom:12px;"></div>');
				$(report.parent).prepend($wrap);
			}
		} else {
			$wrap = $('<div class="task-epic-burndown-chart" style="width:100%;min-height:460px;margin-bottom:12px;"></div>');
		}
		report.$chart_area = $wrap;

		let chart = null;
		let renderTimer = null;
		let renderRequestId = 0;

		function destroyChart() {
			if (chart) {
				chart.dispose();
				chart = null;
			}
			$wrap.empty();
		}

		function scheduleRender(delay = 120) {
			if (renderTimer) {
				clearTimeout(renderTimer);
			}
			renderTimer = setTimeout(function () {
				renderTimer = null;
				renderBurndown();
			}, delay);
		}

		function bindFilterAutoRefresh() {
			(report.filters || []).forEach(function (filter) {
				if (!filter || filter.__task_epic_burndown_bound || !filter.df) {
					return;
				}
				const originalOnChange = filter.df.onchange;
				filter.df.onchange = function () {
					if (typeof originalOnChange === "function") {
						originalOnChange.apply(this, arguments);
					}
					scheduleRender();
				};
				filter.__task_epic_burndown_bound = true;
			});
		}

		function renderBurndown() {
			const filters = frappe.query_report.get_filter_values();
			if (!filters.project) {
				destroyChart();
				return;
			}
			const requestId = ++renderRequestId;
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
							show_completion_forecast: filters.show_completion_forecast ? 1 : 0,
						},
						callback: function (r) {
							if (requestId !== renderRequestId) {
								return;
							}
							if (!r.message || r.exc) {
								return;
							}
							const d = r.message;
							const z = (a) => (a || []).map((x) => (x === null || x === undefined ? 0 : x));
							const cats = d.categories || [];
							const created = z(d.created || d.added);
							const openBase = z(d.open || d.remaining || d.end_scope);
							const completedBase = z(d.completed);
							const createdCompleted = z(d.created_completed || d.same_period_completed);
							const forecastCompleted = z(d.forecast_completed);
							const forecastOpen = z(d.forecast_remaining);
							const holidayDates = new Set((d.holiday_dates || []).filter(Boolean));
							const showCompletionForecast = toBool(
								filters.show_completion_forecast,
								false
							);
							const todayStr = frappe.datetime.get_today();
							const groupByKey = (filters.group_by || "month").toLowerCase();
							const isDayGroup = groupByKey === "day";
							const forecastFromIndexRaw = d.forecast_from_index;
							const forecastFromIndex =
								forecastFromIndexRaw === null || forecastFromIndexRaw === undefined || forecastFromIndexRaw === ""
									? null
									: Number(forecastFromIndexRaw);
							const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
							const mondayOfIsoWeek = (year, week) => {
								const jan4 = new Date(year, 0, 4);
								const jan4Dow = jan4.getDay() || 7;
								const mondayWeek1 = new Date(jan4);
								mondayWeek1.setDate(jan4.getDate() - jan4Dow + 1);
								const out = new Date(mondayWeek1);
								out.setDate(mondayWeek1.getDate() + (week - 1) * 7);
								return out;
							};
							const bucketStartStrForForecast = (label) => {
								if (!label || typeof label !== "string") {
									return null;
								}
								if (groupByKey === "day") {
									return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : null;
								}
								if (groupByKey === "month") {
									return /^\d{4}-\d{2}$/.test(label) ? `${label}-01` : null;
								}
								if (groupByKey === "week") {
									const m = label.match(/^(\d{4})-W(\d{2})$/);
									if (!m) {
										return null;
									}
									const y = Number(m[1]);
									const w = Number(m[2]);
									const mon = mondayOfIsoWeek(y, w);
									return `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`;
								}
								return null;
							};
							const isFutureBucketIndex = (idx) => {
								if (
									forecastFromIndex != null &&
									!Number.isNaN(forecastFromIndex) &&
									forecastFromIndex >= 0
								) {
									return idx >= forecastFromIndex;
								}
								const startStr = bucketStartStrForForecast(cats[idx]);
								return Boolean(startStr && startStr > todayStr);
							};
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
							const segmentLabelColorForecast = {
								created: "#ffffff",
								open: "#ffffff",
								completed: "#02240a",
								created_completed: "#e6ffea",
							};
							const forecastFillOpacity = 0.42;
							const holidayBandFill = "rgba(120, 120, 120, 0.12)";
							const waterfallData = [];
							const holidayBandData = [];
							const forecastBoundaryData = [];
							let previousOpenTop = null;
							let yMin = 0;
							let yMax = 0;

							for (let i = 0; i < cats.length; i++) {
								const isForecast = isFutureBucketIndex(i);
								const isHoliday = isDayGroup && holidayDates.has(cats[i]);
								const createdValue = created[i] || 0;
								const createdCompletedBaseValue = createdCompleted[i] || 0;
								const completedValue =
									showCompletionForecast && isForecast
										? forecastCompleted[i] || 0
										: completedBase[i] || 0;
								const openValue =
									showCompletionForecast && isForecast
										? forecastOpen[i] || 0
										: openBase[i] || 0;
								const createdCompletedValue =
									showCompletionForecast && isForecast ? 0 : createdCompletedBaseValue;
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
									barTop = previousOpenTop == null ? 0 : previousOpenTop;
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
									isForecast,
									isHoliday,
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
								if (isHoliday) {
									holidayBandData.push({
										value: i,
										category: cats[i],
									});
								}
							}

							const yShift = yMin < 0 ? Math.abs(yMin) : 0;
							if (yShift > 0) {
								waterfallData.forEach(function (rowData) {
									const g = rowData.geometry;
									rowData.geometry = {
										barTop: g.barTop + yShift,
										barBottom: g.barBottom + yShift,
										openTop: g.openTop + yShift,
										openBottom: g.openBottom + yShift,
										completedTop: g.completedTop + yShift,
										completedBottom: g.completedBottom + yShift,
										createdTop: g.createdTop + yShift,
										createdBottom: g.createdBottom + yShift,
										createdCompletedTop: g.createdCompletedTop + yShift,
										createdCompletedBottom: g.createdCompletedBottom + yShift,
									};
								});
							}
							const shiftedYMax = yMax + yShift;
							if (
								showCompletionForecast &&
								forecastFromIndex != null &&
								!Number.isNaN(forecastFromIndex) &&
								forecastFromIndex > 0 &&
								forecastFromIndex < cats.length
							) {
								forecastBoundaryData.push({ value: forecastFromIndex });
							}

							let $chartRoot = $wrap.find(".task-epic-burndown-chart-root").first();
							if (!$chartRoot.length) {
								$wrap.empty();
								$chartRoot = $('<div class="task-epic-burndown-chart-root" style="width:100%;min-height:460px;"></div>');
								$wrap.append($chartRoot);
							}
							const dom = $chartRoot.get(0);
							if (!chart || chart.isDisposed()) {
								chart = echarts.init(dom, null, { renderer: "canvas" });
							} else {
								chart.clear();
							}

							chart.setOption(
								{
									animation: true,
									animationDuration: 500,
									animationEasing: "cubicOut",
									animationDurationUpdate: 350,
									animationEasingUpdate: "cubicOut",
									animationDelay: function (idx) {
										return Math.min(idx * 35, 280);
									},
									animationDelayUpdate: function (idx) {
										return Math.min(idx * 20, 160);
									},
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
										scale: false,
										min: 0,
										max: shiftedYMax,
									},
									series: [
										{
											name: "__holiday_bands",
											type: "custom",
											silent: true,
											tooltip: { show: false },
											data: holidayBandData,
											z: -10,
											renderItem: function (params, api) {
												const rowData = holidayBandData[params.dataIndex];
												const categoryIndex = rowData ? rowData.value : params.dataIndex;
												const xCenter = api.coord([categoryIndex, 0])[0];
												const bandWidth = api.size([1, 0])[0];
												const left = xCenter - bandWidth / 2;
												const rect = echarts.graphic.clipRectByRect(
													{
														x: left,
														y: params.coordSys.y,
														width: bandWidth,
														height: params.coordSys.height,
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
													style: {
														fill: holidayBandFill,
													},
													shape: rect,
												};
											},
										},
										{
											name: "__forecast_boundary",
											type: "custom",
											silent: true,
											tooltip: { show: false },
											data: forecastBoundaryData,
											z: 15,
											renderItem: function (params, api) {
												const rowData = forecastBoundaryData[params.dataIndex];
												const boundaryIndex = rowData ? rowData.value : null;
												if (
													boundaryIndex === undefined ||
													boundaryIndex === null ||
													boundaryIndex <= 0 ||
													boundaryIndex >= cats.length
												) {
													return null;
												}
												const leftX = api.coord([boundaryIndex - 1, 0])[0];
												const rightX = api.coord([boundaryIndex, 0])[0];
												const xMid = (leftX + rightX) / 2;
												return {
													type: "group",
													children: [
														{
															type: "line",
															silent: true,
															shape: {
																x1: xMid,
																y1: params.coordSys.y,
																x2: xMid,
																y2: params.coordSys.y + params.coordSys.height,
															},
															style: {
																stroke: "rgba(70, 70, 70, 0.9)",
																lineWidth: 3,
																lineDash: [6, 4],
															},
														},
													],
												};
											},
										},
										{
											name: __("Task epic flow"),
											type: "custom",
											data: waterfallData,
											z: 10,
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
															fillOpacity: rowData.isForecast ? forecastFillOpacity : 1,
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
													const labelPalette = rowData.isForecast
														? segmentLabelColorForecast
														: segmentLabelColor;
													return {
														type: "text",
														silent: true,
														style: {
															x: xCenter,
															y: Math.min(topY, bottomY) + height / 2,
															text: segmentLabel(segment, rawValue),
															textAlign: "center",
															textVerticalAlign: "middle",
															fill: labelPalette[segment],
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

		bindFilterAutoRefresh();
		window.__task_epic_burndown_render = renderBurndown;
		setTimeout(function () {
			scheduleRender(0);
		}, 400);
		if (report.page && report.page.add_inner_button) {
			report.page.add_inner_button(__("Refresh chart"), function () {
				scheduleRender(0);
			});
		}

		$(window).on("resize.task_epic_burndown", function () {
			if (chart) {
				chart.resize();
			}
		});
	},

	after_datatable_render: function () {
		if (window.__task_epic_burndown_render) {
			window.__task_epic_burndown_render();
		}
	},

	after_datatable_refresh: function () {
		if (window.__task_epic_burndown_render) {
			window.__task_epic_burndown_render();
		}
	},
};
