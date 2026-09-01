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
 * Mute field.change during set — pre-writing args.project would skip emit,
 * and Link set_value can briefly clear the input (legacy lastProject restore).
 * Caller always reloads after this.
 * @param {object} page
 * @param {object} args mutable filter args (setupFilters closure)
 * @param {{
 *   onProject?: (project: string) => void,
 *   mute?: (fn: () => Promise<void>|void) => Promise<void>|void,
 * }} [hooks]
 * @returns {Promise<boolean>} true if filter value changed
 */
export async function applyRouteProject(page, args, hooks = {}) {
	const project = takeRouteProject();
	if (!project || !page?.fields_dict?.project) {
		return false;
	}

	const field = page.fields_dict.project;
	const current = String(field.get_value?.() || args.project || "").trim();
	args.project = project;
	localStorage.setItem(projectStorageKey(), project);
	hooks.onProject?.(project);

	const paint = async () => {
		// Classic Task tree: set_input so the Link shows the new project immediately.
		if (typeof field.set_input === "function") {
			field.set_input(project);
		}
		if (typeof field.set_value === "function") {
			await field.set_value(project);
		}
	};

	if (typeof hooks.mute === "function") {
		await hooks.mute(paint);
	} else {
		await paint();
	}

	return current !== project;
}
