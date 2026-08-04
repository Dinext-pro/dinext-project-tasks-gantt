(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/constants.js
  var DEFAULT_TITLE = __("Project Structure Plan");
  var PROJECT_STORAGE_SUFFIX = ":tree:project";
  function projectStorageKey() {
    return `${frappe.user.name}${PROJECT_STORAGE_SUFFIX}`;
  }
  var LAYOUT_WIDTH_KEY = "layout_widths_Tree_Task";
  var MIN_LEFT_PCT = 30;
  var MIN_RIGHT_PCT = 2;
  var DEFAULT_LEFT_PCT = 55;
  var ROW_HEIGHT = 27;
  var GANTT_BAR_HEIGHT = 19;
  var GANTT_PADDING = 8;
  var GANTT_UPPER_HEADER = 40;
  var GANTT_LOWER_HEADER = 26;
  var GANTT_HEADER_CHROME = 10;
  var HEADER_HEIGHT = GANTT_UPPER_HEADER + GANTT_LOWER_HEADER + GANTT_HEADER_CHROME;
  var GANTT_ASSETS = [
    "/assets/dinext_common/js/frappe-gantt.umd.js",
    "/assets/dinext_common/css/frappe-gantt.css"
  ];

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/shell/title.js
  async function setPageTitle(page, project) {
    if (!project) {
      page.set_title(DEFAULT_TITLE);
      return;
    }
    const { message } = await frappe.db.get_value("Project", project, "project_name");
    const projectName = message == null ? void 0 : message.project_name;
    page.set_title(projectName ? `${projectName} (${project})` : project);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/filters/defaults.js
  function filterDefaults() {
    return {
      project: localStorage.getItem(projectStorageKey()) || "",
      task: "",
      status: "",
      priority: "",
      assign: "",
      tag: "",
      limit: null
    };
  }
  function taskSelectOptions(fieldname) {
    const field = frappe.meta.get_docfield("Task", fieldname);
    const values = String((field == null ? void 0 : field.options) || "").split("\n").filter(Boolean);
    return [...values, ""].join("\n");
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/filters/index.js
  async function setupFilters({ page, onChange }) {
    await frappe.model.with_doctype("Task");
    if (page.__task_tree_gantt_filters_getArgs) {
      return page.__task_tree_gantt_filters_getArgs;
    }
    const args = filterDefaults();
    const emit = () => onChange == null ? void 0 : onChange();
    let lastProject = args.project;
    const addIfMissing = (df) => {
      var _a;
      if ((_a = page.fields_dict) == null ? void 0 : _a[df.fieldname]) {
        return page.fields_dict[df.fieldname];
      }
      return page.add_field(df);
    };
    addIfMissing({
      fieldname: "project",
      fieldtype: "Link",
      options: "Project",
      label: __("Project"),
      reqd: 1,
      change() {
        const value = this.get_value();
        if (!value) {
          if (lastProject) {
            this.set_value(lastProject);
            return;
          }
          args.project = "";
          void setPageTitle(page, null);
          emit();
          return;
        }
        lastProject = value;
        args.project = value;
        localStorage.setItem(projectStorageKey(), value);
        void setPageTitle(page, value);
        emit();
      }
    });
    addIfMissing({
      fieldname: "task",
      fieldtype: "Link",
      options: "Task",
      label: __("Task"),
      get_query() {
        const filters = [["Task", "is_group", "=", 1]];
        if (args.project) {
          filters.push(["Task", "project", "=", args.project]);
        }
        return { filters };
      },
      change() {
        args.task = this.get_value() || "";
        emit();
      }
    });
    addIfMissing({
      fieldname: "status",
      fieldtype: "Select",
      label: __("Status"),
      options: taskSelectOptions("status"),
      change() {
        args.status = this.get_value() || "";
        emit();
      }
    });
    addIfMissing({
      fieldname: "priority",
      fieldtype: "Select",
      label: __("Priority"),
      options: taskSelectOptions("priority"),
      change() {
        args.priority = this.get_value() || "";
        emit();
      }
    });
    addIfMissing({
      fieldname: "assign",
      fieldtype: "Link",
      options: "User",
      label: __("Assigned To"),
      change() {
        args.assign = this.get_value() || "";
        emit();
      }
    });
    addIfMissing({
      fieldname: "tag",
      fieldtype: "Link",
      options: "Tag",
      label: __("User Tags"),
      change() {
        args.tag = this.get_value() || "";
        emit();
      }
    });
    addIfMissing({
      fieldname: "limit",
      fieldtype: "Int",
      label: __("Limit"),
      change() {
        const raw = this.get_value();
        args.limit = raw === null || raw === void 0 || raw === "" ? null : cint(raw);
        emit();
      }
    });
    if (args.project && page.fields_dict.project) {
      await page.fields_dict.project.set_value(args.project);
      void setPageTitle(page, args.project);
    }
    const getArgs = () => __spreadValues({}, args);
    page.__task_tree_gantt_filters_getArgs = getArgs;
    return getArgs;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/api.js
  var GET_CHILDREN = "dinext_project_tasks_gantt.task_tree_gantt.api.get_children";
  var SAVE_CELLS = "dinext_project_tasks_gantt.task_tree_gantt.api.save_cells";
  var TIMESHEET_LIMITS = "project_workload_assignment.api.calculate_timesheet_limits";
  var CHECK_DEPENDENCIES = "check_dependencies_for_tasks";
  var PREVIEW_PROPAGATION = "preview_propagation";
  var APPLY_PROPAGATION = "apply_propagation";
  var GET_USER_INFO = "frappe.desk.form.load.get_user_info_for_viewers";
  function applyUserInfo(userInfo) {
    if (!userInfo || typeof userInfo !== "object") {
      return;
    }
    if (typeof frappe.update_user_info === "function") {
      frappe.update_user_info(userInfo);
    } else {
      Object.assign(frappe.boot.user_info || (frappe.boot.user_info = {}), userInfo);
    }
  }
  async function ensureAssignUserInfo(users) {
    const missing = [...new Set((users || []).filter(Boolean))].filter(
      (u) => {
        var _a, _b;
        return !((_b = (_a = frappe.boot.user_info) == null ? void 0 : _a[u]) == null ? void 0 : _b.fullname);
      }
    );
    if (!missing.length) {
      return;
    }
    const data = await frappe.xcall(GET_USER_INFO, {
      users: JSON.stringify(missing)
    });
    applyUserInfo(data);
  }
  async function getChildren(args) {
    var _a;
    const r = await frappe.call({
      method: GET_CHILDREN,
      args: {
        project: args.project,
        parent_task: (_a = args.parent_task) != null ? _a : null,
        all_tasks: args.all_tasks ? 1 : 0,
        status: args.status || null,
        priority: args.priority || null,
        assign: args.assign || null,
        tag: args.tag || null,
        sort_field: args.sort_field || null,
        sort_order: args.sort_order || null,
        limit: args.limit || null
      }
    });
    applyUserInfo(r.user_info);
    return r.message || [];
  }
  async function saveCells(changes) {
    const r = await frappe.call({
      method: SAVE_CELLS,
      args: { changes }
    });
    return r.message;
  }
  async function calculateTimesheetLimits(args) {
    let positions = args.positions;
    if (positions != null && typeof positions !== "string") {
      positions = JSON.stringify(positions);
    }
    try {
      const res = await fetch(`/api/method/${TIMESHEET_LIMITS}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": frappe.csrf_token
        },
        credentials: "same-origin",
        body: JSON.stringify({
          timesheet_name: args.timesheet_name || "",
          positions
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.exc) {
        console.warn(
          "[task_tree_gantt] plan_fact limits",
          data.exc || data._server_messages || res.status
        );
        return [];
      }
      return data.message || [];
    } catch (e) {
      console.warn("[task_tree_gantt] plan_fact limits", e);
      return [];
    }
  }
  async function checkDependencies(args) {
    const r = await frappe.call({
      method: CHECK_DEPENDENCIES,
      args: {
        project: args.project,
        tasks: args.tasks
      }
    });
    return r.message || [];
  }
  async function previewPropagation(args) {
    const r = await frappe.call({
      method: PREVIEW_PROPAGATION,
      args: {
        changed_task: args.changed_task,
        direction: args.direction || "downstream"
      }
    });
    return r.message;
  }
  async function applyPropagation(args) {
    const r = await frappe.call({
      method: APPLY_PROPAGATION,
      args: {
        changes: typeof args.changes === "string" ? args.changes : JSON.stringify(args.changes),
        mode: args.mode || "sync"
      }
    });
    return r.message;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/dependencies/check.js
  var DEP_CONFLICT_CLASS = "tree-gantt-dep-conflict";
  var CONFLICT_COLUMNS = ["subject", "exp_start_date", "exp_end_date"];
  function walkRows(rows, out) {
    var _a;
    for (const row of rows || []) {
      if (row == null ? void 0 : row.id) {
        out.push(row);
      }
      if ((_a = row.children) == null ? void 0 : _a.length) {
        walkRows(row.children, out);
      }
    }
    return out;
  }
  function collectLoadedRows(table) {
    var _a;
    const source = (table == null ? void 0 : table.sourceData) || ((_a = table == null ? void 0 : table.options) == null ? void 0 : _a.data) || [];
    return walkRows(source, []);
  }
  function clearConflict(row) {
    row.dep_conflict = 0;
    row.dep_conflict_start = "";
    row.dep_conflict_end = "";
  }
  function applyResults(rowsById, results) {
    var _a;
    for (const row of Object.values(rowsById)) {
      clearConflict(row);
    }
    for (const item of results || []) {
      const row = rowsById[item.checked_task];
      if (!row || !((_a = item.violations) == null ? void 0 : _a.length)) {
        continue;
      }
      row.dep_conflict = 1;
      for (const v of item.violations) {
        if (v.violated_field === "start") {
          row.dep_conflict_start = v.message || __("Conflict");
        } else if (v.violated_field === "end") {
          row.dep_conflict_end = v.message || __("Conflict");
        }
      }
    }
  }
  function refreshCells(table) {
    var _a, _b;
    (_b = (_a = table == null ? void 0 : table.api) == null ? void 0 : _a.refreshCells) == null ? void 0 : _b.call(_a, {
      columns: CONFLICT_COLUMNS,
      force: true
    });
  }
  function dateFieldsAffectConflicts(changes) {
    return (changes || []).some(
      (c) => c.field === "exp_start_date" || c.field === "exp_end_date"
    );
  }
  function resolveProject(getArgs) {
    const args = typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
    return args.project || null;
  }
  async function refreshConflicts(getArgs, table, rows) {
    const project = resolveProject(getArgs);
    if (!project || !table) {
      return;
    }
    const list = (rows == null ? void 0 : rows.length) ? rows : collectLoadedRows(table);
    if (!list.length) {
      return;
    }
    const rowsById = {};
    for (const row of list) {
      rowsById[row.id] = row;
      clearConflict(row);
    }
    const results = await checkDependencies({
      project,
      tasks: list.map((row) => ({
        name: row.id,
        project,
        subject: row.subject,
        exp_start_date: row.exp_start_date,
        exp_end_date: row.exp_end_date
      }))
    });
    applyResults(rowsById, results);
    refreshCells(table);
  }
  function dateConflictClass(params) {
    var _a;
    const row = params.data;
    const field = (_a = params.colDef) == null ? void 0 : _a.field;
    if (!row || !field) {
      return "";
    }
    if (field === "exp_start_date" && row.dep_conflict_start) {
      return DEP_CONFLICT_CLASS;
    }
    if (field === "exp_end_date" && row.dep_conflict_end) {
      return DEP_CONFLICT_CLASS;
    }
    return "";
  }
  function subjectConflictClass(params) {
    var _a;
    return ((_a = params.data) == null ? void 0 : _a.dep_conflict) ? DEP_CONFLICT_CLASS : "";
  }
  function startDateConflictTooltip(params) {
    var _a;
    return ((_a = params.data) == null ? void 0 : _a.dep_conflict_start) || null;
  }
  function endDateConflictTooltip(params) {
    var _a;
    return ((_a = params.data) == null ? void 0 : _a.dep_conflict_end) || null;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/plan_fact/limits.js
  var STATUS_RANK = {
    block: 5,
    message: 4,
    warning: 3,
    normal: 2,
    "no-plan": 1,
    "no-data": 0
  };
  function walkRows2(rows, out) {
    var _a;
    for (const row of rows || []) {
      if (row == null ? void 0 : row.id) {
        out.push(row);
      }
      if ((_a = row.children) == null ? void 0 : _a.length) {
        walkRows2(row.children, out);
      }
    }
    return out;
  }
  function collectLoadedRows2(table) {
    var _a;
    const source = (table == null ? void 0 : table.sourceData) || ((_a = table == null ? void 0 : table.options) == null ? void 0 : _a.data) || [];
    return walkRows2(source, []);
  }
  function getMaxStatus(positions) {
    var _a;
    let max = "no-data";
    let maxRank = 0;
    for (const data of positions || []) {
      const status = data.status || "no-data";
      if (status === "block") {
        return "block";
      }
      const rank = (_a = STATUS_RANK[status]) != null ? _a : 0;
      if (rank > maxRank) {
        max = status;
        maxRank = rank;
      }
    }
    return max;
  }
  function tooltipFor(status) {
    if (status === "normal") {
      return __("Work efforts within plans/limits");
    }
    if (status === "no-data" || status === "no-plan") {
      return __("Planned work efforts are not defined");
    }
    return __("Task Work Efforts Control");
  }
  function applyPlanFactFields(row, status, taskData, title) {
    row.plan_fact_status = status;
    row.plan_fact_data = taskData;
    row.plan_fact_title = title;
  }
  function stampVisiblePlanFact(table, byId) {
    var _a, _b, _c;
    const stamp = (data) => {
      if (!(data == null ? void 0 : data.id)) {
        return;
      }
      const src = byId[data.id];
      if (!src) {
        return;
      }
      applyPlanFactFields(
        data,
        src.plan_fact_status,
        src.plan_fact_data,
        src.plan_fact_title
      );
    };
    if (typeof ((_a = table.api) == null ? void 0 : _a.forEachNode) === "function") {
      table.api.forEachNode((node) => stamp(node.data));
    } else {
      for (const row of table.rowData || []) {
        stamp(row);
      }
    }
    (_c = (_b = table.api) == null ? void 0 : _b.refreshCells) == null ? void 0 : _c.call(_b, {
      columns: ["plan_fact"],
      force: true
    });
  }
  async function refreshPlanFact(ctx, rows) {
    const { project, table } = ctx || {};
    if (!project || !table) {
      return;
    }
    const loaded = collectLoadedRows2(table);
    const idFilter = (rows == null ? void 0 : rows.length) ? new Set(rows.map((r) => r.id).filter(Boolean)) : null;
    const list = idFilter ? loaded.filter((r) => idFilter.has(r.id)) : loaded;
    if (!list.length) {
      return;
    }
    let results = [];
    try {
      results = await calculateTimesheetLimits({
        timesheet_name: "",
        positions: list.map((row) => ({
          name: row.id,
          document_name: row.id,
          project
        }))
      });
    } catch (e) {
      console.warn("[task_tree_gantt] plan_fact limits", e);
      results = [];
    }
    if (!Array.isArray(results)) {
      results = [];
    }
    const byId = {};
    for (const row of list) {
      const taskData = results.filter(
        (result) => result.position === row.id && (Number(result.planned_hours) > 0 || Number(result.total_hours) > 0)
      );
      if (taskData.length) {
        const status = getMaxStatus(taskData);
        applyPlanFactFields(row, status, taskData, tooltipFor(status));
      } else {
        applyPlanFactFields(
          row,
          "no-data",
          [],
          __("No work efforts data")
        );
      }
      byId[row.id] = row;
    }
    stampVisiblePlanFact(table, byId);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/persist.js
  function normalizeUsers(value) {
    if (Array.isArray(value)) {
      return [...new Set(value.map(String).map((s) => s.trim()).filter(Boolean))];
    }
    if (value == null || value === "") {
      return [];
    }
    if (typeof value === "string") {
      return [
        ...new Set(
          value.split(",").map((s) => s.trim()).filter(Boolean)
        )
      ];
    }
    return [];
  }
  function sameUsers(a, b) {
    const left = normalizeUsers(a).slice().sort();
    const right = normalizeUsers(b).slice().sort();
    if (left.length !== right.length) {
      return false;
    }
    return left.every((u, i) => u === right[i]);
  }
  function stampAssignMetaAfterTodoSync(row, users) {
    if (!row) {
      return;
    }
    const next = normalizeUsers(users);
    const pwaPrev = new Set(normalizeUsers(row.assign_pwa));
    row.assign = next;
    row.assign_pwa = next.filter((u) => pwaPrev.has(u));
    row.assign_todo_only = next.filter((u) => !pwaPrev.has(u));
  }
  function stampAssignMetaAfterPwa(row, users) {
    if (!row) {
      return;
    }
    const next = normalizeUsers(users);
    row.assign = next;
    row.assign_pwa = [...next];
    row.assign_todo_only = [];
  }
  async function listOpenAssignees(taskId) {
    const rows = await frappe.db.get_list("ToDo", {
      fields: ["allocated_to"],
      filters: {
        status: "Open",
        reference_type: "Task",
        reference_name: taskId
      },
      limit: 0
    });
    return normalizeUsers((rows || []).map((r) => r.allocated_to));
  }
  async function syncTodosToUsers(taskId, users) {
    const desired = normalizeUsers(users);
    const desiredSet = new Set(desired);
    const current = await listOpenAssignees(taskId);
    const currentSet = new Set(current);
    const toAdd = desired.filter((u) => !currentSet.has(u));
    const toRemove = current.filter((u) => !desiredSet.has(u));
    if (toAdd.length) {
      await frappe.xcall("frappe.desk.form.assign_to.add", {
        doctype: "Task",
        name: taskId,
        assign_to: toAdd
      });
    }
    for (const user of toRemove) {
      await frappe.xcall("frappe.desk.form.assign_to.remove", {
        doctype: "Task",
        name: taskId,
        assign_to: user
      });
    }
  }
  async function syncTaskAssignMany(ops) {
    const list = (ops || []).filter((op) => op == null ? void 0 : op.taskId);
    for (const op of list) {
      await syncTodosToUsers(op.taskId, op.users);
    }
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/bulk-dialog.js
  function parseDialogUsers(raw) {
    if (Array.isArray(raw)) {
      return normalizeUsers(raw);
    }
    if (raw == null || raw === "") {
      return [];
    }
    return normalizeUsers(String(raw).split(/[,\n]/));
  }
  function openBulkTodoAssignDialog({ rows, onConfirm }) {
    const writable = (rows || []).filter((r) => (r == null ? void 0 : r.id) && r.can_write);
    if (!writable.length) {
      frappe.show_alert({
        message: __("No writable tasks selected"),
        indicator: "orange"
      });
      return;
    }
    const dialog = new frappe.ui.Dialog({
      title: __("Assign users"),
      fields: [
        {
          fieldtype: "HTML",
          fieldname: "hint",
          options: `<p class="text-muted small">${__(
            "Add users to {0} selected task(s). Assignments are saved as ToDo only (not workload).",
            [writable.length]
          )}</p>`
        },
        {
          label: __("Users"),
          fieldname: "users",
          fieldtype: "MultiSelectPills",
          reqd: 1,
          get_data(txt) {
            return frappe.db.get_link_options("User", txt, {
              user_type: "System User",
              enabled: 1
            });
          }
        }
      ],
      primary_action_label: __("Assign"),
      primary_action(values) {
        const users = parseDialogUsers(values == null ? void 0 : values.users);
        if (!users.length) {
          frappe.show_alert({
            message: __("Select at least one user"),
            indicator: "orange"
          });
          return;
        }
        dialog.hide();
        onConfirm == null ? void 0 : onConfirm(users);
      }
    });
    dialog.show();
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/bulk.js
  function editSource() {
    var _a;
    return typeof ((_a = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _a.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
  }
  function commitBulkTodoAssign(table, addUsers) {
    var _a, _b, _c, _d;
    const add = normalizeUsers(addUsers);
    if (!add.length || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      return 0;
    }
    const checkedIds = ((_a = table.getCheckedRowIds) == null ? void 0 : _a.call(table)) || [];
    const changes = [];
    for (const rowId of checkedIds) {
      const node = (_c = (_b = table.api) == null ? void 0 : _b.getRowNode) == null ? void 0 : _c.call(_b, String(rowId));
      const row = (node == null ? void 0 : node.data) || ((_d = table.findSourceRow) == null ? void 0 : _d.call(table, rowId));
      if (!(row == null ? void 0 : row.id) || !row.can_write || !node) {
        continue;
      }
      const oldValue = normalizeUsers(row.assign);
      const newValue = normalizeUsers([...oldValue, ...add]);
      if (sameUsers(oldValue, newValue)) {
        continue;
      }
      changes.push({
        node,
        field: "assign",
        oldValue,
        newValue,
        rowIndex: node.rowIndex,
        colId: "assign"
      });
    }
    if (!changes.length) {
      frappe.show_alert({
        message: __("Nothing to update"),
        indicator: "blue"
      });
      return 0;
    }
    const { applied } = table.commitCellChanges({
      source: editSource(),
      changes
    });
    return applied;
  }
  function bulkAssignToolbarItem() {
    return {
      id: "tree-gantt-bulk-assign",
      label: __("Assign"),
      title: __("Assign users to checked tasks (ToDo)"),
      iconSvg: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 9.5a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M2.5 13.5c.6-2 2.4-3 5.5-3s4.9 1 5.5 3"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M12.5 3.5v4M10.5 5.5h4"/></svg>',
      disabled: ({ table }) => {
        var _a;
        const rows = ((_a = table == null ? void 0 : table.getCheckedRows) == null ? void 0 : _a.call(table)) || [];
        return !rows.some((r) => r == null ? void 0 : r.can_write);
      },
      onClick: ({ table }) => {
        var _a;
        const rows = ((_a = table == null ? void 0 : table.getCheckedRows) == null ? void 0 : _a.call(table)) || [];
        openBulkTodoAssignDialog({
          rows,
          onConfirm: (users) => {
            void ensureAssignUserInfo(users).then(() => {
              commitBulkTodoAssign(table, users);
            });
          }
        });
      }
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/format.js
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text != null && text !== "") {
      node.textContent = text;
    }
    return node;
  }
  function slugClass(value) {
    if (!value) {
      return "";
    }
    return String(value).toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "");
  }
  function parseTags(raw, limit = null) {
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw)) {
      const tags2 = raw.map(String).map((s) => s.trim()).filter(Boolean);
      return limit == null ? tags2 : tags2.slice(0, limit);
    }
    const parts = String(raw).split(",");
    const tags = parts.slice(1).map((s) => s.trim()).filter(Boolean);
    return limit == null ? tags : tags.slice(0, limit);
  }
  function formatPercent(value) {
    if (value == null || value === "") {
      return "";
    }
    const n = Number(value);
    if (Number.isNaN(n)) {
      return "";
    }
    return `${Math.round(n)}%`;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/select-value.js
  function resolveSelectOption(raw, options) {
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
  function isAllowedSelectOption(value, options) {
    if (value == null || value === "") {
      return false;
    }
    return (options || []).includes(String(value));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/priority/options.js
  function getPriorityOptions() {
    const field = frappe.meta.get_field("Task", "priority") || frappe.meta.get_docfield("Task", "priority");
    const raw = (field == null ? void 0 : field.options) || "";
    return String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
  }
  function parsePriorityValue(params) {
    return resolveSelectOption(params.newValue, getPriorityOptions());
  }
  function isValidPriorityValue(value) {
    return isAllowedSelectOption(value, getPriorityOptions());
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/status/options.js
  function getStatusOptions(row) {
    const field = frappe.meta.get_field("Task", "status") || frappe.meta.get_docfield("Task", "status");
    const raw = (field == null ? void 0 : field.options) || "";
    const options = String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!row) {
      return options;
    }
    const confirm = row.confirm === 1 || row.confirm === true;
    if (confirm && row.owner && row.owner !== frappe.session.user) {
      const idx = options.indexOf("Completed");
      if (idx > -1) {
        options.splice(idx, 1);
      }
    }
    return options;
  }
  function parseStatusValue(params) {
    return resolveSelectOption(params.newValue, getStatusOptions());
  }
  function isValidStatusValue(value, row) {
    return isAllowedSelectOption(value, getStatusOptions(row));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/save.js
  var TASK_FIELDS = /* @__PURE__ */ new Set([
    "subject",
    "status",
    "priority",
    "exp_start_date",
    "exp_end_date",
    "expected_time",
    "custom_include"
  ]);
  var EDITABLE_FIELDS = /* @__PURE__ */ new Set([...TASK_FIELDS, "assign"]);
  function rowCanWrite(row) {
    if (!(row == null ? void 0 : row.id))
      return false;
    return row.can_write === 1 || row.can_write === true;
  }
  function fieldCanEdit(row, field) {
    return EDITABLE_FIELDS.has(field) && rowCanWrite(row);
  }
  function taskIdFromChange(change) {
    var _a;
    if ((_a = change == null ? void 0 : change.row) == null ? void 0 : _a.id) {
      return String(change.row.id);
    }
    const raw = String((change == null ? void 0 : change.rowId) || "");
    if (!raw) {
      return "";
    }
    const parts = raw.split(":");
    return parts[parts.length - 1] || raw;
  }
  function toFrappeDate(value) {
    if (value == null || value === "") {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return frappe.datetime.obj_to_str(value);
    }
    const s = String(value).trim();
    if (!s) {
      return null;
    }
    if (s.includes("T")) {
      return s.slice(0, 10);
    }
    return s;
  }
  function normalizeSaveValue(field, value) {
    if (field === "custom_include") {
      return value ? 1 : 0;
    }
    if (field === "exp_start_date" || field === "exp_end_date") {
      return toFrappeDate(value);
    }
    if (field === "expected_time") {
      if (value == null || value === "") {
        return null;
      }
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    if (field === "assign") {
      return normalizeUsers(value);
    }
    return value;
  }
  function rejectSelectValue(fieldLabel, value) {
    const shown = value == null || value === "" ? __("(empty)") : String(value);
    frappe.show_alert({
      message: __("Invalid {0}: {1}", [fieldLabel, shown]),
      indicator: "orange"
    });
    return false;
  }
  function onValidateCells({ changes }) {
    for (const change of changes) {
      if (!EDITABLE_FIELDS.has(change.field)) {
        frappe.show_alert({
          message: __("Field {0} is not editable", [change.field]),
          indicator: "orange"
        });
        return false;
      }
      if (!rowCanWrite(change.row)) {
        frappe.show_alert({
          message: __("Not permitted to write Task {0}", [
            taskIdFromChange(change)
          ]),
          indicator: "red"
        });
        return false;
      }
      if (change.field === "subject" && !String(change.newValue || "").trim()) {
        frappe.show_alert({
          message: __("Subject is required"),
          indicator: "orange"
        });
        return false;
      }
      if (change.field === "status" && !isValidStatusValue(change.newValue, change.row)) {
        return rejectSelectValue(__("Status"), change.newValue);
      }
      if (change.field === "priority" && !isValidPriorityValue(change.newValue)) {
        return rejectSelectValue(__("Priority"), change.newValue);
      }
    }
    return true;
  }
  async function saveCells2(payload) {
    if (!(payload == null ? void 0 : payload.length))
      return true;
    try {
      await saveCells(payload);
      frappe.show_alert(
        {
          message: __("Data updated successfully"),
          indicator: "green"
        },
        5
      );
      return true;
    } catch (e) {
      frappe.show_alert(
        {
          message: e.message || __("Save failed"),
          indicator: "red"
        },
        7
      );
      return false;
    }
  }
  async function saveAssignChanges(changes) {
    const assignChanges = (changes || []).filter((c) => c.field === "assign");
    if (!assignChanges.length) {
      return true;
    }
    try {
      const ops = [];
      const usersForInfo = /* @__PURE__ */ new Set();
      for (const change of assignChanges) {
        const taskId = taskIdFromChange(change);
        const next = normalizeUsers(change.newValue);
        const prev = normalizeUsers(change.oldValue);
        if (sameUsers(prev, next)) {
          continue;
        }
        ops.push({
          taskId,
          users: next
        });
        next.forEach((u) => usersForInfo.add(u));
        if (change.row) {
          stampAssignMetaAfterTodoSync(change.row, next);
        }
      }
      if (!ops.length) {
        return true;
      }
      await syncTaskAssignMany(ops);
      if (usersForInfo.size) {
        await ensureAssignUserInfo([...usersForInfo]);
      }
      frappe.show_alert(
        {
          message: __("Data updated successfully"),
          indicator: "green"
        },
        5
      );
      return true;
    } catch (e) {
      frappe.show_alert(
        {
          message: e.message || __("Assign failed"),
          indicator: "red"
        },
        7
      );
      return false;
    }
  }
  async function onSaveCells({ changes, table }) {
    var _a, _b;
    const taskPayload = (changes || []).filter((c) => TASK_FIELDS.has(c.field)).map((c) => ({
      id: taskIdFromChange(c),
      field: c.field,
      value: normalizeSaveValue(c.field, c.newValue)
    })).filter((c) => c.id);
    const assignOk = await saveAssignChanges(changes);
    if (!assignOk) {
      return false;
    }
    if ((changes || []).some((c) => c.field === "assign")) {
      (_b = (_a = table == null ? void 0 : table.api) == null ? void 0 : _a.refreshCells) == null ? void 0 : _b.call(_a, {
        columns: ["assign"],
        force: true
      });
    }
    if (!taskPayload.length) {
      return true;
    }
    return saveCells2(taskPayload);
  }
  function changesAffectGantt(changes) {
    return (changes || []).some(
      (c) => c.field === "exp_start_date" || c.field === "exp_end_date" || c.field === "status" || c.field === "priority" || c.field === "subject" || c.field === "progress" || c.field === "assign"
    );
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/context.js
  var columnsPage = null;
  var onAssignSaved = null;
  var onTreeMutate = null;
  var onGanttRefresh = null;
  function setColumnContext({
    page,
    onAssignSaved: assignHook,
    onTreeMutate: mutateHook,
    onGanttRefresh: ganttHook
  } = {}) {
    if (page !== void 0) {
      columnsPage = page || null;
    }
    if (assignHook !== void 0) {
      onAssignSaved = typeof assignHook === "function" ? assignHook : null;
    }
    if (mutateHook !== void 0) {
      onTreeMutate = typeof mutateHook === "function" ? mutateHook : null;
    }
    if (ganttHook !== void 0) {
      onGanttRefresh = typeof ganttHook === "function" ? ganttHook : null;
    }
  }
  function getColumnsPage() {
    return columnsPage;
  }
  function getOnAssignSaved() {
    return onAssignSaved;
  }
  function getOnTreeMutate() {
    return onTreeMutate;
  }
  function getOnGanttRefresh() {
    return onGanttRefresh || onAssignSaved;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/widths.js
  var TREE_COL_WIDTH = {
    assign: 100,
    plan_fact: 35,
    status: 130,
    priority: 110,
    exp_start_date: 85,
    exp_end_date: 105,
    expected_time: 87,
    progress: 96,
    custom_include: 35,
    type: 85,
    user_tags: 120
  };
  function fixedCol(width) {
    return {
      width,
      minWidth: width,
      maxWidth: width,
      resizable: false
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/dialog.js
  function openAssignDialog({ row, project = null, onSaved }) {
    if (!(row == null ? void 0 : row.id) || !row.can_write) {
      return;
    }
    if (typeof start_pwa_dialog !== "function") {
      frappe.msgprint(__("Workload assignment function is unavailable"));
      return;
    }
    const task = {
      name: row.id,
      project: project || void 0,
      subject: row.subject || void 0,
      exp_start_date: row.exp_start_date || void 0,
      exp_end_date: row.exp_end_date || void 0
    };
    start_pwa_dialog((pwas) => {
      const users = (pwas || []).filter((pwa) => pwa && !pwa.__isRemove && pwa.user).map((pwa) => pwa.user);
      onSaved == null ? void 0 : onSaved(users);
    }, task);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/index.js
  function assignUsers(row, value) {
    if (Array.isArray(value)) {
      return value;
    }
    return Array.isArray(row == null ? void 0 : row.assign) ? row.assign : [];
  }
  function todoOnlySet(row) {
    return new Set(normalizeUsers(row == null ? void 0 : row.assign_todo_only));
  }
  function renderAvatars(users, row) {
    var _a, _b;
    const list = el(
      "div",
      "list-assignments tree-gantt-assign-avatars d-flex align-items-center"
    );
    const todoOnly = todoOnlySet(row);
    const shown = users.slice(0, 3);
    for (const user of shown) {
      const wrap = el("span", "tree-gantt-assign-avatar");
      const fullName = ((_b = (_a = frappe.user) == null ? void 0 : _a.full_name) == null ? void 0 : _b.call(_a, user)) || user;
      const isTodoOnly = todoOnly.has(user);
      wrap.classList.add(
        isTodoOnly ? "tree-gantt-assign-avatar--todo" : "tree-gantt-assign-avatar--pwa"
      );
      const avatarHtml = frappe.avatar(user, "avatar-small");
      const tmp = document.createElement("div");
      tmp.innerHTML = avatarHtml;
      const avatarNode = tmp.firstElementChild;
      if (avatarNode) {
        wrap.appendChild(avatarNode);
      }
      if (isTodoOnly) {
        const tip = __("{0}: assigned via ToDo only (no workload)", [fullName]);
        wrap.setAttribute("aria-label", tip);
        $(wrap).tooltip({
          title: tip,
          container: "body",
          trigger: "hover",
          delay: { show: 200, hide: 0 }
        });
      } else {
        wrap.title = fullName;
      }
      list.appendChild(wrap);
    }
    if (users.length > 3) {
      const more = el("span", "avatar-group-more text-muted");
      more.textContent = `+${users.length - 3}`;
      list.appendChild(more);
    }
    return list;
  }
  function commitAssignChange(params, row, nextUsers) {
    var _a, _b, _c, _d;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = normalizeUsers(row == null ? void 0 : row.assign);
    const newValue = normalizeUsers(nextUsers);
    if (sameUsers(oldValue, newValue)) {
      return false;
    }
    if (!params.node || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      console.error("[task_tree_gantt] assign commit: table/node missing");
      return false;
    }
    const source = typeof ((_b = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _b.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
    const { applied } = table.commitCellChanges({
      source,
      changes: [
        {
          node: params.node,
          field: "assign",
          oldValue,
          newValue,
          rowIndex: params.node.rowIndex,
          colId: ((_d = (_c = params.column) == null ? void 0 : _c.getColId) == null ? void 0 : _d.call(_c)) || "assign"
        }
      ]
    });
    return applied > 0;
  }
  async function applyAssignFromDialog(row, params, users) {
    var _a, _b;
    const newValue = normalizeUsers(users);
    await ensureAssignUserInfo(newValue);
    stampAssignMetaAfterPwa(row, newValue);
    if (((_a = params.node) == null ? void 0 : _a.data) && params.node.data !== row) {
      stampAssignMetaAfterPwa(params.node.data, newValue);
    }
    const ok = commitAssignChange(params, row, newValue);
    if (ok) {
      (_b = getOnAssignSaved) == null ? void 0 : _b(row.id, newValue);
    }
  }
  function openAssign(row, params) {
    var _a, _b, _c;
    const page = getColumnsPage();
    const project = ((_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b)) || null;
    openAssignDialog({
      row,
      project,
      onSaved: (users) => {
        void applyAssignFromDialog(row, params, users);
      }
    });
  }
  function wireAssignActions(wrap, params, row, avatarsEl) {
    if (!row.can_write) {
      return;
    }
    wrap.classList.add("tree-gantt-assign--editable");
    wrap.title = [wrap.title, __("Double-click to assign")].filter(Boolean).join(" \u2014 ");
    wrap.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openAssign(row, params);
    });
    if (avatarsEl) {
      avatarsEl.classList.add("tree-gantt-assign-avatars--action");
      avatarsEl.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openAssign(row, params);
      });
    }
  }
  function assignValueFormatter(params) {
    const users = assignUsers(params.data, params.value);
    return users.length ? users.join(", ") : "";
  }
  function assignValueParser(params) {
    const raw = params.newValue;
    if (Array.isArray(raw)) {
      return raw.map(String).map((s) => s.trim()).filter(Boolean);
    }
    if (raw == null || raw === "") {
      return [];
    }
    if (typeof raw === "string") {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return Array.isArray(params.oldValue) ? params.oldValue : [];
  }
  function renderAssign(params) {
    const row = params.data || {};
    const users = assignUsers(row, params.value);
    const wrap = el("div", "tree-gantt-assign");
    const label = assignValueFormatter(params);
    wrap.title = label || "-";
    let avatarsEl = null;
    if (!users.length) {
      wrap.classList.add("text-muted");
      wrap.textContent = "-";
    } else {
      avatarsEl = renderAvatars(users, row);
      wrap.appendChild(avatarsEl);
    }
    wireAssignActions(wrap, params, row, avatarsEl);
    return wrap;
  }
  function assignColumn() {
    return __spreadProps(__spreadValues({
      field: "assign",
      headerName: __("Resp.")
    }, fixedCol(TREE_COL_WIDTH.assign)), {
      edit: (row) => rowCanWrite(row),
      suppressClickEdit: true,
      sortable: false,
      cellDataType: false,
      cellRenderer: renderAssign,
      valueFormatter: assignValueFormatter,
      valueParser: assignValueParser,
      cellClass: "dinext-table-cell--align-center"
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/dates/frappe-date-editor.js
  function toIso(value) {
    if (typeof (DinextTable == null ? void 0 : DinextTable.toIsoDateString) === "function") {
      return DinextTable.toIsoDateString(value);
    }
    if (value == null || value === "") {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return frappe.datetime.obj_to_str(value);
    }
    const s = String(value).trim();
    if (!s) {
      return null;
    }
    return s.includes("T") ? s.slice(0, 10) : s;
  }
  var FrappeDateCellEditor = class {
    init(params) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      this.params = params;
      this._stopped = false;
      this._value = toIso(params.value);
      this.host = document.createElement("div");
      this.host.className = "tree-gantt-frappe-date-editor";
      const field = ((_a = params.colDef) == null ? void 0 : _a.field) || "date";
      const initial = this._value || "";
      this.control = frappe.ui.form.make_control({
        parent: $(this.host),
        only_input: true,
        df: {
          fieldname: field,
          fieldtype: "Date",
          label: ""
        },
        value: initial,
        render_input: true
      });
      (_c = (_b = this.control.$wrapper) == null ? void 0 : _b.addClass) == null ? void 0 : _c.call(_b, "tree-gantt-frappe-date-control");
      (_g = (_f = (_e = (_d = this.control.$wrapper) == null ? void 0 : _d.find) == null ? void 0 : _e.call(_d, ".control-label, .help-box, .clearfix")) == null ? void 0 : _f.hide) == null ? void 0 : _g.call(_f);
      this._bindDatepicker();
      (_i = (_h = this.control.$input) == null ? void 0 : _h.on) == null ? void 0 : _i.call(_h, "change", () => {
        this._value = toIso(this.control.get_value());
        this.stopEditing(false);
      });
      (_k = (_j = this.control.$input) == null ? void 0 : _j.on) == null ? void 0 : _k.call(_j, "keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          this.stopEditing(true);
        }
      });
    }
    _bindDatepicker() {
      var _a;
      const dp = (_a = this.control) == null ? void 0 : _a.datepicker;
      if (!(dp == null ? void 0 : dp.$datepicker)) {
        return;
      }
      dp.$datepicker.addClass("tree-gantt-datepicker");
      dp.$datepicker.off(".treeGanttDate");
      dp.$datepicker.on("mousedown.treeGanttDate", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      });
    }
    getGui() {
      return this.host;
    }
    afterGuiAttached() {
      var _a, _b, _c, _d, _e, _f;
      (_c = (_b = (_a = this.control) == null ? void 0 : _a.$input) == null ? void 0 : _b.trigger) == null ? void 0 : _c.call(_b, "focus");
      this._bindDatepicker();
      (_f = (_e = (_d = this.control) == null ? void 0 : _d.datepicker) == null ? void 0 : _e.show) == null ? void 0 : _f.call(_e);
    }
    getValue() {
      var _a, _b;
      if (this._value !== void 0) {
        return this._value;
      }
      return toIso((_b = (_a = this.control) == null ? void 0 : _a.get_value) == null ? void 0 : _b.call(_a));
    }
    isCancelAfterEnd() {
      return false;
    }
    stopEditing(cancel = false) {
      var _a, _b, _c, _d, _e;
      if (this._stopped) {
        return;
      }
      this._stopped = true;
      if (!cancel) {
        this._value = (_c = toIso((_b = (_a = this.control) == null ? void 0 : _a.get_value) == null ? void 0 : _b.call(_a))) != null ? _c : this._value;
      }
      (_e = (_d = this.params) == null ? void 0 : _d.stopEditing) == null ? void 0 : _e.call(_d, cancel);
    }
    destroy() {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      try {
        (_d = (_c = (_b = (_a = this.control) == null ? void 0 : _a.datepicker) == null ? void 0 : _b.$datepicker) == null ? void 0 : _c.off) == null ? void 0 : _d.call(_c, ".treeGanttDate");
        (_g = (_f = (_e = this.control) == null ? void 0 : _e.datepicker) == null ? void 0 : _f.hide) == null ? void 0 : _g.call(_f);
        (_j = (_i = (_h = this.control) == null ? void 0 : _h.datepicker) == null ? void 0 : _i.destroy) == null ? void 0 : _j.call(_i);
      } catch (e) {
      }
      this.control = null;
      this.host = null;
      this.params = null;
    }
  };

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/dates/index.js
  function dateCellClass(params) {
    const conflict = dateConflictClass(params);
    return ["dinext-table-cell--align-center", conflict].filter(Boolean).join(" ");
  }
  function dateColumnBase(field, headerName, tooltipValueGetter) {
    return __spreadProps(__spreadValues({
      field,
      headerName
    }, fixedCol(TREE_COL_WIDTH[field])), {
      type: "date",
      edit: (row) => fieldCanEdit(row, field),
      cellEditor: FrappeDateCellEditor,
      cellClass: dateCellClass,
      tooltipValueGetter,
      wrapHeaderText: true,
      headerClass: "tree-gantt-header--wrap"
    });
  }
  function expStartColumn() {
    return dateColumnBase(
      "exp_start_date",
      __("Forecast Start"),
      startDateConflictTooltip
    );
  }
  function expEndColumn() {
    return dateColumnBase(
      "exp_end_date",
      __("Forecast Completion"),
      endDateConflictTooltip
    );
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/duration.js
  function durationValueFormatter(params) {
    var _a;
    const value = (_a = params.data) == null ? void 0 : _a.duration;
    if (value == null || value === "") {
      return "-";
    }
    return String(value);
  }
  function durationColumn() {
    return __spreadProps(__spreadValues({
      field: "expected_time",
      headerName: __("Duration")
    }, fixedCol(TREE_COL_WIDTH.expected_time)), {
      type: "number",
      cellClass: "dinext-table-cell--align-center",
      valueFormatter: durationValueFormatter,
      edit: false
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/include.js
  function includeColumn() {
    return __spreadProps(__spreadValues({
      field: "custom_include",
      headerName: __("TS")
    }, fixedCol(TREE_COL_WIDTH.custom_include)), {
      type: "checkbox",
      sortable: false,
      edit: (row) => fieldCanEdit(row, "custom_include")
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/plan_fact/dialog.js
  function formatPlanField(val, _field, _options, doc) {
    return doc.planned_hours ? val : `<span class="${doc.status}">${val}</span>`;
  }
  function formatPctField(val, _field, _options, doc) {
    return doc.planned_hours ? `<span class="${doc.status}">${val}</span>` : val;
  }
  function showPlanFactDialog(row) {
    const taskData = ((row == null ? void 0 : row.plan_fact_data) || []).map((data) => {
      var _a;
      return __spreadProps(__spreadValues({}, data), {
        users: frappe.utils.comma_and(((_a = data.hours_data) == null ? void 0 : _a.users) || [])
      });
    });
    if (!taskData.length) {
      return;
    }
    const d = new frappe.ui.Dialog({
      title: __("Work Efforts Plan vs Actual"),
      fields: [
        {
          label: __("Task"),
          fieldname: "name",
          fieldtype: "Data",
          read_only: 1,
          default: row.subject || row.id
        },
        {
          fieldname: "plan_fact_table",
          fieldtype: "Table",
          cannot_add_rows: 1,
          cannot_delete_rows: 1,
          in_place_edit: true,
          fields: [
            {
              label: __("Role"),
              fieldname: "role",
              fieldtype: "Data",
              read_only: 1,
              in_list_view: 1,
              columns: 3
            },
            {
              label: __("Plan"),
              fieldname: "planned_hours",
              fieldtype: "Float",
              precision: 1,
              read_only: 1,
              in_list_view: 1,
              columns: 1,
              formatter: formatPlanField
            },
            {
              label: __("Actual"),
              fieldname: "total_hours",
              fieldtype: "Float",
              precision: 1,
              read_only: 1,
              in_list_view: 1,
              columns: 1
            },
            {
              label: __("%"),
              fieldname: "completion_percentage",
              fieldtype: "Percent",
              precision: 1,
              read_only: 1,
              in_list_view: 1,
              columns: 1,
              formatter: formatPctField
            },
            {
              label: __("Work efforts included from"),
              fieldname: "users",
              fieldtype: "Data",
              read_only: 1,
              in_list_view: 1,
              columns: 4
            }
          ],
          data: taskData
        }
      ],
      size: "large",
      primary_action_label: __("Done"),
      primary_action() {
        var _a, _b;
        d.hide();
        (_b = (_a = document.activeElement) == null ? void 0 : _a.blur) == null ? void 0 : _b.call(_a);
      }
    });
    const missing = taskData.filter((data) => data.plan_required && data.planned_hours <= 0);
    if (missing.length) {
      const warning = document.createElement("div");
      warning.className = "alert alert-danger";
      warning.style.cssText = "margin: 15px 0; display: flex; align-items: center; gap: 8px;";
      warning.innerHTML = `<i class="fa fa-exclamation-triangle" style="font-size: 1.2em;"></i>
			<div><strong>${__("Attention!")}</strong>
			${__("Planned work efforts are required for this task")}</div>`;
      d.$wrapper.find(".modal-body").prepend(warning);
    }
    d.show();
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/plan_fact/index.js
  function renderPlanFactButton(row) {
    const status = (row == null ? void 0 : row.plan_fact_status) || "no-data";
    const hasData = Array.isArray(row == null ? void 0 : row.plan_fact_data) && row.plan_fact_data.length > 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `btn btn-xs plan-fact-button tree-gantt-plan-fact-btn ${status}`;
    btn.title = (row == null ? void 0 : row.plan_fact_title) || __("No work efforts data");
    btn.dataset.docname = (row == null ? void 0 : row.id) || "";
    btn.innerHTML = '<i class="fa fa-info-circle"></i>';
    if (hasData) {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showPlanFactDialog(row);
      });
    }
    return btn;
  }
  function renderPlanFact(params) {
    const wrap = document.createElement("div");
    wrap.className = "tree-gantt-plan-fact";
    wrap.appendChild(renderPlanFactButton(params.data || {}));
    return wrap;
  }
  function planFactColumn() {
    return __spreadProps(__spreadValues({
      field: "plan_fact",
      headerName: __("WE")
    }, fixedCol(TREE_COL_WIDTH.plan_fact)), {
      sortable: false,
      edit: false,
      cellRenderer: renderPlanFact,
      cellClass: "dinext-table-cell--align-center"
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/priority/edit.js
  function evaluateReadOnlyDependsOn(expression, doc) {
    if (typeof expression === "boolean")
      return expression;
    if (!expression)
      return false;
    const expr = String(expression);
    if (expr.startsWith("eval:")) {
      try {
        return !!frappe.utils.eval(expr.slice(5), { doc });
      } catch (e) {
        return false;
      }
    }
    const value = doc == null ? void 0 : doc[expr];
    if (Array.isArray(value))
      return !!value.length;
    return !!value;
  }
  function fieldIsWritable(doc, taskId) {
    var _a, _b;
    if ((_b = (_a = frappe.workflow) == null ? void 0 : _a.is_read_only) == null ? void 0 : _b.call(_a, "Task", taskId))
      return false;
    const df = frappe.meta.get_field("Task", "priority", taskId);
    if (!df)
      return true;
    let status = frappe.perm.get_field_display_status(df, doc, null, false);
    if (status === "Write" && df.read_only_depends_on && evaluateReadOnlyDependsOn(df.read_only_depends_on, doc)) {
      status = "Read";
    }
    return status === "Write";
  }
  function commitPriorityChange(params, row, next) {
    var _a, _b, _c, _d;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = row.priority || "";
    const newValue = next || "";
    if (String(oldValue) === String(newValue)) {
      return false;
    }
    if (!params.node || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      console.error("[task_tree_gantt] priority commit: table/node missing");
      return false;
    }
    const source = typeof ((_b = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _b.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
    const { applied } = table.commitCellChanges({
      source,
      changes: [
        {
          node: params.node,
          field: "priority",
          oldValue,
          newValue,
          rowIndex: params.node.rowIndex,
          colId: ((_d = (_c = params.column) == null ? void 0 : _c.getColId) == null ? void 0 : _d.call(_c)) || "priority"
        }
      ]
    });
    return applied > 0;
  }
  async function startPriorityInlineEdit({ wrap, row, params }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    if (!fieldCanEdit(row, "priority"))
      return;
    if (wrap.querySelector(".tree-gantt-priority-edit"))
      return;
    const taskId = row.id;
    let doc;
    try {
      doc = await frappe.model.with_doc("Task", taskId);
    } catch (e) {
      console.error("[task_tree_gantt] priority with_doc", e);
      return;
    }
    if (!fieldIsWritable(doc, taskId))
      return;
    const options = getPriorityOptions();
    const oldValue = row.priority || "";
    wrap.replaceChildren();
    const host = document.createElement("div");
    host.className = "tree-gantt-priority-edit";
    wrap.appendChild(host);
    let finished = false;
    const finish = (commit) => {
      var _a2, _b2, _c2, _d2;
      if (finished)
        return;
      finished = true;
      const control2 = host._control;
      const next = control2 ? control2.get_value() : oldValue;
      if (commit && next != null && String(next) !== String(oldValue)) {
        const ok = commitPriorityChange(params, row, next);
        if (ok) {
          (_b2 = (_a2 = frappe.model).clear_doc) == null ? void 0 : _b2.call(_a2, "Task", taskId);
        }
      }
      host._control = null;
      (_d2 = (_c2 = params.api) == null ? void 0 : _c2.refreshCells) == null ? void 0 : _d2.call(_c2, {
        rowNodes: params.node ? [params.node] : void 0,
        columns: ["priority"],
        force: true
      });
    };
    const control = frappe.ui.form.make_control({
      parent: $(host),
      doctype: "Task",
      docname: taskId,
      only_input: true,
      df: {
        fieldname: "priority",
        fieldtype: "Select",
        label: "",
        options: options.join("\n")
      },
      value: oldValue,
      render_input: true
    });
    host._control = control;
    (_b = (_a = control.$wrapper) == null ? void 0 : _a.addClass) == null ? void 0 : _b.call(_a, "tree-gantt-priority-control");
    (_f = (_e = (_d = (_c = control.$wrapper) == null ? void 0 : _c.find) == null ? void 0 : _d.call(_c, ".control-label, .help-box, .clearfix")) == null ? void 0 : _e.hide) == null ? void 0 : _f.call(_e);
    (_h = (_g = control.$input) == null ? void 0 : _g.trigger) == null ? void 0 : _h.call(_g, "focus");
    (_j = (_i = control.$input) == null ? void 0 : _i.on) == null ? void 0 : _j.call(_i, "change", () => {
      finish(true);
    });
    (_l = (_k = control.$input) == null ? void 0 : _k.on) == null ? void 0 : _l.call(_k, "keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });
    (_n = (_m = control.$input) == null ? void 0 : _m.on) == null ? void 0 : _n.call(_m, "blur", () => {
      setTimeout(() => finish(false), 150);
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/priority/index.js
  var PRIORITY_SLUGS = ["urgent", "high", "medium", "low"];
  function priorityLabel(value) {
    if (!value) {
      return "";
    }
    return __(String(value));
  }
  function rowPrioritySlug(params) {
    var _a;
    const value = ((_a = params == null ? void 0 : params.data) == null ? void 0 : _a.priority) || (params == null ? void 0 : params.value) || "";
    return slugClass(value);
  }
  function priorityCellClass() {
    return "tree-gantt-priority dinext-table-cell--align-center";
  }
  function priorityCellClassRules() {
    const rules = {};
    for (const slug of PRIORITY_SLUGS) {
      rules[`tree-gantt-priority--${slug}`] = (params) => rowPrioritySlug(params) === slug;
    }
    return rules;
  }
  function wireEdit(wrap, params, row) {
    if (!fieldCanEdit(row, "priority")) {
      return;
    }
    wrap.classList.add("tree-gantt-priority--editable");
    wrap.title = [wrap.title, __("Double-click to edit")].filter(Boolean).join(" \u2014 ");
    wrap.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void startPriorityInlineEdit({ wrap, row, params });
    });
  }
  function renderPriority(params) {
    const row = params.data || {};
    const value = row.priority || params.value || "";
    const wrap = el("div", "tree-gantt-priority-cell");
    const label = priorityLabel(value);
    wrap.textContent = label;
    wrap.title = label;
    wrap.dataset.priority = value;
    wireEdit(wrap, params, row);
    return wrap;
  }
  function priorityColumn() {
    return __spreadProps(__spreadValues({
      field: "priority",
      headerName: __("Priority")
    }, fixedCol(TREE_COL_WIDTH.priority)), {
      edit: (row) => fieldCanEdit(row, "priority"),
      suppressClickEdit: true,
      cellRenderer: renderPriority,
      valueFormatter: (params) => priorityLabel(params.value),
      valueParser: parsePriorityValue,
      cellClass: priorityCellClass,
      cellClassRules: priorityCellClassRules()
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/progress.js
  function renderProgress(params) {
    const value = Number(params.value) || 0;
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    const wrap = el("div", "tree-gantt-progress");
    wrap.title = formatPercent(value);
    const bar = el("div", "progress-bar progress-bar-success tree-gantt-progress-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.style.width = `${pct}%`;
    wrap.appendChild(bar);
    return wrap;
  }
  function progressColumn() {
    return __spreadProps(__spreadValues({
      field: "progress",
      headerName: __("Progress")
    }, fixedCol(TREE_COL_WIDTH.progress)), {
      edit: false,
      cellRenderer: renderProgress,
      cellClass: "dinext-table-cell--align-center"
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/status/edit.js
  function evaluateReadOnlyDependsOn2(expression, doc) {
    if (typeof expression === "boolean")
      return expression;
    if (!expression)
      return false;
    const expr = String(expression);
    if (expr.startsWith("eval:")) {
      try {
        return !!frappe.utils.eval(expr.slice(5), { doc });
      } catch (e) {
        return false;
      }
    }
    const value = doc == null ? void 0 : doc[expr];
    if (Array.isArray(value))
      return !!value.length;
    return !!value;
  }
  function fieldIsWritable2(doc, taskId) {
    var _a, _b;
    if ((_b = (_a = frappe.workflow) == null ? void 0 : _a.is_read_only) == null ? void 0 : _b.call(_a, "Task", taskId))
      return false;
    const df = frappe.meta.get_field("Task", "status", taskId);
    if (!df)
      return true;
    let status = frappe.perm.get_field_display_status(df, doc, null, false);
    if (status === "Write" && df.read_only_depends_on && evaluateReadOnlyDependsOn2(df.read_only_depends_on, doc)) {
      status = "Read";
    }
    return status === "Write";
  }
  function commitStatusChange(params, row, next) {
    var _a, _b, _c, _d;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = row.status || "";
    const newValue = next || "";
    if (String(oldValue) === String(newValue)) {
      return false;
    }
    if (!params.node || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      console.error("[task_tree_gantt] status commit: table/node missing");
      return false;
    }
    const source = typeof ((_b = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _b.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
    const { applied } = table.commitCellChanges({
      source,
      changes: [
        {
          node: params.node,
          field: "status",
          oldValue,
          newValue,
          rowIndex: params.node.rowIndex,
          colId: ((_d = (_c = params.column) == null ? void 0 : _c.getColId) == null ? void 0 : _d.call(_c)) || "status"
        }
      ]
    });
    return applied > 0;
  }
  async function startStatusInlineEdit({ wrap, row, params }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    if (!fieldCanEdit(row, "status"))
      return;
    if (wrap.querySelector(".tree-gantt-status-edit"))
      return;
    const taskId = row.id;
    let doc;
    try {
      doc = await frappe.model.with_doc("Task", taskId);
    } catch (e) {
      console.error("[task_tree_gantt] status with_doc", e);
      return;
    }
    if (!fieldIsWritable2(doc, taskId))
      return;
    const optionsRow = __spreadProps(__spreadValues({}, row), {
      confirm: (_a = doc.confirm) != null ? _a : row.confirm,
      owner: doc.owner || row.owner
    });
    const options = getStatusOptions(optionsRow);
    const oldValue = row.status || "";
    wrap.replaceChildren();
    const host = document.createElement("div");
    host.className = "tree-gantt-status-edit";
    wrap.appendChild(host);
    let finished = false;
    const finish = (commit) => {
      var _a2, _b2, _c2, _d2;
      if (finished)
        return;
      finished = true;
      const control2 = host._control;
      const next = control2 ? control2.get_value() : oldValue;
      if (commit && next != null && String(next) !== String(oldValue)) {
        const ok = commitStatusChange(params, row, next);
        if (ok) {
          (_b2 = (_a2 = frappe.model).clear_doc) == null ? void 0 : _b2.call(_a2, "Task", taskId);
        }
      }
      host._control = null;
      (_d2 = (_c2 = params.api) == null ? void 0 : _c2.refreshCells) == null ? void 0 : _d2.call(_c2, {
        rowNodes: params.node ? [params.node] : void 0,
        columns: ["status"],
        force: true
      });
    };
    const control = frappe.ui.form.make_control({
      parent: $(host),
      doctype: "Task",
      docname: taskId,
      only_input: true,
      df: {
        fieldname: "status",
        fieldtype: "Select",
        label: "",
        options: options.join("\n")
      },
      value: oldValue,
      render_input: true
    });
    host._control = control;
    (_c = (_b = control.$wrapper) == null ? void 0 : _b.addClass) == null ? void 0 : _c.call(_b, "tree-gantt-status-control");
    (_g = (_f = (_e = (_d = control.$wrapper) == null ? void 0 : _d.find) == null ? void 0 : _e.call(_d, ".control-label, .help-box, .clearfix")) == null ? void 0 : _f.hide) == null ? void 0 : _g.call(_f);
    (_i = (_h = control.$input) == null ? void 0 : _h.trigger) == null ? void 0 : _i.call(_h, "focus");
    (_k = (_j = control.$input) == null ? void 0 : _j.on) == null ? void 0 : _k.call(_j, "change", () => {
      finish(true);
    });
    (_m = (_l = control.$input) == null ? void 0 : _l.on) == null ? void 0 : _m.call(_l, "keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });
    (_o = (_n = control.$input) == null ? void 0 : _n.on) == null ? void 0 : _o.call(_n, "blur", () => {
      setTimeout(() => finish(false), 150);
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/status/index.js
  var STATUS_SLUGS = [
    "completed",
    "overdue",
    "cancelled",
    "working",
    "pending_review"
  ];
  function statusLabel(value) {
    if (!value) {
      return "";
    }
    return __(String(value));
  }
  function rowStatusSlug(params) {
    var _a;
    const value = ((_a = params == null ? void 0 : params.data) == null ? void 0 : _a.status) || (params == null ? void 0 : params.value) || "";
    return slugClass(value);
  }
  function statusCellClass() {
    return "tree-gantt-status dinext-table-cell--align-center";
  }
  function statusCellClassRules() {
    const rules = {};
    for (const slug of STATUS_SLUGS) {
      rules[`tree-gantt-status--${slug}`] = (params) => rowStatusSlug(params) === slug;
    }
    return rules;
  }
  function wireEdit2(wrap, params, row) {
    if (!fieldCanEdit(row, "status")) {
      return;
    }
    wrap.classList.add("tree-gantt-status--editable");
    wrap.title = [wrap.title, __("Double-click to edit")].filter(Boolean).join(" \u2014 ");
    wrap.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void startStatusInlineEdit({ wrap, row, params });
    });
  }
  function renderStatus(params) {
    const row = params.data || {};
    const value = row.status || params.value || "";
    const wrap = el("div", "tree-gantt-status-cell");
    const label = statusLabel(value);
    wrap.textContent = label;
    wrap.title = label;
    wrap.dataset.status = value;
    wireEdit2(wrap, params, row);
    return wrap;
  }
  function statusColumn() {
    return __spreadProps(__spreadValues({
      field: "status",
      headerName: __("Status")
    }, fixedCol(TREE_COL_WIDTH.status)), {
      edit: (row) => fieldCanEdit(row, "status"),
      suppressClickEdit: true,
      cellRenderer: renderStatus,
      valueFormatter: (params) => statusLabel(params.value),
      valueParser: parseStatusValue,
      cellClass: statusCellClass,
      cellClassRules: statusCellClassRules()
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/dependencies/preview.js
  var LARGE_AMOUNT_THRESHOLD = 200;
  function showPreviewDialog(previewList, refreshCtx) {
    if (!(previewList == null ? void 0 : previewList.length)) {
      frappe.show_alert(
        __("No downward task dependency violations found")
      );
      return;
    }
    const d = new frappe.ui.Dialog({
      title: __(
        "Required changes to resolve task dependency violations"
      ),
      size: "extra-large",
      fields: [
        {
          fieldname: "dependencies_rows",
          fieldtype: "Table",
          cannot_add_rows: 1,
          cannot_delete_rows: 1,
          in_place_edit: true,
          fields: [
            {
              label: __("Task"),
              fieldname: "subject",
              fieldtype: "Data",
              read_only: 1,
              in_list_view: 1,
              columns: 2
            },
            {
              label: __("Curr. Start"),
              fieldname: "current_start",
              fieldtype: "Date",
              read_only: 1,
              in_list_view: 1,
              columns: 1
            },
            {
              label: __("Curr. End"),
              fieldname: "current_end",
              fieldtype: "Date",
              read_only: 1,
              in_list_view: 1,
              columns: 1
            },
            {
              label: __("Prop. Start"),
              fieldname: "proposed_start",
              fieldtype: "Date",
              read_only: 1,
              in_list_view: 1,
              columns: 1
            },
            {
              label: __("Prop. End"),
              fieldname: "proposed_end",
              fieldtype: "Date",
              read_only: 1,
              in_list_view: 1,
              columns: 1
            },
            {
              label: __("Reasons"),
              fieldname: "reasons",
              fieldtype: "Data",
              read_only: 1,
              in_list_view: 1,
              columns: 4
            }
          ],
          data: previewList
        }
      ],
      primary_action_label: __("Apply Selected"),
      primary_action() {
        const selected = this.fields_dict.dependencies_rows.grid.get_selected_children();
        if (!selected.length) {
          frappe.msgprint(__("You must select changes"));
          return;
        }
        const changes = selected.map((p) => ({
          task: p.task,
          proposed_start: p.proposed_start,
          proposed_end: p.proposed_end
        }));
        const apply = async (mode) => {
          var _a;
          try {
            const message = await applyPropagation({ changes, mode });
            if (mode === "async") {
              frappe.show_alert(
                __("Propagation enqueued \u2014 refresh tree after job finishes")
              );
              d.hide();
              return;
            }
            if (message == null ? void 0 : message.success) {
              frappe.show_alert(
                __("Changes applied: {0}", [message.changed])
              );
              d.hide();
              if ((refreshCtx == null ? void 0 : refreshCtx.getArgs) && (refreshCtx == null ? void 0 : refreshCtx.table)) {
                refreshConflicts(
                  refreshCtx.getArgs,
                  refreshCtx.table
                ).catch(console.error);
              }
              (_a = getOnTreeMutate()) == null ? void 0 : _a();
            } else {
              frappe.msgprint(__("Error applying changes"));
            }
          } catch (e) {
            frappe.msgprint(e.message || __("Error applying changes"));
          }
        };
        if (changes.length > LARGE_AMOUNT_THRESHOLD) {
          frappe.confirm(
            __(
              "This operation affects {0} tasks and may take a long time. Run in background?",
              [changes.length]
            ),
            () => apply("async")
          );
        } else {
          void apply("sync");
        }
      },
      secondary_action_label: __("Close"),
      secondary_action() {
        d.hide();
      }
    });
    d.show();
  }
  async function previewPropagation2(taskId, direction = "downstream", refreshCtx = null) {
    if (!taskId) {
      frappe.show_alert({
        message: __("Select a task"),
        indicator: "orange"
      });
      return;
    }
    const message = await previewPropagation({
      changed_task: taskId,
      direction
    });
    if (!message) {
      return;
    }
    showPreviewDialog(message.preview || [], refreshCtx);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/actions.js
  function projectFromPage() {
    var _a, _b, _c;
    const page = getColumnsPage();
    return ((_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b)) || null;
  }
  function mutateTree() {
    var _a;
    (_a = getOnTreeMutate()) == null ? void 0 : _a();
  }
  function openTaskForm(taskId) {
    if (!taskId)
      return;
    frappe.set_route("Form", "Task", taskId);
  }
  function renameTask(taskId) {
    if (!taskId)
      return;
    frappe.model.rename_doc("Task", taskId, () => mutateTree());
  }
  function deleteTask(taskId) {
    if (!taskId)
      return;
    frappe.model.delete_doc("Task", taskId, () => mutateTree());
  }
  async function addChildTask(row) {
    const parentId = row == null ? void 0 : row.id;
    const project = projectFromPage();
    if (!parentId || !project) {
      frappe.show_alert({ message: __("Select a project"), indicator: "orange" });
      return;
    }
    if (!frappe.model.can_create("Task") || !row.can_write)
      frappe.throw(__("Not permitted"));
    if (!row.hasChildren) {
      try {
        await frappe.db.set_value("Task", parentId, "is_group", 1);
        row.hasChildren = true;
      } catch (e) {
        console.error("[task_tree_gantt] set is_group", e);
      }
    }
    const d = new frappe.ui.Dialog({
      title: __("New {0}", [__("Task")]),
      fields: [
        {
          fieldname: "subject",
          fieldtype: "Data",
          label: __("Subject"),
          reqd: 1
        },
        {
          fieldname: "is_group",
          fieldtype: "Check",
          label: __("Is Group"),
          description: __(
            "Further sub-groups can only be created under records marked as 'Group'"
          )
        }
      ],
      primary_action_label: __("Create New"),
      primary_action(values) {
        if (!(values == null ? void 0 : values.subject)) {
          return;
        }
        d.hide();
        frappe.dom.freeze(__("Creating {0}", [__("Task")]));
        frappe.call({
          method: "erpnext.projects.doctype.task.task.add_node",
          args: {
            doctype: "Task",
            subject: values.subject,
            is_group: values.is_group ? 1 : 0,
            parent: parentId,
            parent_task: parentId,
            project,
            is_root: false
          },
          callback(r) {
            if (!r.exc) {
              mutateTree();
            }
          },
          always() {
            frappe.dom.unfreeze();
          }
        });
      }
    });
    d.set_value("is_group", 0);
    d.show();
  }
  function addMultipleTasks(row) {
    const parentId = row == null ? void 0 : row.id;
    if (!parentId)
      return;
    if (!frappe.model.can_create("Task") || !row.can_write)
      frappe.throw(__("Not permitted"));
    const data = [];
    const dialog = new frappe.ui.Dialog({
      title: __("Add Multiple Tasks"),
      fields: [
        {
          fieldname: "multiple_tasks",
          fieldtype: "Table",
          in_place_edit: true,
          data,
          get_data: () => data,
          fields: [
            {
              fieldtype: "Data",
              fieldname: "subject",
              in_list_view: 1,
              reqd: 1,
              label: __("Subject")
            }
          ]
        }
      ],
      primary_action_label: __("Create"),
      primary_action() {
        var _a;
        const rows = ((_a = dialog.get_values()) == null ? void 0 : _a.multiple_tasks) || [];
        const payload = rows.filter((r) => r.subject);
        if (!payload.length) {
          frappe.msgprint(__("Add at least one subject"));
          return;
        }
        dialog.hide();
        frappe.call({
          method: "erpnext.projects.doctype.task.task.add_multiple_tasks",
          args: {
            data: JSON.stringify(payload),
            parent: parentId
          },
          callback(r) {
            if (!r.exc) {
              frappe.show_alert(__("Tasks created"));
              mutateTree();
            }
          }
        });
      }
    });
    dialog.show();
  }
  function previewDownstream(row) {
    const taskId = row == null ? void 0 : row.id;
    if (!taskId || !row.can_write)
      return;
    if (typeof _tds_preview_tree === "function") {
      _tds_preview_tree(taskId, "downstream", (mode, changes) => {
        if (mode === "async") {
          frappe.show_alert(__("Refresh the task tree after applying changes"));
          return;
        }
        mutateTree();
      });
      return;
    }
    previewPropagation2(taskId, "downstream").then(() => {
    }).catch((e) => {
      console.error("[task_tree_gantt] previewDownstream", e);
      frappe.msgprint(e.message || String(e));
    });
  }
  function taskAllowRename() {
    var _a;
    try {
      const meta = (_a = frappe.get_meta) == null ? void 0 : _a.call(frappe, "Task");
      if (meta && meta.allow_rename === 0) {
        return false;
      }
    } catch (e) {
    }
    return true;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/edit.js
  function evaluateReadOnlyDependsOn3(expression, doc) {
    if (typeof expression === "boolean")
      return expression;
    if (!expression)
      return false;
    const expr = String(expression);
    if (expr.startsWith("eval:")) {
      try {
        return !!frappe.utils.eval(expr.slice(5), { doc });
      } catch (e) {
        return false;
      }
    }
    const value = doc == null ? void 0 : doc[expr];
    if (Array.isArray(value))
      return !!value.length;
    return !!value;
  }
  function fieldIsWritable3(doc, taskId) {
    var _a, _b;
    if ((_b = (_a = frappe.workflow) == null ? void 0 : _a.is_read_only) == null ? void 0 : _b.call(_a, "Task", taskId))
      return false;
    const df = frappe.meta.get_field("Task", "subject", taskId);
    if (!df)
      return true;
    let status = frappe.perm.get_field_display_status(df, doc, null, false);
    if (status === "Write" && df.read_only_depends_on && evaluateReadOnlyDependsOn3(df.read_only_depends_on, doc)) {
      status = "Read";
    }
    return status === "Write";
  }
  async function startSubjectInlineEdit({ mainEl, textEl, row, params }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
    if (!fieldCanEdit(row, "subject"))
      return;
    if (mainEl.querySelector(".tree-gantt-subject-edit"))
      return;
    const taskId = row.id;
    let doc;
    try {
      doc = await frappe.model.with_doc("Task", taskId);
    } catch (e) {
      console.error("[task_tree_gantt] subject with_doc", e);
      return;
    }
    if (!fieldIsWritable3(doc, taskId))
      return;
    const oldValue = row.subject || "";
    textEl.style.display = "none";
    const host = document.createElement("span");
    host.className = "tree-gantt-subject-edit";
    mainEl.appendChild(host);
    let finished = false;
    const finish = async (commit) => {
      var _a2, _b2, _c2, _d2;
      if (finished)
        return;
      finished = true;
      const control2 = host._control;
      const raw = control2 ? control2.get_value() : oldValue;
      const next = String(raw != null ? raw : "").trim();
      if (commit) {
        if (!next) {
          frappe.show_alert({
            message: __("Subject is required"),
            indicator: "orange"
          });
        } else if (next !== oldValue) {
          const ok = await saveCells2([
            { id: taskId, field: "subject", value: next }
          ]);
          if (ok) {
            row.subject = next;
            if ((_a2 = params.node) == null ? void 0 : _a2.data) {
              params.node.data.subject = next;
            }
            (_b2 = getOnGanttRefresh()) == null ? void 0 : _b2();
          }
        }
      }
      host._control = null;
      (_d2 = (_c2 = params.api) == null ? void 0 : _c2.refreshCells) == null ? void 0 : _d2.call(_c2, {
        rowNodes: params.node ? [params.node] : void 0,
        columns: ["subject"],
        force: true
      });
    };
    const control = frappe.ui.form.make_control({
      parent: $(host),
      doctype: "Task",
      docname: taskId,
      only_input: true,
      df: {
        fieldname: "subject",
        fieldtype: "Data",
        label: "",
        reqd: 1
      },
      value: oldValue,
      render_input: true
    });
    host._control = control;
    (_b = (_a = control.$wrapper) == null ? void 0 : _a.addClass) == null ? void 0 : _b.call(_a, "tree-gantt-subject-control");
    (_f = (_e = (_d = (_c = control.$wrapper) == null ? void 0 : _c.find) == null ? void 0 : _d.call(_c, ".control-label, .help-box, .clearfix")) == null ? void 0 : _e.hide) == null ? void 0 : _f.call(_e);
    (_h = (_g = control.$input) == null ? void 0 : _g.attr) == null ? void 0 : _h.call(_g, "autocomplete", "off");
    (_j = (_i = control.$input) == null ? void 0 : _i.trigger) == null ? void 0 : _j.call(_i, "focus");
    (_l = (_k = control.$input) == null ? void 0 : _k.trigger) == null ? void 0 : _l.call(_k, "select");
    (_n = (_m = control.$input) == null ? void 0 : _m.on) == null ? void 0 : _n.call(_m, "keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        void finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        void finish(false);
      }
    });
    (_p = (_o = control.$input) == null ? void 0 : _o.on) == null ? void 0 : _p.call(_o, "blur", () => {
      setTimeout(() => void finish(true), 120);
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/toolbar.js
  function el2(tag, className) {
    const node = document.createElement(tag);
    if (className)
      node.className = className;
    return node;
  }
  function makeBtn({ iconClass, title, onClick }) {
    const btn = el2("button", `btn btn-default btn-xs tree-toolbar-button ${iconClass}`);
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    btn.addEventListener("mousedown", (ev) => {
      ev.stopPropagation();
    });
    return btn;
  }
  function buildSubjectToolbar(row) {
    if (!(row == null ? void 0 : row.id))
      return null;
    const canRead = frappe.model.can_read("Task");
    const canWrite = !!row.can_write;
    const canCreate = frappe.model.can_create("Task");
    const canDelete = frappe.model.can_delete("Task") && frappe.perm.has_perm("Task", 0, "delete", row.id);
    const bar = el2("span", "tree-gantt-subject-toolbar tree-node-toolbar btn-group");
    if (canRead) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-pencil-square-o",
          title: canWrite ? __("Edit") : __("Details"),
          onClick: () => openTaskForm(row.id)
        })
      );
    }
    if (canCreate && canWrite) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-plus-square-o",
          title: __("Add Child"),
          onClick: () => void addChildTask(row)
        })
      );
    }
    if (canWrite && taskAllowRename()) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-font",
          title: __("Rename"),
          onClick: () => renameTask(row.id)
        })
      );
    }
    if (canDelete) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-trash-o",
          title: __("Delete"),
          onClick: () => deleteTask(row.id)
        })
      );
    }
    if (canCreate && canWrite) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-tasks",
          title: __("Add Multiple"),
          onClick: () => addMultipleTasks(row)
        })
      );
    }
    if (canWrite) {
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-level-down",
          title: __("Fix Dependencies"),
          onClick: () => previewDownstream(row)
        })
      );
    }
    return bar.childNodes.length ? bar : null;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/index.js
  var MILESTONE_SRC = "/files/rhombus.png";
  var CLICK_EDIT_DELAY_MS = 280;
  function subjectTitle(row) {
    if (row == null ? void 0 : row.dep_conflict) {
      return row.dep_conflict_start || row.dep_conflict_end || __("Dependency conflict");
    }
    return (row == null ? void 0 : row.id) || "";
  }
  function wireSubjectTextInteractions(text, main, row, params) {
    let clickTimer = null;
    text.addEventListener("click", (ev) => {
      var _a, _b;
      if ((_b = (_a = ev.target).closest) == null ? void 0 : _b.call(_a, ".tree-gantt-subject-toolbar")) {
        return;
      }
      ev.stopPropagation();
      if (!row.can_write) {
        return;
      }
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        void startSubjectInlineEdit({
          mainEl: main,
          textEl: text,
          row,
          params
        });
      }, CLICK_EDIT_DELAY_MS);
    });
    text.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      clearTimeout(clickTimer);
      clickTimer = null;
      openTaskForm(row.id);
    });
  }
  function renderSubject(params) {
    const row = params.data || {};
    const wrap = el("span", "tree-gantt-subject");
    wrap.title = subjectTitle(row);
    if (row.dep_conflict) {
      wrap.classList.add("tree-gantt-dep-conflict");
    }
    if (row.can_write) {
      wrap.classList.add("tree-gantt-subject--editable");
    }
    if (row.color) {
      wrap.style.boxShadow = `inset 3px 0 0 ${row.color}`;
      wrap.classList.add("tree-gantt-subject--colored");
    }
    const main = el("span", "tree-gantt-subject-main");
    if (row.is_milestone) {
      const mark = el("img", "tree-gantt-milestone");
      mark.src = MILESTONE_SRC;
      mark.alt = __("Milestone");
      mark.width = 14;
      mark.height = 14;
      main.appendChild(mark);
    }
    const text = el(
      "span",
      "tree-gantt-subject-text",
      row.subject || params.value || ""
    );
    wireSubjectTextInteractions(text, main, row, params);
    main.appendChild(text);
    wrap.appendChild(main);
    const toolbar = buildSubjectToolbar(row);
    if (toolbar) {
      wrap.appendChild(toolbar);
    }
    return wrap;
  }
  function subjectTooltip(params) {
    return subjectTitle(params.data);
  }
  function subjectColumn() {
    return {
      field: "subject",
      headerName: __("Task"),
      pinned: "left",
      suppressMovable: true,
      lockPinned: true,
      resizable: true,
      flex: 1,
      minWidth: 280,
      maxWidth: 600,
      width: 360,
      tree: true,
      render: renderSubject,
      cellClass: subjectConflictClass,
      tooltipValueGetter: subjectTooltip,
      edit: false,
      sortable: false
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/tags.js
  var TAG_LIMIT = 2;
  async function togglePageTag(page, tag) {
    var _a;
    const field = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.tag;
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
  function renderTags(params) {
    var _a;
    const tags = parseTags(params.value, TAG_LIMIT);
    if (!tags.length) {
      return el("span", "text-muted", "");
    }
    const wrap = el("div", "tree-gantt-tags");
    for (const tag of tags) {
      const pill = el("span", "tree-gantt-tag-pill ellipsis", tag);
      pill.title = tag;
      try {
        const palette = (_a = frappe.get_palette) == null ? void 0 : _a.call(frappe, tag);
        if (palette) {
          pill.style.backgroundColor = `var(${palette[0]})`;
          pill.style.color = `var(${palette[1]})`;
        }
      } catch (e) {
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
  function tagsColumn() {
    return __spreadProps(__spreadValues({
      field: "user_tags",
      headerName: __("Labels")
    }, fixedCol(TREE_COL_WIDTH.user_tags)), {
      sortable: false,
      edit: false,
      cellRenderer: renderTags,
      cellClass: "dinext-table-cell--align-center"
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/type.js
  function typeColumn() {
    return __spreadProps(__spreadValues({
      field: "type",
      headerName: __("Type")
    }, fixedCol(TREE_COL_WIDTH.type)), {
      sortable: false,
      edit: false,
      cellClass: "dinext-table-cell--align-center"
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/index.js
  function getColumns() {
    return [
      subjectColumn(),
      assignColumn(),
      planFactColumn(),
      statusColumn(),
      priorityColumn(),
      expStartColumn(),
      expEndColumn(),
      durationColumn(),
      progressColumn(),
      includeColumn(),
      typeColumn(),
      tagsColumn()
    ];
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/rows.js
  function toTableRow(row) {
    var _a, _b, _c;
    return {
      id: row.id,
      subject: row.subject || "",
      assign: Array.isArray(row.assign) ? row.assign : [],
      assign_pwa: Array.isArray(row.assign_pwa) ? row.assign_pwa : [],
      assign_todo_only: Array.isArray(row.assign_todo_only) ? row.assign_todo_only : [],
      status: row.status || "",
      priority: row.priority || "",
      exp_start_date: row.exp_start_date || null,
      exp_end_date: row.exp_end_date || null,
      expected_time: (_a = row.expected_time) != null ? _a : null,
      duration: (_b = row.duration) != null ? _b : null,
      progress: (_c = row.progress) != null ? _c : 0,
      custom_include: !!row.custom_include,
      type: row.task_type_label || row.task_type || "",
      user_tags: row.user_tags || "",
      is_milestone: row.is_milestone ? 1 : 0,
      color: row.color || null,
      relations: Array.isArray(row.relations) ? row.relations : [],
      parent_task: row.parent_task || null,
      can_write: row.can_write ? 1 : 0,
      confirm: row.confirm ? 1 : 0,
      owner: row.owner || null,
      hasChildren: !!row.has_children
    };
  }
  function toTableRows(rows) {
    return (rows || []).map(toTableRow);
  }
  function nestRows(flat) {
    const byId = {};
    for (const row of flat || []) {
      byId[row.id] = __spreadProps(__spreadValues({}, row), { children: [] });
    }
    const roots = [];
    for (const row of flat || []) {
      const node = byId[row.id];
      const parentId = row.parent_task;
      if (parentId && byId[parentId]) {
        byId[parentId].children.push(node);
        byId[parentId].hasChildren = true;
      } else {
        roots.push(node);
      }
    }
    for (const node of Object.values(byId)) {
      if (!node.children.length) {
        delete node.children;
      } else {
        node.hasChildren = true;
      }
    }
    return roots;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/sort.js
  var PRIORITY_RANK = Object.freeze({
    Low: 1,
    Medium: 2,
    High: 3,
    Urgent: 4
  });
  function priorityRank(value) {
    if (value == null || value === "")
      return null;
    const key = String(value);
    if (Object.prototype.hasOwnProperty.call(PRIORITY_RANK, key))
      return PRIORITY_RANK[key];
    return null;
  }
  function comparePriority(a, b) {
    const ra = priorityRank(a);
    const rb = priorityRank(b);
    if (ra == null && rb == null) {
      return String(a != null ? a : "").localeCompare(String(b != null ? b : ""), void 0, {
        sensitivity: "base"
      });
    }
    if (ra == null)
      return 1;
    if (rb == null)
      return -1;
    return ra - rb;
  }
  var SORT_COMPARATORS = {
    priority: comparePriority
  };

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/dnd/persist.js
  function taskNameFromRowId(rowId) {
    if (rowId == null || rowId === "") {
      return null;
    }
    return String(rowId).split(":").pop() || null;
  }
  async function ensureParentIsGroup(parentName) {
    if (!parentName) {
      return;
    }
    const isGroup = await frappe.db.get_value("Task", parentName, "is_group");
    if (cint(isGroup)) {
      return;
    }
    await frappe.db.set_value("Task", parentName, "is_group", 1);
  }
  function fail(message) {
    throw new Error(message);
  }
  async function persistTaskRowReorder({ move }) {
    if (!move) {
      fail(__("Task reorder: missing move payload"));
    }
    const {
      fromParentRowId,
      toParentRowId,
      rowId,
      blockSize = 1
    } = move;
    if (cint(blockSize) > 1) {
      fail(__("Moving multiple tasks at once is not supported"));
    }
    if (fromParentRowId === toParentRowId) {
      fail(
        __(
          "Sibling order is not saved for Task tree (no order field; reload sorts by dates)"
        )
      );
    }
    const taskName = taskNameFromRowId(rowId);
    if (!taskName) {
      fail(__("Task reorder: invalid task id"));
    }
    if (!frappe.model.can_write("Task")) {
      fail(__("Not permitted"));
    }
    const newParent = taskNameFromRowId(toParentRowId);
    if (newParent === taskName) {
      fail(__("Task cannot be its own parent"));
    }
    frappe.dom.freeze(__("Updating {0}", [__("Task")]));
    try {
      if (newParent) {
        await ensureParentIsGroup(newParent);
      }
      await frappe.db.set_value(
        "Task",
        taskName,
        "parent_task",
        newParent || ""
      );
    } finally {
      frappe.dom.unfreeze();
    }
    return true;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/dnd/index.js
  function createOnRowReorder() {
    return async (ctx) => {
      var _a;
      try {
        await persistTaskRowReorder(ctx);
        (_a = getOnTreeMutate()) == null ? void 0 : _a();
        return true;
      } catch (err) {
        const msg = (err == null ? void 0 : err.message) || (err == null ? void 0 : err.exc) || (typeof err === "string" ? err : null) || __("Could not move task");
        frappe.show_alert({ message: msg, indicator: "red" });
        console.error("[task_tree_gantt] row reorder persist", err);
        return false;
      }
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/index.js
  var ensureBundle = () => frappe.require(["dinext-table.bundle.js"]);
  function getState(container) {
    var _a;
    return (_a = container._treeGanttTable) != null ? _a : container._treeGanttTable = {};
  }
  function showPlaceholder(container, text) {
    container.classList.add("text-muted");
    container.textContent = text;
  }
  function showError(container, err) {
    container.classList.add("text-muted");
    container.textContent = (err == null ? void 0 : err.message) || String(err);
  }
  function destroyState(state) {
    var _a;
    if ((_a = state == null ? void 0 : state.table) == null ? void 0 : _a.destroy) {
      state.table.destroy();
    }
    state.table = null;
  }
  function readArgs(getArgs) {
    return typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
  }
  function childrenQuery(getArgs, parent_task = null, extra = {}) {
    const args = readArgs(getArgs);
    return __spreadValues({
      project: args.project || null,
      parent_task,
      status: args.status || null,
      priority: args.priority || null,
      assign: args.assign || null,
      tag: args.tag || null,
      limit: args.limit || null
    }, extra);
  }
  async function fetchRootRows(getArgs) {
    const args = readArgs(getArgs);
    if (!args.project) {
      return [];
    }
    return toTableRows(
      await getChildren(childrenQuery(getArgs, args.task || null))
    );
  }
  function sideDataCtx(getArgs, table) {
    const args = readArgs(getArgs);
    return { project: args.project || null, table };
  }
  function scheduleSideDataRefresh(getArgs, table, rows) {
    const ctx = sideDataCtx(getArgs, table);
    if (!ctx.project || !ctx.table) {
      return;
    }
    refreshPlanFact(ctx, rows).catch((e) => {
      console.error("[task_tree_gantt] plan_fact refresh", e);
    });
    refreshConflicts(getArgs, table, rows).catch((e) => {
      console.error("[task_tree_gantt] deps conflict refresh", e);
    });
  }
  function createExpandHandler(getArgs, onTreeChange) {
    return async ({ rowId, table }) => {
      const children = toTableRows(
        await getChildren(childrenQuery(getArgs, rowId))
      );
      table.setRowChildren(rowId, children);
      onTreeChange == null ? void 0 : onTreeChange();
      scheduleSideDataRefresh(getArgs, table, children);
    };
  }
  function resolveFullscreenOpts(container, shell) {
    var _a, _b;
    const fsShell = shell || ((_a = container == null ? void 0 : container.closest) == null ? void 0 : _a.call(container, ".layout-main-section")) || ((_b = container == null ? void 0 : container.closest) == null ? void 0 : _b.call(container, ".task-tree-gantt-shell"));
    if (!fsShell) {
      return void 0;
    }
    return {
      target: "shell",
      shell: fsShell,
      onEnter: ({ element }) => {
        element == null ? void 0 : element.classList.add("task-tree-gantt--fullscreen");
      },
      onExit: ({ element }) => {
        element == null ? void 0 : element.classList.remove("task-tree-gantt--fullscreen");
      }
    };
  }
  async function loadTable(container, getArgs, hooks = {}) {
    var _a, _b;
    if (!container) {
      throw new Error("loadTable: container required");
    }
    await ensureBundle();
    const state = getState(container);
    const gen = state.loadGen = (state.loadGen || 0) + 1;
    const args = readArgs(getArgs);
    const { onTreeChange, onCellsSaved, onSortChange, fullscreenShell } = hooks;
    const fullscreen = resolveFullscreenOpts(container, fullscreenShell);
    container.classList.remove("text-muted");
    if (!args.project) {
      destroyState(state);
      delete container._treeGanttTable;
      showPlaceholder(container, __("Select a project"));
      return null;
    }
    if (!state.table) {
      showPlaceholder(container, __("Loading..."));
    }
    try {
      const rows = await fetchRootRows(getArgs);
      if (gen !== state.loadGen) {
        return null;
      }
      state.rows = rows;
      if (state.table) {
        (_b = (_a = state.table).refresh) == null ? void 0 : _b.call(_a, rows);
        onTreeChange == null ? void 0 : onTreeChange();
        scheduleSideDataRefresh(getArgs, state.table);
        return state.table;
      }
      container.replaceChildren();
      const projectKey = args.project || "no-project";
      const taskKey = args.task ? `:${args.task}` : "";
      state.table = await DinextTable.create(__spreadProps(__spreadValues({
        container,
        data: rows,
        columns: getColumns(),
        edit: true,
        selection: { enabled: true },
        clipboard: { enabled: true },
        fillHandle: { enabled: true },
        rowCheck: { enabled: true },
        toolbar: {
          persistKey: `task-tree-gantt:${projectKey}${taskKey}`,
          items: [bulkAssignToolbarItem()]
        },
        rowReorder: {
          enabled: true,
          allowTree: "reparent"
        },
        onRowReorder: createOnRowReorder(),
        sort: {
          enabled: true,
          multi: false,
          nulls: "last",
          comparators: SORT_COMPARATORS
        },
        onSortChange: (payload) => {
          onSortChange == null ? void 0 : onSortChange(payload);
        },
        theme: {
          cellHorizontalPadding: 4,
          spacing: 4,
          columnBorder: false,
          headerColumnBorder: false,
          pinnedColumnBorder: false,
          rowBorder: {
            style: "dashed",
            width: 1,
            color: "gray"
          }
        },
        defaultColDef: {
          resizable: false
        },
        gridOptions: {
          rowHeight: ROW_HEIGHT,
          headerHeight: HEADER_HEIGHT,
          tooltipShowDelay: 0
        }
      }, fullscreen ? { fullscreen } : {}), {
        onExpandRow: createExpandHandler(getArgs, onTreeChange),
        onValidateCells,
        onSaveCells: async (ctx) => {
          const ok = await onSaveCells(ctx);
          if (ok) {
            if (changesAffectGantt(ctx.changes)) {
              onCellsSaved == null ? void 0 : onCellsSaved(ctx.changes);
            }
            if (dateFieldsAffectConflicts(ctx.changes)) {
              scheduleSideDataRefresh(getArgs, state.table);
            }
          }
          return ok;
        }
      }));
      if (gen !== state.loadGen) {
        destroyState(state);
        return null;
      }
      onTreeChange == null ? void 0 : onTreeChange();
      scheduleSideDataRefresh(getArgs, state.table, rows);
      return state.table;
    } catch (err) {
      if (gen !== state.loadGen)
        return null;
      destroyState(state);
      delete container._treeGanttTable;
      showError(container, err);
      console.error("[task_tree_gantt] loadTable failed", err);
      return null;
    }
  }
  async function expandAllRows(table, getArgs, container, expandUi) {
    var _a, _b;
    const args = readArgs(getArgs);
    if (!args.project || !table)
      return;
    const hostState = container == null ? void 0 : container._treeGanttTable;
    const gen = hostState == null ? void 0 : hostState.loadGen;
    frappe.dom.freeze(__("Loading\u2026"));
    try {
      const flat = toTableRows(
        await getChildren(
          childrenQuery(getArgs, null, {
            all_tasks: 1,
            limit: null
          })
        )
      );
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return;
      }
      const nested = nestRows(flat);
      (_a = table.refresh) == null ? void 0 : _a.call(table, nested);
      const expand = typeof expandUi === "function" ? expandUi : (_b = table.expandAll) == null ? void 0 : _b.bind(table);
      if (expand) {
        await expand();
      }
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return;
      }
      scheduleSideDataRefresh(getArgs, table);
    } finally {
      frappe.dom.unfreeze();
    }
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/tasks.js
  function statusColor(status) {
    switch (status) {
      case "Pending Review":
        return "var(--bg-dark-blue)";
      case "Overdue":
        return "var(--alert-bg-danger)";
      case "Completed":
        return "var(--bg-green)";
      case "Cancelled":
        return "var(--bg-light-gray)";
      default:
        return null;
    }
  }
  function fallbackDate(row) {
    return row.exp_start_date || row.modified || row.creation || frappe.datetime.get_today();
  }
  function rowToGanttTask(row) {
    const startDay = row.exp_start_date || fallbackDate(row);
    const endDay = row.exp_end_date || startDay;
    const milestone = !!row.is_milestone;
    return {
      id: row.id,
      name: row.subject || row.id,
      start: `${startDay} 00:00:00`,
      end: `${endDay}${milestone ? " 00:00:00" : " 23:59:59"}`,
      progress: Number(row.progress) || 0,
      dependencies: (row.relations || []).map((r) => r.predecessor).filter(Boolean),
      thumbnail: milestone ? "/files/rhombus.png" : null,
      custom_class: row.priority || "",
      color: statusColor(row.status),
      color_progress: "var(--bg-green)",
      row
    };
  }
  function collectVisibleRows(table) {
    const out = [];
    const api = table == null ? void 0 : table.api;
    if (!(api == null ? void 0 : api.forEachNodeAfterFilterAndSort)) {
      return out;
    }
    api.forEachNodeAfterFilterAndSort((node) => {
      var _a;
      if ((_a = node == null ? void 0 : node.data) == null ? void 0 : _a.id) {
        out.push(node.data);
      }
    });
    return out;
  }
  function rowsToGanttTasks(rows) {
    return (rows || []).map(rowToGanttTask);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/sync.js
  var GANTT_BASE_TOP_PAD = 1.5;
  function tableViewport(tableHost) {
    var _a;
    return ((_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(tableHost, ".ag-body-viewport")) || null;
  }
  function ganttViewport(ganttEl) {
    var _a;
    return ((_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, ".gantt-container")) || ganttEl || null;
  }
  function setupScrollSync(tableHost, ganttEl) {
    const left = tableViewport(tableHost);
    const right = ganttViewport(ganttEl);
    if (!left || !right) {
      return () => {
      };
    }
    let lock = false;
    function fromLeft() {
      if (lock) {
        return;
      }
      lock = true;
      right.scrollTop = left.scrollTop;
      requestAnimationFrame(() => {
        lock = false;
      });
    }
    function fromRight() {
      if (lock) {
        return;
      }
      lock = true;
      left.scrollTop = right.scrollTop;
      requestAnimationFrame(() => {
        lock = false;
      });
    }
    left.addEventListener("scroll", fromLeft, { passive: true });
    right.addEventListener("scroll", fromRight, { passive: true });
    return function cleanup() {
      left.removeEventListener("scroll", fromLeft);
      right.removeEventListener("scroll", fromRight);
    };
  }
  function setupToolbarOffsetSync(tableHost, ganttEl) {
    var _a;
    const toolbar = (_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(tableHost, ".dinext-table-toolbar");
    if (!toolbar || !ganttEl) {
      return () => {
      };
    }
    const apply = () => {
      const h = toolbar.offsetHeight || 0;
      ganttEl.style.paddingTop = `${GANTT_BASE_TOP_PAD + h}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(toolbar);
    return function cleanup() {
      ro.disconnect();
      ganttEl.style.paddingTop = "";
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/hover.js
  var ROW_HOVER = "tree-gantt-row--hover";
  var BAR_HOVER = "tree-gantt-bar--hover";
  function clearTableHover(tableHost) {
    var _a;
    (_a = tableHost == null ? void 0 : tableHost.querySelectorAll) == null ? void 0 : _a.call(tableHost, `.ag-row.${ROW_HOVER}`).forEach((el3) => el3.classList.remove(ROW_HOVER));
  }
  function clearGanttHover(ganttEl) {
    var _a;
    (_a = ganttEl == null ? void 0 : ganttEl.querySelectorAll) == null ? void 0 : _a.call(ganttEl, `.bar-wrapper.${BAR_HOVER}`).forEach((el3) => el3.classList.remove(BAR_HOVER));
  }
  function highlightTableRow(tableHost, table, rowId, on) {
    var _a;
    if (!tableHost) {
      return;
    }
    clearTableHover(tableHost);
    if (!on || !rowId) {
      return;
    }
    const id = String(rowId);
    const rows = tableHost.querySelectorAll(
      `.ag-row[row-id="${CSS.escape(id)}"]`
    );
    if (rows.length) {
      rows.forEach((row) => row.classList.add(ROW_HOVER));
      return;
    }
    if (!((_a = table == null ? void 0 : table.api) == null ? void 0 : _a.getRowNode)) {
      return;
    }
    const node = table.api.getRowNode(id);
    const idx = node == null ? void 0 : node.rowIndex;
    if (idx == null || !table.api.getDisplayedRowAtIndex) {
      return;
    }
    const displayed = table.api.getDisplayedRowAtIndex(idx);
    if ((displayed == null ? void 0 : displayed.rowIndex) == null) {
      return;
    }
    tableHost.querySelectorAll(`.ag-row[row-index="${displayed.rowIndex}"]`).forEach((row) => row.classList.add(ROW_HOVER));
  }
  function highlightGanttBar(ganttEl, rowId, on) {
    if (!ganttEl || !rowId) {
      return;
    }
    clearGanttHover(ganttEl);
    if (!on) {
      return;
    }
    const bar = ganttEl.querySelector(
      `.bar-wrapper[data-id="${CSS.escape(String(rowId))}"]`
    );
    bar == null ? void 0 : bar.classList.add(BAR_HOVER);
  }
  function setupHoverSync(tableHost, ganttEl, table) {
    if (!tableHost || !ganttEl) {
      return () => {
      };
    }
    let lastId = null;
    let leaveTimer = null;
    function setHover(rowId) {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (lastId === rowId) {
        return;
      }
      lastId = rowId;
      if (!rowId) {
        clearTableHover(tableHost);
        clearGanttHover(ganttEl);
        return;
      }
      highlightTableRow(tableHost, table, rowId, true);
      highlightGanttBar(ganttEl, rowId, true);
    }
    function scheduleClear() {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
      }
      leaveTimer = setTimeout(() => setHover(null), 80);
    }
    function onTableOver(e) {
      var _a, _b, _c;
      const row = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".ag-row");
      const id = (_c = row == null ? void 0 : row.getAttribute) == null ? void 0 : _c.call(row, "row-id");
      if (id) {
        setHover(id);
      }
    }
    function onGanttOver(e) {
      var _a, _b, _c;
      const wrap = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".bar-wrapper[data-id]");
      const id = (_c = wrap == null ? void 0 : wrap.getAttribute) == null ? void 0 : _c.call(wrap, "data-id");
      if (id) {
        setHover(id);
      }
    }
    tableHost.addEventListener("mouseover", onTableOver, { passive: true });
    tableHost.addEventListener("mouseleave", scheduleClear, { passive: true });
    ganttEl.addEventListener("mouseover", onGanttOver, { passive: true });
    ganttEl.addEventListener("mouseleave", scheduleClear, { passive: true });
    return function cleanup() {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
      }
      tableHost.removeEventListener("mouseover", onTableOver);
      tableHost.removeEventListener("mouseleave", scheduleClear);
      ganttEl.removeEventListener("mouseover", onGanttOver);
      ganttEl.removeEventListener("mouseleave", scheduleClear);
      clearTableHover(tableHost);
      clearGanttHover(ganttEl);
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/index.js
  async function ensureAssets() {
    await frappe.require([...GANTT_ASSETS]);
    if (typeof window.Gantt !== "function") {
      throw new Error("frappe-gantt (window.Gantt) not loaded");
    }
  }
  async function loadHolidays(project) {
    var _a;
    if (!project) {
      return [];
    }
    try {
      const r = await frappe.db.get_value("Project", project, [
        "holiday_list",
        "company"
      ]);
      const values = (r == null ? void 0 : r.message) || {};
      let listName = values.holiday_list;
      if (!listName && values.company) {
        const c = await frappe.db.get_value("Company", values.company, [
          "default_holiday_list"
        ]);
        listName = (_a = c == null ? void 0 : c.message) == null ? void 0 : _a.default_holiday_list;
      }
      if (!listName) {
        return [];
      }
      const doc = await frappe.db.get_doc("Holiday List", listName);
      return ((doc == null ? void 0 : doc.holidays) || []).map((d) => ({
        date: d.holiday_date,
        name: d.description,
        weekly_off: !!d.weekly_off
      }));
    } catch (e) {
      console.warn("[task_tree_gantt] holidays", e);
      return [];
    }
  }
  function showPopup(ctx) {
    var _a;
    ctx.set_title(ctx.task.name);
    const start = moment(ctx.task.start).format("MMM D");
    const end = moment(ctx.task.end).format("MMM D");
    const progress = Math.floor((Number(ctx.task.progress) || 0) * 100) / 100;
    ctx.set_subtitle(`${start} - ${end}<br/>${__("Progress")}: ${progress}%`);
    const assign = (_a = ctx.task.row) == null ? void 0 : _a.assign;
    if (Array.isArray(assign) && assign.length) {
      try {
        const group = frappe.avatar_group(assign, 5, { filterable: false });
        const node = Array.isArray(group) ? group[0] : group;
        ctx.set_details(
          `<div class="gantt-assign-avatars">${(node == null ? void 0 : node.outerHTML) || ""}</div>`
        );
      } catch (e) {
        ctx.set_details(`<div class="gantt-assign-avatars"></div>`);
      }
    } else {
      ctx.set_details(
        `<div class="gantt-assign-avatars">${frappe.utils.icon("assign", "md")}</div>`
      );
    }
  }
  function buildOptions(holidays) {
    const weekend = holidays.filter((d) => d.weekly_off);
    const fest = holidays.filter((d) => !d.weekly_off);
    return {
      lines: "both ",
      today_button: true,
      scroll_to: "today",
      view_mode: "Day",
      view_mode_select: true,
      view_modes: [Gantt.VIEW_MODE.DAY, Gantt.VIEW_MODE.WEEK],
      infinite_padding: false,
      arrow_curve: 3,
      move_dependencies: false,
      popup_on: "click",
      popup: showPopup,
      on_double_click: (task) => {
        if (task == null ? void 0 : task.id) {
          frappe.set_route("Form", "Task", task.id);
        }
      },
      language: frappe.boot.lang,
      upper_header_height: GANTT_UPPER_HEADER,
      lower_header_height: GANTT_LOWER_HEADER,
      bar_corner_radius: 1,
      padding: GANTT_PADDING,
      bar_height: GANTT_BAR_HEIGHT,
      column_width: 25,
      holidays: {
        "var(--g-weekend-highlight-color)": weekend,
        "var(--g-holiday-highlight-color)": fest
      },
      readonly: true,
      readonly_progress: true,
      readonly_dates: true
    };
  }
  function bindSync(state) {
    if (typeof state.ganttSyncCleanup === "function") {
      state.ganttSyncCleanup();
      state.ganttSyncCleanup = null;
    }
    if (typeof state.ganttHoverCleanup === "function") {
      state.ganttHoverCleanup();
      state.ganttHoverCleanup = null;
    }
    if (typeof state.ganttToolbarSyncCleanup === "function") {
      state.ganttToolbarSyncCleanup();
      state.ganttToolbarSyncCleanup = null;
    }
    if (state.tableHost && state.ganttEl) {
      state.ganttSyncCleanup = setupScrollSync(state.tableHost, state.ganttEl);
      state.ganttHoverCleanup = setupHoverSync(
        state.tableHost,
        state.ganttEl,
        state.table
      );
      state.ganttToolbarSyncCleanup = setupToolbarOffsetSync(
        state.tableHost,
        state.ganttEl
      );
    }
  }
  function collectGanttTasks(table) {
    return rowsToGanttTasks(collectVisibleRows(table));
  }
  async function runGanttUpdate(state) {
    var _a, _b, _c, _d, _e, _f, _g;
    if (!(state == null ? void 0 : state.ganttEl)) {
      return null;
    }
    const project = (_b = (_a = state.getArgs) == null ? void 0 : _a.call(state)) == null ? void 0 : _b.project;
    if (!project || !state.table) {
      destroyGantt(state);
      return null;
    }
    await ensureAssets();
    const tasks = collectGanttTasks(state.table);
    if (!tasks.length) {
      destroyGantt(state);
      return null;
    }
    if (!state.holidays || state.holidaysProject !== project) {
      state.holidays = await loadHolidays(project);
      state.holidaysProject = project;
    }
    if (((_d = (_c = state.getArgs) == null ? void 0 : _c.call(state)) == null ? void 0 : _d.project) !== project || !state.table) {
      return null;
    }
    if (((_e = state.gantt) == null ? void 0 : _e.refresh) && ((_g = (_f = state.ganttEl).querySelector) == null ? void 0 : _g.call(_f, ".gantt"))) {
      state.gantt.refresh(tasks);
      bindSync(state);
      return state.gantt;
    }
    state.gantt = null;
    state.ganttEl.innerHTML = "";
    state.gantt = new Gantt(state.ganttEl, tasks, buildOptions(state.holidays || []));
    bindSync(state);
    return state.gantt;
  }
  async function pumpGanttUpdates(state) {
    if (state._ganttPumping) {
      return;
    }
    state._ganttPumping = true;
    try {
      while (state._ganttDirty) {
        state._ganttDirty = false;
        await runGanttUpdate(state);
      }
    } finally {
      state._ganttPumping = false;
      if (state._ganttDirty) {
        void pumpGanttUpdates(state);
      }
    }
  }
  async function ensureGantt(state) {
    if (!state) {
      return null;
    }
    state._ganttDirty = true;
    await pumpGanttUpdates(state);
    return state.gantt || null;
  }
  function destroyGantt(state) {
    if (!state) {
      return;
    }
    state._ganttDirty = false;
    if (state._ganttRaf) {
      cancelAnimationFrame(state._ganttRaf);
      state._ganttRaf = 0;
    }
    if (typeof state.ganttSyncCleanup === "function") {
      state.ganttSyncCleanup();
      state.ganttSyncCleanup = null;
    }
    if (typeof state.ganttHoverCleanup === "function") {
      state.ganttHoverCleanup();
      state.ganttHoverCleanup = null;
    }
    if (typeof state.ganttToolbarSyncCleanup === "function") {
      state.ganttToolbarSyncCleanup();
      state.ganttToolbarSyncCleanup = null;
    }
    state.gantt = null;
    state.holidays = null;
    state.holidaysProject = null;
    state._ganttPumping = false;
    if (state.ganttEl) {
      state.ganttEl.innerHTML = "";
    }
  }
  function scheduleGanttRefresh(state) {
    if (!state) {
      return;
    }
    state._ganttDirty = true;
    if (state._ganttPumping) {
      return;
    }
    if (state._ganttRaf) {
      return;
    }
    state._ganttRaf = requestAnimationFrame(() => {
      state._ganttRaf = 0;
      Promise.resolve(pumpGanttUpdates(state)).catch(
        (e) => console.error("[task_tree_gantt] gantt refresh", e)
      );
    });
  }
  function wireTreeGanttHooks(table, state) {
    var _a, _b, _c;
    if (!table || table._treeGanttHooks) {
      return;
    }
    table._treeGanttHooks = true;
    const expandAll = (_a = table.expandAll) == null ? void 0 : _a.bind(table);
    if (expandAll) {
      table.expandAll = () => expandAllRows(table, state.getArgs, state.tableHost, expandAll).then(() => scheduleGanttRefresh(state)).catch((e) => {
        console.error(e);
        frappe.msgprint(e.message || String(e));
      });
    }
    const collapse = (_b = table.collapseRow) == null ? void 0 : _b.bind(table);
    if (collapse) {
      table.collapseRow = (rowId) => {
        collapse(rowId);
        scheduleGanttRefresh(state);
      };
    }
    const collapseAll = (_c = table.collapseAll) == null ? void 0 : _c.bind(table);
    if (collapseAll) {
      table.collapseAll = () => {
        collapseAll();
        scheduleGanttRefresh(state);
      };
    }
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/shell/layout.js
  function applyWidths(left, right, leftPct) {
    left.style.width = `${leftPct}%`;
    right.style.width = `${100 - leftPct}%`;
  }
  function readStoredLeftPct() {
    const raw = localStorage.getItem(LAYOUT_WIDTH_KEY);
    if (!raw) {
      return DEFAULT_LEFT_PCT;
    }
    const leftPct = parseFloat(raw);
    if (Number.isNaN(leftPct)) {
      return DEFAULT_LEFT_PCT;
    }
    const rightPct = 100 - leftPct;
    if (leftPct < MIN_LEFT_PCT || rightPct < MIN_RIGHT_PCT) {
      return DEFAULT_LEFT_PCT;
    }
    return leftPct;
  }
  function buildShell(parent) {
    const shell = document.createElement("div");
    shell.className = "task-tree-gantt-shell";
    shell.dataset.role = "shell";
    const left = document.createElement("div");
    left.className = "task-tree-gantt-panel task-tree-gantt-panel--left";
    const tableHost = document.createElement("div");
    tableHost.className = "task-tree-gantt-table-host";
    tableHost.dataset.role = "table";
    left.appendChild(tableHost);
    const border = document.createElement("div");
    border.className = "task-tree-gantt-resize";
    border.setAttribute("role", "separator");
    border.setAttribute("aria-orientation", "vertical");
    const right = document.createElement("div");
    right.className = "task-tree-gantt-panel task-tree-gantt-panel--right";
    const gantt = document.createElement("div");
    gantt.id = "task-gantt";
    gantt.className = "task-tree-gantt-chart";
    gantt.dataset.role = "gantt";
    right.appendChild(gantt);
    shell.append(left, border, right);
    parent.appendChild(shell);
    applyWidths(left, right, readStoredLeftPct());
    return { shell, left, border, right, tableHost, gantt };
  }
  function setupResize({ shell, left, right, border }) {
    let dragging = false;
    const onMouseDown = (e) => {
      e.preventDefault();
      dragging = true;
      document.body.classList.add("task-tree-gantt-resizing");
    };
    const onMouseUp = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      document.body.classList.remove("task-tree-gantt-resizing");
    };
    const onMouseMove = (e) => {
      if (!dragging) {
        return;
      }
      const rect = shell.getBoundingClientRect();
      const leftPct = (e.clientX - rect.left) / rect.width * 100;
      const rightPct = 100 - leftPct;
      if (leftPct < MIN_LEFT_PCT || rightPct < MIN_RIGHT_PCT) {
        return;
      }
      applyWidths(left, right, leftPct);
      localStorage.setItem(LAYOUT_WIDTH_KEY, String(leftPct));
    };
    border.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      dragging = false;
      document.body.classList.remove("task-tree-gantt-resizing");
      border.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/mount.js
  async function mount({ page }) {
    var _a, _b;
    page.set_title(DEFAULT_TITLE);
    (_b = (_a = page.wrapper) == null ? void 0 : _a.addClass) == null ? void 0 : _b.call(_a, "task-tree-gantt-page");
    const state = {
      getArgs: null,
      tableHost: null,
      ganttEl: null,
      table: null,
      gantt: null,
      fullscreenShell: null
    };
    const reload = async () => {
      state.table = await loadTable(state.tableHost, state.getArgs, {
        onTreeChange: () => scheduleGanttRefresh(state),
        onCellsSaved: () => scheduleGanttRefresh(state),
        onSortChange: () => scheduleGanttRefresh(state),
        fullscreenShell: state.fullscreenShell
      });
      if (state.table) {
        wireTreeGanttHooks(state.table, state);
        await ensureGantt(state);
      } else {
        destroyGantt(state);
      }
    };
    state.getArgs = await setupFilters({
      page,
      onChange: () => {
        if (state.tableHost) {
          void reload();
        }
      }
    });
    const refreshGantt = () => scheduleGanttRefresh(state);
    setColumnContext({
      page,
      onAssignSaved: refreshGantt,
      onGanttRefresh: refreshGantt,
      onTreeMutate: () => {
        void reload();
      }
    });
    const main = page.main.get(0);
    state.fullscreenShell = main;
    const zones = buildShell(main);
    state.tableHost = zones.tableHost;
    state.ganttEl = zones.gantt;
    const disposeResize = setupResize(zones);
    await reload();
    return __spreadProps(__spreadValues({}, zones), { state, disposeResize });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/index.js
  frappe.provide("dinext_project_tasks_gantt.treeGantt");
  dinext_project_tasks_gantt.treeGantt = {
    mount
  };
})();
//# sourceMappingURL=task_tree_gantt.bundle.PSAOI5R7.js.map
