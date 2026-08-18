/** Cached Task doc — avoid await before opening the Select (keeps user gesture). */
export function cachedTaskDoc(taskId) {
	if (!taskId) {
		return null;
	}
	try {
		const doc = frappe.get_doc?.("Task", taskId);
		if (doc) {
			return doc;
		}
	} catch {
		/* not in locals */
	}
	return locals?.Task?.[taskId] || null;
}

/** Open native &lt;select&gt; list in the same click that started edit. */
export function openNativeSelect($input) {
	const el = $input?.get?.(0) || $input;
	if (!el) {
		return;
	}
	el.focus?.();
	if (typeof el.showPicker === "function") {
		try {
			el.showPicker();
		} catch {
			/* gesture lost or unsupported */
		}
	}
}
