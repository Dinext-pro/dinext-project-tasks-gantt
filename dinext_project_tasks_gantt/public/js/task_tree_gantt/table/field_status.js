/**
 * Field status for Task Tree rows with the primitives Desk Form uses.
 *
 * Server sends authorization only (`can_read`, `can_write`, workflow lock,
 * `tree_meta`). Everything the form evaluates in the browser — `depends_on`,
 * `read_only_depends_on`, `mandatory_depends_on`, container (Tab / Section /
 * Column Break) visibility, permlevel, docstatus, read_only, set_only_once,
 * workflow state / update fields — is evaluated here per row on a
 * Frappe-shaped doc, then narrowed by `dinext.fieldRules` (see field_rules.js).
 *
 * `createFieldStatusCore(deps)` is pure (unit-tested under node); the module
 * exports are the frappe-bound instance used by the tree.
 */
import { installFieldRules } from "./field_rules.js";

export const DOCTYPE = "Task";
const RANK = { None: 0, Read: 1, Write: 2 };
const NO_VALUE_TYPES = new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading"]);

/** Grid row keys whose value is the DocType value (grid edits win over `_doc`). */
const TABLE_DOC_FIELDS = [
	"subject",
	"status",
	"priority",
	"project",
	"custom_planned_start_date",
	"custom_planned_end_date",
	"exp_start_date",
	"exp_end_date",
	"act_start_date",
	"act_end_date",
	"completed_on",
	"expected_time",
	"duration",
	"progress",
	"custom_include",
	"is_milestone",
	"color",
	"parent_task",
	"custom_tree_order",
	"confirm",
	"owner",
];
const CHECK_FIELDS = new Set(["custom_include", "is_milestone", "confirm"]);

