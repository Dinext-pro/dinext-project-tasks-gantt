"""Тонкие entrypoint'ы doc_events: sync Issue↔virtual Task + mirrors (слой 4b)."""

from __future__ import annotations

from dinext_project_tasks_gantt.virtual_task.mirrors.docshare import (
	delete_docshare_mirror,
	sync_docshare_mirror,
)
from dinext_project_tasks_gantt.virtual_task.mirrors.tag import sync_tag_link_mirror
from dinext_project_tasks_gantt.virtual_task.mirrors.todo import sync_todo_mirror
from dinext_project_tasks_gantt.virtual_task.sync.child_wire import wire_task_child_to_issue
from dinext_project_tasks_gantt.virtual_task.sync.delete import (
	delete_issue_for_virtual_task,
	delete_virtual_task_for_issue,
)
from dinext_project_tasks_gantt.virtual_task.sync.issue_to_task import sync_issue_to_virtual_task
from dinext_project_tasks_gantt.virtual_task.sync.task_to_issue import sync_virtual_task_to_issue


def after_insert_issue(doc, method=None):
	"""Issue after_insert → создать/обновить virtual Task (ITVT)."""
	sync_issue_to_virtual_task(doc)


def on_update_issue(doc, method=None):
	"""Issue on_update → синхронизировать поля в virtual Task (ITVT)."""
	sync_issue_to_virtual_task(doc)


def on_trash_issue(doc, method=None):
	"""Issue on_trash → удалить связанную virtual Task."""
	delete_virtual_task_for_issue(doc)


def before_save_task(doc, method=None):
	"""Task before_save → зеркало полей virtual Task → Issue (TVTI, set_value)."""
	sync_virtual_task_to_issue(doc)


def on_update_task(doc, method=None):
	"""Task on_update → связать обычную Task с virtual parent / Issue (child wire)."""
	wire_task_child_to_issue(doc)


def after_delete_task(doc, method=None):
	"""Task after_delete → если virtual, удалить связанный Issue."""
	delete_issue_for_virtual_task(doc)


# --- слой 4b: mirrors ---


def after_insert_todo(doc, method=None):
	"""ToDo after_insert → зеркало назначения на парный Issue/Task."""
	sync_todo_mirror(doc)


def on_update_todo(doc, method=None):
	"""ToDo on_update → обновить зеркальное назначение (Closed → set_value)."""
	sync_todo_mirror(doc)


def after_insert_docshare(doc, method=None):
	"""DocShare after_insert → создать share на парном Issue/Task."""
	sync_docshare_mirror(doc)


def on_update_docshare(doc, method=None):
	"""DocShare on_update → синхронизировать права share на паре."""
	sync_docshare_mirror(doc)


def after_delete_docshare(doc, method=None):
	"""DocShare after_delete → удалить зеркальный share того же user."""
	delete_docshare_mirror(doc)


def after_insert_tag_link(doc, method=None):
	"""Tag Link after_insert → повесить тот же тег на парный документ."""
	sync_tag_link_mirror(doc)
