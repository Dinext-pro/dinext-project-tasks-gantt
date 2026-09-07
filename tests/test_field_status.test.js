/**
 * Unit tests for public/js/task_tree_gantt/table/field_status.js and field_rules.js.
 *
 * Run (node >= 18, anywhere):
 *   node --test apps/dinext_project_tasks_gantt/tests/test_field_status.test.js
 *
 * The ES modules are loaded through `vm` (imports/exports stripped, sources
 * concatenated). `createFieldStatusCore` is exercised with injected deps; the
 * frappe-bound exports with a small `frappe` stub.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const TABLE_DIR = path.resolve(__dirname, "../dinext_project_tasks_gantt/public/js/task_tree_gantt/table");
const SOURCES = [path.join(TABLE_DIR, "field_rules.js"), path.join(TABLE_DIR, "field_status.js")];

/* ----------------------------------------------------------- frappe pieces */

function frappeEval(code, context = {}) {
	// frappe.utils.eval verbatim (frappe/public/js/frappe/utils/utils.js)
	const names = Object.keys(context);
	const values = Object.values(context);
	const body = `let out = ${code}; return out`;
	// eslint-disable-next-line no-new-func
	return new Function(...names, body)(...values);
}

function cint(v) {
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function getFieldDisplayStatus(df, doc, perm) {
	// Trimmed copy of frappe.perm.get_field_display_status (no cur_frm branch).
	if (!df.permlevel) df.permlevel = 0;
	const p = perm[df.permlevel];
	let status = "None";
	if (p) {
		if (p.write && !df.disabled && !df.is_virtual) status = "Write";
		else if (p.read) status = "Read";
	}
	if (cint(df.hidden)) status = "None";
	if (cint(df.hidden_due_to_dependency)) status = "None";
	if (!doc) return status;
	if (status === "Write" && cint(doc.docstatus) > 0) status = "Read";
	if (status === "Write" && (cint(df.read_only) || df.fieldtype === "Read Only")) status = "Read";
	if (status === "Write" && df.set_only_once && !doc.__islocal) status = "Read";
	return status;
}

function df(fieldname, props = {}) {
	return { fieldname, fieldtype: "Data", label: fieldname, parent: "Task", ...props };
}

const DEFAULT_FIELDS = [
	df("subject", { reqd: 1 }),
	df("status", { fieldtype: "Select", options: "Open\nWorking\nPending Review\nCompleted\nCancelled" }),
	df("custom_opportunity", { fieldtype: "Link" }),
	df("custom_include", { fieldtype: "Check", depends_on: "eval:!doc.custom_opportunity" }),
	df("type", { fieldtype: "Link" }),
	df("is_template", { fieldtype: "Check" }),
	df("exp_end_date", { fieldtype: "Date", read_only_depends_on: 'eval:doc.status == "Completed"' }),
	df("custom_section_break_hxxoh", {
		fieldtype: "Section Break",
		depends_on: "eval:((doc.type == 'Phase'||doc.type == 'Stage') && !doc.is_template)",
	}),
	df("custom_planned_start_date", { fieldtype: "Date" }),
	df("cb1", { fieldtype: "Column Break", depends_on: "eval:doc.is_template" }),
	df("custom_planned_end_date", { fieldtype: "Date" }),
	df("sec2", { fieldtype: "Section Break" }),
	df("priority", { fieldtype: "Select", options: "Low\nMedium\nHigh\nUrgent" }),
	df("broken", { depends_on: "eval:doc.type?.trim( != ''" }),
	df("fnfield", { depends_on: "fn:is_visible" }),
	df("completed_on", { fieldtype: "Date", mandatory_depends_on: 'eval:doc.status == "Completed"' }),
	df("reqd_but_ruled", { reqd: 1, mandatory_depends_on: "eval:doc.status == 'Working'" }),
	df("hidden_reqd", { reqd: 1, hidden: 1 }),
	df("secret", { permlevel: 1 }),
	df("locked", { read_only: 1 }),
	df("gone", { hidden: 1 }),
	df("depends_on_tasks", { fieldtype: "Table", options: "Task Depends On", reqd: 1 }),
];

/* ------------------------------------------------------------- module load */

function loadModules(frappe) {
	const exported = [];
	// Each module gets its own block scope (module-private consts may share names);
	// exports are hoisted to a shared `__exports` object.
	let src = "const __exports = {};\n";
	for (const file of SOURCES) {
		const names = [];
		let text = fs.readFileSync(file, "utf8");
		text = text.replace(/^import .*?;\s*$/gm, "");
		text = text.replace(/^export function (\w+)/gm, (_m, name) => {
			names.push(name);
			return `function ${name}`;
		});
		text = text.replace(/^export (const|let) (\w+)/gm, (_m, kind, name) => {
			names.push(name);
			return `${kind} ${name}`;
		});
		const assigns = names.map((n) => `__exports.${n} = ${n};`).join("\n");
		src += `\n{\n${text}\n${assigns}\n}\n`;
		exported.push(...names);
	}
	const logs = { warn: [], error: [] };
	const context = {
		frappe,
		window: {},
		console: {
			...console,
			warn: (...args) => logs.warn.push(args),
			error: (...args) => logs.error.push(args),
		},
		__: (s) => s,
		Number,
		String,
		Boolean,
		Array,
		Object,
		Map,
		Set,
		WeakMap,
		JSON,
		Math,
	};
	context.globalThis = context;
	vm.createContext(context);
	const mod = vm.runInContext(`${src}\n;__exports`, context, {
		filename: "field_status+field_rules.js",
	});
	for (const name of exported) {
		assert.ok(name in mod, `export ${name} missing`);
	}
	return { mod, logs, context };
}

function frappeStub(fields = DEFAULT_FIELDS) {
	const meta = { name: "Task", fields };
	const state = { roles: new Set(["Employee"]) };
	return {
		frappe: {
			session: { user: "u@x.com" },
			user: { has_role: (r) => state.roles.has(r) },
			utils: { eval: frappeEval },
			perm: {
				get_field_display_status: getFieldDisplayStatus,
				get_perm: () => [{ read: 1, write: 1 }, { read: 1, write: 0 }],
			},
			get_meta: (dt) => (dt === "Task" ? meta : null),
			meta: {
				get_docfield: (dt, name) => (dt === "Task" ? fields.find((f) => f.fieldname === name) || null : null),
			},
		},
		state,
		fields,
	};
}

/** Pure core with injected deps (no frappe). */
function setupCore(options = {}) {
	const fields = options.fields || DEFAULT_FIELDS.map((f) => ({ ...f }));
	const { mod } = loadModules({});
	const warns = [];
	const evals = [];
	const roles = new Set(["Employee"]);
	const registry = mod.createRegistry({ warn: (...a) => warns.push(["rule", ...a]) });
	const core = mod.createFieldStatusCore({
		getDocfield: (name) => fields.find((f) => f.fieldname === name) || null,
		getFields: () => fields,
		displayStatus: getFieldDisplayStatus,
		evalExpr: (code, ctx) => {
			evals.push(code);
			return frappeEval(code, ctx);
		},
		fallbackPerm: options.fallbackPerm,
		registry: () => registry,
		user: () => "u@x.com",
		hasRole: (r) => roles.has(r),
		warn: (...a) => warns.push(a),
		translate: (s) => s,
	});
	core.setTreeMeta(
		"treeMeta" in options
			? options.treeMeta
			: { doctype: "Task", permlevels_readable: [0], permlevels_writable: [0], workflow: null }
	);
	return { core, mod, registry, fields, warns, evals, roles };
}

function row(overrides = {}) {
	const doc = {
		name: "TASK-1",
		doctype: "Task",
		docstatus: 0,
		subject: "Hi",
		status: "Open",
		type: "Task",
		is_template: 0,
		custom_opportunity: null,
		custom_include: 0,
		exp_end_date: null,
		completed_on: null,
		reqd_but_ruled: null,
		hidden_reqd: null,
		owner: "u@x.com",
		...(overrides._doc || {}),
	};
	return {
		id: "TASK-1",
		can_read: 1,
		can_write: 1,
		subject: doc.subject,
		status: doc.status,
		assign: [],
		...overrides,
		_doc: doc,
	};
}

/** vm context has its own Array/Object prototypes — compare by value. */
function sameJson(actual, expected) {
	assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

/* ------------------------------------------------------------ fieldStatus */

test("depends_on JS-only expression `!doc.custom_opportunity`: Write when empty, None when set", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row(), "custom_include"), "Write");
	assert.equal(core.fieldStatus(row({ _doc: { custom_opportunity: "OPP-1" } }), "custom_include"), "None");
});

