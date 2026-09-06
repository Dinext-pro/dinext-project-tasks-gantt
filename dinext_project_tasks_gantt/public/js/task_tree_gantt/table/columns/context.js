/** Shared page ref + column hooks (tag filter, assign save, tree mutate). */
let columnsPage = null;
let onAssignSaved = null;
let onTreeMutate = null;
let onGanttRefresh = null;
let onRelationsFocus = null;
let getTreeTableFn = null;

/** Additive API for column modules. */
export function setColumnContext({
	page,
	onAssignSaved: assignHook,
	onTreeMutate: mutateHook,
	onGanttRefresh: ganttHook,
	onRelationsFocus: relationsHook,
	getTreeTable: tableHook,
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
	if (relationsHook !== undefined) {
		onRelationsFocus = typeof relationsHook === "function" ? relationsHook : null;
	}
	if (tableHook !== undefined) {
		getTreeTableFn = typeof tableHook === "function" ? tableHook : null;
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

export function getOnRelationsFocus() {
	return onRelationsFocus;
}

export function getTreeTable() {
	return getTreeTableFn?.() || null;
}
