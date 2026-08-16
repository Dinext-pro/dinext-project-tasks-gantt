/**
 * Column defs aggregator. Per-column files live beside this index.
 * Import as `./columns/index.js` — no sibling table/columns.js.
 */
import { assignColumn } from "./assign/index.js";
import { expEndColumn, expStartColumn } from "./dates/index.js";
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
		expStartColumn(),
		expEndColumn(),
		durationColumn(),
		progressColumn(),
		includeColumn(),
		typeColumn(),
		tagsColumn(),
	];
}
