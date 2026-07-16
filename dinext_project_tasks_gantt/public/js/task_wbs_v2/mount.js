import { DEFAULT_TITLE } from "./constants.js";
import { setupFilters } from "./filters/index.js";
import {
	destroyGantt,
	scheduleGanttRefresh,
	wireTreeGanttHooks,
} from "./gantt/index.js";
import { buildShell, setupResize } from "./shell/layout.js";
import { setColumnContext } from "./table/columns/context.js";
import { loadTable } from "./table/index.js";

export async function mount({ page, fromTreeCutover = false }) {
	page.set_title(DEFAULT_TITLE);
	page.wrapper?.addClass?.("task-wbs-v2-page");

	const state = {
		getArgs: null,
		tableHost: null,
		ganttEl: null,
		table: null,
		gantt: null,
		fullscreenShell: null,
		fromTreeCutover: !!fromTreeCutover,
	};

	const reload = async () => {
		state.table = await loadTable(state.tableHost, state.getArgs, {
			// Coalesced — avoid parallel ensureGantt with mount await below.
			onTreeChange: () => scheduleGanttRefresh(state),
			onCellsSaved: () => scheduleGanttRefresh(state),
			// Client sort reorders source — gantt bars must follow row order.
			onSortChange: () => scheduleGanttRefresh(state),
			// page.main = page-form filters + WBS shell (WR fullscreen pattern).
			fullscreenShell: state.fullscreenShell,
		});
		if (state.table) {
			wireTreeGanttHooks(state.table, state);
			// schedule (not await ensure) — same path as onTreeChange, last gen wins.
			scheduleGanttRefresh(state);
		} else {
			destroyGantt(state);
		}
	};

	state.getArgs = await setupFilters({
		page,
		onChange: () => {
			if (state.tableHost) {
				void reload();
			}
		},
	});

	const refreshGantt = () => scheduleGanttRefresh(state);
	setColumnContext({
		page,
		onAssignSaved: refreshGantt,
		onGanttRefresh: refreshGantt,
		// Subject toolbar Add/Delete/Multiple → full reload.
		onTreeMutate: () => {
			void reload();
		},
	});

	const main = page.main.get(0);
	state.fullscreenShell = main;
	const zones = buildShell(main);
	state.tableHost = zones.tableHost;
	state.ganttEl = zones.gantt;
	const disposeResize = setupResize(zones);

	await reload();

	return { ...zones, state, disposeResize };
}
