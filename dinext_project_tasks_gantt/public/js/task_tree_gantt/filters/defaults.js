import { projectStorageKey } from "../constants.js";

export function filterDefaults() {
	return {
		project: localStorage.getItem(projectStorageKey()) || "",
		task: "",
		status: "",
		priority: "",
		assign: "",
		tag: "",
		limit: null,
	};
}

export function taskSelectOptions(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	const values = String(field?.options || "").split("\n").filter(Boolean);
	return ["", ...values].join("\n");
}
