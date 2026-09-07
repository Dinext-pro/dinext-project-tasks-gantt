/**
 * Generic Task form adapter for `dinext.fieldRules` (doctype_js["Task"]).
 *
 * After Frappe's own refresh/dependency pass, every field that has a rule is
 * evaluated on `frm.doc`. The adapter may only narrow:
 *   status "None" → hidden, "Read" → read_only, `options` → Select options.
 * `null` / no status / Write = no opinion: do not set read_only/hidden to 0
 * and do not restore Select options from meta (that would wipe Confirm CS).
 * Re-runs on refresh and on every Task field change (rules are pure and cheap).
 *
 * Read must beat Frappe `read_only_depends_on`: `set_df_property` →
 * `refresh_field` → `layout.refresh_dependency` writes read_only=0 when the
 * expression is false (Task.custom_include / is_milestone). Tree only narrows
 * Write→Read; it never writes 0. Form must clear the depends_on copy, set
 * read_only 1, refresh the control, and disable Check `$input`.
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

/** Stop Frappe from resetting read_only=0 after we lock. Mutates the form df copy. */
function dinextPrepareFormRead(df, props) {
	if (df && props && props.read_only === 1) {
		df.read_only_depends_on = "";
	}
	return props;
}

function dinextEnforceFormRead(field) {
	if (!field || !field.df) {
		return;
	}
	field.df.read_only = 1;
	if (typeof field.refresh === "function") {
		field.refresh();
	}
	if (field.df.fieldtype === "Check") {
		if (field.$input && field.$input.prop) {
			field.$input.prop("disabled", true);
		}
		if (field.input) {
			field.input.disabled = true;
		}
	}
}

(function () {
	const DOCTYPE = "Task";

	function registry() {
		const host = window.dinext && window.dinext.fieldRules;
		if (host && typeof host.flushPending === "function") {
			host.flushPending();
		}
		return host && typeof host.evaluate === "function" ? host : null;
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
			const props = dinextPrepareFormRead(
				field.df,
				dinextApplyFormPolicy(reg.evaluate(DOCTYPE, fieldname, frm.doc, ctx), field.df)
			);
			for (const [prop, value] of Object.entries(props)) {
				if (field.df[prop] != value) {
					frm.set_df_property(fieldname, prop, value);
				}
			}
			if (props.read_only === 1) {
				dinextEnforceFormRead(field);
			}
		}
	}

	function onRefresh(frm) {
		applyTaskFieldRules(frm);
		// Confirm CS and refresh_dependency run in the same turn; re-apply after.
		setTimeout(() => applyTaskFieldRules(frm), 0);
	}

	const handlers = { refresh: onRefresh };
	const meta = frappe.get_meta(DOCTYPE);
	for (const df of (meta && meta.fields) || []) {
		if (df.fieldname && !frappe.model.no_value_type.includes(df.fieldtype)) {
			handlers[df.fieldname] = applyTaskFieldRules;
		}
	}
	frappe.ui.form.on(DOCTYPE, handlers);
})();
