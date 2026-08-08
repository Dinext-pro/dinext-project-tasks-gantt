"""Tag Link To Issue Virtual Task_V2 — After Insert via add_tag (prod parity)."""

from __future__ import annotations

import frappe

from .helpers import mirror_target_for_issue_or_task


def sync_tag_link_mirror(doc) -> None:
	if doc.document_type not in ("Issue", "Task"):
		return

	target_type, target_name = mirror_target_for_issue_or_task(
		doc.document_type, doc.document_name
	)
	if not target_type:
		return

	target_doc = frappe.get_doc(target_type, target_name)
	target_doc.add_tag(doc.tag)
