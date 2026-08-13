"""Depend_Task_Date_Check — Task Before Save (prod parity, ISS-2025-02699).

Если менялись exp_* — периоды задач из depends_on должны влезать в период текущего Task.
Конфликт: окно. Кнопка «подогнать» — только если факт всех связанных не торчит за новое окно.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import format_date, getdate


def validate_depend_task_dates(doc) -> None:
	"""Before Save: проверить depends_on vs exp_* текущего Task."""
	old_doc = doc.get_doc_before_save()

	date_changed = False
	if old_doc:
		if old_doc.exp_start_date != doc.exp_start_date:
			date_changed = True
		if old_doc.exp_end_date != doc.exp_end_date:
			date_changed = True

	if not date_changed and old_doc:
		return

	overlapping = collect_overlapping_depends(doc)
	if not overlapping:
		return

	_throw_period_conflict(doc, overlapping)


def collect_overlapping_depends(doc) -> list[dict]:
	"""Связанные depends_on, чей exp_* не влезает в exp_* текущего Task."""
	if not doc.depends_on or not doc.exp_start_date or not doc.exp_end_date:
		return []

	dependent_tasks = [row.task for row in doc.depends_on if row.task]
	if not dependent_tasks:
		return []

	tasks_data = frappe.get_all(
		"Task",
		filters={"name": ["in", dependent_tasks]},
		fields=[
			"name",
			"subject",
			"exp_start_date",
			"exp_end_date",
			"act_start_date",
			"act_end_date",
			"completed_on",
		],
	)
	tasks_dict = {task.name: task for task in tasks_data}

	win_start = getdate(doc.exp_start_date)
	win_end = getdate(doc.exp_end_date)
	overlapping = []

	for row in doc.depends_on:
		if not row.task or row.task not in tasks_dict:
			continue

		dependent_task = tasks_dict[row.task]
		if not dependent_task.exp_start_date or not dependent_task.exp_end_date:
			continue

		dependent_start = getdate(dependent_task.exp_start_date)
		dependent_end = getdate(dependent_task.exp_end_date)
		if dependent_start < win_start or dependent_end > win_end:
			overlapping.append(dependent_task)

	return overlapping


def fact_blocks_fit(task, win_start, win_end) -> bool:
	"""Факт торчит за новое окно → прогноз нельзя ужать под родителя."""
	act_start = task.get("act_start_date") if hasattr(task, "get") else getattr(task, "act_start_date", None)
	fact_start = getdate(act_start) if act_start else None
	fact_end = _fact_end(task)
	if fact_start and fact_start < win_start:
		return True
	if fact_end and fact_end > win_end:
		return True
	return False


def _fact_end(task):
	act_end = task.get("act_end_date") if hasattr(task, "get") else getattr(task, "act_end_date", None)
	completed_on = task.get("completed_on") if hasattr(task, "get") else getattr(task, "completed_on", None)
	parts = [getdate(value) for value in (act_end, completed_on) if value]
	return max(parts) if parts else None


def _throw_period_conflict(doc, overlapping) -> None:
	win_start = getdate(doc.exp_start_date)
	win_end = getdate(doc.exp_end_date)
	blocked = [task for task in overlapping if fact_blocks_fit(task, win_start, win_end)]
	can_fit = not blocked

	period = f"{format_date(doc.exp_start_date)} — {format_date(doc.exp_end_date)}"
	rows = "<br>".join(_task_row_html(task, blocked=task in blocked) for task in overlapping)

	if can_fit:
		hint = _(
			"Прогноз связанных задач должен целиком входить в этот период. "
			"Фактические даты не мешают: можно подогнать их прогноз под выбранный период "
			"(факт не изменится)."
		)
		primary_action = {
			"label": _("Fit planned dates of dependent tasks"),
			"client_action": "dinext_fit_depend_task_dates",
			"args": {
				"task": getattr(doc, "name", None),
				"exp_start_date": str(win_start),
				"exp_end_date": str(win_end),
			},
			"hide_on_success": True,
		}
	else:
		hint = _(
			"Подогнать прогноз нельзя: у связанных задач факт выходит за новый период. "
			"Прогноз не может быть короче факта."
		)
		primary_action = None

	msg = _(
		"<b>Задача:</b> {subject}<br>"
		"<b>Новый прогнозный период:</b> {period}<br><br>"
		"{hint}<br><br>"
		"<b>Задачи вне периода:</b><br>{rows}"
	).format(subject=doc.subject, period=period, hint=hint, rows=rows)

	frappe.throw(
		title=_("Конфликт дат периодов"),
		msg=msg,
		exc=frappe.ValidationError,
		is_minimizable=True,
		primary_action=primary_action,
	)


def _task_row_html(task, *, blocked: bool) -> str:
	plan = f"{format_date(task.exp_start_date)} — {format_date(task.exp_end_date)}"
	line = (
		f'• <a href="/app/task/{task.name}" target="_blank"><b>{task.subject}</b></a>: '
		f"{_('прогноз')} {plan}"
	)
	fact_end = _fact_end(task)
	act_start = task.get("act_start_date") if hasattr(task, "get") else getattr(task, "act_start_date", None)
	if blocked:
		fact_bits = []
		if act_start:
			fact_bits.append(f"{_('с')} {format_date(act_start)}")
		if fact_end:
			fact_bits.append(f"{_('по')} {format_date(fact_end)}")
		if fact_bits:
			line += f" — {_('факт')} {' '.join(fact_bits)}"
	return line


def fit_depend_task_dates(task: str, exp_start_date: str, exp_end_date: str) -> dict:
	"""Подогнать exp_* связанных depends_on под окно родителя, затем сохранить родителя."""
	if not task or not exp_start_date or not exp_end_date:
		frappe.throw(_("Не заданы задача или период"))

	if not frappe.has_permission("Task", "write", task):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	win_start = getdate(exp_start_date)
	win_end = getdate(exp_end_date)
	parent = frappe.get_doc("Task", task)
	parent.exp_start_date = win_start
	parent.exp_end_date = win_end

	overlapping = collect_overlapping_depends(parent)
	if not overlapping:
		parent.save()
		return {"updated": 0}

	if any(fact_blocks_fit(row, win_start, win_end) for row in overlapping):
		_throw_period_conflict(parent, overlapping)

	updated = 0
	for row in overlapping:
		if not frappe.has_permission("Task", "write", row.name):
			frappe.throw(_("Not permitted to write Task {0}").format(row.name), frappe.PermissionError)
		child = frappe.get_doc("Task", row.name)
		changed = False
		if getdate(child.exp_start_date) < win_start:
			child.exp_start_date = win_start
			changed = True
		if getdate(child.exp_end_date) > win_end:
			child.exp_end_date = win_end
			changed = True
		if changed:
			child.save()
			updated += 1

	parent.save()
	return {"updated": updated}
