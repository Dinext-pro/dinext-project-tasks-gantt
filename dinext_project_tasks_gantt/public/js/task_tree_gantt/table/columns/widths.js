/**
 * Tree Task_TreeView_Style_V4 widths + RU label room
 * (status value / headers with sort icon).
 */
export const TREE_COL_WIDTH = {
	assign: 100,
	// «Связи»: subject[FS] +N
	relations: 180,
	plan_fact: 35,
	// «В ожидании отзыва» (trimmed for density)
	status: 130,
	// «Приоритет» + sort
	priority: 110,
	custom_planned_start_date: 85,
	custom_planned_end_date: 105,
	exp_start_date: 85,
	// «Прогноз завершения» + sort
	exp_end_date: 105,
	act_start_date: 85,
	act_end_date: 105,
	// «Длит-сть» + sort
	expected_time: 87,
	// «Прогресс» + sort
	progress: 96,
	custom_include: 35,
	type: 85,
	user_tags: 120,
};

/** Default column sizing — resizable (grow/shrink from Tree widths). */
export function fixedCol(width) {
	return {
		width,
		minWidth: 32,
	};
}
