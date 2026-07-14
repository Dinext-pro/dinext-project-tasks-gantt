// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { refreshDependencies } from "./dependencies/check.js";
import { refreshPlanFact } from "./plan_fact/limits.js";

/** Refresh dependency conflicts + plan-fact after load/expand/save. */
export async function refreshSideData(state, rows) {
	if (!state?.project || !state.table) {
		return;
	}
	await Promise.all([
		refreshDependencies(state, rows).catch((e) => {
			console.error("task_wbs deps", e);
		}),
		refreshPlanFact(state, rows).catch((e) => {
			console.error("task_wbs plan_fact", e);
		}),
	]);
}
