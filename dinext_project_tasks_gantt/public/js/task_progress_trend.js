// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

(function () {
	const ECHARTS_ASSET = "/assets/dinext_common/js/echarts.min.js";
	const WIDGET_ID = "task-progress-trend-widget";
	const PERIODS = ["day", "week", "month"];
	const PROGRESS_COLORS = {
		actual: "#1b3bff",
		planned: "#c482f7",
		forecast: "#919ff5",
	};
	const MUTED_BAR_COLORS = ["#6f8fa8", "#9aa879", "#c49a6c", "#a8798f", "#7d8b91", "#9b8db5"];

	frappe.ui.form.on("Task", {
		refresh(frm) {
			render_task_progress_trend(frm);
		},
	});

	function render_task_progress_trend(frm) {
		if (!frm.doc || frm.doc.__islocal || is_milestone(frm.doc)) {
			remove_widget(frm);
			return;
		}

		const wrapper = ensure_widget(frm);
		if (!wrapper.length) {
			return;
		}
		const period = wrapper.data("period") || "day";
		load_chart(frm, wrapper, period);
	}

	function is_milestone(doc) {
		return is_checked(doc.is_milestone) || doc.type === "Milestone" || doc.type === __("Milestone");
	}

	function is_checked(value) {
		return value === true || value === 1 || value === "1";
	}

	function ensure_widget(frm) {
		let wrapper = frm.$wrapper.find(`#${WIDGET_ID}`);
		if (wrapper.length) {
			return wrapper;
		}

		if (!frm.dashboard || !frm.dashboard.add_section) {
			return $();
		}

		const dashboard_body = frm.dashboard.add_section("", null, "task-progress-trend-section");
		wrapper = $(`
			<section id="${WIDGET_ID}" class="task-progress-trend-widget">
				<div class="task-progress-trend-header">
					<div>
						<!--<div class="task-progress-trend-title">${__("Progress Trend")}</div>-->
						<div class="task-progress-trend-subtitle">${__("Progress, forecast, and approved hours")}</div>
					</div>
					<div class="task-progress-trend-periods" role="group" aria-label="${__("Chart period")}"></div>
				</div>
				<div class="task-progress-trend-state text-muted">${__("Loading chart...")}</div>
				<div class="task-progress-trend-chart"></div>
			</section>
		`);

		PERIODS.forEach((period) => {
			const button = $(`<button type="button" class="btn btn-xs btn-default"></button>`);
			button.text(__(period_label(period)));
			button.attr("data-period", period);
			button.on("click", () => {
				wrapper.data("period", period);
				load_chart(frm, wrapper, period);
			});
			wrapper.find(".task-progress-trend-periods").append(button);
		});

		dashboard_body.append(wrapper);
		wrapper.data("period", "day");
		return wrapper;
	}

	function period_label(period) {
		if (period === "day") {
			return "Day";
		}
		if (period === "week") {
			return "Week";
		}
		return "Month";
	}

	function remove_widget(frm) {
		const wrapper = frm.$wrapper.find(`#${WIDGET_ID}`);
		const chart = wrapper.data("chart");
		if (chart) {
			chart.dispose();
		}
		const observer = wrapper.data("theme-observer");
		if (observer) {
			observer.disconnect();
		}
		wrapper.remove();
	}

	function load_chart(frm, wrapper, period) {
		set_active_period(wrapper, period);
		set_state(wrapper, __("Loading chart..."));
		frappe.require([ECHARTS_ASSET], () => {
			frappe.call({
				method: "dinext_project_tasks_gantt.burndown.get_task_progress_trend",
				args: {
					task: frm.doc.name,
					group_by: period,
				},
				callback(r) {
					if (r.exc || !r.message) {
						set_state(wrapper, __("Unable to load progress trend"));
						return;
					}
					wrapper.data("last-chart-data", r.message);
					draw_chart(wrapper, r.message);
				},
				error() {
					set_state(wrapper, __("Unable to load progress trend"));
				},
			});
		});
	}

	function set_active_period(wrapper, period) {
		wrapper.find("[data-period]").each(function () {
			const button = $(this);
			button.toggleClass("btn-primary", button.attr("data-period") === period);
			button.toggleClass("btn-default", button.attr("data-period") !== period);
		});
	}

	function set_state(wrapper, message) {
		wrapper.find(".task-progress-trend-state").text(message).toggle(Boolean(message));
	}

	function draw_chart(wrapper, data) {
		const categories = data.categories || [];
		if (!categories.length) {
			set_state(wrapper, __("No progress data to display"));
			return;
		}

		set_state(wrapper, "");
		wrapper.data("last-chart-data", data);
		const dom = wrapper.find(".task-progress-trend-chart").get(0);
		let chart = wrapper.data("chart");
		if (!chart) {
			chart = echarts.init(dom, null, { renderer: "canvas" });
			wrapper.data("chart", chart);
			$(window)
				.off("resize.task_progress_trend")
				.on("resize.task_progress_trend", () => chart.resize());
			watch_theme_changes(wrapper);
		}

		const theme = chart_theme_palette();
		const progress = normalize_progress_series(data.progress || {});
		const forecastCategories = progress.forecast_categories || categories;
		const allCategories = forecastCategories.length > categories.length ? forecastCategories : categories;
		const timesheetLimits = data.timesheet_limits || {};
		const limitMarkArea = timesheet_limit_mark_area(timesheetLimits, theme);
		const hoursRows = data.hours_by_role || [];
		const hoursOffset = staircase_hours_offset(hoursRows, allCategories.length);
		const roleSeries = hoursRows.map((row, index) => ({
			name: row.role,
			type: "bar",
			stack: "hours",
			yAxisIndex: 1,
			barWidth: "100%",
			barGap: "-100%",
			barCategoryGap: "0%",
			data: pad(row.values || [], allCategories.length, 0),
			itemStyle: { color: MUTED_BAR_COLORS[index % MUTED_BAR_COLORS.length] },
			emphasis: { focus: "series" },
		}));

		chart.setOption(
			{
				backgroundColor: "transparent",
				tooltip: {
					trigger: "axis",
					backgroundColor: theme.tooltipBackground,
					borderColor: theme.axisLine,
					textStyle: { color: theme.tooltipText },
					axisPointer: {
						type: "cross",
						label: { color: theme.axisPointerLabelText, backgroundColor: theme.axisPointerLabelBackground },
					},
				},
				legend: [
					{
						type: "scroll",
						top: 0,
						textStyle: { color: theme.text },
						data: [__("Actual progress"), __("Planned progress"), __("Forecast progress")],
					},
					{
						type: "scroll",
						bottom: 0,
						textStyle: { color: theme.text },
						data: roleSeries.map((row) => row.name),
					},
				],
				grid: { left: 48, right: 48, top: 54, bottom: 76 },
				xAxis: {
					type: "category",
					data: allCategories,
					axisLabel: { rotate: allCategories.length > 8 ? 35 : 0, color: theme.textMuted },
					axisLine: { lineStyle: { color: theme.axisLine } },
					axisTick: { lineStyle: { color: theme.axisLine } },
				},
				yAxis: [
					{
						type: "value",
						name: __("Progress, %"),
						min: 0,
						max: 100,
						nameTextStyle: { color: theme.text },
						axisLabel: { color: theme.textMuted },
						axisLine: { lineStyle: { color: theme.axisLine } },
						splitLine: { lineStyle: { color: theme.splitLine } },
					},
					{
						type: "value",
						name: __("Work hours"),
						min: 0,
						max: timesheetLimits.axis_max || null,
						nameTextStyle: { color: theme.text },
						axisLabel: { color: theme.textMuted },
						axisLine: { lineStyle: { color: theme.axisLine } },
						splitLine: { show: false },
					},
				],
				series: [
					...(limitMarkArea
						? [
								{
									name: __("Timesheet limits"),
									type: "line",
									yAxisIndex: 1,
									data: pad([], allCategories.length, null),
									silent: true,
									symbol: "none",
									lineStyle: { opacity: 0 },
									tooltip: { show: false },
									markArea: limitMarkArea,
								},
							]
						: []),
					...(hoursOffset.some((value) => value > 0)
						? [
								{
									name: "__hours_offset",
									type: "bar",
									stack: "hours",
									yAxisIndex: 1,
									barWidth: "100%",
									barGap: "-100%",
									barCategoryGap: "0%",
									data: hoursOffset,
									silent: true,
									itemStyle: { color: "rgba(0, 0, 0, 0)" },
									emphasis: { disabled: true },
									tooltip: { show: false },
								},
							]
						: []),
					...roleSeries,
					{
						name: progress.actual.label,
						type: "line",
						yAxisIndex: 0,
						smooth: true,
						symbol: "circle",
						symbolSize: 8,
						itemStyle: { color: PROGRESS_COLORS.actual, borderColor: PROGRESS_COLORS.actual },
						lineStyle: { color: PROGRESS_COLORS.actual, type: "solid", width: 4 },
						data: pad(progress.actual.values || [], allCategories.length, null),
						markLine: marker_lines(data.date_markers || [], theme),
					},
					{
						name: progress.planned.label,
						type: "line",
						yAxisIndex: 0,
						smooth: true,
						symbol: null,
						symbolSize: 0,
						itemStyle: { color: PROGRESS_COLORS.planned, borderColor: PROGRESS_COLORS.planned },
						lineStyle: { color: PROGRESS_COLORS.planned, type: progress.planned.line_style },
						data: pad(progress.planned.values || [], allCategories.length, null),
					},
					{
						name: progress.forecast.label,
						type: "line",
						yAxisIndex: 0,
						smooth: true,
						symbol: null,
						symbolSize: 0,
						itemStyle: { color: PROGRESS_COLORS.forecast, borderColor: PROGRESS_COLORS.forecast },
						lineStyle: { color: PROGRESS_COLORS.forecast, type: progress.forecast.line_style },
						data: progress.forecast.values && progress.forecast.values.length ? progress.forecast.values : [],
					},
				],
			},
			true
		);
	}

	function normalize_progress_series(progress) {
		const series = progress.series || [];
		const byId = {};
		series.forEach((row) => {
			byId[row.id] = row;
		});
		return {
			actual: byId.actual_progress || {
				label: __("Actual progress"),
				line_style: "solid",
				values: progress.factual || [],
			},
			planned: byId.planned_progress || {
				label: __("Planned progress"),
				line_style: "dashed",
				values: progress.planned || [],
			},
			forecast: byId.forecast_progress || {
				label: __("Forecast progress"),
				line_style: "dotted",
				values: progress.forecast || [],
			},
			forecast_categories:
				(byId.forecast_progress && byId.forecast_progress.categories) ||
				progress.forecast_categories ||
				[],
		};
	}

	function marker_lines(markers, theme) {
		const filtered = markers.filter((marker) => marker.bucket_label);
		const byBucket = new Map();
		for (const marker of filtered) {
			const key = marker.bucket_label;
			if (!byBucket.has(key)) {
				byBucket.set(key, []);
			}
			byBucket.get(key).push(marker);
		}
		const data = [];
		for (const [bucketLabel, group] of byBucket) {
			const labels = [];
			const seen = new Set();
			for (const m of group) {
				const text = m.label != null ? String(m.label) : "";
				if (text && !seen.has(text)) {
					seen.add(text);
					labels.push(text);
				}
			}
			const combined = labels.length ? labels.join(", ") : String(bucketLabel);
			data.push({
				name: combined,
				xAxis: bucketLabel,
				label: { formatter: combined, color: theme.text, fontSize: 10 },
				lineStyle: { color: theme.markerLine },
			});
		}
		return data.length
			? { symbol: "none", label: { position: "middle", rotate: 90, fontSize: 10 }, data }
			: undefined;
	}

	function watch_theme_changes(wrapper) {
		if (wrapper.data("theme-observer")) {
			return;
		}
		const redraw = frappe.utils.debounce
			? frappe.utils.debounce(() => redraw_last_chart(wrapper), 150)
			: () => redraw_last_chart(wrapper);
		if (frappe.ui && frappe.ui.theme && frappe.ui.theme.on) {
			frappe.ui.theme.on("change", redraw);
		}
		const observer = new MutationObserver(redraw);
		[document.documentElement, document.body].forEach((node) => {
			if (node) {
				observer.observe(node, { attributes: true, attributeFilter: ["class", "data-theme", "data-theme-mode"] });
			}
		});
		wrapper.data("theme-observer", observer);
	}

	function redraw_last_chart(wrapper) {
		const data = wrapper.data("last-chart-data");
		if (data && wrapper.closest("body").length) {
			draw_chart(wrapper, data);
		}
	}

	function chart_theme_palette() {
		const styles = getComputedStyle(document.documentElement);
		const isDark = is_dark_theme();
		const tooltipBackground = isDark ? "rgba(24, 28, 36, 0.96)" : "rgba(255, 255, 255, 0.96)";
		const tooltipText = isDark ? "#f9fafb" : "#1f2937";
		return {
			text: css_var(styles, "--text-color", isDark ? "#e5e7eb" : "#1f2937"),
			textMuted: css_var(styles, "--text-muted", isDark ? "#a3aab8" : "#6b7280"),
			axisLine: css_var(styles, "--border-color", isDark ? "#3f4653" : "#d9dee7"),
			splitLine: isDark ? "rgba(229, 231, 235, 0.12)" : "rgba(31, 41, 55, 0.10)",
			markerLine: isDark ? "rgba(229, 231, 235, 0.52)" : "rgba(31, 41, 55, 0.42)",
			tooltipBackground,
			tooltipText,
			axisPointerLabelText: tooltipText,
			axisPointerLabelBackground: tooltipBackground,
			limitArea: {
				green: isDark ? "rgba(76, 175, 80, 0.16)" : "rgba(76, 175, 80, 0.10)",
				yellow: isDark ? "rgba(255, 193, 7, 0.18)" : "rgba(255, 193, 7, 0.14)",
				red: isDark ? "rgba(244, 67, 54, 0.18)" : "rgba(244, 67, 54, 0.12)",
			},
		};
	}

	function is_dark_theme() {
		const candidates = [
			document.documentElement.getAttribute("data-theme"),
			document.documentElement.getAttribute("data-theme-mode"),
			document.body && document.body.getAttribute("data-theme"),
			document.body && document.body.getAttribute("data-theme-mode"),
			frappe.boot && frappe.boot.user && frappe.boot.user.desk_theme,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		return (
			candidates.includes("dark") ||
			document.documentElement.classList.contains("dark") ||
			(document.body && document.body.classList.contains("dark"))
		);
	}

	function css_var(styles, name, fallback) {
		return (styles.getPropertyValue(name) || "").trim() || fallback;
	}

	function staircase_hours_offset(rows, length) {
		const offsets = [];
		let cumulative = 0;
		for (let index = 0; index < length; index++) {
			offsets.push(cumulative);
			cumulative += rows.reduce((total, row) => total + flt((row.values || [])[index]), 0);
		}
		return offsets;
	}

	function timesheet_limit_mark_area(timesheetLimits, theme) {
		const bands = timesheetLimits.bands || [];
		if (!bands.length) {
			return undefined;
		}
		return {
			silent: true,
			label: { show: false },
			data: bands.map((band) => [
				{
					yAxis: band.from,
					itemStyle: { color: theme.limitArea[band.color] || theme.limitArea.green },
				},
				{ yAxis: band.to },
			]),
		};
	}

	function pad(values, length, fallback) {
		const out = values.slice();
		while (out.length < length) {
			out.push(fallback);
		}
		return out;
	}

	function flt(value) {
		const number = Number(value);
		return Number.isFinite(number) ? number : 0;
	}

})();
