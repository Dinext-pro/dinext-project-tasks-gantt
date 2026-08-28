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
export const ROW_HEIGHT = 32;
export const GANTT_BAR_HEIGHT = 19;
export const GANTT_PADDING = 13;

/** frappe-gantt calendar (upper + lower). Library adds +10 → 76px.
 *  Week zeros lower row at runtime (dates stay, period labels go). */
export const GANTT_UPPER_HEADER = 40;
export const GANTT_LOWER_HEADER = 26;
export const GANTT_HEADER_CHROME = 10;
export const GANTT_HEADER_HEIGHT =
	GANTT_UPPER_HEADER + GANTT_LOWER_HEADER + GANTT_HEADER_CHROME;

/** Compact DinextTable column titles. Independent of Gantt calendar. */
export const HEADER_HEIGHT = 42;

export const GANTT_ASSETS = [
	"/assets/dinext_common/js/frappe-gantt.umd.js",
	"/assets/dinext_common/css/frappe-gantt.css",
];
