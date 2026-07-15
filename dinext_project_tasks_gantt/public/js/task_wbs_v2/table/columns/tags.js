import { getColumnsPage } from "./context.js";
import { el, parseTags } from "../format.js";
import { fixedCol, TREE_COL_WIDTH } from "./widths.js";

const TAG_LIMIT = 2;

/** Tree parity: same tag → clear filter; else set tag. */
export async function togglePageTag(page, tag) {
	const field = page?.fields_dict?.tag;
	if (!field) {
		return;
	}
	const old = field.get_value();
	if (tag === old) {
		await field.set_value("");
	} else {
		await field.set_value(tag);
	}
}

export function renderTags(params) {
	const tags = parseTags(params.value, TAG_LIMIT);
	if (!tags.length) {
		return el("span", "text-muted", "");
	}
	const wrap = el("div", "twb-v2-tags");
	for (const tag of tags) {
		const pill = el("span", "twb-v2-tag-pill ellipsis", tag);
		pill.title = tag;
		try {
			const palette = frappe.get_palette?.(tag);
			if (palette) {
				pill.style.backgroundColor = `var(${palette[0]})`;
				pill.style.color = `var(${palette[1]})`;
			}
		} catch (e) {
			/* optional */
		}
		pill.addEventListener("click", (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			const page = getColumnsPage();
			if (page) {
				void togglePageTag(page, tag);
			}
		});
		wrap.appendChild(pill);
	}
	return wrap;
}

export function tagsColumn() {
	return {
		field: "user_tags",
		headerName: __("Метки"),
		...fixedCol(TREE_COL_WIDTH.user_tags),
		sortable: false,
		edit: false,
		cellRenderer: renderTags,
		cellClass: "dinext-table-cell--align-center",
	};
}
