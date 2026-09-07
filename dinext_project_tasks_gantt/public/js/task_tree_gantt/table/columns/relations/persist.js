/**
 * Sync Task.custom_relations (Task Relation) from popover row list.
 * Each row: predecessor + type (+ buffer preserved when key matches).
 * type is English Select value; UI labels go through __().
 */
import { DEFAULT_RELATION_TYPE, resolveRelationType } from "./options.js";

export { DEFAULT_RELATION_TYPE };

function normalizeRelationType(value) {
	return resolveRelationType(value);
}

function relationKey(predecessor, type) {
	return `${predecessor}\0${normalizeRelationType(type)}`;
}

/**
 * @returns {{
 *   predecessor: string,
 *   predecessor_subject?: string,
 *   type: string,
 *   buffer_days: number,
 *   is_active: number,
 *   name?: string,
 *   project?: string,
 * }[]}
 */
export function normalizeRelations(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	const out = [];
	const seen = new Set();
	for (const raw of value) {
		if (!raw || typeof raw !== "object") {
			continue;
		}
		const predecessor = String(raw.predecessor || "").trim();
		if (!predecessor) {
			continue;
		}
		const type = normalizeRelationType(raw.type);
		const key = relationKey(predecessor, type);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const subject = String(
			raw.predecessor_subject || raw.subject || ""
		).trim();
		out.push({
			predecessor,
			predecessor_subject: subject || undefined,
			type,
			buffer_days: Number(raw.buffer_days) || 0,
			is_active: raw.is_active == null ? 1 : raw.is_active ? 1 : 0,
			name: raw.name || undefined,
			project: raw.project || undefined,
		});
	}
	return out;
}

/** Fill predecessor_subject for display (Task.subject). */
export async function enrichPredecessorSubjects(relations) {
	const list = normalizeRelations(relations);
	const need = [
		...new Set(
			list
				.filter((r) => !r.predecessor_subject)
				.map((r) => r.predecessor)
		),
	];
	if (!need.length) {
		return list;
	}
	let rows = [];
	try {
		rows = await frappe.db.get_list("Task", {
			filters: { name: ["in", need] },
			fields: ["name", "subject"],
			limit: need.length,
		});
	} catch (e) {
		console.error("[task_tree_gantt] enrichPredecessorSubjects", e);
		return list;
	}
	const byName = new Map(
		(rows || []).map((t) => [t.name, t.subject || ""])
	);
	return list.map((r) => ({
		...r,
		predecessor_subject:
			r.predecessor_subject || byName.get(r.predecessor) || "",
	}));
}

export function predecessorLabel(rel) {
	if (!rel) {
		return "";
	}
	const subject = String(rel.predecessor_subject || "").trim();
	if (subject && subject !== rel.predecessor) {
		return subject;
	}
	return subject || rel.predecessor || "";
}

/** Resolve Task.subject from loaded tree rows (same grid). */
export function subjectFromGrid(api, taskId) {
	if (!api || !taskId) {
		return "";
	}
	let found = "";
	api.forEachNode?.((node) => {
		if (found || !node?.data) {
			return;
		}
		if (node.data.id === taskId && node.data.subject) {
			found = String(node.data.subject).trim();
		}
	});
	return found;
}

/**
 * Prefer subject on the relation; else tree row subject / link title cache.
 */
export function withResolvedSubjects(relations, api = null) {
	return normalizeRelations(relations).map((r) => {
		let subject = String(r.predecessor_subject || "").trim();
		if (!subject || subject === r.predecessor) {
			subject = subjectFromGrid(api, r.predecessor) || subject;
		}
		if (!subject || subject === r.predecessor) {
			try {
				const titled =
					frappe.utils.get_link_title?.("Task", r.predecessor) || "";
				if (titled && titled !== r.predecessor) {
					subject = String(titled).trim();
				}
			} catch (e) {
				/* ignore */
			}
		}
		return {
			...r,
			predecessor_subject: subject || r.predecessor_subject || "",
		};
	});
}

export function sameRelations(a, b) {
	const left = normalizeRelations(a)
		.map((r) => relationKey(r.predecessor, r.type))
		.sort();
	const right = normalizeRelations(b)
		.map((r) => relationKey(r.predecessor, r.type))
		.sort();
	if (left.length !== right.length) {
		return false;
	}
	return left.every((k, i) => k === right[i]);
}

