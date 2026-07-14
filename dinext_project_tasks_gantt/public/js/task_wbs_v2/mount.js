import { DEFAULT_TITLE } from "./constants.js";
import { setupFilters } from "./filters/index.js";
import {
	destroyGantt,
	ensureGantt,
	scheduleGanttRefresh,
	wireTreeGanttHooks,
} from "./gantt/index.js";
import { buildShell, setupResize } from "./shell/layout.js";
import { setupToolbar } from "./shell/toolbar.js";
import { loadTable } from "./table/index.js";

export async function mount({ page }) {
	page.set_title(DEFAULT_TITLE);

	const state = {
		getArgs: null,
		tableHost: null,
		ganttEl: null,
		table: null,
		gantt: null,
	};

	const reload = async () => {
		state.table = await loadTable(state.tableHost, state.getArgs, {
			onTreeChange: () => scheduleGanttRefresh(state),
			onCellsSaved: () => scheduleGanttRefresh(state),
			// Client sort reorders source — gantt bars must follow row order.
			onSortChange: () => scheduleGanttRefresh(state),
		});
		if (state.table) {
			wireTreeGanttHooks(state.table, state);
			await ensureGantt(state);
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

	const main = page.main.get(0);
	const zones = buildShell(main);
	state.tableHost = zones.tableHost;
	state.ganttEl = zones.gantt;
	const disposeResize = setupResize(zones);

	setupToolbar({ page, state });

	await reload();

	return { ...zones, state, disposeResize };
}
