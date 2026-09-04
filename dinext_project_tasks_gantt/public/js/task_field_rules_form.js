/**
 * Generic Task form adapter for `dinext.fieldRules` (doctype_js["Task"]).
 *
 * After Frappe's own refresh/dependency pass, every field that has a rule is
 * evaluated on `frm.doc`. The adapter may only narrow:
 *   status "None" → hidden, "Read" → read_only, `options` → Select options.
 * `null` / no status / Write = no opinion: do not set read_only/hidden to 0
 * and do not restore Select options from meta (that would wipe Confirm CS).
 * Re-runs on refresh and on every Task field change (rules are pure and cheap).
 */

function dinextApplyFormPolicy(out, df) {
	const props = {};
	if (!out || typeof out !== "object") {
		return props;
	}
	if (out.status === "None") {
		props.hidden = 1;
	} else if (out.status === "Read") {
		props.read_only = 1;
	}
	if (Array.isArray(out.options) && df && df.fieldtype === "Select") {
		props.options = out.options.join("\n");
	}
	return props;
}

(function () {
	const DOCTYPE = "Task";

	function registry() {
		const reg = window.dinext && window.dinext.fieldRules;
		return reg && typeof reg.evaluate === "function" ? reg : null;
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
			const props = dinextApplyFormPolicy(reg.evaluate(DOCTYPE, fieldname, frm.doc, ctx), field.df);
			for (const [prop, value] of Object.entries(props)) {
				if (field.df[prop] !== value) {
					frm.set_df_property(fieldname, prop, value);
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
