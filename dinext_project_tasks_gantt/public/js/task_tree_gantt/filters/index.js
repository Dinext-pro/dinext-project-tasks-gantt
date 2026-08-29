import { projectStorageKey } from "../constants.js";
import { setPageTitle } from "../shell/title.js";
import {
	filterDefaults,
	normalizeMulti,
	taskMultiSelectOptions,
} from "./defaults.js";
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

	function valuesEqual(prev, next) {
		if (Array.isArray(prev) || Array.isArray(next)) {
			const a = normalizeMulti(prev);
			const b = normalizeMulti(next);
			return a.length === b.length && a.every((v, i) => v === b[i]);
		}
		return prev === next;
	}

	function setArg(fieldname, value) {
		if (valuesEqual(args[fieldname], value)) {
			return false;
		}
		args[fieldname] = Array.isArray(value) ? normalizeMulti(value) : value;
		return true;
	}

	const addIfMissing = (df) => {
		if (page.fields_dict?.[df.fieldname]) {
			return page.fields_dict[df.fieldname];
		}
		return page.add_field(df);
	};

	function bindMultiSelectList(fieldname, label, getData) {
		const field = addIfMissing({
			fieldname,
			fieldtype: "MultiSelectList",
			label,
			placeholder: label,
			get_data:
				getData || (() => taskMultiSelectOptions(fieldname)),
			change() {
				if (setArg(fieldname, normalizeMulti(this.get_value()))) {
					emit();
				}
			},
		});
		const notify = () => {
			if (setArg(fieldname, normalizeMulti(field.get_value()))) {
				emit();
			}
		};
		// ControlMultiSelectList always parse_validate("") — df.change fires once.
		for (const name of [
			"toggle_select_item",
			"clear_all_selections",
			"select_all_options",
			"set_value",
		]) {
			if (typeof field[name] !== "function") {
				continue;
			}
			const orig = field[name].bind(field);
			field[name] = (...a) => {
				const result = orig(...a);
				notify();
				return result;
			};
		}
		return field;
	}

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

	bindMultiSelectList("task", __("Task"), (txt) => {
		if (!args.project) {
			return [];
		}
		return frappe.db.get_link_options("Task", txt || "", {
			project: args.project,
		});
	});
	bindMultiSelectList("status", __("Status"));
	bindMultiSelectList("priority", __("Priority"));
	bindMultiSelectList("assign", __("Assigned To"), (txt) =>
		frappe.db.get_link_options("User", txt || "", {
			user_type: "System User",
			enabled: 1,
		})
	);
	bindMultiSelectList("tag", __("User Tags"), (txt) =>
		frappe.db.get_link_options("Tag", txt || "")
	);

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
