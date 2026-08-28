import { projectStorageKey } from "../constants.js";
import { setPageTitle } from "../shell/title.js";
import { filterDefaults, taskSelectOptions } from "./defaults.js";
import { applyRouteProject, takeRouteProject } from "./route-project.js";

/**
 * @returns {Promise<{
 *   getArgs: () => object,
 *   applyRouteProject: () => Promise<boolean>,
 * }>}
 */
export async function setupFilters({ page, onChange }) {
	await frappe.model.with_doctype("Task");

	if (page.__task_tree_gantt_filters) {
		return page.__task_tree_gantt_filters;
	}

	const args = filterDefaults();
	// Route from Project Form wins over localStorage (first paint).
	const routeProject = takeRouteProject();
	if (routeProject) {
		args.project = routeProject;
	}
	const emit = () => onChange?.();
	let lastProject = args.project;

	function setArg(fieldname, value) {
		if (args[fieldname] === value) {
			return false;
		}
		args[fieldname] = value;
		return true;
	}

	const addIfMissing = (df) => {
		if (page.fields_dict?.[df.fieldname]) {
			return page.fields_dict[df.fieldname];
		}
		return page.add_field(df);
	};

	addIfMissing({
		fieldname: "project",
		fieldtype: "Link",
		options: "Project",
		label: __("Project"),
		reqd: 1,
		change() {
			const value = this.get_value();
			if (!value) {
				if (lastProject) {
					this.set_value(lastProject);
					return;
				}
				if (!setArg("project", "")) {
					return;
				}
				void setPageTitle(page, null);
				emit();
				return;
			}
			if (!setArg("project", value)) {
				lastProject = value;
				return;
			}
			lastProject = value;
			localStorage.setItem(projectStorageKey(), value);
			void setPageTitle(page, value);
			emit();
		},
	});

	addIfMissing({
		fieldname: "task",
		fieldtype: "Link",
		options: "Task",
		label: __("Task"),
		get_query() {
			if (!args.project) {
				return { filters: [["Task", "name", "=", ""]] };
			}
			return {
				filters: [["Task", "project", "=", args.project]],
				page_length: 50,
			};
		},
		change() {
			if (setArg("task", this.get_value() || "")) {
				emit();
			}
		},
	});

	addIfMissing({
		fieldname: "status",
		fieldtype: "Select",
		label: __("Status"),
		options: taskSelectOptions("status"),
		change() {
			if (setArg("status", this.get_value() || "")) {
				emit();
			}
		},
	});

	addIfMissing({
		fieldname: "priority",
		fieldtype: "Select",
		label: __("Priority"),
		options: taskSelectOptions("priority"),
		change() {
			if (setArg("priority", this.get_value() || "")) {
				emit();
			}
		},
	});

	addIfMissing({
		fieldname: "assign",
		fieldtype: "Link",
		options: "User",
		label: __("Assigned To"),
		change() {
			if (setArg("assign", this.get_value() || "")) {
				emit();
			}
		},
	});

	addIfMissing({
		fieldname: "tag",
		fieldtype: "Link",
		options: "Tag",
		label: __("User Tags"),
		change() {
			if (setArg("tag", this.get_value() || "")) {
				emit();
			}
		},
	});

	addIfMissing({
		fieldname: "limit",
		fieldtype: "Int",
		label: __("Limit"),
		change() {
			const raw = this.get_value();
			const next =
				raw === null || raw === undefined || raw === "" ? null : cint(raw);
			if (setArg("limit", next)) {
				emit();
			}
		},
	});

	if (args.project && page.fields_dict.project) {
		await page.fields_dict.project.set_value(args.project);
		void setPageTitle(page, args.project);
	}

	const api = {
		getArgs: () => ({ ...args }),
		applyRouteProject: () =>
			applyRouteProject(page, args, {
				onProject: (project) => {
					lastProject = project;
				},
			}),
	};
	page.__task_tree_gantt_filters = api;
	return api;
}
