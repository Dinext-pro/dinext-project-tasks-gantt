/** Shared page ref + column hooks (tag filter, assign save, tree mutate). */
let columnsPage = null;
let onAssignSaved = null;
let onTreeMutate = null;
let onGanttRefresh = null;

/** Additive API for column modules. */
export function setColumnContext({
	page,
	onAssignSaved: assignHook,
	onTreeMutate: mutateHook,
	onGanttRefresh: ganttHook,
} = {}) {
	if (page !== undefined) {
		columnsPage = page || null;
	}
	if (assignHook !== undefined) {
		onAssignSaved = typeof assignHook === "function" ? assignHook : null;
	}
	if (mutateHook !== undefined) {
		onTreeMutate = typeof mutateHook === "function" ? mutateHook : null;
	}
	if (ganttHook !== undefined) {
		onGanttRefresh = typeof ganttHook === "function" ? ganttHook : null;
	}
}

export function getColumnsPage() {
	return columnsPage;
}

export function getOnAssignSaved() {
	return onAssignSaved;
}

export function getOnTreeMutate() {
	return onTreeMutate;
}

export function getOnGanttRefresh() {
	return onGanttRefresh || onAssignSaved;
}