test("read_only_depends_on true → Read; false → Write; grid value wins over stale _doc", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row({ status: "Open" }), "exp_end_date"), "Write");
	assert.equal(core.fieldStatus(row({ status: "Completed" }), "exp_end_date"), "Read");
	assert.equal(core.fieldStatus(row({ status: "Completed", _doc: { status: "Open" } }), "exp_end_date"), "Read");
});

test("hidden Section Break hides its fields; Column Break too; next section resets", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row(), "custom_planned_start_date"), "None");
	assert.equal(core.fieldStatus(row({ _doc: { type: "Phase" } }), "custom_planned_start_date"), "Write");
	assert.equal(core.fieldStatus(row({ _doc: { type: "Phase" } }), "custom_planned_end_date"), "None");
	assert.equal(core.fieldStatus(row(), "priority"), "Write");
});

test("broken eval expression: does not restrict, evaluated once, warned once", () => {
	const { core, warns, evals } = setupCore();
	assert.equal(core.fieldStatus(row(), "broken"), "Write");
	assert.equal(core.fieldStatus(row({ _doc: { type: "Phase" } }), "broken"), "Write");
	assert.equal(evals.filter((c) => c.includes("trim(")).length, 1);
	assert.equal(warns.filter((w) => String(w[0]).includes('Invalid "depends_on"')).length, 1);
});

