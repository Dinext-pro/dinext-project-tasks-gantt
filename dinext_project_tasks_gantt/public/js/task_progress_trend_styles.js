// Copyright (c) 2026, Dinext and contributors
// For license information, please see license.txt

(function () {
	const STYLE_ID = "dinext-task-progress-trend-styles";

	frappe.dom.set_style(
		`
.task-progress-trend-widget {
	border-radius: 6px;
	margin: 0;
	padding: 12px;
	background: var(--card-bg);
}

.task-progress-trend-header {
	align-items: center;
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
}

.task-progress-trend-title {
	font-weight: 600;
}

.task-progress-trend-subtitle {
	color: var(--text-muted);
	font-size: 12px;
}

.task-progress-trend-periods {
	display: flex;
	gap: 4px;
}

.task-progress-trend-chart {
	height: 357px;
	width: 100%;
}

.task-progress-trend-state {
	padding: 16px 0;
}
`,
		STYLE_ID
	);
})();
