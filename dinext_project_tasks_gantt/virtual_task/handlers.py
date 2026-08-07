"""Thin doc_events entrypoints for virtual Task ↔ Issue sync."""

from __future__ import annotations

from .child_wire import wire_task_child_to_issue
from .delete import delete_issue_for_virtual_task, delete_virtual_task_for_issue
from .issue_to_task import sync_issue_to_virtual_task
from .task_to_issue import sync_virtual_task_to_issue


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
