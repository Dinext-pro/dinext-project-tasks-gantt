import { projectStorageKey } from "../constants.js";

function consumeRouteOptionsProject() {
	const opts = frappe.route_options;
	if (!opts || opts.project == null || opts.project === "") {
		return null;
	}
	const project = String(opts.project).trim();
	opts.project = null;
	return project || null;
}

function prevIsProjectForm() {
	const prev = frappe.get_prev_route?.() || [];
	return prev[0] === "Form" && prev[1] === "Project";
}

export function queryProject() {
	const raw = new URLSearchParams(window.location.search).get("project");
	const project = raw == null ? "" : String(raw).trim();
	return project || null;
}

/**
 * Keep `?project=` in sync with the page filter.
 * replaceState — do not retrigger Tree show.
 * @param {string|null|undefined} project
 */
export function syncProjectQuery(project) {
	const url = new URL(window.location.href);
	const current = url.searchParams.get("project") || "";
	const next = String(project || "").trim();
	if (current === next) {
		return;
	}
	if (next) {
		url.searchParams.set("project", next);
	} else {
		url.searchParams.delete("project");
	}
	const nextUrl = url.pathname + url.search + url.hash;
	window.history.replaceState(window.history.state, "", nextUrl);
}

/**
 * Inbound project for Tree.
 * Always consume leftover `route_options.project` so reports cannot leak later.
 *
 * `show`: only Project Form → Task tree (not return from Task / stale `?project=`).
 * First paint: Project Form, else URL query (bookmark / reload).
 *
 * @param {{ fromShow?: boolean }} [opts]
 * @returns {string|null}
 */
export function takeRouteProject(opts = {}) {
	const fromOpts = consumeRouteOptionsProject();
	if (opts.fromShow) {
		return prevIsProjectForm() && fromOpts ? fromOpts : null;
	}
	if (prevIsProjectForm() && fromOpts) {
		return fromOpts;
	}
	return queryProject();
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
	const project = takeRouteProject({ fromShow: true });
	if (!project || !page?.fields_dict?.project) {
		syncProjectQuery(args.project);
		return false;
	}

	const field = page.fields_dict.project;
	const current = String(field.get_value?.() || args.project || "").trim();
	args.project = project;
	localStorage.setItem(projectStorageKey(), project);
	syncProjectQuery(project);
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
