from dinext_common.tests.hub_test_utils import HubRegistrationTestCase
from dinext_project_tasks_gantt.setup.dinext_hub import register_dinext_hub_items


class TestInitialHubContribution(HubRegistrationTestCase):
	def test_gantt_registers_report_without_another_task_list(self):
		register_dinext_hub_items()
		register_dinext_hub_items()
		self.settings.reload()
		self.assertEqual([r.target for r in self.settings.items], ["Task Epic Burndown"])
		self.assertEqual(self.settings.doctype_items, [])
		self.assertEqual(self.settings.sections[0].list_limit, 8)
		self.assertEqual(self.settings.sections[0].card_columns, 4)
