import { projectStorageKey } from "../constants.js";
import { setPageTitle } from "../shell/title.js";
import { filterDefaults, taskSelectOptions } from "./defaults.js";

export async function setupFilters({ page, onChange }) {
	await frappe.model.with_doctype("Task");

	const args = filterDefaults();
	const emit = () => onChange?.();
	let lastProject = args.project;

	page.add_field({
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

	page.add_field({
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

	page.add_field({
		fieldname: "status",
		fieldtype: "Select",
		label: __("Status"),
		options: taskSelectOptions("status"),
		change() {
			args.status = this.get_value() || "";
			emit();
		},
	});

	page.add_field({
		fieldname: "priority",
		fieldtype: "Select",
		label: __("Priority"),
		options: taskSelectOptions("priority"),
		change() {
			args.priority = this.get_value() || "";
			emit();
		},
	});

	page.add_field({
		fieldname: "assign",
		fieldtype: "Link",
		options: "User",
		label: __("Assigned To"),
		change() {
			args.assign = this.get_value() || "";
			emit();
		},
	});

	page.add_field({
		fieldname: "tag",
		fieldtype: "Link",
		options: "Tag",
		label: __("User Tags"),
		change() {
			args.tag = this.get_value() || "";
			emit();
		},
	});

	page.add_field({
		fieldname: "limit",
		fieldtype: "Int",
		label: __("Limit"),
		change() {
			const raw = this.get_value();
			args.limit = raw === null || raw === undefined || raw === "" ? null : cint(raw);
			emit();
		},
	});

	if (args.project) {
		await page.fields_dict.project.set_value(args.project);
		void setPageTitle(page, args.project);
	}

	return () => ({ ...args });
}
