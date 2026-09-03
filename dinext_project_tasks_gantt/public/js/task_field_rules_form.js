/**
 * Generic Task form adapter for `dinext.fieldRules` (doctype_js["Task"]).
 *
 * After Frappe's own refresh/dependency pass, every field that has a rule is
 * evaluated on `frm.doc`; the rule may only narrow the form:
 *   status "None" → hidden, "Read" → read_only, `options` → Select options.
 * When a rule returns null the pristine meta property is restored.
 * Re-runs on refresh and on every Task field change (rules are pure and cheap).
 */
(function () {
	const DOCTYPE = "Task";
	const PROPS = ["hidden", "read_only", "options"];

	function registry() {
		const reg = window.dinext && window.dinext.fieldRules;
		return reg && typeof reg.evaluate === "function" ? reg : null;
	}

	function pristine(frm, fieldname) {
		frm.__dinext_field_rules_pristine = frm.__dinext_field_rules_pristine || {};
		const store = frm.__dinext_field_rules_pristine;
		if (!store[fieldname]) {
			const df =
				(frappe.get_meta(DOCTYPE).fields || []).find((f) => f.fieldname === fieldname) || {};
			store[fieldname] = {
				hidden: cint(df.hidden),
				read_only: cint(df.read_only),
				options: df.options,
			};
		}
		return store[fieldname];
	}

	function applyTaskFieldRules(frm) {
		const reg = registry();
		if (!reg || !frm || !frm.doc || !frm.fields_dict) {
			return;
		}
		const ctx = {
			doctype: DOCTYPE,
			doc: frm.doc,
			frm,
			user: frappe.session.user,
			hasRole: (role) => Boolean(frappe.user.has_role(role)),
		};
		for (const fieldname of reg.getFields(DOCTYPE)) {
			const field = frm.fields_dict[fieldname];
			if (!field || !field.df) {
				continue;
			}
			const base = pristine(frm, fieldname);
			const out = reg.evaluate(DOCTYPE, fieldname, frm.doc, ctx) || {};
			const next = {
				hidden: base.hidden || out.status === "None" ? 1 : 0,
				read_only: base.read_only || out.status === "Read" ? 1 : 0,
				options: Array.isArray(out.options) ? out.options.join("\n") : base.options,
			};
			for (const prop of PROPS) {
				if (prop === "options" && field.df.fieldtype !== "Select") {
					continue;
				}
				if (field.df[prop] !== next[prop]) {
					frm.set_df_property(fieldname, prop, next[prop]);
				}
			}
		}
	}

	const handlers = { refresh: applyTaskFieldRules };
	const meta = frappe.get_meta(DOCTYPE);
	for (const df of (meta && meta.fields) || []) {
		if (df.fieldname && !frappe.model.no_value_type.includes(df.fieldtype)) {
			handlers[df.fieldname] = applyTaskFieldRules;
		}
	}
	frappe.ui.form.on(DOCTYPE, handlers);
})();
