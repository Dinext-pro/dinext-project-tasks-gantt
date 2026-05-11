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
			fieldname: "use_task_weight",
			label: __("Учитывать вес задачи"),
			fieldtype: "Check",
			default: 0,
			depends_on: "eval: doc.measure == 'task_count'",
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
			depends_on: "eval: doc.measure != 'hours'",
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

		function getThemeVariableColor(variableName, fallback) {
			if (
				typeof getComputedStyle !== "function" ||
				!document ||
				!document.documentElement ||
				!variableName
			) {
				return fallback;
			}
			const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
			return value || fallback;
		}

		function getEChartsThemeName() {
			const root = document.documentElement;
			return root && root.getAttribute("data-theme") === "dark" ? "dark" : undefined;
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

		/** Query Report omits falsy values from get_filter_values(); Check returns 0 when off. */
		function getCheckFilterValue(fieldname, defaultWhenMissing) {
			const qr = frappe.query_report;
			if (!qr || typeof qr.get_filter !== "function") {
				return defaultWhenMissing;
			}
			const f = qr.get_filter(fieldname, false);
			if (!f || typeof f.get_value !== "function") {
				return defaultWhenMissing;
			}
			const raw = f.get_value();
			if (raw === undefined || raw === null || raw === "") {
				return defaultWhenMissing;
			}
			if (typeof raw === "string") {
				return !["0", "false", "no", "off"].includes(raw.toLowerCase());
			}
			return !!raw;
		}

		function renderBurndown() {
			const filters = frappe.query_report.get_filter_values();
			if (!filters.project) {
				destroyChart();
				return;
			}
			const requestId = ++renderRequestId;
			const measureKey = (filters.measure || "hours").toLowerCase();
			const useProgress =
				measureKey === "hours" ? false : getCheckFilterValue("use_progress", true);
			const excludeGroupTasks = getCheckFilterValue("exclude_group_tasks", true);
			const showCompletionForecastFilter = getCheckFilterValue("show_completion_forecast", false);
			const useTaskWeight = getCheckFilterValue("use_task_weight", false);

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
							exclude_group_tasks: excludeGroupTasks ? 1 : 0,
							use_progress: useProgress ? 1 : 0,
							forecast_periods: filters.forecast_periods || 6,
							show_completion_forecast: showCompletionForecastFilter ? 1 : 0,
							use_task_weight: useTaskWeight ? 1 : 0,
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
							const showCompletionForecast = showCompletionForecastFilter;
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
							const weightedTaskCount =
								useTaskWeight ||
								d.use_task_weight === true ||
								d.use_task_weight === 1 ||
								String(d.use_task_weight || "").toLowerCase() === "true";
							const formatValue = (value) => {
								if (
									(d.measure || "") === "task_count" &&
									!d.use_progress &&
									!weightedTaskCount
								) {
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
							const isDark = getEChartsThemeName() === "dark";
							const segmentColors = isDark
								? {
										created: "#3d6fa8",
										open: "#5eb0e8",
										completed: "#4d9e5c",
										created_completed: "#3d9090",
									}
								: {
										created: "#0b2f5a",
										open: "#1f77b4",
										completed: "#6fdc6f",
										created_completed: "#0f5b5b",
									};
							const segmentLabelColor = isDark
								? {
										created: "#f8fafc",
										open: "#f8fafc",
										completed: "#bbf7d0",
										created_completed: "#ccfbf1",
									}
								: {
										created: "#ffffff",
										open: "#ffffff",
										completed: "#0a5c0a",
										created_completed: "#a8ffb0",
									};
							const segmentLabelColorForecast = isDark
								? {
										created: "#f8fafc",
										open: "#f8fafc",
										completed: "#86efac",
										created_completed: "#ecfdf5",
									}
								: {
										created: "#ffffff",
										open: "#ffffff",
										completed: "#02240a",
										created_completed: "#e6ffea",
									};
							const forecastFillOpacity = 0.42;
							const holidayBandFill = isDark
								? "rgba(148, 163, 184, 0.14)"
								: "rgba(120, 120, 120, 0.12)";
							const forecastBoundaryStroke = isDark
								? "rgba(226, 232, 240, 0.88)"
								: "rgba(70, 70, 70, 0.9)";
							const axisTextColor = getThemeVariableColor(
								"--text-color",
								isDark ? "#d1d5db" : "#383838"
							);
							const gridLineColor = getThemeVariableColor(
								"--border-color",
								isDark ? "rgba(148, 163, 184, 0.22)" : "rgba(148, 163, 184, 0.28)"
							);
							const yAxisSplitLineColor = isDark
								? "rgba(186, 198, 215, 0.52)"
								: "rgba(71, 85, 105, 0.42)";
							const tooltipBg = getThemeVariableColor(
								"--popover-bg",
								getThemeVariableColor("--card-bg", "#ffffff")
							);
							const tooltipBorder = getThemeVariableColor(
								"--border-color",
								isDark ? "#475569" : "#e2e8f0"
							);
							const waterfallData = [];
							const holidayBandData = [];
							const forecastBoundaryData = [];
							let previousOpenTop = null;
							let yMin = 0;
							let yMax = 0;

							for (let i = 0; i < cats.length; i++) {
								const isForecast = isFutureBucketIndex(i);
								const isHoliday = isDayGroup && holidayDates.has(cats[i]);
								if (isHoliday) {
									holidayBandData.push({
										value: i,
										category: cats[i],
									});
								}
								if (!showCompletionForecast && isForecast) {
									continue;
								}
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
							if (chart && !chart.isDisposed()) {
								chart.dispose();
								chart = null;
							}
							chart = echarts.init(dom, getEChartsThemeName(), { renderer: "canvas" });

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
										backgroundColor: tooltipBg,
										borderColor: tooltipBorder,
										borderWidth: 1,
										textStyle: {
											color: axisTextColor,
										},
										formatter: function (params) {
											if (!params || !params.data) {
												return "";
											}
											const rowData = params.data;
											const lines = [
												'<span style="color:' +
													axisTextColor +
													';font-weight:600">' +
													rowData.category +
													"</span>" +
													'<table style="margin-top:4px;border-collapse:collapse;color:' +
													axisTextColor +
													'">',
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
									toolbox: {
										right: 8,
										top: 4,
										itemSize: 16,
										iconStyle: {
											borderColor: getThemeVariableColor("--text-muted", axisTextColor),
										},
										feature: {
											saveAsImage: {
												title: __("Save as Image"),
												name: "task-epic-burndown",
												pixelRatio: 2,
												backgroundColor: getThemeVariableColor("--card-bg", "#ffffff"),
											},
										},
									},
									legend: {
										data: [
											__("Completed in period"),
											__("Open at period end"),
											__("Created in period"),
											__("Created and completed"),
										],
										textStyle: {
											color: axisTextColor,
											fontSize: 12,
										},
									},
									grid: { left: 48, right: 24, top: 48, bottom: 80 },
									xAxis: {
										type: "category",
										data: cats,
										axisLine: {
											lineStyle: {
												color: gridLineColor,
											},
										},
										axisLabel: {
											rotate: cats.length > 8 ? 35 : 0,
											color: axisTextColor,
										},
										splitLine: {
											show: true,
											lineStyle: {
												color: gridLineColor,
												type: "dashed",
											},
										},
									},
									yAxis: {
										type: "value",
										name: d.y_axis_label || "",
										nameTextStyle: {
											color: axisTextColor,
										},
										scale: false,
										min: 0,
										max: shiftedYMax,
										axisLine: {
											show: true,
											lineStyle: {
												color: gridLineColor,
											},
										},
										axisLabel: {
											color: axisTextColor,
										},
										splitLine: {
											show: true,
											lineStyle: {
												color: yAxisSplitLineColor,
												type: "dashed",
											},
										},
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
															id: `forecast-boundary-${boundaryIndex}`,
															shape: {
																x1: xMid,
																y1: params.coordSys.y,
																x2: xMid,
																y2: params.coordSys.y + params.coordSys.height,
															},
															enterFrom: {
																shape: {
																	x1: xMid,
																	y1: params.coordSys.y + params.coordSys.height,
																	x2: xMid,
																	y2: params.coordSys.y + params.coordSys.height,
																},
																style: {
																	opacity: 0,
																},
															},
															transition: ["shape", "style"],
															style: {
																stroke: forecastBoundaryStroke,
																lineWidth: 3,
																lineDash: [6, 4],
																opacity: 1,
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
												const categoryIndex = rowData.value;
												const xCenter = api.coord([categoryIndex, 0])[0];
												const bandWidth = api.size([1, 0])[0] * 0.72;
												const left = xCenter - bandWidth / 2;
												const coord = (value) => api.coord([categoryIndex, value])[1];
												const segmentRect = (segment, topValue, bottomValue) => {
													const topY = coord(topValue);
													const bottomY = coord(bottomValue);
													const height = Math.abs(bottomY - topY);
													if (height <= 0) {
														return null;
													}
													const rect = echarts.graphic.clipRectByRect(
														{
															x: left,
															y: Math.min(topY, bottomY),
															width: bandWidth,
															height,
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
													const segmentCursor = rowData.isForecast ? "default" : "pointer";
													return {
														type: "rect",
														cursor: segmentCursor,
														id: `${rowData.category}-${segment}-rect`,
														name: segment,
														info: { segment },
														emphasis: {
															style: {
																cursor: segmentCursor,
															},
														},
														enterFrom: {
															shape: {
																x: rect.x,
																y: rect.y + rect.height,
																width: rect.width,
																height: 0,
															},
															style: {
																opacity: 0,
															},
														},
														transition: ["shape", "style"],
														style: {
															fill: segmentColors[segment],
															fillOpacity: rowData.isForecast ? forecastFillOpacity : 1,
															opacity: 1,
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
														id: `${rowData.category}-${segment}-text`,
														silent: true,
														enterFrom: {
															style: {
																x: xCenter,
																y: Math.min(topY, bottomY) + height / 2 + 8,
																opacity: 0,
															},
														},
														transition: ["style"],
														style: {
															x: xCenter,
															y: Math.min(topY, bottomY) + height / 2,
															text: segmentLabel(segment, rawValue),
															textAlign: "center",
															textVerticalAlign: "middle",
															fill: labelPalette[segment],
															fontSize: 12,
															fontWeight: 600,
															opacity: 1,
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
													cursor: rowData.isForecast ? "default" : "pointer",
													children,
												};
											},
										},
									],
								},
								true
							);
							chart.off("mousemove");
							chart.on("mousemove", function (params) {
								const segment = params.info && params.info.segment;
								if (!segment || params.dataIndex === undefined) {
									chart.getZr().setCursorStyle("default");
									return;
								}
								const rowData =
									params.data || waterfallData[params.dataIndex];
								chart
									.getZr()
									.setCursorStyle(rowData && !rowData.isForecast ? "pointer" : "default");
							});
							chart.getZr().off("globalout");
							chart.getZr().on("globalout", function () {
								chart.getZr().setCursorStyle("default");
							});
							chart.off("click");
							chart.on("click", function (params) {
								const segment = params.info && params.info.segment;
								if (!segment || params.dataIndex === undefined) {
									return;
								}
								const rowData =
									params.data || waterfallData[params.dataIndex];
								if (rowData && rowData.isForecast) {
									return;
								}
								const bucketIndex =
									rowData && rowData.value !== undefined && rowData.value !== null
										? rowData.value
										: params.dataIndex;
								const docNames =
									((d.task_filters || {})[segment] || [])[bucketIndex] || [];
								if (!docNames.length) {
									return;
								}
								frappe.route_options = {
									project: ["=", filters.project],
									name: ["in", docNames],
								};
								const measureKey = (filters.measure || "hours").toLowerCase();
								if (
									measureKey === "hours" &&
									(segment === "completed" || segment === "created_completed")
								) {
									frappe.set_route("List", "User Timesheet Position");
									return;
								}
								frappe.set_route("List", "Task");
							});
						},
					});
				}
			);
		}

		bindFilterAutoRefresh();
		window.__task_epic_burndown_render = renderBurndown;
		window.__task_epic_burndown_schedule = scheduleRender;

		function ensureBurndownThemeObserver() {
			if (typeof MutationObserver === "undefined" || window.__task_epic_burndown_theme_observed) {
				return;
			}
			window.__task_epic_burndown_theme_observed = true;
			const root = document.documentElement;
			if (!root) {
				return;
			}
			let theme = root.getAttribute("data-theme");
			const observer = new MutationObserver(function () {
				const next = root.getAttribute("data-theme");
				if (next === theme) {
					return;
				}
				theme = next;
				const qr = frappe.query_report;
				if (!qr || typeof qr.get_filter_values !== "function") {
					return;
				}
				const fv = qr.get_filter_values();
				if (!fv || !fv.project) {
					return;
				}
				if (typeof window.__task_epic_burndown_schedule === "function") {
					window.__task_epic_burndown_schedule(0);
				}
			});
			observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
		}

		ensureBurndownThemeObserver();

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
