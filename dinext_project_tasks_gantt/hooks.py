app_name = "dinext_project_tasks_gantt"
app_title = "Dinext Project Tasks Gantt"
app_publisher = "Dinext"
app_description = "Dinext Project Tasks Gantt"
app_email = "info@dinext.ru"
app_license = "mit"

fixtures = [
    {
        "doctype": "Custom Field",
        "filters": [
            ["module", "in", ["Dinext Project Tasks Gantt"]]
        ]
    },
    {
        "doctype": "Story Point",
        "filters": [
            ["name", "in", ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]]
        ]
    },
    {
        "doctype": "Property Setter",
        "filters": [
            ["module", "in", ["Dinext Project Tasks Gantt"]]
        ]
    },
    #{
    #    "doctype": "Workflow",
    #    "filters": [
    #        ["document_type", "in", ["Application For Leave", "User Timesheet Position", "Project", "Expense Claim", "Purchase Invoice", "Sales Invoice"]],
    #        ["is_active", "=", 1]            
    #    ]
    #}    
]
''''''

# Apps
# ------------------

required_apps = ["dinext_common", "doctype_permission", "dinext_projects", "project_workload_assignment"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "dinext_project_tasks_gantt",
# 		"logo": "/assets/dinext_project_tasks_gantt/logo.png",
# 		"title": "Dinext Project Tasks Gantt",
# 		"route": "/dinext_project_tasks_gantt",
# 		"has_permission": "dinext_project_tasks_gantt.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# `dinext.fieldRules` registry (Task form adapter + Task Tree consume it; owner apps register).
app_include_js = ["field_rules.bundle.js"]

# include js, css files in header of web template
# web_include_css = "/assets/dinext_project_tasks_gantt/css/dinext_project_tasks_gantt.css"
# web_include_js = "/assets/dinext_project_tasks_gantt/js/dinext_project_tasks_gantt.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "dinext_project_tasks_gantt/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Task": [
		"public/js/task_progress_trend_styles.js",
		"public/js/task_progress_trend.js",
		"public/js/task_field_rules_form.js",
	],
	"Project": [
		"public/js/burndown_navigation.js",
		"public/js/project_burndown_button.js",
	],
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
doctype_tree_js = {
	"Task": [
		"public/js/burndown_navigation.js",
		"public/js/task_tree_burndown_button.js",
		"public/js/task_tree_gantt_adapter.js",
	],
}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "dinext_project_tasks_gantt/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "dinext_project_tasks_gantt.utils.jinja_methods",
# 	"filters": "dinext_project_tasks_gantt.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "dinext_project_tasks_gantt.install.before_install"
after_install = "dinext_project_tasks_gantt.install.after_install"
after_migrate = "dinext_project_tasks_gantt.install.after_migrate"

# Uninstallation
# ------------

# before_uninstall = "dinext_project_tasks_gantt.uninstall.before_uninstall"
# after_uninstall = "dinext_project_tasks_gantt.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "dinext_project_tasks_gantt.utils.before_app_install"
# after_app_install = "dinext_project_tasks_gantt.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "dinext_project_tasks_gantt.utils.before_app_uninstall"
# after_app_uninstall = "dinext_project_tasks_gantt.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "dinext_project_tasks_gantt.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

vt_handlers = "dinext_project_tasks_gantt.virtual_task.handlers"
td_handlers = "dinext_project_tasks_gantt.task_dates.handlers"

doc_events = {
	"Project": {
		"before_save": "dinext_project_tasks_gantt.project_progress_audit.before_save_project",
	},
	"Issue": {
		"after_insert": f"{vt_handlers}.after_insert_issue",
		"on_update": f"{vt_handlers}.on_update_issue",
		"on_trash": f"{vt_handlers}.on_trash_issue",
	},
	"Task": {
		"before_validate": f"{td_handlers}.before_validate_task",
		"before_insert": [
			"dinext_project_tasks_gantt.project_progress_audit.before_insert_task",
			"dinext_project_tasks_gantt.task_tree_order.before_insert_task",
		],
		"before_save": [
			"dinext_project_tasks_gantt.task_progress_audit.before_save_task",
			"dinext_project_tasks_gantt.project_progress_audit.before_save_task",
			f"{td_handlers}.before_save_task",
			f"{vt_handlers}.before_save_task",
		],
		"on_update": [
			"dinext_project_tasks_gantt.project_progress_audit.on_update_task",
			"dinext_project_tasks_gantt.task_parent_progress.on_update_task",
			f"{vt_handlers}.on_update_task",
		],
		"on_trash": "dinext_project_tasks_gantt.project_progress_audit.on_trash_task",
		"after_delete": [
			"dinext_project_tasks_gantt.project_progress_audit.after_delete_task",
			"dinext_project_tasks_gantt.task_parent_progress.after_delete_task",
			f"{vt_handlers}.after_delete_task",
		],
	},
	"ToDo": {
		"after_insert": f"{vt_handlers}.after_insert_todo",
		"on_update": f"{vt_handlers}.on_update_todo",
	},
	"DocShare": {
		"after_insert": f"{vt_handlers}.after_insert_docshare",
		"on_update": f"{vt_handlers}.on_update_docshare",
		"after_delete": f"{vt_handlers}.after_delete_docshare",
	},
	"Tag Link": {
		"after_insert": f"{vt_handlers}.after_insert_tag_link",
	},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"dinext_project_tasks_gantt.tasks.all"
# 	],
# 	"daily": [
# 		"dinext_project_tasks_gantt.tasks.daily"
# 	],
# 	"hourly": [
# 		"dinext_project_tasks_gantt.tasks.hourly"
# 	],
# 	"weekly": [
# 		"dinext_project_tasks_gantt.tasks.weekly"
# 	],
# 	"monthly": [
# 		"dinext_project_tasks_gantt.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "dinext_project_tasks_gantt.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "dinext_project_tasks_gantt.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "dinext_project_tasks_gantt.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["dinext_project_tasks_gantt.utils.before_request"]
# after_request = ["dinext_project_tasks_gantt.utils.after_request"]

# Job Events
# ----------
# before_job = ["dinext_project_tasks_gantt.utils.before_job"]
# after_job = ["dinext_project_tasks_gantt.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"dinext_project_tasks_gantt.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

