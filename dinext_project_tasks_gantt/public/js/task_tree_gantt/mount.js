import { DEFAULT_TITLE } from "./constants.js";
import { setupFilters } from "./filters/index.js";
import {
	destroyGantt,
	ensureGantt,
	scheduleGanttRefresh,
	wireTreeGanttHooks,
} from "./gantt/index.js";
import { buildShell, setupResize } from "./shell/layout.js";
import { setColumnContext } from "./table/columns/context.js";
import { loadTable } from "./table/index.js";

export async function mount({ page }) {
	page.set_title(DEFAULT_TITLE);
	page.wrapper?.addClass?.("task-tree-gantt-page");

	const state = {
		getArgs: null,
		tableHost: null,
		ganttEl: null,
		table: null,
		gantt: null,
		fullscreenShell: null,
	};

	const reload = async (opts = {}) => {
		state.table = await loadTable(state.tableHost, state.getArgs, {
			// Coalesced — avoid parallel ensureGantt with mount await below.
			onTreeChange: () => scheduleGanttRefresh(state),
			onCellsSaved: () => scheduleGanttRefresh(state),
			// Client sort reorders source — gantt bars must follow row order.
			onSortChange: () => scheduleGanttRefresh(state),
			onFilterChange: (ctx) => {
				state.applyGanttOffset?.();
				const json = JSON.stringify(ctx?.filter || {});
				if (json !== state._ganttFilterJson) {
					state._ganttFilterJson = json;
					scheduleGanttRefresh(state);
				}
			},
			// page.main = page-form filters + Tree Gantt shell (WR fullscreen pattern).
			fullscreenShell: state.fullscreenShell,
			expandRowIds: opts.expandRowIds,
		});
		if (state.table) {
			wireTreeGanttHooks(state.table, state);
			await ensureGantt(state);
		} else {
			destroyGantt(state);
		}
	};

	const filters = await setupFilters({
		page,
		onChange: () => {
			if (state.tableHost) {
				void reload();
			}
		},
	});
	state.getArgs = filters.getArgs;
	state.applyRouteProject = filters.applyRouteProject;

	const refreshGantt = () => scheduleGanttRefresh(state);
	setColumnContext({
		page,
		onAssignSaved: refreshGantt,
		onGanttRefresh: refreshGantt,
		// Subject toolbar Add/Delete/Multiple → full reload.
		onTreeMutate: (opts) => {
			void reload(opts);
		},
	});

	const main = page.main.get(0);
	state.fullscreenShell = main;
	const zones = buildShell(main);
	state.tableHost = zones.tableHost;
	state.ganttEl = zones.gantt;
	state.ganttHScroll = zones.ganttHScroll;
	const disposeResize = setupResize(zones);

	await reload();

	const onShow = () => reload();

	return { ...zones, state, disposeResize, onShow };
}
