/**
 * `dinext.fieldRules` — declarative per-field rules shared by the Task form
 * adapter and the Task Tree. Owner apps register rules from any script:
 *
 *   frappe.provide("dinext.fieldRules");
 *   (dinext.fieldRules._pending = dinext.fieldRules._pending || []).push(["Task", rules]);
 *   if (typeof dinext.fieldRules.register === "function") dinext.fieldRules.flushPending();
 *
 * rules = { [fieldname]: (doc, ctx) => { status?: "Write"|"Read"|"None", options?: string[] } | null }
 *
 * Rules are pure (no DOM, no calls) and can only restrict what Frappe
 * primitives allow: lowest `status` wins, `options` intersect. `null` = no
 * opinion. A throwing rule is reported once and ignored.
 *
 * Contract:
 *   register(doctype, rules)                      add rules (several apps may add for one field)
 *   evaluate(doctype, fieldname, doc, ctx)        merged { status?, options? } | null
 *   getFields(doctype)                            fieldnames with at least one rule
 *   flushPending()                                drain `_pending` ([doctype, rules] pairs)
 *   _pending                                      consumer queue when provider loads later
 */

const RANK = { None: 0, Read: 1, Write: 2 };

/**
 * @param {object} [options]
 * @param {object} [options.target] object to turn into the registry (a consumer
 *   stub `{ _pending: [...] }` from `frappe.provide`); a fresh object by default
 * @param {Function} [options.warn] error reporter (console.error by default)
 */
export function createRegistry({ target, warn } = {}) {
	const byDoctype = {};
	const failed = new Set();
	const report =
		typeof warn === "function"
			? warn
			: (...args) => (typeof console !== "undefined" ? console.error(...args) : null);

	function fieldMap(doctype) {
		return byDoctype[doctype] || (byDoctype[doctype] = {});
	}

	function mergeStatus(current, next) {
		if (!(next in RANK)) {
			return current;
		}
		if (current == null || RANK[next] < RANK[current]) {
			return next;
		}
		return current;
	}

	function mergeOptions(current, next) {
		if (!Array.isArray(next)) {
			return current;
		}
		const list = next.map(String);
		if (current == null) {
			return list;
		}
		return current.filter((option) => list.includes(option));
	}

	const registry = target && typeof target === "object" ? target : {};
	if (!Array.isArray(registry._pending)) {
		registry._pending = [];
	}
	Object.assign(registry, {
		register(doctype, rules) {
			if (!doctype || !rules || typeof rules !== "object") {
				return;
			}
			const map = fieldMap(doctype);
			for (const [fieldname, rule] of Object.entries(rules)) {
				if (typeof rule !== "function") {
					continue;
				}
				(map[fieldname] = map[fieldname] || []).push(rule);
			}
		},

		flushPending() {
			const pending = Array.isArray(registry._pending) ? registry._pending.splice(0) : [];
			for (const entry of pending) {
				if (Array.isArray(entry)) {
					registry.register(entry[0], entry[1]);
				}
			}
		},

		getFields(doctype) {
			return Object.keys(byDoctype[doctype] || {});
		},

		evaluate(doctype, fieldname, doc, ctx) {
			const rules = byDoctype[doctype]?.[fieldname];
			if (!rules || !rules.length) {
				return null;
			}
			let status = null;
			let options = null;
			let any = false;
			rules.forEach((rule, index) => {
				let out = null;
				try {
					out = rule(doc || {}, ctx || {});
				} catch (error) {
					const key = `${doctype}:${fieldname}:${index}`;
					if (!failed.has(key)) {
						failed.add(key);
						report(`[dinext.fieldRules] rule failed for ${doctype}.${fieldname}`, error);
					}
					return;
				}
				if (!out || typeof out !== "object") {
					return;
				}
				any = true;
				status = mergeStatus(status, out.status);
				options = mergeOptions(options, out.options);
			});
			if (!any) {
				return null;
			}
			const result = {};
			if (status != null) {
				result.status = status;
			}
			if (options != null) {
				result.options = options;
			}
			return result;
		},

		/** Testing helper. */
		_reset() {
			for (const key of Object.keys(byDoctype)) {
				delete byDoctype[key];
			}
			failed.clear();
		},
	});
	return registry;
}

/**
 * Install `dinext.fieldRules` on `root` (upgrading a consumer stub created by
 * `frappe.provide("dinext.fieldRules")` in place) and drain `_pending`.
 * Idempotent; safe whether the provider or a consumer script runs first.
 */
export function installFieldRules(root) {
	const host = root || (typeof globalThis !== "undefined" ? globalThis : window);
	host.dinext = host.dinext || {};
	const existing = host.dinext.fieldRules;
	const registry =
		existing && typeof existing.register === "function"
			? existing
			: createRegistry({ target: existing });
	host.dinext.fieldRules = registry;
	registry.flushPending();
	return registry;
}