test("fn: expression is ignored with a single warning", () => {
	const { core, warns } = setupCore();
	assert.equal(core.fieldStatus(row(), "fnfield"), "Write");
	core.fieldStatus(row(), "fnfield");
	assert.equal(warns.filter((w) => String(w[0]).includes("fn:")).length, 1);
});

test("workflow state_field and update_fields → Read", () => {
	const { core } = setupCore({
		treeMeta: {
			doctype: "Task",
			permlevels_readable: [0],
			permlevels_writable: [0],
			workflow: { state_field: "status", update_fields: ["priority"] },
		},
	});
	assert.equal(core.fieldStatus(row(), "status"), "Read");
	assert.equal(core.fieldStatus(row(), "priority"), "Read");
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
});

test("row-level: can_write=0 → Read, can_read=0 → None, docstatus 1 → Read, read_only → Read, hidden → None", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row({ can_write: 0 }), "subject"), "Read");
	assert.equal(core.fieldStatus(row({ can_read: 0, can_write: 0 }), "subject"), "None");
	assert.equal(core.fieldStatus(row({ _doc: { docstatus: 1 } }), "subject"), "Read");
	assert.equal(core.fieldStatus(row(), "locked"), "Read");
	assert.equal(core.fieldStatus(row(), "gone"), "None");
});

test("_assign (no DocField): Write iff can_write; None when unreadable; unknown fieldname same", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row(), "_assign"), "Write");
	assert.equal(core.fieldStatus(row({ can_write: 0 }), "_assign"), "Read");
	assert.equal(core.fieldStatus(row({ can_read: 0 }), "_assign"), "None");
	assert.equal(core.fieldStatus(row(), "not_a_field"), "Write");
});

test("permlevel from tree_meta: level 1 None / Read / Write", () => {
	const { core } = setupCore();
	assert.equal(core.fieldStatus(row(), "secret"), "None");
	core.setTreeMeta({ permlevels_readable: [0, 1], permlevels_writable: [0], workflow: null });
	assert.equal(core.fieldStatus(row(), "secret"), "Read");
	core.setTreeMeta({ permlevels_readable: [0, 1], permlevels_writable: [0, 1], workflow: null });
	assert.equal(core.fieldStatus(row(), "secret"), "Write");
});

