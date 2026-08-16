import { projectStorageKey } from "../constants.js";

/**
 * Project from Project Form → Tree navigation (`frappe.route_options.project`).
 * Consume once (legacy Tree parity).
 * @returns {string|null}
 */
export function takeRouteProject() {
	const opts = frappe.route_options;
	if (!opts || !opts.project) {
		return null;
	}
	const project = String(opts.project).trim();
	opts.project = null;
	return project || null;
}

/**
 * Apply incoming route project onto page filter + args.
 * @param {object} page
 * @param {object} args mutable filter args (setupFilters closure)
 * @param {{ onProject?: (project: string) => void }} [hooks]
 * @returns {Promise<boolean>} true if filter value changed
 */
export async function applyRouteProject(page, args, hooks = {}) {
	const project = takeRouteProject();
	if (!project || !page?.fields_dict?.project) {
		return false;
	}

	const field = page.fields_dict.project;
	const current = field.get_value?.() || args.project || "";
	args.project = project;
	localStorage.setItem(projectStorageKey(), project);
	hooks.onProject?.(project);

	if (current === project) {
		return false;
	}

	await field.set_value(project);
	return true;
}
