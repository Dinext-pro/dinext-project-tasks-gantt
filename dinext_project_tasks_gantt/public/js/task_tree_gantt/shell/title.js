import { DEFAULT_TITLE } from "../constants.js";

export async function setPageTitle(page, project) {
	if (!project) {
		page.set_title(DEFAULT_TITLE);
		return;
	}

	const { message } = await frappe.db.get_value("Project", project, "project_name");
	const projectName = message?.project_name;
	page.set_title(projectName ? `${projectName} (${project})` : project);
}