test("no tree_meta yet: permlevels fall back to role perms (frappe.perm.get_perm shape)", () => {
	const { core } = setupCore({
		treeMeta: null,
		fallbackPerm: () => [{ read: 1, write: 1 }, { read: 1, write: 0 }],
	});
	assert.equal(core.fieldStatus(row(), "secret"), "Read");
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
	sameJson(core.buildPerm(row()), { 0: { read: 1, write: 1 }, 1: { read: 1, write: 0 } });
});

test("shared DocField is never mutated; stale hidden_due_to_dependency from a form is ignored", () => {
	const { core, fields } = setupCore();
	const subject = fields.find((f) => f.fieldname === "subject");
	subject.hidden_due_to_dependency = 1;
	delete subject.permlevel;
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
	assert.equal(subject.hidden_due_to_dependency, 1);
	assert.equal("permlevel" in subject, false);
});

test("buildPerm shape matches frappe.perm expectations", () => {
	const { core } = setupCore();
	sameJson(core.buildPerm(row(), { permlevels_readable: [0, 1], permlevels_writable: [0] }), {
		0: { read: 1, write: 1 },
		1: { read: 1, write: 0 },
	});
	sameJson(core.buildPerm(row({ can_read: 0 }), { permlevels_readable: [0], permlevels_writable: [0] }), {
		0: { read: 0, write: 0 },
	});
});

test("rowToDoc maps aliases and grid values to DocType names", () => {
	const { core } = setupCore();
	const doc = core.rowToDoc(
		row({ assign: ["a@x.com"], custom_include: true, subject: "Edited", _doc: { subject: "Old" } })
	);
	assert.equal(doc.doctype, "Task");
	assert.equal(doc.name, "TASK-1");
	assert.equal(doc._assign, '["a@x.com"]');
	assert.equal(doc.custom_include, 1);
	assert.equal(doc.subject, "Edited");
	assert.equal(doc.type, "Task");
});

/* -------------------------------------------------------------- mandatory */

test("missingMandatoryLabels: reqd, mandatory_depends_on, hidden fields included, absent fields skipped", () => {
	const { core } = setupCore();
	const base = core.rowToDoc(row());
	// hidden_reqd is reqd + hidden and empty → reported (form does not skip hidden)
	sameJson(core.missingMandatoryLabels(base), ["hidden_reqd"]);
	sameJson(core.missingMandatoryLabels({ ...base, hidden_reqd: "x", subject: "" }), ["subject"]);
	sameJson(core.missingMandatoryLabels({ ...base, hidden_reqd: "x", status: "Completed" }), ["completed_on"]);
	sameJson(
		core.missingMandatoryLabels({ ...base, hidden_reqd: "x", status: "Completed", completed_on: "2026-09-03" }),
		[]
	);
	// reqd Table not shipped in the doc → not judged
	assert.equal(core.missingMandatoryLabels({ ...base, hidden_reqd: "x" }).includes("depends_on_tasks"), false);
});

test("mandatory_depends_on decides when set, even if reqd=1 (form save.js semantics)", () => {
	const { core } = setupCore();
	const base = { ...core.rowToDoc(row()), hidden_reqd: "x" };
	sameJson(core.missingMandatoryLabels({ ...base, status: "Open" }), []);
	sameJson(core.missingMandatoryLabels({ ...base, status: "Working" }), ["reqd_but_ruled"]);
});

/* --------------------------------------------------------------- registry */

test("registry rule lowers status, never raises; ctx has user/hasRole/doc", () => {
	const { core, registry, roles } = setupCore();
	let seenCtx = null;
	registry.register("Task", {
		subject: (doc, ctx) => {
			seenCtx = ctx;
			return ctx.hasRole("Task Manager") ? null : { status: "Read" };
		},
		locked: () => ({ status: "Write" }),
		gone: () => ({ status: "Write" }),
	});
	assert.equal(core.fieldStatus(row(), "subject"), "Read");
	assert.equal(seenCtx.user, "u@x.com");
	assert.equal(seenCtx.doc.name, "TASK-1");
	roles.add("Task Manager");
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
	assert.equal(core.fieldStatus(row(), "locked"), "Read");
	assert.equal(core.fieldStatus(row(), "gone"), "None");
	sameJson(registry.getFields("Task").sort(), ["gone", "locked", "subject"]);
});

