/**
 * Unit tests for dinextApplyFormPolicy in public/js/task_field_rules_form.js.
 *
 * Run (node >= 18):
 *   node --test apps/dinext_project_tasks_gantt/tests/test_form_policy.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FORM_FILE = path.resolve(
	__dirname,
	"../dinext_project_tasks_gantt/public/js/task_field_rules_form.js"
);

function loadPolicy() {
	const src = fs.readFileSync(FORM_FILE, "utf8").replace(/\(function \(\) \{[\s\S]*$/, "");
	const ctx = {};
	vm.runInNewContext(`${src}\nthis.dinextApplyFormPolicy = dinextApplyFormPolicy;`, ctx);
	return ctx.dinextApplyFormPolicy;
}

/** vm context has its own Object prototype — compare by value. */
function sameJson(actual, expected) {
	assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

const apply = loadPolicy();
const select = { fieldtype: "Select" };
const data = { fieldtype: "Data" };

test("null / Write / empty: no props (never read_only/hidden 0, never restore options)", () => {
	sameJson(apply(null, select), {});
	sameJson(apply(undefined, select), {});
	sameJson(apply({ status: "Write" }, select), {});
	sameJson(apply({}, select), {});
});

test("None → hidden 1; Read → read_only 1; never both from one status", () => {
	sameJson(apply({ status: "None" }, data), { hidden: 1 });
	sameJson(apply({ status: "Read" }, data), { read_only: 1 });
});

test("options only for Select; keep status narrowing", () => {
	sameJson(apply({ options: ["Open", "Completed"] }, data), {});
	sameJson(apply({ status: "Read", options: ["Open", "Completed"] }, select), {
		read_only: 1,
		options: "Open\nCompleted",
	});
	sameJson(apply({ options: ["Working"] }, select), { options: "Working" });
});
