/**
 * Task Relation.type Select options + short display badge.
 */
import { DEFAULT_RELATION_TYPE } from "./persist.js";

export function getRelationTypeOptions() {
	const field =
		frappe.meta.get_docfield?.("Task Relation", "type") ||
		frappe.meta.get_field?.("Task Relation", "type");
	const raw = field?.options || "";
	const fromMeta = String(raw)
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	if (fromMeta.length) {
		return fromMeta;
	}
	return [
		"FS (Finish → Start)",
		"SS (Start → Start)",
		"FF (Finish → Finish)",
		"SF (Start → Finish)",
	];
}

/** Short badge: FS / SS / FF / SF. */
export function shortRelationType(type) {
	if (!type) {
		return "FS";
	}
	const m = String(type).match(/^(FS|SS|FF|SF)/);
	return m ? m[1] : String(type).slice(0, 2);
}

export { DEFAULT_RELATION_TYPE };
