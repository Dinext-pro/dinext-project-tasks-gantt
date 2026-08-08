"""Thin doc_events entrypoints for virtual Task ↔ Issue sync (+ satellites)."""

from __future__ import annotations

from .child_wire import wire_task_child_to_issue
from .delete import delete_issue_for_virtual_task, delete_virtual_task_for_issue
from .docshare_mirror import delete_docshare_mirror, sync_docshare_mirror
from .issue_to_task import sync_issue_to_virtual_task
from .tag_mirror import sync_tag_link_mirror
from .task_to_issue import sync_virtual_task_to_issue
from .todo_mirror import sync_todo_mirror


def after_insert_issue(doc, method=None):
	sync_issue_to_virtual_task(doc)


def on_update_issue(doc, method=None):
	sync_issue_to_virtual_task(doc)


def on_trash_issue(doc, method=None):
	delete_virtual_task_for_issue(doc)


def before_save_task(doc, method=None):
	sync_virtual_task_to_issue(doc)


def on_update_task(doc, method=None):
	wire_task_child_to_issue(doc)


def after_delete_task(doc, method=None):
	delete_issue_for_virtual_task(doc)


# --- layer 4b satellites ---


def after_insert_todo(doc, method=None):
	sync_todo_mirror(doc)


def on_update_todo(doc, method=None):
	sync_todo_mirror(doc)


def after_insert_docshare(doc, method=None):
	sync_docshare_mirror(doc)


def on_update_docshare(doc, method=None):
	sync_docshare_mirror(doc)


def after_delete_docshare(doc, method=None):
	delete_docshare_mirror(doc)


def after_insert_tag_link(doc, method=None):
	sync_tag_link_mirror(doc)
