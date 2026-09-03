# Copyright (c) 2026, Dinext and contributors
# For license information, please see license.txt

"""Introspection of the Frappe form contract (depends_on family) for Task.

The expressions are JavaScript and are evaluated ONLY on the client (Desk form,
Tree Gantt). This module never evaluates them: it lists which fieldnames they
reference so the server can ship every referenced value (incl. child tables)
and so `after_migrate` can report expressions the tree cannot honour.
"""

from __future__ import annotations

import re

import frappe
from frappe.model import default_fields, optional_fields

DEPENDS_PROPS = ("depends_on", "read_only_depends_on", "mandatory_depends_on")

_DOC_REF_RE = re.compile(r"\bdoc\.([A-Za-z_][A-Za-z0-9_]*)")


def expression_refs(expr) -> set[str]:
	"""Fieldnames referenced by one depends_on-style expression.

	`eval:` → every `doc.<name>`; plain string → the string itself is a fieldname;
	`fn:` / booleans → nothing (not resolvable without a form).
	"""
	if expr is None or expr is True or expr is False:
		return set()
	text = str(expr).strip()
	if not text:
		return set()
	if text.startswith("eval:"):
		return {ref for ref in _DOC_REF_RE.findall(text) if not ref.startswith("__")}
	if text.startswith("fn:"):
		return set()
	return {text}


def referenced_fieldnames(meta) -> set[str]:
	"""Union of references over every DocField's depends_on family (incl. breaks)."""
	refs: set[str] = set()
	for df in meta.fields:
		for prop in DEPENDS_PROPS:
			refs.update(expression_refs(getattr(df, prop, None)))
	return refs


def referenced_table_fields(meta) -> list:
	"""Table DocFields referenced by any expression (their rows must ship with the doc)."""
	refs = referenced_fieldnames(meta)
	return [df for df in meta.get_table_fields() if df.fieldname in refs]


def lint_messages(doctype: str = "Task") -> list[str]:
	"""Human-readable findings for `after_migrate`. Lists, never evaluates."""
	meta = frappe.get_meta(doctype)
	known = {df.fieldname for df in meta.fields if df.fieldname}
	known.update(default_fields)
	known.update(optional_fields)
	table_fieldnames = {df.fieldname for df in meta.get_table_fields()}
	out: list[str] = []
	for df in meta.fields:
		for prop in DEPENDS_PROPS:
			expr = getattr(df, prop, None)
			if not expr:
				continue
			where = f"{doctype}.{df.fieldname or df.fieldtype}.{prop}"
			text = str(expr).strip()
			if text.startswith("fn:"):
				out.append(f"WARN {where}: `fn:` expression needs a form; tree treats it as not restricting: {text}")
				continue
			for ref in sorted(expression_refs(text)):
				if ref not in known:
					out.append(f"WARN {where}: references unknown field `doc.{ref}`: {text}")
				elif ref in table_fieldnames:
					out.append(f"INFO {where}: references Table field `{ref}` (child rows shipped in tree row)")
	return out
