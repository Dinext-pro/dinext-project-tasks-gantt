// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { buildShell, setupResize } from "./shell/layout.js";
import { setupFilters, getProjectFromPage } from "./shell/filters.js";
import { destroyShell, initState } from "./state.js";
import { initTable, reloadTable } from "./table/table.js";
import { setupToolbar } from "./shell/toolbar.js";

function clearMain(page) {
	destroyShell(page);
	const main = page.main.get(0);
	if (!main) {
		return;
	}
	// page_form lives inside page.main (frappe Page) — never wipe it
	const pageForm = page.page_form?.get?.(0);
	[...main.children].forEach((child) => {
		if (child === pageForm || child.classList?.contains("page-form")) {
			return;
		}
		main.removeChild(child);
	});
}

function setStatus(page, text) {
	const state = initState(page);
	const main = page.main.get(0);
	if (!state.statusEl) {
		state.statusEl = document.createElement("div");
		state.statusEl.className = "task-wbs-page-status text-muted";
		const pageForm = page.page_form?.get?.(0);
		if (pageForm?.parentNode === main) {
			pageForm.after(state.statusEl);
		} else {
			main.insertBefore(state.statusEl, main.firstChild);
		}
	}
	state.statusEl.textContent = text || "";
}

function reloadWithStatus(page, label) {
	setStatus(page, __("Loading…"));
	return reloadTable(page)
		.then(() => {
			const state = initState(page);
			setStatus(
				page,
				label ||
					(state.project
						? __("Project: {0}", [state.project])
						: __("Select a project"))
			);
		})
		.catch((e) => {
			console.error("task_wbs reload", e);
			setStatus(page, __("Failed to load table"));
			frappe.msgprint({
				title: __("Error"),
				indicator: "red",
				message: e.message || String(e),
			});
		});
}

/**
 * WE-style entry: mount shell once, then init/reload table.
 * @param {{ wrapper: HTMLElement, page: object }} ctx
 */
export async function mount({ wrapper, page }) {
	clearMain(page);
	const state = initState(page);

	setupFilters({
		page,
		state,
		onChange(patch) {
			if (patch.project) {
				state.project = patch.project;
			} else {
				state.project = getProjectFromPage(page) || state.project;
			}
			reloadWithStatus(
				page,
				state.project ? __("Project: {0}", [state.project]) : null
			);
		},
	});

	state.project = getProjectFromPage(page) || state.project;

	const shellEls = buildShell(page);
	state.shell = shellEls.shell;
	state.container = shellEls.tableHost;
	state.ganttEl = shellEls.gantt;
	state.resizeCleanup = setupResize(shellEls);

	setupToolbar({
		page,
		state,
		reload: () =>
			reloadWithStatus(
				page,
				state.project ? __("Project: {0}", [state.project]) : null
			),
	});

	await reloadWithStatus(
		page,
		state.project ? __("Project: {0}", [state.project]) : null
	);
}

export function getProject(page) {
	if (page) {
		return initState(page).project || getProjectFromPage(page);
	}
	return null;
}
