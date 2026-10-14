const method = "dinext_project_tasks_gantt.tests.ui_test_helpers";
const bench = "cd /home/ikhmel/mybench && /usr/local/bin/bench --site localhost execute";

context("Task critical path", () => {
	before(() => {
		cy.exec(`${bench} ${method}.seed_critical_path`, { timeout: 180000 }).then((result) => {
			const line = result.stdout
				.trim()
				.split("\n")
				.filter((row) => row.startsWith("{"))
				.pop();
			expect(line, result.stdout).to.be.a("string");
			Cypress.env("criticalPath", JSON.parse(line));
		});
	});

	after(() => {
		cy.exec(`${bench} ${method}.cleanup_critical_path`, { timeout: 180000 });
	});

	it("highlights the critical chain only after the toolbar checkbox is turned on", () => {
		const fixture = Cypress.env("criticalPath");
		const storageKey = `${fixture.user}:tree:critical-path`;
		cy.login(fixture.user, fixture.password);
		cy.visit(`/app/tree/Task?project=${encodeURIComponent(fixture.project)}`, {
			onBeforeLoad(win) {
				win.localStorage.setItem(storageKey, "0");
			},
		});
		cy.window().its("frappe.csrf_token").should("be.a", "string").and("not.eq", "None");
		cy.get("#tree-gantt-critical-path", { timeout: 120000 })
			.should("exist")
			.and("not.be.checked");
		cy.get(".tree-gantt-critical-mark").should("not.exist");
		cy.get(".tree-gantt-critical-ring").should("not.exist");
		cy.get(".tree-gantt-bar--critical").should("not.exist");
		cy.get(".tree-gantt-row--critical").should("not.exist");

		cy.get("#tree-gantt-critical-path").check({ force: true });

		for (const task of fixture.critical) {
			cy.get(`.bar-wrapper[data-id="${task}"] rect.tree-gantt-critical-ring`, {
				timeout: 30000,
			}).should("exist");
			cy.get(`.bar-wrapper[data-id="${task}"]`).should(
				"not.have.class",
				"tree-gantt-bar--critical"
			);
		}
		cy.get(`.bar-wrapper[data-id="${fixture.slack}"] rect.tree-gantt-critical-ring`).should(
			"not.exist"
		);
		cy.contains(".tree-gantt-subject", "Cypress critical start")
			.find(".tree-gantt-critical-mark")
			.should("have.attr", "title", "Critical path")
			.and("have.attr", "aria-label", "Critical path");
		cy.contains(".tree-gantt-subject", "Cypress critical end")
			.find(".tree-gantt-critical-mark")
			.should("exist");
		cy.contains(".tree-gantt-subject", "Cypress critical slack")
			.find(".tree-gantt-critical-mark")
			.should("not.exist");
		cy.get(".tree-gantt-subject-text[title='Critical path']").should("not.exist");
		cy.get(".tree-gantt-bar--critical").should("not.exist");
		cy.get(".ag-row.tree-gantt-row--critical").should("not.exist");
	});
});
