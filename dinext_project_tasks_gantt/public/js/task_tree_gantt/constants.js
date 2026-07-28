export const DEFAULT_TITLE = __("Project Structure Plan");

export const PROJECT_STORAGE_SUFFIX = ":tree:project";

export function projectStorageKey() {
	return `${frappe.user.name}${PROJECT_STORAGE_SUFFIX}`;
}

export const LAYOUT_WIDTH_KEY = "layout_widths_Tree_Task";

export const MIN_LEFT_PCT = 30;
export const MIN_RIGHT_PCT = 2;
export const DEFAULT_LEFT_PCT = 55;

/** Match legacy tree/gantt pitch: bar_height + padding. */
export const ROW_HEIGHT = 27;
export const GANTT_BAR_HEIGHT = 19;
export const GANTT_PADDING = 8;

/** frappe-gantt grid-header = upper + lower + chrome (keep table/gantt sync). */
export const GANTT_UPPER_HEADER = 40;
export const GANTT_LOWER_HEADER = 26;
export const GANTT_HEADER_CHROME = 10;
/** Table headerHeight = gantt upper+lower+chrome (76). Gantt host: CSS padding-top 3px. */
export const HEADER_HEIGHT =
	GANTT_UPPER_HEADER + GANTT_LOWER_HEADER + GANTT_HEADER_CHROME;

export const GANTT_ASSETS = [
	"/assets/dinext_common/js/frappe-gantt.umd.js",
	"/assets/dinext_common/css/frappe-gantt.css",
];