export function relationsFromRow(row, value, api = null) {
	const fromValue =
		Array.isArray(value) && value.length && typeof value[0] === "object"
			? normalizeRelations(value)
			: null;
	const fromRow = Array.isArray(row?.relations)
		? normalizeRelations(row.relations)
		: [];
	const base = fromValue?.length ? fromValue : fromRow;
	// Merge subjects: value may lose predecessor_subject after grid commit.
	const byPred = new Map(
		fromRow.map((r) => [r.predecessor, r.predecessor_subject || ""])
	);
	const merged = base.map((r) => ({
		...r,
		predecessor_subject:
			r.predecessor_subject || byPred.get(r.predecessor) || "",
	}));
	return withResolvedSubjects(merged, api);
}

export function stampRelationsOnRow(row, nextRelations) {
	if (!row) {
		return;
	}
	const next = normalizeRelations(nextRelations);
	row.relations = next;
	row.predecessors = next.map((r) => r.predecessor);
}

async function validateRelationRow(taskId, predecessor, relType, bufferDays) {
	try {
		const check = await frappe.xcall("validate_relation", {
			parent_successor: taskId,
			predecessor,
			rel_type: relType,
			buffer_days: bufferDays || 0,
		});
		if (check && check.ok === false) {
			throw new Error(check.error || __("Invalid relation"));
		}
	} catch (e) {
		const msg = e?.message || String(e || "");
		if (
			msg.includes("validate_relation") ||
			msg.includes("not found") ||
			msg.includes("AttributeError")
		) {
			return;
		}
		throw e instanceof Error ? e : new Error(msg || __("Invalid relation"));
	}
}

/**
 * Replace custom_relations with desired active rows.
 * @param {string} taskId
 * @param {object[] | null} relations
 * @param {{ project?: string | null }} [hint]
 */
export async function syncTaskRelations(taskId, relations, hint = {}) {
	if (!taskId) {
		return;
	}
	const desired = normalizeRelations(relations);
	if (desired.some((r) => r.predecessor === taskId)) {
		throw new Error(__("Predecessor can't be same as successor"));
	}

	const got = await frappe.call({
		method: "frappe.client.get",
		args: { doctype: "Task", name: taskId },
	});
	const doc = got.message;
	if (!doc) {
		throw new Error(__("Task {0} not found", [taskId]));
	}

	const prevRows = doc.custom_relations || [];
	const prevByKey = new Map();
	for (const r of prevRows) {
		if (!r.predecessor) {
			continue;
		}
		prevByKey.set(relationKey(r.predecessor, r.type), r);
	}

	const project = hint.project || doc.project || null;
	const nextRows = [];

	for (const row of desired) {
		const key = relationKey(row.predecessor, row.type);
		const prev = prevByKey.get(key);
		if (prev) {
			nextRows.push({
				name: prev.name,
				predecessor: row.predecessor,
				type: row.type,
				buffer_days: prev.buffer_days ?? row.buffer_days ?? 0,
				is_active: 1,
				project: prev.project || project || undefined,
			});
		} else {
			await validateRelationRow(
				taskId,
				row.predecessor,
				row.type,
				row.buffer_days || 0
			);
			nextRows.push({
				predecessor: row.predecessor,
				type: row.type,
				buffer_days: row.buffer_days || 0,
				is_active: 1,
				project: project || undefined,
			});
		}
	}

	doc.custom_relations = nextRows;
	await frappe.call({
		method: "frappe.client.save",
		args: { doc },
		freeze: true,
		freeze_message: __("Updating relations…"),
	});
	// Keep subjects from draft, fill gaps from Task.
	const withSubjects = nextRows.map((r) => {
		const fromDraft = desired.find(
			(d) =>
				d.predecessor === r.predecessor &&
				normalizeRelationType(d.type) === normalizeRelationType(r.type)
		);
		return {
			...r,
			predecessor_subject: fromDraft?.predecessor_subject,
		};
	});
	return enrichPredecessorSubjects(withSubjects);
}

export async function syncTaskRelationsMany(ops) {
	const list = (ops || []).filter((op) => op?.taskId);
	for (const op of list) {
		op.relations = await syncTaskRelations(op.taskId, op.relations, {
			project: op.project,
		});
	}
}

export { normalizeRelationType, relationKey };
