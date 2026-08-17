"""Depend_Task_Date_Check — Task Before Save (prod parity, ISS-2025-02699).

Если менялись exp_* — периоды задач из depends_on должны влезать в период текущего Task.
Validate-only: throw, без записи партнёров.
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

	# Если даты не изменились — no-op (как prod: pass / else)
	if not date_changed and old_doc:
		return

	if not doc.depends_on:
		return

	dependent_tasks = [row.task for row in doc.depends_on if row.task]
	if not dependent_tasks:
		return

	tasks_data = frappe.get_all(
		"Task",
		filters={"name": ["in", dependent_tasks]},
		fields=["name", "subject", "exp_start_date", "exp_end_date"],
	)
	tasks_dict = {task.name: task for task in tasks_data}

	overlapping_tasks = []

	for row in doc.depends_on:
		if not row.task or row.task not in tasks_dict:
			continue

		dependent_task = tasks_dict[row.task]

		if not dependent_task.exp_start_date or not dependent_task.exp_end_date:
			continue

		if not doc.exp_start_date or not doc.exp_end_date:
			continue

		current_start = getdate(doc.exp_start_date)
		current_end = getdate(doc.exp_end_date)
		dependent_start = getdate(dependent_task.exp_start_date)
		dependent_end = getdate(dependent_task.exp_end_date)

		# Зависимая должна начинаться не раньше и заканчиваться не позже текущей
		if dependent_start < current_start or dependent_end > current_end:
			overlapping_tasks.append(
				{
					"name": dependent_task.name,
					"subject": dependent_task.subject,
					"exp_start_date": dependent_task.exp_start_date,
					"exp_end_date": dependent_task.exp_end_date,
				}
			)

	if not overlapping_tasks:
		return

	error_message = _("""Периоды дат дочерних задач должны входить в период родительской задачи.""")

	task_details = "<br>".join(
		[
			f"""• <a href="/app/task/{task['name']}" target="_blank"><b>{task['subject']}</b></a>: 
                    {format_date(task['exp_start_date'])} - {format_date(task['exp_end_date'])}"""
			for task in overlapping_tasks
		]
	)

	current_task_dates = f"{format_date(doc.exp_start_date)} - {format_date(doc.exp_end_date)}"

	frappe.throw(
		title=_("Конфликт дат периодов"),
		msg=f"""<b>Текущая задача:</b> {doc.subject}<br>
                    <b>Период:</b> {current_task_dates}<br><br>
                    {error_message}<br><br>
                    <b>Дочерние задачи с датами вне периода:</b><br>
                    {task_details}""",
		exc=frappe.ValidationError,
		is_minimizable=True,
	)
