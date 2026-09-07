/**
 * Deleted-id tombstones — overlap reload / expand must not restore rows.
 *
 * Run (node >= 18):
 *   node --test apps/dinext_project_tasks_gantt/tests/test_removed.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const vm = require("node:vm");

const REMOVED_PATH = path.resolve(
	__dirname,
	"../dinext_project_tasks_gantt/public/js/task_tree_gantt/table/removed.js"
);

function loadRemoved() {
	const src = fs.readFileSync(REMOVED_PATH, "utf8").replace(/^export /gm, "");
	const ctx = {};
	vm.runInNewContext(
		`${src}
		Object.assign(this, {
			rememberRemovedIds,
			forgetRemovedIds,
			clearRemovedIds,
			getRemovedIdList,
			filterRemovedRows,
			stripRemovedTree,
			installRemovedIdFilter,
			dropRemovedTasks,
		});`,
		ctx
	);
	return ctx;
}

test("remember / forget / clear", () => {
	const api = loadRemoved();
	api.rememberRemovedIds(["a", "b"]);
	assert.equal(api.getRemovedIdList().sort().join(), "a,b");
	api.forgetRemovedIds(["a"]);
	assert.equal(api.getRemovedIdList().join(), "b");
	api.clearRemovedIds();
	assert.equal(api.getRemovedIdList().length, 0);
});

test("filterRemovedRows keeps new children, drops tombstones", () => {
	const api = loadRemoved();
	api.rememberRemovedIds(["gone"]);
	const rows = [{ id: "gone" }, { id: "new" }];
	assert.equal(
		api.filterRemovedRows(rows).map((r) => r.id).join(),
		"new"
	);
});

test("stripRemovedTree drops nested tombstone", () => {
	const api = loadRemoved();
	api.rememberRemovedIds(["c1"]);
	const tree = [
		{
			id: "r1",
			children: [{ id: "c1" }, { id: "c2" }],
		},
	];
	const out = api.stripRemovedTree(tree);
	assert.equal(out[0].id, "r1");
	assert.equal(out[0].children.map((c) => c.id).join(), "c2");
});

test("dropRemovedTasks removes nested row from source and grid", () => {
	const api = loadRemoved();
	const gone = { id: "c1", subject: "gone" };
	const keep = { id: "c2", subject: "keep" };
	const root = { id: "r1", hasChildren: true, children: [gone, keep] };
	const removed = [];
	const nodes = [
		{ data: { id: "r1", _rowId: "r1" } },
		{ data: { id: "c1", _rowId: "r1:c1" } },
		{ data: { id: "c2", _rowId: "r1:c2" } },
	];
	const table = {
		sourceData: [root],
		options: { data: [root] },
		expandedIds: new Set(["r1"]),
		pruneSortBaseline() {},
		syncRowDataFromGrid() {},
		refreshAllTreeToggles() {},
		api: {
			forEachNode(fn) {
				nodes.forEach(fn);
			},
			applyTransaction({ remove }) {
				removed.push(...remove.map((r) => r.id));
			},
		},
	};
	api.dropRemovedTasks(table, ["c1"]);
	assert.equal(table.sourceData[0].children.map((c) => c.id).join(), "c2");
	assert.equal(removed.join(), "c1");
	assert.equal(table.expandedIds.has("r1"), true);
});

test("installRemovedIdFilter strips setRowChildren payload", () => {
	const api = loadRemoved();
	api.rememberRemovedIds(["c1"]);
	const calls = [];
	const table = {
		setRowChildren(rowId, children) {
			calls.push({ rowId, ids: children.map((c) => c.id) });
		},
	};
	api.installRemovedIdFilter(table);
	table.setRowChildren("r1", [{ id: "c1" }, { id: "c2" }]);
	assert.deepEqual(calls[0].ids, ["c2"]);
});
