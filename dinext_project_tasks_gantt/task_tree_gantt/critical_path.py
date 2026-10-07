# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Critical path from planned dates and active Task Relation rows.

Float is as-scheduled total float: how many business days the planned start
can move later before the project finish or a successor constraint moves.
Dates are not written back.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable

import frappe

from dinext_project_tasks_gantt.task_tree_gantt.get_data.acl import TaskTreeAcl

_CANCELLED = "Cancelled"


def parse_day(value) -> date | None:
	if value is None or value == "":
		return None
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value
	text = str(value).strip()[:10]
	try:
		year, month, day = text.split("-")
		return date(int(year), int(month), int(day))
	except (TypeError, ValueError):
		return None


def _iso(value: date | None) -> str:
	return value.isoformat() if value else ""


def is_business_day(day: date, holidays: set[str]) -> bool:
	if day.weekday() >= 5:
		return False
	return day.isoformat() not in holidays


def add_business_days(start: date | None, offset: int, holidays: set[str]) -> date | None:
	"""Same rule as preview_propagation: offset 0 returns the anchor unchanged."""
	if start is None:
		return None
	current = start
	step = 1 if int(offset) >= 0 else -1
	remaining = abs(int(offset))
	while remaining > 0:
		current = current + timedelta(days=step)
		if not is_business_day(current, holidays):
			continue
		remaining -= 1
	return current


def business_offset(start: date, end: date, holidays: set[str]) -> int:
	"""Signed working-day steps from start to end. Zero when the dates match."""
	if start == end:
		return 0
	step = 1 if end > start else -1
	current = start
	count = 0
	guard = 0
	while current != end and guard < 3660:
		current = current + timedelta(days=step)
		guard += 1
		if is_business_day(current, holidays):
			count += step
	return count


def relation_kind(rel_type) -> str:
	if not rel_type:
		return ""
	token = str(rel_type).strip().split()[0].upper()
	if token in {"FS", "SS", "FF", "SF"}:
		return token
	return ""


def _cycle_nodes(node_ids: list[str], edges: list[tuple[str, str]]) -> set[str]:
	adj: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
	radj: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
	cyclic: set[str] = set()
	for pred, succ in edges:
		if pred not in adj or succ not in adj:
			continue
		if pred == succ:
			cyclic.add(pred)
			continue
		adj[pred].append(succ)
		radj[succ].append(pred)

	def postorder(graph: dict[str, list[str]]) -> list[str]:
		seen: set[str] = set()
		order: list[str] = []
		for start in node_ids:
			if start in seen:
				continue
			stack = [start]
			seen.add(start)
			while stack:
				current = stack[-1]
				pending = next((nxt for nxt in graph[current] if nxt not in seen), None)
				if pending is None:
					order.append(stack.pop())
					continue
				seen.add(pending)
				stack.append(pending)
		return order

	seen_rev: set[str] = set()
	for start in reversed(postorder(adj)):
		if start in seen_rev:
			continue
		stack = [start]
		seen_rev.add(start)
		component = []
		while stack:
			current = stack.pop()
			component.append(current)
			for nxt in radj[current]:
				if nxt not in seen_rev:
					seen_rev.add(nxt)
					stack.append(nxt)
		if len(component) > 1:
			cyclic.update(component)
	return cyclic


def _reconcile(late_start: date, late_finish: date, offset: int, holidays: set[str]) -> tuple[date, date]:
	for _ in range(3):
		from_finish = add_business_days(late_finish, -offset, holidays)
		if from_finish and from_finish < late_start:
			late_start = from_finish
		from_start = add_business_days(late_start, offset, holidays)
		if from_start and from_start < late_finish:
			late_finish = from_start
	return late_start, late_finish


