/** Severity rank for Task.priority (asc = Low → … → Urgent). */
const PRIORITY_RANK = Object.freeze({
	Low: 1,
	Medium: 2,
	High: 3,
	Urgent: 4,
});

function priorityRank(value) {
	if (value == null || value === "") return null;
	const key = String(value);
	if (Object.prototype.hasOwnProperty.call(PRIORITY_RANK, key)) return PRIORITY_RANK[key];
	return null;
}

/**
 * Custom comparator for sort.comparators.priority.
 * Core applies asc/desc after this returns signed cmp.
 */
export function comparePriority(a, b) {
	const ra = priorityRank(a);
	const rb = priorityRank(b);
	if (ra == null && rb == null) {
		return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
			sensitivity: "base",
		});
	}
	if (ra == null) return 1;
	if (rb == null) return -1;
	return ra - rb;
}

export const SORT_COMPARATORS = {
	priority: comparePriority,
};
