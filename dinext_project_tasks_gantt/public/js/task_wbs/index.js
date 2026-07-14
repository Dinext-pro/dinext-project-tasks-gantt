// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { mount, getProject } from "./mount.js";

frappe.provide("dinext_project_tasks_gantt.task_wbs");

let ready = false;

const TaskWbs = {
	isReady() {
		return ready;
	},
	mount,
	getProject,
};

dinext_project_tasks_gantt.task_wbs = TaskWbs;
ready = true;

export { TaskWbs, mount, getProject };
