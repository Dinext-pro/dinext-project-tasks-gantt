import { projectStorageKey } from "../constants.js";

export function filterDefaults() {
	return {
		project: localStorage.getItem(projectStorageKey()) || "",
		task: [],
		status: [],
		priority: [],
		assign: [],
		tag: [],
		limit: null,
	};
}

export function taskMultiSelectOptions(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	return String(field?.options || "")
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((value) => ({
			value,
			label: __(value),
			description: "",
		}));
}

/** Empty / junk → []. Used for MultiSelectList page-form filters. */
export function normalizeMulti(raw) {
	if (raw == null || raw === "") {
		return [];
	}
	if (Array.isArray(raw)) {
		return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
	}
	if (typeof raw === "string") {
		const t = raw.trim();
		if (!t || t === "[]" || t === "null" || t === "None") {
			return [];
		}
		if (t.startsWith("[")) {
			try {
				const parsed = JSON.parse(t);
				if (Array.isArray(parsed)) {
					return normalizeMulti(parsed);
				}
			} catch {
				/* scalar */
			}
		}
		return [t];
	}
	return [];
}

/** API payload: null = no filter. Non-empty array = OR values. */
export function multiPayload(raw) {
	const list = normalizeMulti(raw);
	return list.length ? list : null;
}

export function hasMulti(raw) {
	return normalizeMulti(raw).length > 0;
}
