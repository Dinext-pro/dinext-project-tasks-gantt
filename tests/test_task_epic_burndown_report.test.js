const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const BURNDOWN_SCRIPT_PATH =
	"/home/frappe/frappe-bench/apps/dinext_project_tasks_gantt/dinext_project_tasks_gantt/dinext_project_tasks_gantt/report/task_epic_burndown/task_epic_burndown.js";
const ROADMAP_SCRIPT_PATH =
	"/home/frappe/frappe-bench/apps/dinext_project_stage_gate/dinext_project_stage_gate/dinext_project_stage_gate/report/project_stage_gate_roadmap/project_stage_gate_roadmap.js";

function createMainMock(state) {
	const store = {
		".task-epic-burndown-chart-root": [{}],
		".task-epic-burndown-chart": [{}],
		".task-epic-burndown-summary": [{}],
	};

	function findSingle(selector) {
		const items = store[selector] || [];
		return {
			length: items.length,
			each(callback) {
				items.forEach((item, index) => {
					callback.call(item, index);
				});
				return this;
			},
			remove() {
				if (items.length) {
					state.removed.push(selector);
				}
				store[selector] = [];
				return this;
			},
		};
	}

	return {
		find(selector) {
			if (typeof selector === "string" && selector.includes(",")) {
				const parts = selector.split(",").map((part) => part.trim());
				return {
					length: parts.some((part) => (store[part] || []).length > 0) ? 1 : 0,
					remove() {
						parts.forEach((part) => {
							findSingle(part).remove();
						});
						return this;
					},
				};
			}
			return findSingle(selector);
		},
	};
}

function loadBurndownScript() {
	const script = fs.readFileSync(BURNDOWN_SCRIPT_PATH, "utf8");
	const state = {
		removed: [],
		scheduleCalls: 0,
		destroyCalls: 0,
	};

	const context = {
		__(value) {
			return value;
		},
		console,
		document: {
			createElement() {
				return {
					getContext() {
						return {
							font: "",
							measureText(text) {
								return { width: text.length * 6 };
							},
						};
					},
				};
			},
			documentElement: {
				getAttribute() {
					return null;
				},
			},
			head: {
				appendChild() {},
			},
		},
		window: {
			__task_epic_burndown_schedule() {
				state.scheduleCalls += 1;
			},
			__task_epic_burndown_destroy() {
				state.destroyCalls += 1;
			},
			echarts: {
				getInstanceByDom() {
					return {
						dispose() {},
					};
				},
			},
			addEventListener() {},
		},
		getComputedStyle() {
			return {
				getPropertyValue() {
					return "";
				},
			};
		},
		setTimeout(fn) {
			if (typeof fn === "function") {
				fn();
			}
			return 1;
		},
		clearTimeout() {},
		frappe: {
			query_report: null,
			query_reports: {},
			datetime: {
				add_months() {
					return "2026-01-01";
				},
				get_today() {
					return "2026-01-01";
				},
			},
			provide(path) {
				const segments = path.split(".");
				let pointer = context;
				for (const segment of segments) {
					pointer[segment] = pointer[segment] || {};
					pointer = pointer[segment];
				}
			},
			require(_files, callback) {
				if (callback) {
					callback();
				}
				return Promise.resolve();
			},
			utils: {
				escape_html(value) {
					return value;
				},
				report_column_total() {
					return 0;
				},
				throttle(fn) {
					return fn;
				},
			},
			call() {
				return Promise.resolve({ message: [] });
			},
		},
		$() {
			return {
				length: 0,
				find() {
					return { length: 0, empty() {}, append() {}, prepend() {}, insertBefore() {}, off() {}, on() {} };
				},
				empty() {},
				append() {},
				prepend() {},
				insertBefore() {},
				off() {},
				on() {},
				get() {
					return [{ getBoundingClientRect: () => ({ width: 800, height: 460 }) }];
				},
			};
		},
	};

	vm.runInNewContext(script, context);

	return {
		context,
		state,
		reportDef: context.frappe.query_reports["Task Epic Burndown"],
		isBurndownReport: context.task_epic_burndown_is_burndown_report,
		teardownMount: context.task_epic_burndown_teardown_mount,
	};
}

test("teardown_mount removes burndown DOM for non-burndown report", () => {
	const { state, teardownMount } = loadBurndownScript();
	const report = {
		report_name: "Project Stage Gate Roadmap",
		page: { main: createMainMock(state) },
	};

	teardownMount(report);

	assert.deepEqual(state.removed, [".task-epic-burndown-chart", ".task-epic-burndown-summary"]);
	assert.equal(state.destroyCalls, 1);
});