test("registry evaluate merges several rules: lowest status, options intersection", () => {
	const { mod } = loadModules({});
	const registry = mod.createRegistry({ warn: () => {} });
	registry.register("Task", { status: () => ({ options: ["Open", "Working", "Completed"] }) });
	registry.register("Task", { status: () => ({ status: "Read", options: ["Working", "Completed", "Cancelled"] }) });
	registry.register("Task", { status: () => null });
	sameJson(registry.evaluate("Task", "status", {}, {}), { status: "Read", options: ["Working", "Completed"] });
	assert.equal(registry.evaluate("Task", "subject", {}, {}), null);
	assert.equal(registry.evaluate("Other", "status", {}, {}), null);
});

test("throwing rule is ignored and reported once", () => {
	const { core, registry, warns } = setupCore();
	registry.register("Task", {
		subject: () => {
			throw new Error("boom");
		},
	});
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
	assert.equal(core.fieldStatus(row(), "subject"), "Write");
	assert.equal(warns.filter((w) => w[0] === "rule").length, 1);
});

test("fieldOptions narrows Select options keeping base order; no rule → base", () => {
	const { core, registry } = setupCore();
	const base = ["Open", "Working", "Pending Review", "Completed"];
	sameJson(core.fieldOptions(row(), "status", base), base);
	registry.register("Task", {
		status: (doc) => (doc.confirm ? { options: ["Completed", "Open"] } : null),
	});
	sameJson(core.fieldOptions(row(), "status", base), base);
	sameJson(core.fieldOptions(row({ confirm: 1 }), "status", base), ["Open", "Completed"]);
});

test("installFieldRules: consumer-first `frappe.provide` stub is upgraded in place and _pending drained", () => {
	const { mod } = loadModules({});
	const host = {};
	const rules = { subject: () => ({ status: "None" }) };
	// consumer (dinord_erpnext_customization/public/js/task_field_rules.js) before provider
	host.dinext = { fieldRules: {} };
	(host.dinext.fieldRules._pending = host.dinext.fieldRules._pending || []).push(["Task", rules]);
	assert.equal(typeof host.dinext.fieldRules.register, "undefined");
	const stub = host.dinext.fieldRules;
	const registry = mod.installFieldRules(host);
	assert.equal(registry, stub);
	assert.equal(host.dinext.fieldRules._pending.length, 0);
	sameJson(registry.getFields("Task"), ["subject"]);
	// provider-first then consumer: push + flushPending path
	host.dinext.fieldRules._pending.push(["Task", { status: () => ({ status: "Read" }) }]);
	host.dinext.fieldRules.flushPending();
	sameJson(registry.getFields("Task").sort(), ["status", "subject"]);
	// second install is a no-op
	assert.equal(mod.installFieldRules(host), registry);
});

/* ------------------------------------------------- frappe-bound exports */

test("frappe-bound exports: fieldStatus(row, fieldname) and registry via global dinext", () => {
	const { frappe } = frappeStub();
	const { mod, context } = loadModules(frappe);
	mod.setTreeMeta({ doctype: "Task", permlevels_readable: [0], permlevels_writable: [0], workflow: null });
	assert.equal(mod.fieldStatus(row(), "custom_include"), "Write");
	assert.equal(mod.fieldStatus(row({ _doc: { custom_opportunity: "OPP-1" } }), "custom_include"), "None");
	assert.equal(mod.fieldStatus(row({ status: "Completed" }), "exp_end_date"), "Read");
	context.dinext.fieldRules.register("Task", { subject: () => ({ status: "Read" }) });
	assert.equal(mod.fieldStatus(row(), "subject"), "Read");
	sameJson(mod.fieldOptions(row(), "priority", ["Low", "High"]), ["Low", "High"]);
});
