/**
 * applyTreeMerge removeIds — shallow reload must drop deleted children.
 *
 * Run (node >= 18):
 *   node --test apps/dinext_project_tasks_gantt/tests/test_tree_merge.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const vm = require("node:vm");

const MERGE_PATH = path.resolve(
	__dirname,
	"../dinext_project_tasks_gantt/public/js/task_tree_gantt/table/merge.js"
);

function loadMerge() {
	const src = fs.readFileSync(MERGE_PATH, "utf8").replace(/^export /gm, "");
	const ctx = {};
	vm.runInNewContext(`${src}\nthis.applyTreeMerge = applyTreeMerge;`, ctx);
	return ctx;
}

function fakeTable(roots) {
	const table = {
		sourceData: roots,
		options: { data: roots },
		expandedIds: new Set(roots.filter((r) => r.children?.length).map((r) => r.id)),
		childOps: [],
		applyExternalCellValues() {},
		findTreeSourceRow(rowId) {
			const id = String(rowId).split(":").pop();
			const walk = (list) => {
				for (const row of list || []) {
					if (String(row.id) === id) {
						return row;
					}
					const found = walk(row.children);
					if (found) {
						return found;
					}
				}
				return null;
			};
			return walk(table.sourceData);
		},
		setRowChildren(rowId, children) {
			table.childOps.push({
				rowId,
				ids: children.map((c) => c.id),
			});
			const parent = table.findTreeSourceRow(rowId);
			if (parent) {
				parent.children = children;
			}
		},
		pruneSortBaseline() {},
		api: {
			refreshCells() {},
			forEachNode() {},
			applyTransaction() {},
		},
	};
	return table;
}

test("shallow merge without removeIds keeps existing child", () => {
	const { applyTreeMerge } = loadMerge();
	const child = { id: "c1", subject: "gone" };
	const root = { id: "r1", subject: "root", hasChildren: true, children: [child] };
	const table = fakeTable([root]);
	applyTreeMerge(table, [{ id: "r1", subject: "root", hasChildren: true }], {
		deep: false,
	});
	assert.equal(root.children[0].id, "c1");
	assert.equal(table.childOps.length, 0);
});

test("shallow merge with removeIds drops nested task via setRowChildren", () => {
	const { applyTreeMerge } = loadMerge();
	const gone = { id: "c1", subject: "gone" };
	const keep = { id: "c2", subject: "keep" };
	const root = {
		id: "r1",
		subject: "root",
		hasChildren: true,
		children: [gone, keep],
	};
	const table = fakeTable([root]);
	applyTreeMerge(table, [{ id: "r1", subject: "root", hasChildren: true }], {
		deep: false,
		removeIds: ["c1"],
	});
	assert.equal(root.children.length, 1);
	assert.equal(root.children[0].id, "c2");
	assert.equal(table.childOps.length, 1);
	assert.equal(table.childOps[0].rowId, "r1");
	assert.equal(table.childOps[0].ids.join(), "c2");
	assert.equal(root.hasChildren, true);
});

test("removeIds last child clears hasChildren and expand", () => {
	const { applyTreeMerge } = loadMerge();
	const child = { id: "c1", subject: "gone" };
	const root = { id: "r1", subject: "root", hasChildren: true, children: [child] };
	const table = fakeTable([root]);
	applyTreeMerge(table, [{ id: "r1", subject: "root", hasChildren: false }], {
		deep: false,
		removeIds: ["c1"],
	});
	assert.equal(root.children.length, 0);
	assert.equal(root.hasChildren, false);
	assert.equal(table.expandedIds.has("r1"), false);
});