def compute_critical_path(tasks: Iterable[dict], relations: Iterable[dict], holidays: Iterable[str] | None = None) -> dict:
	"""Return critical task ids, tight edges, and whether a cycle was excluded."""
	holiday_set = {str(day)[:10] for day in (holidays or []) if day}
	nodes: dict[str, dict] = {}
	for raw in tasks or []:
		task_id = str(raw.get("id") or raw.get("name") or "").strip()
		if not task_id or task_id in nodes:
			continue
		if str(raw.get("status") or "") == _CANCELLED:
			continue
		start = parse_day(raw.get("start") if "start" in raw else raw.get("exp_start_date"))
		end = parse_day(raw.get("end") if "end" in raw else raw.get("exp_end_date"))
		if not start or not end:
			continue
		if raw.get("is_milestone"):
			end = start
		if end < start:
			continue
		nodes[task_id] = {
			"id": task_id,
			"start": start,
			"end": end,
			"offset": business_offset(start, end, holiday_set),
		}

	parsed_edges = []
	for raw in relations or []:
		pred = str(raw.get("predecessor") or raw.get("from") or "").strip()
		succ = str(raw.get("task") or raw.get("parent") or raw.get("to") or "").strip()
		kind = relation_kind(raw.get("type"))
		if not pred or not succ or not kind:
			continue
		if pred not in nodes or succ not in nodes:
			continue
		try:
			buffer_days = int(raw.get("buffer_days") if raw.get("buffer_days") is not None else raw.get("buffer") or 0)
		except (TypeError, ValueError):
			buffer_days = 0
		parsed_edges.append({"from": pred, "to": succ, "type": kind, "buffer": buffer_days})

	cyclic = _cycle_nodes(list(nodes), [(edge["from"], edge["to"]) for edge in parsed_edges])
	if cyclic:
		nodes = {task_id: node for task_id, node in nodes.items() if task_id not in cyclic}
		parsed_edges = [edge for edge in parsed_edges if edge["from"] not in cyclic and edge["to"] not in cyclic]

	if not nodes:
		return {"tasks": [], "edges": [], "cycles": bool(cyclic)}

	project_finish = max(node["end"] for node in nodes.values())
	outgoing: dict[str, list[dict]] = defaultdict(list)
	indeg = {task_id: 0 for task_id in nodes}
	for edge in parsed_edges:
		outgoing[edge["from"]].append(edge)
		indeg[edge["to"]] = indeg.get(edge["to"], 0) + 1

	queue = [task_id for task_id, degree in indeg.items() if degree == 0]
	order: list[str] = []
	while queue:
		current = queue.pop()
		order.append(current)
		for edge in outgoing[current]:
			indeg[edge["to"]] -= 1
			if indeg[edge["to"]] == 0:
				queue.append(edge["to"])

	late: dict[str, tuple[date, date]] = {}
	for task_id in reversed(order):
		node = nodes[task_id]
		late_finish = project_finish
		late_start = add_business_days(late_finish, -node["offset"], holiday_set) or node["start"]
		for edge in outgoing[task_id]:
			succ_start, succ_finish = late[edge["to"]]
			buffer_days = edge["buffer"]
			if edge["type"] == "FS":
				bound = add_business_days(succ_start, -buffer_days, holiday_set)
				if bound and bound < late_finish:
					late_finish = bound
			elif edge["type"] == "FF":
				bound = add_business_days(succ_finish, -buffer_days, holiday_set)
				if bound and bound < late_finish:
					late_finish = bound
			elif edge["type"] == "SS":
				bound = add_business_days(succ_start, -buffer_days, holiday_set)
				if bound and bound < late_start:
					late_start = bound
			elif edge["type"] == "SF":
				bound = add_business_days(succ_finish, -buffer_days, holiday_set)
				if bound and bound < late_start:
					late_start = bound
		late[task_id] = _reconcile(late_start, late_finish, node["offset"], holiday_set)

	critical = []
	for task_id in nodes:
		late_start, _late_finish = late[task_id]
		if business_offset(nodes[task_id]["start"], late_start, holiday_set) <= 0:
			critical.append(task_id)
	critical_set = set(critical)

	tight = []
	for edge in parsed_edges:
		if edge["from"] not in critical_set or edge["to"] not in critical_set:
			continue
		pred = nodes[edge["from"]]
		succ = nodes[edge["to"]]
		if edge["type"] in {"FS", "SS"}:
			anchor = pred["end"] if edge["type"] == "FS" else pred["start"]
			actual = succ["start"]
		else:
			anchor = pred["end"] if edge["type"] == "FF" else pred["start"]
			actual = succ["end"]
		required = add_business_days(anchor, edge["buffer"], holiday_set)
		if required and actual == required:
			tight.append({"from": edge["from"], "to": edge["to"], "type": edge["type"]})

	return {
		"tasks": sorted(critical_set),
		"edges": tight,
		"cycles": bool(cyclic),
	}


def holiday_dates_for_project(project: str) -> set[str]:
	if not project:
		return set()
	values = frappe.db.get_value("Project", project, ["holiday_list", "company"], as_dict=True) or {}
	holiday_list = values.get("holiday_list")
	if not holiday_list and values.get("company"):
		holiday_list = frappe.db.get_value("Company", values.get("company"), "default_holiday_list")
	if not holiday_list:
		return set()
	rows = frappe.get_all(
		"Holiday",
		filters={"parent": holiday_list},
		fields=["holiday_date"],
		limit_page_length=0,
	)
	return {_iso(parse_day(row.get("holiday_date"))) for row in rows if row.get("holiday_date")}


def get_critical_path(project: str) -> dict:
	if not project:
		frappe.throw(frappe._("Project is required"))
	if not frappe.has_permission("Task", "read"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	rows = TaskTreeAcl.readable_task_rows(
		project,
		["name", "status", "exp_start_date", "exp_end_date", "is_group", "is_milestone"],
	)
	names = [row["name"] for row in rows if row.get("name")]
	relations = []
	if names:
		relations = frappe.get_all(
			"Task Relation",
			filters={"parent": ["in", names], "parenttype": "Task", "is_active": 1},
			fields=["parent", "predecessor", "type", "buffer_days"],
			limit_page_length=0,
		)
	tasks = [
		{
			"id": row["name"],
			"status": row.get("status"),
			"exp_start_date": row.get("exp_start_date"),
			"exp_end_date": row.get("exp_end_date"),
			"is_milestone": row.get("is_milestone"),
			"is_group": row.get("is_group"),
		}
		for row in rows
	]
	result = compute_critical_path(tasks, relations, holiday_dates_for_project(project))
	return result
