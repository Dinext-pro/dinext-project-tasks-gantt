import { DEFAULT_TITLE } from "../constants.js";

const TITLE_LINK_CLASS = "tree-gantt-title--link";

function titleEl(page) {
	return page?.$title_area?.find?.(".title-text")?.[0] || null;
}

function unbindTitleClick(page) {
	const el = titleEl(page);
	if (!el) {
		return;
	}
	el.classList.remove(TITLE_LINK_CLASS);
	el.onclick = null;
}

function bindTitleClick(page, project) {
	const el = titleEl(page);
	if (!el || !project) {
		return;
	}
	el.classList.add(TITLE_LINK_CLASS);
	el.onclick = () => {
		frappe.set_route("Form", "Project", project);
	};
}

export async function setPageTitle(page, project) {
	if (!project) {
		page.set_title(DEFAULT_TITLE);
		unbindTitleClick(page);
		return;
	}

	const { message } = await frappe.db.get_value("Project", project, "project_name");
	const projectName = message?.project_name;
	page.set_title(projectName ? `${projectName} (${project})` : project);
	bindTitleClick(page, project);
}