function cint(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function rowCanRead(row) {
	if (!row?.id) return false;
	return !(row.can_read === 0 || row.can_read === false);
}

export function rowCanWrite(row) {
	if (!row?.id) return false;
	return row.can_write === 1 || row.can_write === true;
}

function isEmptyValue(value) {
	if (value == null) return true;
	if (Array.isArray(value)) return value.length === 0;
	return String(value).trim() === "";
}

/**
 * @param {object} deps
 * @param {(fieldname: string) => object|null} deps.getDocfield  DocField of `Task`
 * @param {() => object[]} deps.getFields                         `frappe.get_meta("Task").fields` (layout order)
 * @param {(df, doc, perm) => string} deps.displayStatus         `frappe.perm.get_field_display_status`
 * @param {(code: string, ctx: object) => any} deps.evalExpr     `frappe.utils.eval`
 * @param {() => object|null} [deps.fallbackPerm]                `frappe.perm.get_perm("Task")` when no tree_meta yet
 * @param {() => object} deps.registry                           `dinext.fieldRules`
 * @param {() => string} deps.user
 * @param {(role: string) => boolean} deps.hasRole
 * @param {(...args) => void} [deps.warn]                        console.warn
 * @param {(s: string) => string} [deps.translate]               `__`
 */
export function createFieldStatusCore(deps) {
	const warn = deps.warn || ((...args) => console.warn(...args));
	const translate = deps.translate || ((s) => s);
	let treeMeta = null;
	const warned = new Set();
	const brokenExpressions = new Set();
	const docMemo = new WeakMap();
	const containerMemo = new WeakMap();

	function warnOnce(key, ...args) {
		if (warned.has(key)) return;
		warned.add(key);
		warn(...args);
	}

	/* ---------------------------------------------------------- tree_meta */

	function setTreeMeta(meta) {
		treeMeta = meta && typeof meta === "object" ? meta : null;
	}

	function getTreeMeta() {
		return treeMeta;
	}

	/* ---------------------------------------------------------------- doc */

	function docSignature(row) {
		const parts = [];
		for (const field of TABLE_DOC_FIELDS) {
			parts.push(String(row[field] ?? ""));
		}
		parts.push(Array.isArray(row.assign) ? row.assign.join(",") : "");
		return parts.join("\u0001");
	}

	/**
	 * Grid row → Frappe doc for expressions: server document (`row._doc`) with
	 * the grid's current scalar values on top; aliases mapped to DocType names.
	 */
	function rowToDoc(row) {
		if (!row) {
			return { doctype: DOCTYPE };
		}
		const sig = docSignature(row);
		const memo = docMemo.get(row);
		if (memo && memo.sig === sig && memo.docRef === row._doc) {
			return memo.doc;
		}
		const doc = { ...(row._doc || {}) };
		doc.doctype = DOCTYPE;
		doc.name = row.id ?? doc.name;
		doc.docstatus = cint(doc.docstatus);
		for (const field of TABLE_DOC_FIELDS) {
			if (!(field in row)) continue;
			doc[field] = CHECK_FIELDS.has(field) ? (row[field] ? 1 : 0) : row[field];
		}
		if (Array.isArray(row.assign)) {
			doc._assign = row.assign.length ? JSON.stringify(row.assign) : null;
		}
		delete doc.__islocal;
		docMemo.set(row, { sig, docRef: row._doc, doc });
		return doc;
	}

	/* --------------------------------------------------------------- perm */

	function permLevels(meta) {
		if (meta && (meta.permlevels_readable || meta.permlevels_writable)) {
			return {
				readable: new Set(meta.permlevels_readable || [0]),
				writable: new Set(meta.permlevels_writable || [0]),
			};
		}
		const rolePerm = typeof deps.fallbackPerm === "function" ? deps.fallbackPerm() : null;
		const readable = new Set([0]);
		const writable = new Set([0]);
		if (rolePerm) {
			for (const [level, p] of Object.entries(rolePerm)) {
				if (!p) continue;
				if (p.read) readable.add(cint(level));
				if (p.write) writable.add(cint(level));
			}
		}
		return { readable, writable };
	}

	/** Same shape `frappe.perm.get_perm` builds: perm[permlevel] = { read, write }. */
	function buildPerm(row, meta = treeMeta) {
		const canRead = rowCanRead(row) ? 1 : 0;
		const canWrite = canRead && rowCanWrite(row) ? 1 : 0;
		const { readable, writable } = permLevels(meta);
		const perm = {};
		for (const level of new Set([0, ...readable, ...writable])) {
			perm[level] = {
				read: canRead && readable.has(level) ? 1 : 0,
				write: canWrite && writable.has(level) ? 1 : 0,
			};
		}
		return perm;
	}

	/* -------------------------------------------------------- expressions */

	/**
	 * Desk Form `Layout.evaluate_depends_on_value`, tree edition.
	 * @returns {boolean|null} null = cannot evaluate here (fn:, broken) → does not restrict
	 */
	function evaluateDependsOn(expression, doc, { fieldname = "?", prop = "depends_on" } = {}) {
		if (expression == null || expression === "") return null;
		if (typeof expression === "boolean") return expression;
		if (typeof expression === "function") {
			try {
				return Boolean(expression(doc));
			} catch (error) {
				warnOnce(
					`${prop}:${fieldname}:<function>`,
					`[task_tree_gantt] "${prop}" function failed on Task.${fieldname}; ignored`,
					error
				);
				return null;
			}
		}
		const text = String(expression);
		if (text.startsWith("eval:")) {
			if (brokenExpressions.has(text)) return null;
			try {
				return Boolean(deps.evalExpr(text.slice(5), { doc, parent: null }));
			} catch (error) {
				brokenExpressions.add(text);
				warnOnce(
					`${prop}:${fieldname}:${text}`,
					`[task_tree_gantt] Invalid "${prop}" expression on Task.${fieldname}; ignored: ${text}`,
					error
				);
				return null;
			}
		}
		if (text.startsWith("fn:")) {
			warnOnce(
				`fn:${fieldname}:${text}`,
				`[task_tree_gantt] "${prop}" with fn: needs a form; ignored on Task.${fieldname}: ${text}`
			);
			return null;
		}
		const value = doc?.[text];
		return Array.isArray(value) ? value.length > 0 : Boolean(value);
	}

	/** fieldname → enclosing Tab / Section / Column Break DocFields (layout order). */
	function containersByField(fields) {
		let map = containerMemo.get(fields);
		if (map) return map;
		map = new Map();
		let tab = null;
		let section = null;
		let column = null;
		for (const df of fields) {
			if (df.fieldtype === "Tab Break") {
				tab = df;
				section = null;
				column = null;
				continue;
			}
			if (df.fieldtype === "Section Break") {
				section = df;
				column = null;
				continue;
			}
			if (df.fieldtype === "Column Break") {
				column = df;
				continue;
			}
			if (df.fieldname) {
				map.set(df.fieldname, [tab, section, column].filter(Boolean));
			}
		}
		containerMemo.set(fields, map);
		return map;
	}

	/** Field and its containers all pass `depends_on` (a hidden section hides its fields). */
	function dependsOnVisible(df, doc) {
		if (!df) return true;
		const fields = deps.getFields() || [];
		const chain = [...(containersByField(fields).get(df.fieldname) || []), df];
		for (const node of chain) {
			if (!node.depends_on) continue;
			const visible = evaluateDependsOn(node.depends_on, doc, {
				fieldname: node.fieldname || node.fieldtype,
				prop: "depends_on",
			});
			if (visible === false) return false;
		}
		return true;
	}

	function workflowReadOnly(fieldname, meta = treeMeta) {
		const wf = meta?.workflow;
		if (!wf || !fieldname) return false;
		if (fieldname === wf.state_field) return true;
		return Array.isArray(wf.update_fields) && wf.update_fields.includes(fieldname);
	}

	/* -------------------------------------------------------------- rules */

	function ruleCtx(doc) {
		return {
			doctype: DOCTYPE,
			doc,
			user: deps.user(),
			hasRole: (role) => Boolean(deps.hasRole(role)),
			treeMeta,
		};
	}

	function evaluateRule(fieldname, doc) {
		const registry = deps.registry();
		if (!registry || typeof registry.evaluate !== "function") return null;
		return registry.evaluate(DOCTYPE, fieldname, doc, ruleCtx(doc));
	}

	/* -------------------------------------------------------- fieldStatus */

	/**
	 * @param {object} row DinextTable row (get_children contract + grid values)
	 * @param {string} fieldname Task fieldname (`_assign` and other non-DocField keys allowed)
	 * @returns {"Write"|"Read"|"None"}
	 */
	function fieldStatus(row, fieldname) {
		if (!rowCanRead(row)) return "None";
		const doc = rowToDoc(row);
		const perm = buildPerm(row);
		const df = fieldname ? deps.getDocfield(fieldname) : null;
		let status;
		if (!df) {
			// `_assign` and other non-DocField columns: document-level authorization only.
			status = perm[0].write ? "Write" : perm[0].read ? "Read" : "None";
			if (status === "Write" && cint(doc.docstatus) > 0) status = "Read";
		} else {
			// Copy: the shared meta DocField carries `hidden_due_to_dependency` from the
			// last Desk form and must not be mutated (`get_field_display_status` writes permlevel).
			const dfCopy = { ...df, permlevel: df.permlevel || 0, hidden_due_to_dependency: 0 };
			status = deps.displayStatus(dfCopy, doc, perm);
			if (status !== "None" && !dependsOnVisible(df, doc)) status = "None";
			if (status === "Write" && df.read_only_depends_on) {
				const ro = evaluateDependsOn(df.read_only_depends_on, doc, {
					fieldname: df.fieldname,
					prop: "read_only_depends_on",
				});
				if (ro === true) status = "Read";
			}
			if (status === "Write" && workflowReadOnly(df.fieldname)) status = "Read";
		}
		if (status === "None" || !fieldname) return status;
		const rule = evaluateRule(fieldname, doc);
		const next = rule?.status;
		if (next in RANK && RANK[next] < RANK[status]) return next;
		return status;
	}

	/** Select options narrowed by registry rules (order of `baseOptions` kept). */
	function fieldOptions(row, fieldname, baseOptions) {
		const base = Array.isArray(baseOptions) ? baseOptions.map(String) : [];
		if (!fieldname) return base;
		const rule = evaluateRule(fieldname, rowToDoc(row));
		if (!Array.isArray(rule?.options)) return base;
		const allowed = new Set(rule.options.map(String));
		return base.filter((option) => allowed.has(option));
	}

	/* ---------------------------------------------------------- mandatory */

	/** Desk Form `save.js is_docfield_mandatory`: `mandatory_depends_on` decides when set, else `reqd`. */
	function isDocfieldMandatory(df, doc) {
		if (!df) return false;
		if (df.mandatory_depends_on && doc) {
			return (
				evaluateDependsOn(df.mandatory_depends_on, doc, {
					fieldname: df.fieldname,
					prop: "mandatory_depends_on",
				}) === true
			);
		}
		return Boolean(cint(df.reqd));
	}

	/**
	 * Labels of mandatory fields that are empty on `doc` (Desk Form
	 * `check_mandatory`: every value field, hidden ones included). Fields absent
	 * from the doc snapshot (not permitted / not shipped) are not judged.
	 */
	function missingMandatoryLabels(doc) {
		const out = [];
		for (const df of deps.getFields() || []) {
			if (!df.fieldname || NO_VALUE_TYPES.has(df.fieldtype)) continue;
			if (!doc || !(df.fieldname in doc)) continue;
			if (!isDocfieldMandatory(df, doc)) continue;
			if (isEmptyValue(doc[df.fieldname])) {
				out.push(translate(df.label || df.fieldname));
			}
		}
		return out;
	}

	function resetCaches() {
		warned.clear();
		brokenExpressions.clear();
	}

	return {
		setTreeMeta,
		getTreeMeta,
		rowToDoc,
		buildPerm,
		evaluateDependsOn,
		dependsOnVisible,
		fieldStatus,
		fieldOptions,
		isDocfieldMandatory,
		missingMandatoryLabels,
		resetCaches,
	};
}

/* ------------------------------------------------------- frappe binding */

const core = createFieldStatusCore({
	getDocfield: (fieldname) => frappe.meta?.get_docfield?.(DOCTYPE, fieldname) || null,
	getFields: () => frappe.get_meta?.(DOCTYPE)?.fields || [],
	displayStatus: (df, doc, perm) => frappe.perm.get_field_display_status(df, doc, perm),
	evalExpr: (code, ctx) => frappe.utils.eval(code, ctx),
	fallbackPerm: () => frappe.perm?.get_perm?.(DOCTYPE) || null,
	registry: () => installFieldRules(),
	user: () => frappe.session?.user,
	hasRole: (role) => Boolean(frappe.user?.has_role?.(role)),
	warn: (...args) => console.warn(...args),
	translate: (s) => (typeof __ === "function" ? __(s) : s),
});

/** `frappe.response.tree_meta` from get_children / get_tree_meta. */
export const setTreeMeta = core.setTreeMeta;
export const getTreeMeta = core.getTreeMeta;
export const rowToDoc = core.rowToDoc;
export const buildPerm = core.buildPerm;
export const evaluateDependsOn = core.evaluateDependsOn;
/** @returns {"Write"|"Read"|"None"} */
export const fieldStatus = core.fieldStatus;
export const fieldOptions = core.fieldOptions;
export const isDocfieldMandatory = core.isDocfieldMandatory;
export const missingMandatoryLabels = core.missingMandatoryLabels;
/** Testing / hot-reload helper. */
export const resetFieldStatusCaches = core.resetCaches;
