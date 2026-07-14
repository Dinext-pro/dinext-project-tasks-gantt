// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

import { getChildren } from "../api.js";
import { queryArgsFromState } from "../state.js";

/**
 * Canonical API row → DinextTable row.
 * @param {object} row
 */
export function toGridRow(row) {
	return {
		id: row.id,
		subject: row.subject || "",
		status: row.status || "",
		priority: row.priority || "",
		task_type: row.task_type || "",
		type: row.task_type_label || row.task_type || "",
		exp_start_date: row.exp_start_date || null,
		exp_end_date: row.exp_end_date || null,
		custom_planned_start_date: row.custom_planned_start_date || null,
		custom_planned_end_date: row.custom_planned_end_date || null,
		expected_time: row.expected_time ?? null,
		duration: row.duration ?? null,
		progress: row.progress ?? 0,
		assign: Array.isArray(row.assign) ? row.assign : [],
		user_tags: row.user_tags || "",
		custom_include: row.custom_include ? 1 : 0,
		is_milestone: row.is_milestone ? 1 : 0,
		color: row.color || null,
		parent_task: row.parent_task || null,
		relations: row.relations || [],
		owner: row.owner || null,
		hasChildren: !!row.has_children,
		can_write: row.can_write ? 1 : 0,
	};
}

export function mapRows(rows) {
	return (rows || []).map(toGridRow);
}

/** Flat list → nested tree by parent_task. */
export function nestRows(flat) {
	const byId = {};
	for (const row of flat || []) {
		byId[row.id] = { ...row, children: [] };
	}
	const roots = [];
	for (const row of flat || []) {
		const node = byId[row.id];
		const parentId = row.parent_task;
		if (parentId && byId[parentId]) {
			byId[parentId].children.push(node);
			byId[parentId].hasChildren = true;
		} else {
			roots.push(node);
		}
	}
	for (const node of Object.values(byId)) {
		if (!node.children.length) {
			delete node.children;
		} else {
			node.hasChildren = true;
		}
	}
	return roots;
}

/**
 * @param {object} args — see queryArgsFromState + parent_task / all_tasks
 */
export async function fetchChildren(args) {
	if (!args?.project) {
		return [];
	}
	const rows = await getChildren(args);
	return mapRows(rows);
}

/** Load project root rows into state.rows */
export async function loadRootRows(state) {
	if (!state.project) {
		state.rows = [];
		return state.rows;
	}
	state.rows = await fetchChildren(
		queryArgsFromState(state, { parent_task: null })
	);
	return state.rows;
}

/** Load full project tree (all_tasks) nested for Expand All. */
export async function loadAllRows(state) {
	if (!state.project) {
		state.rows = [];
		return state.rows;
	}
	const flat = await fetchChildren(
		queryArgsFromState(state, { all_tasks: 1 })
	);
	state.rows = nestRows(flat);
	return state.rows;
}
