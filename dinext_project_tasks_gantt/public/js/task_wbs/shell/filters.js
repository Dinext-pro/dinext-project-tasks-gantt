// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { PROJECT_STORAGE_SUFFIX } from "../constants.js";

function projectStorageKey() {
	return frappe.user.name + PROJECT_STORAGE_SUFFIX;
}

function taskFieldOptions(fieldname) {
	const field = frappe.meta.get_docfield("Task", fieldname);
	const raw = field?.options || "";
	return ["", ...String(raw).split("\n").filter(Boolean)];
}

/**
 * @param {object} opts
 * @param {object} opts.page
 * @param {(patch: { project?: string }) => void} opts.onChange
 * @param {object} opts.state — page._task_wbs
 */
export function setupFilters({ page, onChange, state }) {
	const storageKey = projectStorageKey();

	function emitProject(value) {
		if (typeof onChange === "function") {
			onChange({ project: value });
		}
	}

	function emitFilters() {
		if (!state) {
			return;
		}
		state.filters = {
			...state.filters,
			status: page.fields_dict.status?.get_value() || "",
			priority: page.fields_dict.priority?.get_value() || "",
		};
		if (typeof onChange === "function") {
			onChange({});
		}
	}

	if (!page.fields_dict.project) {
		page.add_field({
			fieldtype: "Link",
			fieldname: "project",
			options: "Project",
			label: __("Project"),
			reqd: 1,
			change() {
				const field = page.fields_dict.project;
				const value = field.get_value();
				const old_value = field.last_value;

				if (value) {
					localStorage.setItem(storageKey, value);
					emitProject(value);
				} else if (old_value) {
					field.set_value(old_value);
				}
			},
		});
	}

	if (!page.fields_dict.status) {
		page.add_field({
			fieldtype: "Select",
			fieldname: "status",
			label: __("Status"),
			options: taskFieldOptions("status").join("\n"),
			change: emitFilters,
		});
	}

	if (!page.fields_dict.priority) {
		page.add_field({
			fieldtype: "Select",
			fieldname: "priority",
			label: __("Priority"),
			options: taskFieldOptions("priority").join("\n"),
			change: emitFilters,
		});
	}

	const saved = localStorage.getItem(storageKey);
	const current = page.fields_dict.project.get_value();
	if (saved && !current) {
		// set_value is async; caller may await this promise
		page.fields_dict.project.set_value(saved);
	}

	if (state) {
		state.filters = {
			...state.filters,
			status: page.fields_dict.status?.get_value() || "",
			priority: page.fields_dict.priority?.get_value() || "",
		};
		if (!state.project) {
			state.project = current || saved || null;
		}
	}

	return page.fields_dict.project;
}

export function getProjectFromPage(page) {
	return page.fields_dict?.project?.get_value?.() || null;
}