test("refresh wrapper does not set burndown flags for roadmap report", async () => {
	const { state, context } = loadBurndownScript();
	const report = {
		report_name: "Project Stage Gate Roadmap",
		page: { main: createMainMock(state) },
		__task_epic_burndown_refresh_wrapped: false,
		refresh() {
			return Promise.resolve();
		},
	};

	if (!report.__task_epic_burndown_refresh_wrapped) {
		report.__task_epic_burndown_refresh_wrapped = true;
		const originalRefresh = report.refresh.bind(report);
		report.refresh = function (have_filters_changed) {
			if (!context.task_epic_burndown_is_burndown_report(report)) {
				context.task_epic_burndown_teardown_mount(report);
				return originalRefresh.apply(this, arguments);
			}
			report.__task_epic_burndown_force_chart_after_table = have_filters_changed !== true;
			return originalRefresh.apply(this, arguments);
		};
	}

	await report.refresh(true);

	assert.equal(report.__task_epic_burndown_force_chart_after_table, undefined);
	assert.ok(state.removed.includes(".task-epic-burndown-chart"));
});

test("after_datatable_render does not schedule burndown render for roadmap report", () => {
	const { reportDef, state, context } = loadBurndownScript();
	context.frappe.query_report = {
		report_name: "Project Stage Gate Roadmap",
		page: { main: createMainMock(state) },
		data: [{ period: "2026-01" }],
	};

	reportDef.after_datatable_render();

	assert.equal(state.scheduleCalls, 0);
	assert.ok(state.removed.includes(".task-epic-burndown-chart"));
});

test("is_burndown_report identifies only Task Epic Burndown", () => {
	const { isBurndownReport } = loadBurndownScript();

	assert.equal(isBurndownReport({ report_name: "Task Epic Burndown" }), true);
	assert.equal(isBurndownReport({ report_name: "Project Stage Gate Roadmap" }), false);
});

test("burndown script does not declare shared top-level DINEXT_TASK_TYPE_TRANSLATION_CONTEXT", () => {
	const burndownScript = fs.readFileSync(BURNDOWN_SCRIPT_PATH, "utf8");

	assert.doesNotMatch(
		burndownScript,
		/^\s*const\s+DINEXT_TASK_TYPE_TRANSLATION_CONTEXT\s*=/m
	);
	assert.match(
		burndownScript,
		/^\s*const\s+TASK_EPIC_BURNDOWN_TASK_TYPE_TRANSLATION_CONTEXT\s*=/m
	);
});

test("burndown and roadmap scripts can load in the same vm context", () => {
	const roadmapScript = fs.readFileSync(ROADMAP_SCRIPT_PATH, "utf8");
	const burndownScript = fs.readFileSync(BURNDOWN_SCRIPT_PATH, "utf8");
	const context = {
		__(value) {
			return value;
		},
		console,
		document: {
			documentElement: { getAttribute() { return null; } },
			createElement() {
				return { setAttribute() {}, textContent: "", appendChild() {} };
			},
			head: { appendChild() {} },
		},
		window: {
			innerHeight: 1200,
			addEventListener() {},
			removeEventListener() {},
		},
		getComputedStyle() {
			return { getPropertyValue() { return ""; } };
		},
		frappe: {
			query_reports: {},
			datetime: {
				add_months() {
					return "2026-01-01";
				},
				get_today() {
					return "2026-01-01";
				},
			},
			provide(path) {
				const segments = path.split(".");
				let pointer = context;
				for (const segment of segments) {
					pointer[segment] = pointer[segment] || {};
					pointer = pointer[segment];
				}
			},
			model: { can_read() { return true; } },
			set_route() {},
			msgprint() {},
			db: { get_link_options() { return []; } },
			require(_files, callback) {
				if (callback) {
					callback();
				}
			},
		},
		dinext_project_stage_gate: {},
		$: () => ({
			length: 0,
			find() {
				return { length: 0, remove() {} };
			},
		}),
	};

	assert.doesNotThrow(() => {
		vm.runInNewContext(roadmapScript, context);
		vm.runInNewContext(burndownScript, context);
	});
	assert.ok(context.frappe.query_reports["Project Stage Gate Roadmap"]);
	assert.ok(context.frappe.query_reports["Task Epic Burndown"]);
});
