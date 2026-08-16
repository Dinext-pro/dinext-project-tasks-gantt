/**
 * Task Select fields (status / priority): English option keys in row data.
 * Paste may carry __(key) labels — map back before validate/save.
 */

/**
 * @param {unknown} raw
 * @param {string[]} options English Select options
 * @returns {string|null} English key, null if empty, or trimmed raw if unmatched
 */
export function resolveSelectOption(raw, options) {
	if (raw == null) {
		return null;
	}
	const s = String(raw).trim();
	if (!s) {
		return null;
	}

	const list = options || [];
	if (list.includes(s)) {
		return s;
	}

	const lower = s.toLowerCase();
	const byKey = list.find((opt) => opt.toLowerCase() === lower);
	if (byKey) {
		return byKey;
	}

	const byLabel = list.find((opt) => {
		const label = String(__(opt));
		return label === s || label.toLowerCase() === lower;
	});
	if (byLabel) {
		return byLabel;
	}

	return s;
}

/** @returns {boolean} */
export function isAllowedSelectOption(value, options) {
	if (value == null || value === "") {
		return false;
	}
	return (options || []).includes(String(value));
}
