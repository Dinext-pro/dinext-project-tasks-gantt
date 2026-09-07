/**
 * Unit tests for public/js/task_tree_gantt/table/completed_on.js
 * and its order vs missingMandatoryLabels (status → Completed).
 *
 * Run (node >= 18):
 *   node --test apps/dinext_project_tasks_gantt/tests/test_completed_on.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const vm = require("node:vm");

const TABLE_DIR = path.resolve(
	__dirname,
	"../dinext_project_tasks_gantt/public/js/task_tree_gantt/table"
);

function loadCompletedOn() {
	const src = fs
		.readFileSync(path.join(TABLE_DIR, "completed_on.js"), "utf8")
		.replace(/^export /gm, "");
	const ctx = {};
	vm.runInNewContext(`${src}\nthis.resolveCompletedOn = resolveCompletedOn;\nthis.applyCompletedOnSideEffects = applyCompletedOnSideEffects;`, ctx);
	return ctx;
}

const TODAY = "2026-09-03";

test("resolveCompletedOn: empty + no act_end → today", () => {
	const { resolveCompletedOn } = loadCompletedOn();
	assert.equal(resolveCompletedOn(null, null, TODAY), TODAY);
	assert.equal(resolveCompletedOn("", "", TODAY), TODAY);
});

test("resolveCompletedOn: empty + past act_end → act_end", () => {
	const { resolveCompletedOn } = loadCompletedOn();
	assert.equal(resolveCompletedOn("2026-08-01", null, TODAY), "2026-08-01");
});

test("resolveCompletedOn: empty + future act_end → today", () => {
	const { resolveCompletedOn } = loadCompletedOn();
	assert.equal(resolveCompletedOn("2026-09-10", null, TODAY), TODAY);
});

test("resolveCompletedOn: existing completed_on kept unless act_end later or future", () => {
	const { resolveCompletedOn } = loadCompletedOn();
	assert.equal(resolveCompletedOn(null, "2026-07-01", TODAY), "2026-07-01");
	assert.equal(resolveCompletedOn("2026-08-01", "2026-07-01", TODAY), "2026-08-01");
	assert.equal(resolveCompletedOn("2026-09-10", "2026-09-20", TODAY), TODAY);
});

test("applyCompletedOnSideEffects: injects completed_on before mandatory sees empty", () => {
	const { applyCompletedOnSideEffects } = loadCompletedOn();
	const row = {
		id: "TASK-1",
		status: "Open",
		act_end_date: "2026-08-01",
		completed_on: null,
		_doc: { status: "Open", act_end_date: "2026-08-01", completed_on: null },
	};
	const changes = [{ field: "status", newValue: "Completed", oldValue: "Open", row, rowId: "TASK-1" }];
	const injected = applyCompletedOnSideEffects(changes, {
		today: TODAY,
		getDoc: (r) => ({ ...r._doc, ...r }),
	});
	assert.equal(injected.length, 1);
	assert.equal(injected[0].field, "completed_on");
	assert.equal(injected[0].newValue, "2026-08-01");
	assert.equal(changes.length, 2);
	assert.equal(changes[1].newValue, "2026-08-01");
});

test("applyCompletedOnSideEffects: no act_end → today; skip if already set", () => {
	const { applyCompletedOnSideEffects } = loadCompletedOn();
	const empty = { id: "T1", status: "Open", act_end_date: null, completed_on: null };
	const filled = { id: "T2", status: "Open", act_end_date: "2026-08-01", completed_on: "2026-07-01" };
	const a = [{ field: "status", newValue: "Completed", row: empty }];
	applyCompletedOnSideEffects(a, { today: TODAY, getDoc: (r) => r });
	assert.equal(a[1].newValue, TODAY);

	const b = [{ field: "status", newValue: "Completed", row: filled }];
	const injected = applyCompletedOnSideEffects(b, { today: TODAY, getDoc: (r) => r });
	assert.equal(injected.length, 0);
	assert.equal(b.length, 1);
});

test("applyCompletedOnSideEffects: leaving Completed does not clear", () => {
	const { applyCompletedOnSideEffects } = loadCompletedOn();
	const row = { id: "T1", status: "Completed", completed_on: "2026-08-01" };
	const changes = [{ field: "status", newValue: "Open", oldValue: "Completed", row }];
	const injected = applyCompletedOnSideEffects(changes, { today: TODAY, getDoc: (r) => r });
	assert.equal(injected.length, 0);
	assert.equal(changes.length, 1);
});

test("mandatory order: fill then missingMandatoryLabels skips completed_on, still reports other empties", () => {
	const { applyCompletedOnSideEffects } = loadCompletedOn();
	function isEmpty(v) {
		return v == null || String(v).trim() === "";
	}
	function missing(doc) {
		const out = [];
		if (doc.status === "Completed" && isEmpty(doc.completed_on)) out.push("completed_on");
		if (doc.status === "Completed" && isEmpty(doc.issue)) out.push("issue");
		return out;
	}
	const row = {
		status: "Open",
		act_end_date: "2026-08-01",
		completed_on: null,
		issue: null,
	};
	const changes = [{ field: "status", newValue: "Completed", row }];
	const before = { ...row, status: "Completed" };
	assert.deepEqual(missing(before), ["completed_on", "issue"]);
	applyCompletedOnSideEffects(changes, { today: TODAY, getDoc: (r) => r });
	const after = { ...row, status: "Completed" };
	for (const c of changes) after[c.field] = c.newValue;
	assert.deepEqual(missing(after), ["issue"]);
	assert.equal(after.completed_on, "2026-08-01");
});
