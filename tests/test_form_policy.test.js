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
	vm.runInNewContext(
		`${src}
		this.dinextApplyFormPolicy = dinextApplyFormPolicy;
		this.dinextPrepareFormRead = dinextPrepareFormRead;
		this.dinextEnforceFormRead = dinextEnforceFormRead;`,
		ctx
	);
	return ctx;
}

/** vm context has its own Object prototype — compare by value. */
function sameJson(actual, expected) {
	assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

const helpers = loadPolicy();
const apply = helpers.dinextApplyFormPolicy;
const prepare = helpers.dinextPrepareFormRead;
const enforce = helpers.dinextEnforceFormRead;
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

test("Read clears read_only_depends_on on the form df copy", () => {
	const df = { fieldtype: "Check", read_only_depends_on: "eval:doc.is_milestone" };
	const props = prepare(df, apply({ status: "Read" }, df));
	sameJson(props, { read_only: 1 });
	assert.equal(df.read_only_depends_on, "");
});

test("Write / None leave read_only_depends_on alone", () => {
	const df = { fieldtype: "Check", read_only_depends_on: "eval:doc.is_milestone" };
	prepare(df, apply({ status: "Write" }, df));
	assert.equal(df.read_only_depends_on, "eval:doc.is_milestone");
	prepare(df, apply({ status: "None" }, df));
	assert.equal(df.read_only_depends_on, "eval:doc.is_milestone");
});

test("enforce Read: df.read_only 1, Check input disabled, refresh called", () => {
	let refreshed = 0;
	const field = {
		df: { fieldtype: "Check", read_only: 0 },
		$input: { prop(name, value) { this[name] = value; } },
		input: { disabled: false },
		refresh() {
			refreshed += 1;
		},
	};
	enforce(field);
	assert.equal(field.df.read_only, 1);
	assert.equal(field.input.disabled, true);
	assert.equal(field.$input.disabled, true);
	assert.equal(refreshed, 1);
});
