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
				args.project = "";
				void setPageTitle(page, null);
				emit();
				return;
			}
			lastProject = value;
			args.project = value;
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
			const filters = [["Task", "is_group", "=", 1]];
			if (args.project) {
				filters.push(["Task", "project", "=", args.project]);
			}
			return { filters };
		},
		change() {
			args.task = this.get_value() || "";
			emit();
		},
	});

	addIfMissing({
		fieldname: "status",
		fieldtype: "Select",
		label: __("Status"),
		options: taskSelectOptions("status"),
		change() {
			args.status = this.get_value() || "";
			emit();
		},
	});

	addIfMissing({
		fieldname: "priority",
		fieldtype: "Select",
		label: __("Priority"),
		options: taskSelectOptions("priority"),
		change() {
			args.priority = this.get_value() || "";
			emit();
		},
	});

	addIfMissing({
		fieldname: "assign",
		fieldtype: "Link",
		options: "User",
		label: __("Assigned To"),
		change() {
			args.assign = this.get_value() || "";
			emit();
		},
	});

	addIfMissing({
		fieldname: "tag",
		fieldtype: "Link",
		options: "Tag",
		label: __("User Tags"),
		change() {
			args.tag = this.get_value() || "";
			emit();
		},
	});

	addIfMissing({
		fieldname: "limit",
		fieldtype: "Int",
		label: __("Limit"),
		change() {
			const raw = this.get_value();
			args.limit = raw === null || raw === undefined || raw === "" ? null : cint(raw);
			emit();
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
