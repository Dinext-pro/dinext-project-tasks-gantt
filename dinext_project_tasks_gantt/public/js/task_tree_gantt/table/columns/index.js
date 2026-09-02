/**
 * Column defs aggregator. Per-column files live beside this index.
 * Import as `./columns/index.js` — no sibling table/columns.js.
 */
import { deniedTitle, fieldIsHidden } from "../save.js";
import { assignColumn } from "./assign/index.js";
import {
	actualEndColumn,
	actualStartColumn,
	expEndColumn,
	expStartColumn,
	plannedEndColumn,
	plannedStartColumn,
} from "./dates/index.js";
import { durationColumn } from "./duration.js";
import { includeColumn } from "./include.js";
import { planFactColumn } from "./plan_fact/index.js";
import { priorityColumn } from "./priority/index.js";
import { progressColumn } from "./progress.js";
import { relationsColumn } from "./relations/index.js";
import { statusColumn } from "./status/index.js";
import { subjectColumn } from "./subject/index.js";
import { tagsColumn } from "./tags.js";
import { typeColumn } from "./type.js";

/**
 * Cursor class + native title from existing `edit` callback.
 * Subject skips title — hover preview fights native tooltip.
 */
function withHiddenMask(col) {
	if (!col.field) {
		return col;
	}
	const field = col.field;
	const prevGetter = col.valueGetter;
	const prevRenderer = col.cellRenderer;
	const next = {
		...col,
		valueGetter: (params) => {
			if (fieldIsHidden(params.data, field)) {
				return null;
			}
			if (typeof prevGetter === "function") {
				return prevGetter(params);
			}
			return params.data?.[field];
		},
	};
	if (typeof prevRenderer === "function") {
		next.cellRenderer = (params) => {
			if (fieldIsHidden(params.data, field)) {
				return "";
			}
			return prevRenderer(params);
		};
	}
	return next;
}

function withWriteDeniedHint(col) {
	if (typeof col.edit !== "function" || !col.field) {
		return col;
	}
	const field = col.field;
	const prevRules = col.cellClassRules || {};
	const prevTip = col.tooltipValueGetter;
	const prevCellRenderer = col.cellRenderer;
	const next = {
		...col,
		cellClassRules: {
			...prevRules,
			"tree-gantt-cell--write-denied": (params) => !col.edit(params.data),
		},
	};
	if (field !== "subject") {
		next.tooltipValueGetter = (params) =>
			deniedTitle(params.data, field) ||
			(typeof prevTip === "function" ? prevTip(params) : undefined);
	}
	if (typeof prevCellRenderer === "function") {
		next.cellRenderer = (params) => {
			const el = prevCellRenderer(params);
			const tip = deniedTitle(params.data, field);
			if (tip && el instanceof HTMLElement) {
				el.title = tip;
			}
			return el;
		};
	}
	return next;
}

/**
 * Column parity + inline edit.
 * Sortable flags match Tree header (status/priority/dates/duration/progress).
 * With sort.enabled, default is sortable — explicit false for opt-out.
 */
export function getColumns() {
	return [
		subjectColumn(),
		assignColumn(),
		relationsColumn(),
		planFactColumn(),
		statusColumn(),
		priorityColumn(),
		plannedStartColumn(),
		plannedEndColumn(),
		expStartColumn(),
		expEndColumn(),
		actualStartColumn(),
		actualEndColumn(),
		durationColumn(),
		progressColumn(),
		includeColumn(),
		typeColumn(),
		tagsColumn(),
	].map((col) => withWriteDeniedHint(withHiddenMask(col)));
}
