/**
 * Tree Task_TreeView_Style_V4 widths + RU label room
 * (status value / headers with sort icon).
 */
export const TREE_COL_WIDTH = {
	assign: 100,
	plan_fact: 35,
	// «В ожидании отзыва» (trimmed for density)
	status: 130,
	// «Приоритет» + sort
	priority: 110,
	exp_start_date: 85,
	// «Прогноз завершения» + sort
	exp_end_date: 105,
	// «Длит-сть» + sort
	expected_time: 87,
	// «Прогресс» + sort
	progress: 96,
	custom_include: 35,
	type: 85,
	user_tags: 120,
};

/** Fixed non-resizable column sizing (all except subject). */
export function fixedCol(width) {
	return {
		width,
		minWidth: width,
		maxWidth: width,
		resizable: false,
	};
}
