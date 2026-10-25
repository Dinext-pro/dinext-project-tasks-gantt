const { execFileSync } = require("node:child_process");
const path = require("node:path");

module.exports = {
	defaultCommandTimeout: 120000,
	pageLoadTimeout: 120000,
	requestTimeout: 180000,
	video: false,
	viewportHeight: 960,
	viewportWidth: 1400,
	retries: {
		runMode: 0,
		openMode: 0,
	},
	e2e: {
		setupNodeEvents(on, config) {
			on("task", {
				criticalPathFixture(action) {
					if (!["seed_critical_path", "cleanup_critical_path"].includes(action)) {
						throw new Error(`Unknown critical-path fixture action: ${action}`);
					}
					const output = execFileSync(
						config.env.benchCommand || "bench",
						[
							"--site",
							config.env.site || "localhost",
							"execute",
							`dinext_project_tasks_gantt.tests.ui_test_helpers.${action}`,
						],
						{
							cwd: config.env.benchPath || path.resolve(__dirname, "../.."),
							encoding: "utf8",
							timeout: 180000,
						}
					);
					const result = output.trim().split("\n").filter((line) => line.startsWith("{")).pop();
					if (!result) throw new Error(`Fixture returned no JSON: ${output}`);
					return JSON.parse(result);
				},
			});
			return config;
		},
		baseUrl: "http://127.0.0.1:8000",
		specPattern: "cypress/integration/**/*.js",
		supportFile: "cypress/support/e2e.js",
		includeShadowDom: true,
		testIsolation: false,
	},
};
