/**
 * Task Relation.type Select options + short display badge.
 * Canonical values stay English; Frappe Select shows __(value).
 */
function mapSelectKey(raw, options) {
	if (typeof DinextTable?.parseSelectValue === "function") {
		return DinextTable.parseSelectValue(raw, options);
	}
	if (raw == null || raw === "") {
		return null;
	}
	const s = String(raw).trim();
	return options.includes(s) ? s : null;
}

export const RELATION_TYPE_VALUES = [
	"FS (Finish → Start)",
	"SS (Start → Start)",
	"FF (Finish → Finish)",
	"SF (Start → Finish)",
];

/** Canonical Select value from Task Relation.type. */
export const DEFAULT_RELATION_TYPE = RELATION_TYPE_VALUES[0];

export function getRelationTypeOptions() {
	const field =
		frappe.meta.get_docfield?.("Task Relation", "type") ||
		frappe.meta.get_field?.("Task Relation", "type");
	const raw = field?.options || "";
	const fromMeta = String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	return fromMeta.length ? fromMeta : RELATION_TYPE_VALUES;
}

/**
 * Label / prefix / English key → English option. Save path stays English.
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveRelationType(raw) {
	if (raw == null || raw === "") {
		return DEFAULT_RELATION_TYPE;
	}
	const s = String(raw).trim();
	if (!s) {
		return DEFAULT_RELATION_TYPE;
	}
	const options = getRelationTypeOptions();
	if (options.includes(s)) {
		return s;
	}
	const mapped = mapSelectKey(s, options);
	if (mapped && options.includes(mapped)) {
		return mapped;
	}
	const short = s.match(/^(FS|SS|FF|SF)/);
	if (short) {
		const byPrefix = options.find(
			(opt) => opt === short[1] || opt.startsWith(`${short[1]} `)
		);
		if (byPrefix) {
			return byPrefix;
		}
	}
	return s;
}

/** Short badge: FS / SS / FF / SF. */
export function shortRelationType(type) {
	if (!type) {
		return "FS";
	}
	const m = String(type).match(/^(FS|SS|FF|SF)/);
	return m ? m[1] : String(type).slice(0, 2);
}
