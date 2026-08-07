"""Guards for virtual Task sync."""

from .flags import ITVT_DEPTH


def is_virtual_task(doc) -> bool:
	return bool(doc.get("type") == "Issue" and doc.get("custom_linked_issue"))


def sync_depth(doc) -> int:
	return int(doc.flags.get(ITVT_DEPTH) or 0)


def bump_sync_depth(task_doc):
	"""Context-manager-like pair: return (previous, apply bump). Use try/finally."""
	cur = sync_depth(task_doc)
	setattr(task_doc.flags, ITVT_DEPTH, cur + 1)
	return cur


def restore_sync_depth(task_doc, previous: int):
	setattr(task_doc.flags, ITVT_DEPTH, previous)
