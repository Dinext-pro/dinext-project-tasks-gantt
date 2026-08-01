// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

(function () {
	const TASK_DOCTYPE = "Task";
	const navigation = dinext_project_tasks_gantt.burndown_navigation;
	const BUTTON_LABEL = navigation.LABEL;

	frappe.provide("frappe.treeview_settings");

	const settings = frappe.treeview_settings[TASK_DOCTYPE];
	if (!settings) {
		return;
	}

	if (settings.__task_tree_burndown_wrapped) {
		return;
	}
	settings.__task_tree_burndown_wrapped = true;

	const previous_onload = settings.onload;
	settings.onload = function (treeview) {
		if (previous_onload) {
			previous_onload.call(this, treeview);
		}
		wrap_make_tree_for_burndown_button(treeview);
		setup_task_tree_burndown_button(treeview);
		schedule_burndown_button_sync(treeview);
	};

	const previous_post_render = settings.post_render;
	settings.post_render = function (treeview) {
		if (previous_post_render) {
			previous_post_render.call(this, treeview);
		}
		setup_task_tree_burndown_button(treeview);
		schedule_burndown_button_sync(treeview);
	};

	function get_stored_tree_project() {
		try {
			const user = frappe.user?.name || frappe.session?.user;
			if (!user) {
				return null;
			}
			const stored = localStorage.getItem(`${user}:tree:project`);
			return stored ? String(stored).trim() : null;
		} catch (error) {
			return null;
		}
	}

	function get_selected_project(treeview) {
		const project_field = treeview?.page?.fields_dict?.project;
		const candidates = [
			project_field?.get_value?.(),
			treeview?.args?.project,
			project_field?.df?.default,
			get_stored_tree_project(),
		];

		for (const candidate of candidates) {
			if (candidate == null || candidate === "") {
				continue;
			}
			const project = String(candidate).trim();
			if (project) {
				return project;
			}
		}

		return null;
	}

	function sync_burndown_button_state(treeview) {
		const button = treeview?.__burndown_button_el;
		if (!button || !button.length) {
			return;
		}
		const has_project = Boolean(get_selected_project(treeview));
		button.prop("disabled", !has_project);
	}

	function schedule_burndown_button_sync(treeview) {
		sync_burndown_button_state(treeview);
		setTimeout(() => sync_burndown_button_state(treeview), 0);
		setTimeout(() => sync_burndown_button_state(treeview), 300);
	}

	function wrap_make_tree_for_burndown_button(treeview) {
		if (!treeview || treeview.__burndown_make_tree_wrapped) {
			return;
		}

		treeview.__burndown_make_tree_wrapped = true;
		const original_make_tree = treeview.make_tree.bind(treeview);
		treeview.make_tree = function () {
			const result = original_make_tree.apply(this, arguments);
			schedule_burndown_button_sync(treeview);
			return result;
		};
	}

	function bind_project_filter_watch(treeview) {
		if (treeview.__burndown_project_filter_bound) {
			schedule_burndown_button_sync(treeview);
			return;
		}

		const project_field = treeview?.page?.fields_dict?.project;
		if (!project_field) {
			return;
		}

		treeview.__burndown_project_filter_bound = true;
		const previous_change = project_field.change;
		project_field.change = function () {
			if (previous_change) {
				previous_change.apply(this, arguments);
			}
			sync_burndown_button_state(treeview);
		};

		if (project_field.$input?.length) {
			project_field.$input.on("change.task_tree_burndown", () => {
				sync_burndown_button_state(treeview);
			});
		}

		schedule_burndown_button_sync(treeview);
	}

	function open_burndown_report(treeview) {
		const project = get_selected_project(treeview);
		if (!project) {
			return;
		}

		return navigation.open_report(project);
	}

	function setup_task_tree_burndown_button(treeview) {
		if (!treeview?.page) {
			return;
		}

		if (treeview.__burndown_button_el?.length) {
			bind_project_filter_watch(treeview);
			return;
		}

		const button = treeview.page.add_inner_button(navigation.ICON + " " + BUTTON_LABEL, function () {
			if (button.prop("disabled")) {
				return;
			}
			open_burndown_report(treeview);
		});

		if (!button?.length) {
			return;
		}

		treeview.__burndown_button_el = button;
		bind_project_filter_watch(treeview);
	}
})();
