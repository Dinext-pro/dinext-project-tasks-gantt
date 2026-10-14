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
  var ROW_HEIGHT = 28;
  var GANTT_BAR_HEIGHT = 19;
  var GANTT_PADDING = 9;
  var GANTT_UPPER_HEADER = 40;
  var GANTT_LOWER_HEADER = 26;
  var GANTT_HEADER_CHROME = 10;
  var GANTT_HEADER_HEIGHT = GANTT_UPPER_HEADER + GANTT_LOWER_HEADER + GANTT_HEADER_CHROME;
  var HEADER_HEIGHT = 42;
  var GANTT_ASSETS = [
    "/assets/dinext_common/js/frappe-gantt.umd.js",
    "/assets/dinext_common/css/frappe-gantt.css"
  ];

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/filters/defaults.js
  function filterDefaults() {
    return {
      project: localStorage.getItem(projectStorageKey()) || "",
      task: [],
      status: [],
      priority: [],
      assign: [],
      tag: [],
      limit: null
    };
  }
  function taskMultiSelectOptions(fieldname) {
    const field = frappe.meta.get_docfield("Task", fieldname);
    return String((field == null ? void 0 : field.options) || "").split("\n").map((s) => s.trim()).filter(Boolean).map((value) => ({
      value,
      label: __(value),
      description: ""
    }));
  }
  function normalizeMulti(raw) {
    if (raw == null || raw === "") {
      return [];
    }
    if (Array.isArray(raw)) {
      return [...new Set(raw.map((x) => String(x).trim()).filter(Boolean))];
    }
    if (typeof raw === "string") {
      const t = raw.trim();
      if (!t || t === "[]" || t === "null" || t === "None") {
        return [];
      }
      if (t.startsWith("[")) {
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) {
            return normalizeMulti(parsed);
          }
        } catch (e) {
        }
      }
      return [t];
    }
    return [];
  }
  function multiPayload(raw) {
    const list = normalizeMulti(raw);
    return list.length ? list : null;
  }
  function hasMulti(raw) {
    return normalizeMulti(raw).length > 0;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/field_rules.js
  var RANK = { None: 0, Read: 1, Write: 2 };
  function createRegistry({ target, warn } = {}) {
    const byDoctype = {};
    const failed = /* @__PURE__ */ new Set();
    const report = typeof warn === "function" ? warn : (...args) => typeof console !== "undefined" ? console.error(...args) : null;
    function fieldMap(doctype) {
      return byDoctype[doctype] || (byDoctype[doctype] = {});
    }
    function mergeStatus(current, next) {
      if (!(next in RANK)) {
        return current;
      }
      if (current == null || RANK[next] < RANK[current]) {
        return next;
      }
      return current;
    }
    function mergeOptions(current, next) {
      if (!Array.isArray(next)) {
        return current;
      }
      const list = next.map(String);
      if (current == null) {
        return list;
      }
      return current.filter((option) => list.includes(option));
    }
    const registry = target && typeof target === "object" ? target : {};
    if (!Array.isArray(registry._pending)) {
      registry._pending = [];
    }
    Object.assign(registry, {
      register(doctype, rules) {
        if (!doctype || !rules || typeof rules !== "object") {
          return;
        }
        const map = fieldMap(doctype);
        for (const [fieldname, rule] of Object.entries(rules)) {
          if (typeof rule !== "function") {
            continue;
          }
          (map[fieldname] = map[fieldname] || []).push(rule);
        }
      },
      flushPending() {
        const pending = Array.isArray(registry._pending) ? registry._pending.splice(0) : [];
        for (const entry of pending) {
          if (Array.isArray(entry)) {
            registry.register(entry[0], entry[1]);
          }
        }
      },
      getFields(doctype) {
        return Object.keys(byDoctype[doctype] || {});
      },
      evaluate(doctype, fieldname, doc, ctx) {
        var _a;
        const rules = (_a = byDoctype[doctype]) == null ? void 0 : _a[fieldname];
        if (!rules || !rules.length) {
          return null;
        }
        let status = null;
        let options = null;
        let any = false;
        rules.forEach((rule, index) => {
          let out = null;
          try {
            out = rule(doc || {}, ctx || {});
          } catch (error) {
            const key = `${doctype}:${fieldname}:${index}`;
            if (!failed.has(key)) {
              failed.add(key);
              report(`[dinext.fieldRules] rule failed for ${doctype}.${fieldname}`, error);
            }
            return;
          }
          if (!out || typeof out !== "object") {
            return;
          }
          any = true;
          status = mergeStatus(status, out.status);
          options = mergeOptions(options, out.options);
        });
        if (!any) {
          return null;
        }
        const result = {};
        if (status != null) {
          result.status = status;
        }
        if (options != null) {
          result.options = options;
        }
        return result;
      },
      _reset() {
        for (const key of Object.keys(byDoctype)) {
          delete byDoctype[key];
        }
        failed.clear();
      }
    });
    return registry;
  }
  function installFieldRules(root) {
    const host = root || (typeof globalThis !== "undefined" ? globalThis : window);
    host.dinext = host.dinext || {};
    const existing = host.dinext.fieldRules;
    const registry = existing && typeof existing.register === "function" ? existing : createRegistry({ target: existing });
    host.dinext.fieldRules = registry;
    registry.flushPending();
    return registry;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/field_status.js
  var DOCTYPE = "Task";
  var RANK2 = { None: 0, Read: 1, Write: 2 };
  var NO_VALUE_TYPES = /* @__PURE__ */ new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading"]);
  var TABLE_DOC_FIELDS = [
    "subject",
    "status",
    "priority",
    "project",
    "custom_planned_start_date",
    "custom_planned_end_date",
    "exp_start_date",
    "exp_end_date",
    "act_start_date",
    "act_end_date",
    "completed_on",
    "expected_time",
    "duration",
    "progress",
    "custom_include",
    "is_milestone",
    "color",
    "parent_task",
    "custom_tree_order",
    "confirm",
    "owner"
  ];
  var CHECK_FIELDS = /* @__PURE__ */ new Set(["custom_include", "is_milestone", "confirm"]);
  function cint2(value) {
    const n2 = Number(value);
    return Number.isFinite(n2) ? Math.trunc(n2) : 0;
  }
  function rowCanRead(row) {
    if (!(row == null ? void 0 : row.id))
      return false;
    return !(row.can_read === 0 || row.can_read === false);
  }
  function rowCanWrite(row) {
    if (!(row == null ? void 0 : row.id))
      return false;
    return row.can_write === 1 || row.can_write === true;
  }
  function isEmptyValue(value) {
    if (value == null)
      return true;
    if (Array.isArray(value))
      return value.length === 0;
    return String(value).trim() === "";
  }
  function createFieldStatusCore(deps) {
    const warn = deps.warn || ((...args) => console.warn(...args));
    const translate = deps.translate || ((s) => s);
    let treeMeta = null;
    const warned = /* @__PURE__ */ new Set();
    const brokenExpressions = /* @__PURE__ */ new Set();
    const docMemo = /* @__PURE__ */ new WeakMap();
    const containerMemo = /* @__PURE__ */ new WeakMap();
    function warnOnce(key, ...args) {
      if (warned.has(key))
        return;
      warned.add(key);
      warn(...args);
    }
    function setTreeMeta2(meta) {
      treeMeta = meta && typeof meta === "object" ? meta : null;
    }
    function getTreeMeta2() {
      return treeMeta;
    }
    function docSignature(row) {
      var _a;
      const parts = [];
      for (const field of TABLE_DOC_FIELDS) {
        parts.push(String((_a = row[field]) != null ? _a : ""));
      }
      parts.push(Array.isArray(row.assign) ? row.assign.join(",") : "");
      return parts.join("");
    }
    function rowToDoc2(row) {
      var _a;
      if (!row) {
        return { doctype: DOCTYPE };
      }
      const sig = docSignature(row);
      const memo = docMemo.get(row);
      if (memo && memo.sig === sig && memo.docRef === row._doc) {
        return memo.doc;
      }
      const doc = __spreadValues({}, row._doc || {});
      doc.doctype = DOCTYPE;
      doc.name = (_a = row.id) != null ? _a : doc.name;
      doc.docstatus = cint2(doc.docstatus);
      for (const field of TABLE_DOC_FIELDS) {
        if (!(field in row))
          continue;
        doc[field] = CHECK_FIELDS.has(field) ? row[field] ? 1 : 0 : row[field];
      }
      if (Array.isArray(row.assign)) {
        doc._assign = row.assign.length ? JSON.stringify(row.assign) : null;
      }
      delete doc.__islocal;
      docMemo.set(row, { sig, docRef: row._doc, doc });
      return doc;
    }
    function permLevels(meta) {
      if (meta && (meta.permlevels_readable || meta.permlevels_writable)) {
        return {
          readable: new Set(meta.permlevels_readable || [0]),
          writable: new Set(meta.permlevels_writable || [0])
        };
      }
      const rolePerm = typeof deps.fallbackPerm === "function" ? deps.fallbackPerm() : null;
      const readable = /* @__PURE__ */ new Set([0]);
      const writable = /* @__PURE__ */ new Set([0]);
      if (rolePerm) {
        for (const [level, p] of Object.entries(rolePerm)) {
          if (!p)
            continue;
          if (p.read)
            readable.add(cint2(level));
          if (p.write)
            writable.add(cint2(level));
        }
      }
      return { readable, writable };
    }
    function buildPerm2(row, meta = treeMeta) {
      const canRead = rowCanRead(row) ? 1 : 0;
      const canWrite = canRead && rowCanWrite(row) ? 1 : 0;
      const { readable, writable } = permLevels(meta);
      const perm = {};
      for (const level of /* @__PURE__ */ new Set([0, ...readable, ...writable])) {
        perm[level] = {
          read: canRead && readable.has(level) ? 1 : 0,
          write: canWrite && writable.has(level) ? 1 : 0
        };
      }
      return perm;
    }
    function evaluateDependsOn2(expression, doc, { fieldname = "?", prop = "depends_on" } = {}) {
      if (expression == null || expression === "")
        return null;
      if (typeof expression === "boolean")
        return expression;
      if (typeof expression === "function") {
        try {
          return Boolean(expression(doc));
        } catch (error) {
          warnOnce(
            `${prop}:${fieldname}:<function>`,
            `[task_tree_gantt] "${prop}" function failed on Task.${fieldname}; ignored`,
            error
          );
          return null;
        }
      }
      const text = String(expression);
      if (text.startsWith("eval:")) {
        if (brokenExpressions.has(text))
          return null;
        try {
          return Boolean(deps.evalExpr(text.slice(5), { doc, parent: null }));
        } catch (error) {
          brokenExpressions.add(text);
          warnOnce(
            `${prop}:${fieldname}:${text}`,
            `[task_tree_gantt] Invalid "${prop}" expression on Task.${fieldname}; ignored: ${text}`,
            error
          );
          return null;
        }
      }
      if (text.startsWith("fn:")) {
        warnOnce(
          `fn:${fieldname}:${text}`,
          `[task_tree_gantt] "${prop}" with fn: needs a form; ignored on Task.${fieldname}: ${text}`
        );
        return null;
      }
      const value = doc == null ? void 0 : doc[text];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    }
    function containersByField(fields) {
      let map = containerMemo.get(fields);
      if (map)
        return map;
      map = /* @__PURE__ */ new Map();
      let tab = null;
      let section = null;
      let column = null;
      for (const df of fields) {
        if (df.fieldtype === "Tab Break") {
          tab = df;
          section = null;
          column = null;
          continue;
        }
        if (df.fieldtype === "Section Break") {
          section = df;
          column = null;
          continue;
        }
        if (df.fieldtype === "Column Break") {
          column = df;
          continue;
        }
        if (df.fieldname) {
          map.set(df.fieldname, [tab, section, column].filter(Boolean));
        }
      }
      containerMemo.set(fields, map);
      return map;
    }
    function dependsOnVisible(df, doc) {
      if (!df)
        return true;
      const fields = deps.getFields() || [];
      const chain = [...containersByField(fields).get(df.fieldname) || [], df];
      for (const node of chain) {
        if (!node.depends_on)
          continue;
        const visible = evaluateDependsOn2(node.depends_on, doc, {
          fieldname: node.fieldname || node.fieldtype,
          prop: "depends_on"
        });
        if (visible === false)
          return false;
      }
      return true;
    }
    function workflowReadOnly(fieldname, meta = treeMeta) {
      const wf = meta == null ? void 0 : meta.workflow;
      if (!wf || !fieldname)
        return false;
      if (fieldname === wf.state_field)
        return true;
      return Array.isArray(wf.update_fields) && wf.update_fields.includes(fieldname);
    }
    function ruleCtx(doc) {
      return {
        doctype: DOCTYPE,
        doc,
        user: deps.user(),
        hasRole: (role) => Boolean(deps.hasRole(role)),
        treeMeta
      };
    }
    function evaluateRule(fieldname, doc) {
      const registry = deps.registry();
      if (!registry || typeof registry.evaluate !== "function")
        return null;
      return registry.evaluate(DOCTYPE, fieldname, doc, ruleCtx(doc));
    }
    function fieldStatus2(row, fieldname) {
      if (!rowCanRead(row))
        return "None";
      const doc = rowToDoc2(row);
      const perm = buildPerm2(row);
      const df = fieldname ? deps.getDocfield(fieldname) : null;
      let status;
      if (!df) {
        status = perm[0].write ? "Write" : perm[0].read ? "Read" : "None";
        if (status === "Write" && cint2(doc.docstatus) > 0)
          status = "Read";
      } else {
        const dfCopy = __spreadProps(__spreadValues({}, df), { permlevel: df.permlevel || 0, hidden_due_to_dependency: 0 });
        status = deps.displayStatus(dfCopy, doc, perm);
        if (status !== "None" && !dependsOnVisible(df, doc))
          status = "None";
        if (status === "Write" && df.read_only_depends_on) {
          const ro = evaluateDependsOn2(df.read_only_depends_on, doc, {
            fieldname: df.fieldname,
            prop: "read_only_depends_on"
          });
          if (ro === true)
            status = "Read";
        }
        if (status === "Write" && workflowReadOnly(df.fieldname))
          status = "Read";
      }
      if (status === "None" || !fieldname)
        return status;
      const rule = evaluateRule(fieldname, doc);
      const next = rule == null ? void 0 : rule.status;
      if (next in RANK2 && RANK2[next] < RANK2[status])
        return next;
      return status;
    }
    function fieldOptions2(row, fieldname, baseOptions) {
      const base = Array.isArray(baseOptions) ? baseOptions.map(String) : [];
      if (!fieldname)
        return base;
      const rule = evaluateRule(fieldname, rowToDoc2(row));
      if (!Array.isArray(rule == null ? void 0 : rule.options))
        return base;
      const allowed = new Set(rule.options.map(String));
      return base.filter((option) => allowed.has(option));
    }
    function isDocfieldMandatory2(df, doc) {
      if (!df)
        return false;
      if (df.mandatory_depends_on && doc) {
        return evaluateDependsOn2(df.mandatory_depends_on, doc, {
          fieldname: df.fieldname,
          prop: "mandatory_depends_on"
        }) === true;
      }
      return Boolean(cint2(df.reqd));
    }
    function missingMandatoryLabels2(doc) {
      const out = [];
      for (const df of deps.getFields() || []) {
        if (!df.fieldname || NO_VALUE_TYPES.has(df.fieldtype))
          continue;
        if (!doc || !(df.fieldname in doc))
          continue;
        if (!isDocfieldMandatory2(df, doc))
          continue;
        if (isEmptyValue(doc[df.fieldname])) {
          out.push(translate(df.label || df.fieldname));
        }
      }
      return out;
    }
    function resetCaches() {
      warned.clear();
      brokenExpressions.clear();
    }
    return {
      setTreeMeta: setTreeMeta2,
      getTreeMeta: getTreeMeta2,
      rowToDoc: rowToDoc2,
      buildPerm: buildPerm2,
      evaluateDependsOn: evaluateDependsOn2,
      dependsOnVisible,
      fieldStatus: fieldStatus2,
      fieldOptions: fieldOptions2,
      isDocfieldMandatory: isDocfieldMandatory2,
      missingMandatoryLabels: missingMandatoryLabels2,
      resetCaches
    };
  }
  var core = createFieldStatusCore({
    getDocfield: (fieldname) => {
      var _a, _b;
      return ((_b = (_a = frappe.meta) == null ? void 0 : _a.get_docfield) == null ? void 0 : _b.call(_a, DOCTYPE, fieldname)) || null;
    },
    getFields: () => {
      var _a, _b;
      return ((_b = (_a = frappe.get_meta) == null ? void 0 : _a.call(frappe, DOCTYPE)) == null ? void 0 : _b.fields) || [];
    },
    displayStatus: (df, doc, perm) => frappe.perm.get_field_display_status(df, doc, perm),
    evalExpr: (code, ctx) => frappe.utils.eval(code, ctx),
    fallbackPerm: () => {
      var _a, _b;
      return ((_b = (_a = frappe.perm) == null ? void 0 : _a.get_perm) == null ? void 0 : _b.call(_a, DOCTYPE)) || null;
    },
    registry: () => installFieldRules(),
    user: () => {
      var _a;
      return (_a = frappe.session) == null ? void 0 : _a.user;
    },
    hasRole: (role) => {
      var _a, _b;
      return Boolean((_b = (_a = frappe.user) == null ? void 0 : _a.has_role) == null ? void 0 : _b.call(_a, role));
    },
    warn: (...args) => console.warn(...args),
    translate: (s) => typeof __ === "function" ? __(s) : s
  });
  var setTreeMeta = core.setTreeMeta;
  var getTreeMeta = core.getTreeMeta;
  var rowToDoc = core.rowToDoc;
  var buildPerm = core.buildPerm;
  var evaluateDependsOn = core.evaluateDependsOn;
  var fieldStatus = core.fieldStatus;
  var fieldOptions = core.fieldOptions;
  var isDocfieldMandatory = core.isDocfieldMandatory;
  var missingMandatoryLabels = core.missingMandatoryLabels;
  var resetFieldStatusCaches = core.resetCaches;

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/api.js
  var GET_CHILDREN = "dinext_project_tasks_gantt.api.get_children";
  var GET_CRITICAL_PATH = "dinext_project_tasks_gantt.api.get_critical_path";
  var SAVE_CELLS = "dinext_project_tasks_gantt.api.save_cells";
  var TIMESHEET_LIMITS = "project_workload_assignment.api.calculate_user_timesheet_limits";
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
        task: multiPayload(args.task),
        all_tasks: args.all_tasks ? 1 : 0,
        status: multiPayload(args.status),
        priority: multiPayload(args.priority),
        assign: multiPayload(args.assign),
        tag: multiPayload(args.tag),
        sort_field: args.sort_field || null,
        sort_order: args.sort_order || null,
        limit: args.limit || null
      }
    });
    applyUserInfo(r.user_info);
    if (r.tree_meta) {
      setTreeMeta(r.tree_meta);
    }
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
  async function getCriticalPath(project) {
    const r = await frappe.call({
      method: GET_CRITICAL_PATH,
      args: { project }
    });
    return r.message || { tasks: [], edges: [], cycles: false };
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

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/critical/index.js
  var STORAGE_SUFFIX = ":tree:critical-path";
  var CRITICAL_MARK_CLASS = "tree-gantt-critical-mark";
  var CRITICAL_RING_CLASS = "tree-gantt-critical-ring";
  var CRITICAL_ARROW_UNDERLAY_CLASS = "tree-gantt-critical-arrow-underlay";
  var ICON_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="5" height="3" rx="0.6"/><rect x="10" y="9" width="5" height="3" rx="0.6"/><path d="M6 5.5h2.2a2 2 0 0 1 2 2V9"/></g></svg>';
  function criticalPathIconSvg() {
    return ICON_SVG;
  }
  var cache = emptyCache();
  var requestGen = 0;
  var painter = () => {
  };
  function emptyCache() {
    return {
      project: "",
      valid: false,
      tasks: /* @__PURE__ */ new Set(),
      edges: /* @__PURE__ */ new Set()
    };
  }
  function storageKey() {
    var _a;
    const user = ((_a = frappe.user) == null ? void 0 : _a.name) || "";
    return `${user}${STORAGE_SUFFIX}`;
  }
  function readFlag() {
    try {
      return localStorage.getItem(storageKey()) === "1";
    } catch (e) {
      return false;
    }
  }
  function writeFlag(on) {
    try {
      localStorage.setItem(storageKey(), on ? "1" : "0");
    } catch (e) {
    }
  }
  function isCriticalPathVisible() {
    return readFlag();
  }
  function isTaskCritical(taskId) {
    if (!taskId || !cache.valid || !isCriticalPathVisible()) {
      return false;
    }
    return cache.tasks.has(String(taskId));
  }
  function isCriticalEdge(fromId, toId) {
    if (!fromId || !toId || !cache.valid || !isCriticalPathVisible()) {
      return false;
    }
    return cache.edges.has(`${fromId}\0${toId}`);
  }
  function setCriticalPathPainter(fn) {
    painter = typeof fn === "function" ? fn : () => {
    };
  }
  function notify() {
    painter();
  }
  function applyPayload(project, message) {
    const tasks = new Set(((message == null ? void 0 : message.tasks) || []).map(String));
    const edges = new Set(
      ((message == null ? void 0 : message.edges) || []).filter((edge) => (edge == null ? void 0 : edge.from) && (edge == null ? void 0 : edge.to)).map((edge) => `${edge.from}\0${edge.to}`)
    );
    cache = { project: project || "", valid: true, tasks, edges };
  }
  async function reloadCriticalPath(project) {
    if (!isCriticalPathVisible() || !project) {
      cache = emptyCache();
      notify();
      return;
    }
    const gen = ++requestGen;
    try {
      const message = await getCriticalPath(project);
      if (gen !== requestGen || !isCriticalPathVisible()) {
        return;
      }
      applyPayload(project, message);
      notify();
    } catch (e) {
      if (gen !== requestGen) {
        return;
      }
      console.warn("[task_tree_gantt] critical path", e);
      cache = emptyCache();
      notify();
    }
  }
  function invalidateCriticalPath(project) {
    const wasValid = cache.valid;
    cache = emptyCache();
    if (!isCriticalPathVisible()) {
      if (wasValid) {
        notify();
      }
      return Promise.resolve();
    }
    return reloadCriticalPath(project);
  }
  function paintToggle(host, getProject) {
    const title = __("Show critical path");
    const wrap = document.createElement("label");
    wrap.className = "dinext-table-toolbar-item dinext-table-toolbar-item--checkbox";
    wrap.title = title;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "tree-gantt-critical-path";
    input.className = "dinext-table-toolbar-checkbox-input";
    input.checked = isCriticalPathVisible();
    input.setAttribute("aria-label", title);
    const icon = document.createElement("span");
    icon.className = "tree-gantt-critical-toggle-icon";
    icon.innerHTML = ICON_SVG;
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      writeFlag(input.checked);
      void reloadCriticalPath(input.checked ? getProject == null ? void 0 : getProject() : null);
    });
    wrap.appendChild(input);
    wrap.appendChild(icon);
    host.replaceChildren(wrap);
  }
  function criticalPathToolbarItem({ getProject }) {
    return {
      type: "custom",
      id: "tree-gantt-critical-path",
      render({ host }) {
        paintToggle(host, getProject);
      }
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/shell/title.js
  var TITLE_LINK_CLASS = "tree-gantt-title--link";
  function titleEl(page) {
    var _a, _b, _c;
    return ((_c = (_b = (_a = page == null ? void 0 : page.$title_area) == null ? void 0 : _a.find) == null ? void 0 : _b.call(_a, ".title-text")) == null ? void 0 : _c[0]) || null;
  }
  function unbindTitleClick(page) {
    const el3 = titleEl(page);
    if (!el3) {
      return;
    }
    el3.classList.remove(TITLE_LINK_CLASS);
    el3.onclick = null;
  }
  function bindTitleClick(page, project) {
    const el3 = titleEl(page);
    if (!el3 || !project) {
      return;
    }
    el3.classList.add(TITLE_LINK_CLASS);
    el3.onclick = () => {
      frappe.set_route("Form", "Project", project);
    };
  }
  async function setPageTitle(page, project) {
    if (!project) {
      page.set_title(DEFAULT_TITLE);
      unbindTitleClick(page);
      return;
    }
    const { message } = await frappe.db.get_value("Project", project, "project_name");
    const projectName = message == null ? void 0 : message.project_name;
    page.set_title(projectName ? `${projectName} (${project})` : project);
    bindTitleClick(page, project);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/filters/route-project.js
  function consumeRouteOptionsProject() {
    const opts = frappe.route_options;
    if (!opts || opts.project == null || opts.project === "") {
      return null;
    }
    const project = String(opts.project).trim();
    opts.project = null;
    return project || null;
  }
  function prevIsProjectForm() {
    var _a;
    const prev = ((_a = frappe.get_prev_route) == null ? void 0 : _a.call(frappe)) || [];
    return prev[0] === "Form" && prev[1] === "Project";
  }
  function queryProject() {
    const raw = new URLSearchParams(window.location.search).get("project");
    const project = raw == null ? "" : String(raw).trim();
    return project || null;
  }
  function syncProjectQuery(project) {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("project") || "";
    const next = String(project || "").trim();
    if (current === next) {
      return;
    }
    if (next) {
      url.searchParams.set("project", next);
    } else {
      url.searchParams.delete("project");
    }
    const nextUrl = url.pathname + url.search + url.hash;
    window.history.replaceState(window.history.state, "", nextUrl);
  }
  function takeRouteProject(opts = {}) {
    const fromOpts = consumeRouteOptionsProject();
    if (opts.fromShow) {
      return prevIsProjectForm() && fromOpts ? fromOpts : null;
    }
    if (prevIsProjectForm() && fromOpts) {
      return fromOpts;
    }
    return queryProject();
  }
  async function applyRouteProject(page, args, hooks = {}) {
    var _a, _b, _c;
    const project = takeRouteProject({ fromShow: true });
    if (!project || !((_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project)) {
      syncProjectQuery(args.project);
      return false;
    }
    const field = page.fields_dict.project;
    const current = String(((_b = field.get_value) == null ? void 0 : _b.call(field)) || args.project || "").trim();
    args.project = project;
    localStorage.setItem(projectStorageKey(), project);
    syncProjectQuery(project);
    (_c = hooks.onProject) == null ? void 0 : _c.call(hooks, project);
    const paint = async () => {
      if (typeof field.set_input === "function") {
        field.set_input(project);
      }
      if (typeof field.set_value === "function") {
        await field.set_value(project);
      }
    };
    if (typeof hooks.mute === "function") {
      await hooks.mute(paint);
    } else {
      await paint();
    }
    return current !== project;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/filters/index.js
  async function setupFilters({ page, onChange }) {
    await frappe.model.with_doctype("Task");
    if (page.__task_tree_gantt_filters) {
      return page.__task_tree_gantt_filters;
    }
    const args = filterDefaults();
    const routeProject = takeRouteProject();
    if (routeProject) {
      args.project = routeProject;
    }
    const emit = () => onChange == null ? void 0 : onChange();
    let lastProject = args.project;
    let muteChange = false;
    function valuesEqual(prev, next) {
      if (Array.isArray(prev) || Array.isArray(next)) {
        const a = normalizeMulti(prev);
        const b = normalizeMulti(next);
        return a.length === b.length && a.every((v, i) => v === b[i]);
      }
      return prev === next;
    }
    function setArg(fieldname, value) {
      if (valuesEqual(args[fieldname], value)) {
        return false;
      }
      args[fieldname] = Array.isArray(value) ? normalizeMulti(value) : value;
      return true;
    }
    const addIfMissing = (df) => {
      var _a;
      if ((_a = page.fields_dict) == null ? void 0 : _a[df.fieldname]) {
        return page.fields_dict[df.fieldname];
      }
      return page.add_field(df);
    };
    function bindMultiSelectList(fieldname, label, getData) {
      const field = addIfMissing({
        fieldname,
        fieldtype: "MultiSelectList",
        label,
        placeholder: label,
        get_data: getData || (() => taskMultiSelectOptions(fieldname)),
        change() {
          if (setArg(fieldname, normalizeMulti(this.get_value()))) {
            emit();
          }
        }
      });
      const notify2 = () => {
        if (setArg(fieldname, normalizeMulti(field.get_value())) && !muteChange) {
          emit();
        }
      };
      for (const name of [
        "toggle_select_item",
        "clear_all_selections",
        "select_all_options",
        "set_value"
      ]) {
        if (typeof field[name] !== "function") {
          continue;
        }
        const orig = field[name].bind(field);
        field[name] = (...a) => {
          const result = orig(...a);
          notify2();
          return result;
        };
      }
      return field;
    }
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
          if (!setArg("project", "")) {
            return;
          }
          void setPageTitle(page, null);
          emit();
          return;
        }
        if (!setArg("project", value)) {
          lastProject = value;
          return;
        }
        lastProject = value;
        localStorage.setItem(projectStorageKey(), value);
        syncProjectQuery(value);
        void setPageTitle(page, value);
        emit();
      }
    });
    bindMultiSelectList("task", __("Task"), (txt) => {
      if (!args.project) {
        return [];
      }
      return frappe.db.get_link_options("Task", txt || "", {
        project: args.project
      });
    });
    bindMultiSelectList("status", __("Status"));
    bindMultiSelectList("priority", __("Priority"));
    bindMultiSelectList(
      "assign",
      __("Assigned To"),
      (txt) => frappe.db.get_link_options("User", txt || "", {
        user_type: "System User",
        enabled: 1
      })
    );
    bindMultiSelectList(
      "tag",
      __("User Tags"),
      (txt) => frappe.db.get_link_options("Tag", txt || "")
    );
    addIfMissing({
      fieldname: "limit",
      fieldtype: "Int",
      label: __("Limit"),
      hidden: 1,
      change() {
        const raw = this.get_value();
        const next = raw === null || raw === void 0 || raw === "" ? null : cint(raw);
        if (setArg("limit", next) && !muteChange) {
          emit();
        }
      }
    });
    if (args.project && page.fields_dict.project) {
      await page.fields_dict.project.set_value(args.project);
      syncProjectQuery(args.project);
      void setPageTitle(page, args.project);
    }
    async function resetExceptProject() {
      var _a, _b;
      muteChange = true;
      try {
        for (const name of ["task", "status", "priority", "assign", "tag"]) {
          setArg(name, []);
          const field = (_a = page.fields_dict) == null ? void 0 : _a[name];
          if (typeof (field == null ? void 0 : field.set_value) === "function") {
            await field.set_value([]);
          }
        }
        setArg("limit", null);
        const limitField = (_b = page.fields_dict) == null ? void 0 : _b.limit;
        if (typeof (limitField == null ? void 0 : limitField.set_value) === "function") {
          await limitField.set_value("");
        }
      } finally {
        muteChange = false;
      }
    }
    const api = {
      getArgs: () => __spreadValues({}, args),
      resetExceptProject,
      applyRouteProject: () => applyRouteProject(page, args, {
        onProject: (project) => {
          lastProject = project;
          void setPageTitle(page, project);
        },
        mute: async (fn) => {
          muteChange = true;
          try {
            await fn();
          } finally {
            muteChange = false;
          }
        }
      })
    };
    page.__task_tree_gantt_filters = api;
    return api;
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
  function applyConflictFields(row, src) {
    row.dep_conflict = (src == null ? void 0 : src.dep_conflict) || 0;
    row.dep_conflict_start = (src == null ? void 0 : src.dep_conflict_start) || "";
    row.dep_conflict_end = (src == null ? void 0 : src.dep_conflict_end) || "";
  }
  function violationTooltip(v) {
    const date = (v == null ? void 0 : v.expected_date) || "";
    if ((v == null ? void 0 : v.violated_field) === "start") {
      return __("Successor start must be >= {0}", [date]);
    }
    if ((v == null ? void 0 : v.violated_field) === "end") {
      return __("Successor end must be >= {0}", [date]);
    }
    return (v == null ? void 0 : v.message) || __("Conflict");
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
          row.dep_conflict_start = violationTooltip(v);
        } else if (v.violated_field === "end") {
          row.dep_conflict_end = violationTooltip(v);
        }
      }
    }
  }
  function stampVisibleConflicts(table, rowsById) {
    var _a, _b, _c;
    const stamp = (data) => {
      if (!(data == null ? void 0 : data.id) || !rowsById[data.id]) {
        return;
      }
      applyConflictFields(data, rowsById[data.id]);
    };
    if (typeof ((_a = table.api) == null ? void 0 : _a.forEachNode) === "function") {
      table.api.forEachNode((node) => stamp(node.data));
    } else {
      for (const row of table.rowData || []) {
        stamp(row);
      }
    }
    (_c = (_b = table == null ? void 0 : table.api) == null ? void 0 : _b.refreshCells) == null ? void 0 : _c.call(_b, {
      columns: CONFLICT_COLUMNS,
      force: true
    });
  }
  function dateFieldsAffectConflicts(changes) {
    return (changes || []).some(
      (c) => c.field === "exp_start_date" || c.field === "exp_end_date" || c.field === "relations"
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
    stampVisibleConflicts(table, rowsById);
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
  function subjectConflictClassRules() {
    return {
      [DEP_CONFLICT_CLASS]: (params) => {
        var _a;
        return !!((_a = params.data) == null ? void 0 : _a.dep_conflict);
      }
    };
  }
  function dateConflictClassRules() {
    return {
      [DEP_CONFLICT_CLASS]: (params) => !!dateConflictClass(params)
    };
  }
  function subjectTreeContentKey(params) {
    const row = (params == null ? void 0 : params.data) || {};
    return `${row.dep_conflict || 0}\0${row.dep_conflict_start || ""}\0${row.dep_conflict_end || ""}`;
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
  var PWR_WORKLOAD_PERCENT_TASK = "\u0412 % \u043E\u0442 \u0442\u0440\u0443\u0434\u043E\u0435\u043C\u043A\u043E\u0441\u0442\u0438 \u0437\u0430\u0434\u0430\u0447\u0438";
  var PWA_FIELDS = [
    "name",
    "task",
    "role",
    "user",
    "user_full_name",
    "task_dates",
    "date_from",
    "date_to",
    "workload",
    "wl_value",
    "acc_separately"
  ];
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
  function maxToDate(date) {
    const today = frappe.datetime.now_date();
    if (!date) {
      return today;
    }
    return frappe.datetime.get_day_diff(today, date) > 0 ? today : date;
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
  async function fetchProjectTeam(project, cache2) {
    if (!project) {
      return [];
    }
    if (cache2.team.has(project)) {
      return cache2.team.get(project);
    }
    const users = await frappe.xcall("project_team_assign_filter", { project }) || [];
    cache2.team.set(project, users);
    return users;
  }
  async function fetchUserRoles(project, user, cache2) {
    const key = `${project}\0${user}`;
    if (cache2.roles.has(key)) {
      return cache2.roles.get(key);
    }
    const roles = await frappe.xcall("get_project_user_roles", { project, user }) || [];
    cache2.roles.set(key, roles);
    return roles;
  }
  async function resolveTaskMeta(taskId, hint = {}) {
    var _a, _b;
    let project = hint.project || null;
    let expStart = (_a = hint.exp_start_date) != null ? _a : null;
    let expEnd = (_b = hint.exp_end_date) != null ? _b : null;
    if (!project || expStart == null || expEnd == null) {
      const r = await frappe.db.get_value("Task", taskId, [
        "project",
        "exp_start_date",
        "exp_end_date"
      ]);
      const msg = (r == null ? void 0 : r.message) || r || {};
      project = project || msg.project || null;
      if (expStart == null) {
        expStart = msg.exp_start_date || null;
      }
      if (expEnd == null) {
        expEnd = msg.exp_end_date || null;
      }
    }
    return { project, exp_start_date: expStart, exp_end_date: expEnd };
  }
  async function buildPwaRowsForTask(taskId, desiredUsers, hint, cache2) {
    var _a, _b, _c, _d;
    const desired = normalizeUsers(desiredUsers);
    const desiredSet = new Set(desired);
    const { project, exp_start_date, exp_end_date } = await resolveTaskMeta(
      taskId,
      hint
    );
    if (!project) {
      throw new Error(__("Task {0}: project is required for assignment", [taskId]));
    }
    const team = await fetchProjectTeam(project, cache2);
    const teamSet = new Set(team);
    const existing = await frappe.db.get_list("Project Workload Assignment", {
      fields: PWA_FIELDS,
      filters: { task: taskId },
      limit: 0
    }) || [];
    const byUser = new Map(existing.map((p) => [p.user, p]));
    const rows = [];
    for (const pwa of existing) {
      if (desiredSet.has(pwa.user)) {
        rows.push({
          name: pwa.name,
          task: taskId,
          user: pwa.user,
          role: pwa.role,
          user_full_name: pwa.user_full_name,
          task_dates: pwa.task_dates,
          date_from: pwa.date_from,
          date_to: pwa.date_to,
          workload: pwa.workload,
          wl_value: pwa.wl_value,
          acc_separately: pwa.acc_separately
        });
      } else {
        rows.push({
          name: pwa.name,
          task: taskId,
          user: pwa.user,
          __isRemove: true
        });
      }
    }
    for (const user of desired) {
      if (byUser.has(user)) {
        continue;
      }
      if (!teamSet.has(user)) {
        throw new Error(
          __("User {0} is not in the project team", [((_b = (_a = frappe.user) == null ? void 0 : _a.full_name) == null ? void 0 : _b.call(_a, user)) || user])
        );
      }
      const roles = await fetchUserRoles(project, user, cache2);
      if (!roles.length) {
        throw new Error(
          __(
            "User {0} has no project role. Choose a role in the assignment dialog.",
            [((_d = (_c = frappe.user) == null ? void 0 : _c.full_name) == null ? void 0 : _d.call(_c, user)) || user]
          )
        );
      }
      rows.push({
        __islocal: true,
        task: taskId,
        user,
        role: roles[0],
        task_dates: 1,
        date_from: maxToDate(exp_start_date),
        date_to: maxToDate(exp_end_date),
        workload: PWR_WORKLOAD_PERCENT_TASK,
        wl_value: 100,
        acc_separately: 1
      });
    }
    return rows;
  }
  async function callBulkProcessPwa(rows) {
    if (!rows.length) {
      return;
    }
    await new Promise((resolve, reject) => {
      frappe.call({
        method: "project_workload_assignment.pwa_dates.bulk.bulk_process_pwa",
        args: { rows },
        freeze: true,
        freeze_message: __("Updating assignments\u2026"),
        callback: (r) => {
          if (r.exc) {
            reject(new Error(r.message || __("Assign failed")));
            return;
          }
          resolve(r);
        },
        error: (err) => {
          reject(err instanceof Error ? err : new Error(__("Assign failed")));
        }
      });
    });
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
    if (!list.length) {
      return;
    }
    const cache2 = { team: /* @__PURE__ */ new Map(), roles: /* @__PURE__ */ new Map() };
    const allRows = [];
    for (const op of list) {
      const rows = await buildPwaRowsForTask(
        op.taskId,
        op.users,
        {
          project: op.project,
          exp_start_date: op.exp_start_date,
          exp_end_date: op.exp_end_date
        },
        cache2
      );
      allRows.push(...rows);
    }
    const hasPwaMutation = allRows.some((r) => r.__islocal || r.__isRemove);
    if (hasPwaMutation) {
      await callBulkProcessPwa(allRows);
    }
    for (const op of list) {
      await syncTodosToUsers(op.taskId, op.users);
    }
  }
  async function fetchProjectTeamUsers(project) {
    if (!project) {
      return [];
    }
    return await frappe.xcall("project_team_assign_filter", { project }) || [];
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/context.js
  var columnsPage = null;
  var onAssignSaved = null;
  var onTreeMutate = null;
  var onGanttRefresh = null;
  var onRelationsFocus = null;
  var getTreeTableFn = null;
  function setColumnContext({
    page,
    onAssignSaved: assignHook,
    onTreeMutate: mutateHook,
    onGanttRefresh: ganttHook,
    onRelationsFocus: relationsHook,
    getTreeTable: tableHook
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
    if (relationsHook !== void 0) {
      onRelationsFocus = typeof relationsHook === "function" ? relationsHook : null;
    }
    if (tableHook !== void 0) {
      getTreeTableFn = typeof tableHook === "function" ? tableHook : null;
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
  function getOnRelationsFocus() {
    return onRelationsFocus;
  }
  function getTreeTable() {
    return (getTreeTableFn == null ? void 0 : getTreeTableFn()) || null;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/priority/options.js
  function getPriorityOptions(row) {
    const field = frappe.meta.get_field("Task", "priority") || frappe.meta.get_docfield("Task", "priority");
    const raw = (field == null ? void 0 : field.options) || "";
    const options = String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!row) {
      return options;
    }
    return fieldOptions(row, "priority", options);
  }
  function isValidPriorityValue(value, row) {
    if (value == null || value === "") {
      return false;
    }
    return getPriorityOptions(row).includes(String(value));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/relations/options.js
  function mapSelectKey(raw, options) {
    if (typeof (DinextTable == null ? void 0 : DinextTable.parseSelectValue) === "function") {
      return DinextTable.parseSelectValue(raw, options);
    }
    if (raw == null || raw === "") {
      return null;
    }
    const s = String(raw).trim();
    return options.includes(s) ? s : null;
  }
  var RELATION_TYPE_VALUES = [
    "FS (Finish \u2192 Start)",
    "SS (Start \u2192 Start)",
    "FF (Finish \u2192 Finish)",
    "SF (Start \u2192 Finish)"
  ];
  var DEFAULT_RELATION_TYPE = RELATION_TYPE_VALUES[0];
  function getRelationTypeOptions() {
    var _a, _b, _c, _d;
    const field = ((_b = (_a = frappe.meta).get_docfield) == null ? void 0 : _b.call(_a, "Task Relation", "type")) || ((_d = (_c = frappe.meta).get_field) == null ? void 0 : _d.call(_c, "Task Relation", "type"));
    const raw = (field == null ? void 0 : field.options) || "";
    const fromMeta = String(raw).split("\n").map((s) => s.trim()).filter(Boolean);
    return fromMeta.length ? fromMeta : RELATION_TYPE_VALUES;
  }
  function resolveRelationType(raw) {
    if (raw == null || raw === "") {
      return DEFAULT_RELATION_TYPE;
    }
    const s = String(raw).trim();
    if (!s) {
      return DEFAULT_RELATION_TYPE;
    }
    const options = getRelationTypeOptions();
    if (options.includes(s)) {
      return s;
    }
    const mapped = mapSelectKey(s, options);
    if (mapped && options.includes(mapped)) {
      return mapped;
    }
    const short = s.match(/^(FS|SS|FF|SF)/);
    if (short) {
      const byPrefix = options.find(
        (opt) => opt === short[1] || opt.startsWith(`${short[1]} `)
      );
      if (byPrefix) {
        return byPrefix;
      }
    }
    return s;
  }
  function shortRelationType(type) {
    if (!type) {
      return "FS";
    }
    const m = String(type).match(/^(FS|SS|FF|SF)/);
    return m ? m[1] : String(type).slice(0, 2);
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/relations/persist.js
  function normalizeRelationType(value) {
    return resolveRelationType(value);
  }
  function relationKey(predecessor, type) {
    return `${predecessor}\0${normalizeRelationType(type)}`;
  }
  function normalizeRelations(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const raw of value) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const predecessor = String(raw.predecessor || "").trim();
      if (!predecessor) {
        continue;
      }
      const type = normalizeRelationType(raw.type);
      const key = relationKey(predecessor, type);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const subject = String(
        raw.predecessor_subject || raw.subject || ""
      ).trim();
      out.push({
        predecessor,
        predecessor_subject: subject || void 0,
        type,
        buffer_days: Number(raw.buffer_days) || 0,
        is_active: raw.is_active == null ? 1 : raw.is_active ? 1 : 0,
        name: raw.name || void 0,
        project: raw.project || void 0
      });
    }
    return out;
  }
  async function enrichPredecessorSubjects(relations) {
    const list = normalizeRelations(relations);
    const need = [
      ...new Set(
        list.filter((r) => !r.predecessor_subject).map((r) => r.predecessor)
      )
    ];
    if (!need.length) {
      return list;
    }
    let rows = [];
    try {
      rows = await frappe.db.get_list("Task", {
        filters: { name: ["in", need] },
        fields: ["name", "subject"],
        limit: need.length
      });
    } catch (e) {
      console.error("[task_tree_gantt] enrichPredecessorSubjects", e);
      return list;
    }
    const byName = new Map(
      (rows || []).map((t) => [t.name, t.subject || ""])
    );
    return list.map((r) => __spreadProps(__spreadValues({}, r), {
      predecessor_subject: r.predecessor_subject || byName.get(r.predecessor) || ""
    }));
  }
  function predecessorLabel(rel) {
    if (!rel) {
      return "";
    }
    const subject = String(rel.predecessor_subject || "").trim();
    if (subject && subject !== rel.predecessor) {
      return subject;
    }
    return subject || rel.predecessor || "";
  }
  function subjectFromGrid(api, taskId) {
    var _a;
    if (!api || !taskId) {
      return "";
    }
    let found = "";
    (_a = api.forEachNode) == null ? void 0 : _a.call(api, (node) => {
      if (found || !(node == null ? void 0 : node.data)) {
        return;
      }
      if (node.data.id === taskId && node.data.subject) {
        found = String(node.data.subject).trim();
      }
    });
    return found;
  }
  function withResolvedSubjects(relations, api = null) {
    return normalizeRelations(relations).map((r) => {
      var _a, _b;
      let subject = String(r.predecessor_subject || "").trim();
      if (!subject || subject === r.predecessor) {
        subject = subjectFromGrid(api, r.predecessor) || subject;
      }
      if (!subject || subject === r.predecessor) {
        try {
          const titled = ((_b = (_a = frappe.utils).get_link_title) == null ? void 0 : _b.call(_a, "Task", r.predecessor)) || "";
          if (titled && titled !== r.predecessor) {
            subject = String(titled).trim();
          }
        } catch (e) {
        }
      }
      return __spreadProps(__spreadValues({}, r), {
        predecessor_subject: subject || r.predecessor_subject || ""
      });
    });
  }
  function sameRelations(a, b) {
    const left = normalizeRelations(a).map((r) => relationKey(r.predecessor, r.type)).sort();
    const right = normalizeRelations(b).map((r) => relationKey(r.predecessor, r.type)).sort();
    if (left.length !== right.length) {
      return false;
    }
    return left.every((k, i) => k === right[i]);
  }
  function relationsFromRow(row, value, api = null) {
    const fromValue = Array.isArray(value) && value.length && typeof value[0] === "object" ? normalizeRelations(value) : null;
    const fromRow = Array.isArray(row == null ? void 0 : row.relations) ? normalizeRelations(row.relations) : [];
    const base = (fromValue == null ? void 0 : fromValue.length) ? fromValue : fromRow;
    const byPred = new Map(
      fromRow.map((r) => [r.predecessor, r.predecessor_subject || ""])
    );
    const merged = base.map((r) => __spreadProps(__spreadValues({}, r), {
      predecessor_subject: r.predecessor_subject || byPred.get(r.predecessor) || ""
    }));
    return withResolvedSubjects(merged, api);
  }
  function stampRelationsOnRow(row, nextRelations) {
    if (!row) {
      return;
    }
    const next = normalizeRelations(nextRelations);
    row.relations = next;
    row.predecessors = next.map((r) => r.predecessor);
  }
  async function validateRelationRow(taskId, predecessor, relType, bufferDays) {
    try {
      const check = await frappe.xcall("validate_relation", {
        parent_successor: taskId,
        predecessor,
        rel_type: relType,
        buffer_days: bufferDays || 0
      });
      if (check && check.ok === false) {
        throw new Error(check.error || __("Invalid relation"));
      }
    } catch (e) {
      const msg = (e == null ? void 0 : e.message) || String(e || "");
      if (msg.includes("validate_relation") || msg.includes("not found") || msg.includes("AttributeError")) {
        return;
      }
      throw e instanceof Error ? e : new Error(msg || __("Invalid relation"));
    }
  }
  async function syncTaskRelations(taskId, relations, hint = {}) {
    var _a, _b;
    if (!taskId) {
      return;
    }
    const desired = normalizeRelations(relations);
    if (desired.some((r) => r.predecessor === taskId)) {
      throw new Error(__("Predecessor can't be same as successor"));
    }
    const got = await frappe.call({
      method: "frappe.client.get",
      args: { doctype: "Task", name: taskId }
    });
    const doc = got.message;
    if (!doc) {
      throw new Error(__("Task {0} not found", [taskId]));
    }
    const prevRows = doc.custom_relations || [];
    const prevByKey = /* @__PURE__ */ new Map();
    for (const r of prevRows) {
      if (!r.predecessor) {
        continue;
      }
      prevByKey.set(relationKey(r.predecessor, r.type), r);
    }
    const project = hint.project || doc.project || null;
    const nextRows = [];
    for (const row of desired) {
      const key = relationKey(row.predecessor, row.type);
      const prev = prevByKey.get(key);
      if (prev) {
        nextRows.push({
          name: prev.name,
          predecessor: row.predecessor,
          type: row.type,
          buffer_days: (_b = (_a = prev.buffer_days) != null ? _a : row.buffer_days) != null ? _b : 0,
          is_active: 1,
          project: prev.project || project || void 0
        });
      } else {
        await validateRelationRow(
          taskId,
          row.predecessor,
          row.type,
          row.buffer_days || 0
        );
        nextRows.push({
          predecessor: row.predecessor,
          type: row.type,
          buffer_days: row.buffer_days || 0,
          is_active: 1,
          project: project || void 0
        });
      }
    }
    doc.custom_relations = nextRows;
    await frappe.call({
      method: "frappe.client.save",
      args: { doc },
      freeze: true,
      freeze_message: __("Updating relations\u2026")
    });
    const withSubjects = nextRows.map((r) => {
      const fromDraft = desired.find(
        (d2) => d2.predecessor === r.predecessor && normalizeRelationType(d2.type) === normalizeRelationType(r.type)
      );
      return __spreadProps(__spreadValues({}, r), {
        predecessor_subject: fromDraft == null ? void 0 : fromDraft.predecessor_subject
      });
    });
    return enrichPredecessorSubjects(withSubjects);
  }
  async function syncTaskRelationsMany(ops) {
    const list = (ops || []).filter((op) => op == null ? void 0 : op.taskId);
    for (const op of list) {
      op.relations = await syncTaskRelations(op.taskId, op.relations, {
        project: op.project
      });
    }
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
    return fieldOptions(row, "status", options);
  }
  function isValidStatusValue(value, row) {
    if (value == null || value === "") {
      return false;
    }
    return getStatusOptions(row).includes(String(value));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/completed_on.js
  function toIso(value) {
    if (value == null || value === "") {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, "0");
      const d2 = String(value.getDate()).padStart(2, "0");
      return `${y}-${m}-${d2}`;
    }
    const s = String(value).trim();
    if (!s) {
      return null;
    }
    return s.slice(0, 10);
  }
  function resolveCompletedOn(actEndDate, completedOnDate, today) {
    const todayS = toIso(today);
    const actEnd = toIso(actEndDate);
    let out = toIso(completedOnDate);
    if (actEnd) {
      if (!out || out < actEnd) {
        out = actEnd;
      }
    } else if (!out) {
      out = todayS;
    }
    if (out && todayS && out > todayS) {
      out = todayS;
    }
    return out;
  }
  function applyCompletedOnSideEffects(changes, { today, getDoc } = {}) {
    var _a;
    if (!(changes == null ? void 0 : changes.length)) {
      return [];
    }
    const injected = [];
    for (const change of changes) {
      if (change.field !== "status" || change.newValue !== "Completed") {
        continue;
      }
      if (changes.some((c) => c.row === change.row && c.field === "completed_on")) {
        continue;
      }
      const doc = getDoc ? getDoc(change.row) : __spreadValues({}, change.row || {});
      if (toIso(doc.completed_on)) {
        continue;
      }
      const filled = resolveCompletedOn(doc.act_end_date, null, today);
      if (!filled) {
        continue;
      }
      injected.push({
        rowId: change.rowId,
        rowIndex: change.rowIndex,
        field: "completed_on",
        oldValue: (_a = doc.completed_on) != null ? _a : null,
        newValue: filled,
        row: change.row
      });
    }
    if (injected.length) {
      changes.push(...injected);
    }
    return injected;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/rows.js
  function toTableRow(row) {
    var _a, _b, _c;
    return {
      _doc: row,
      id: row.id,
      subject: row.can_read === 0 ? row.subject || row.id || "" : row.subject || "",
      assign: Array.isArray(row.assign) ? row.assign : [],
      assign_pwa: Array.isArray(row.assign_pwa) ? row.assign_pwa : [],
      assign_todo_only: Array.isArray(row.assign_todo_only) ? row.assign_todo_only : [],
      status: row.status || "",
      priority: row.priority || "",
      custom_planned_start_date: row.custom_planned_start_date || null,
      custom_planned_end_date: row.custom_planned_end_date || null,
      exp_start_date: row.exp_start_date || null,
      exp_end_date: row.exp_end_date || null,
      act_start_date: row.act_start_date || null,
      act_end_date: row.act_end_date || null,
      completed_on: row.completed_on || null,
      expected_time: (_a = row.expected_time) != null ? _a : null,
      duration: (_b = row.duration) != null ? _b : null,
      progress: row.progress == null || row.progress === "" ? null : row.progress,
      custom_include: row.custom_include == null ? null : !!row.custom_include,
      type: row.task_type_label || row.task_type || "",
      user_tags: row.user_tags || "",
      is_milestone: row.is_milestone ? 1 : 0,
      color: row.color || null,
      relations: Array.isArray(row.relations) ? row.relations : [],
      predecessors: Array.isArray(row.relations) ? row.relations.map((r) => r.predecessor).filter(Boolean) : [],
      parent_task: row.parent_task || null,
      custom_tree_order: (_c = row.custom_tree_order) != null ? _c : 0,
      can_read: row.can_read === 0 || row.can_read === false ? 0 : 1,
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
      if (parentId && parentId !== row.id && byId[parentId]) {
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

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/save.js
  var TASK_FIELDS = /* @__PURE__ */ new Set([
    "subject",
    "status",
    "priority",
    "custom_planned_start_date",
    "custom_planned_end_date",
    "exp_start_date",
    "exp_end_date",
    "expected_time",
    "custom_include",
    "completed_on"
  ]);
  var SAVE_DATE_FIELDS = /* @__PURE__ */ new Set([
    "custom_planned_start_date",
    "custom_planned_end_date",
    "exp_start_date",
    "exp_end_date",
    "completed_on"
  ]);
  var COLUMN_TO_DOCTYPE = {
    task_type: "type",
    task_type_label: "type",
    assign: "_assign",
    assign_pwa: "_assign",
    assign_todo_only: "_assign",
    relations: "custom_relations",
    user_tags: "_user_tags"
  };
  function toDocTypeField(field) {
    return COLUMN_TO_DOCTYPE[field] || field;
  }
  function columnStatus(row, field) {
    return fieldStatus(row, toDocTypeField(field));
  }
  function fieldIsHidden(row, field) {
    if (!rowCanRead(row))
      return false;
    return columnStatus(row, field) === "None";
  }
  function fieldCanEdit(row, field) {
    if (!rowCanRead(row))
      return false;
    if (!rowCanWrite(row))
      return false;
    return columnStatus(row, field) === "Write";
  }
  function writeDeniedTitle() {
    return __("Not permitted");
  }
  function deniedTitle(row, field) {
    return fieldCanEdit(row, field) ? "" : writeDeniedTitle();
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
    if (s.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }
    const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    return null;
  }
  function clearTaskDocs(ids) {
    var _a, _b;
    for (const id of ids) {
      if (id) {
        (_b = (_a = frappe.model).clear_doc) == null ? void 0 : _b.call(_a, "Task", id);
      }
    }
  }
  function normalizeSaveValue(field, value) {
    if (field === "custom_include") {
      return value ? 1 : 0;
    }
    if (SAVE_DATE_FIELDS.has(field)) {
      return toFrappeDate(value);
    }
    if (field === "expected_time") {
      if (value == null || value === "") {
        return null;
      }
      const n2 = Number(value);
      return Number.isFinite(n2) ? n2 : value;
    }
    if (field === "assign") {
      return normalizeUsers(value);
    }
    if (field === "relations") {
      return normalizeRelations(value);
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
  function mandatoryPrecheck(changes) {
    const byRow = /* @__PURE__ */ new Map();
    for (const change of changes || []) {
      if (!TASK_FIELDS.has(change.field) || !change.row) {
        continue;
      }
      if (!byRow.has(change.row)) {
        byRow.set(change.row, __spreadValues({}, rowToDoc(change.row)));
      }
      byRow.get(change.row)[toDocTypeField(change.field)] = normalizeSaveValue(
        change.field,
        change.newValue
      );
    }
    for (const [row, doc] of byRow) {
      const missing = missingMandatoryLabels(doc);
      if (missing.length) {
        frappe.msgprint({
          message: __("Mandatory fields required in {0}", [__("Task")]) + `: ${row.id}<br><br><ul><li>${missing.join("</li><li>")}</li></ul>`,
          indicator: "red",
          title: __("Missing Fields")
        });
        return false;
      }
    }
    return true;
  }
  function onValidateCells({ changes }) {
    for (const change of changes) {
      if (!rowCanRead(change.row) || !rowCanWrite(change.row)) {
        frappe.show_alert({
          message: __("Not permitted to write Task {0}", [
            taskIdFromChange(change)
          ]),
          indicator: "red"
        });
        return false;
      }
      if (!fieldCanEdit(change.row, change.field)) {
        frappe.show_alert({
          message: __("Field {0} is not editable", [change.field]),
          indicator: "orange"
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
      if (change.field === "priority" && !isValidPriorityValue(change.newValue, change.row)) {
        return rejectSelectValue(__("Priority"), change.newValue);
      }
      if (SAVE_DATE_FIELDS.has(change.field)) {
        const raw = change.newValue;
        if (raw != null && raw !== "" && !toFrappeDate(raw)) {
          frappe.show_alert({
            message: __("Invalid date"),
            indicator: "orange"
          });
          return false;
        }
      }
      if (change.field === "relations") {
        const next = normalizeRelations(change.newValue);
        const taskId = taskIdFromChange(change);
        if (next.some((r) => r.predecessor === taskId)) {
          frappe.show_alert({
            message: __("Predecessor can't be same as successor"),
            indicator: "orange"
          });
          return false;
        }
      }
    }
    applyCompletedOnSideEffects(changes, {
      today: frappe.datetime.get_today(),
      getDoc: rowToDoc
    });
    return mandatoryPrecheck(changes);
  }
  function toIsoDate(value) {
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
    return s.slice(0, 10);
  }
  function applySideEffectDateRows(table, rows) {
    if (!table || !(rows == null ? void 0 : rows.length)) {
      return false;
    }
    if (typeof table.applyExternalCellValues !== "function") {
      console.error(
        "[task_tree_gantt] DinextTable.applyExternalCellValues missing \u2014 rebuild dinext_common"
      );
      return false;
    }
    const changes = [];
    for (const row of rows) {
      if (!(row == null ? void 0 : row.id)) {
        continue;
      }
      for (const field of ["exp_start_date", "exp_end_date"]) {
        changes.push({
          id: String(row.id),
          field,
          value: toIsoDate(row[field])
        });
      }
    }
    if (!changes.length) {
      return false;
    }
    return table.applyExternalCellValues(changes) > 0;
  }
  function applySavedRows(table, saved) {
    var _a, _b;
    if (!table || !(saved == null ? void 0 : saved.length)) {
      return false;
    }
    if (typeof table.applyExternalCellValues !== "function") {
      return false;
    }
    const changes = [];
    for (const row of saved) {
      if (!(row == null ? void 0 : row.id)) {
        continue;
      }
      const tableRow = toTableRow(row);
      for (const [field, value] of Object.entries(tableRow)) {
        if (field === "id" || field === "hasChildren") {
          continue;
        }
        changes.push({ id: String(row.id), field, value });
      }
    }
    if (!changes.length) {
      return false;
    }
    const applied = table.applyExternalCellValues(changes) > 0;
    const nodes = saved.map((row) => {
      var _a2;
      return (_a2 = table.findGridNodeByBusinessId) == null ? void 0 : _a2.call(table, row.id);
    }).filter(Boolean);
    if (nodes.length) {
      (_b = (_a = table.api) == null ? void 0 : _a.refreshCells) == null ? void 0 : _b.call(_a, { rowNodes: nodes, force: true });
    }
    return applied;
  }
  async function saveCells2(payload, { table } = {}) {
    if (!(payload == null ? void 0 : payload.length))
      return true;
    try {
      const message = await saveCells(payload);
      applySideEffectDateRows(table, message == null ? void 0 : message.rows);
      applySavedRows(table, message == null ? void 0 : message.saved);
      const savedIds = new Set(
        payload.map((p) => p.id).filter(Boolean).map(String)
      );
      for (const row of (message == null ? void 0 : message.rows) || []) {
        if (row == null ? void 0 : row.id) {
          savedIds.add(String(row.id));
        }
      }
      clearTaskDocs(savedIds);
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
  async function saveRelationChanges(changes) {
    var _a, _b, _c, _d, _e;
    const relChanges = (changes || []).filter((c) => c.field === "relations");
    if (!relChanges.length) {
      return true;
    }
    try {
      const pageProject = ((_d = (_c = (_b = (_a = getColumnsPage()) == null ? void 0 : _a.fields_dict) == null ? void 0 : _b.project) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c)) || null;
      const ops = [];
      for (const change of relChanges) {
        const taskId = taskIdFromChange(change);
        const next = normalizeRelations(change.newValue);
        const prev = normalizeRelations(change.oldValue);
        if (sameRelations(prev, next)) {
          continue;
        }
        ops.push({
          taskId,
          relations: next,
          project: ((_e = change.row) == null ? void 0 : _e.project) || pageProject,
          row: change.row || null
        });
      }
      if (!ops.length) {
        return true;
      }
      await syncTaskRelationsMany(ops);
      for (const op of ops) {
        if (op.row) {
          stampRelationsOnRow(op.row, op.relations);
        }
      }
      clearTaskDocs(ops.map((op) => op.taskId));
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
          message: e.message || __("Relations update failed"),
          indicator: "red"
        },
        7
      );
      return false;
    }
  }
  async function saveAssignChanges(changes) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const assignChanges = (changes || []).filter((c) => c.field === "assign");
    if (!assignChanges.length) {
      return true;
    }
    try {
      const pageProject = ((_d = (_c = (_b = (_a = getColumnsPage()) == null ? void 0 : _a.fields_dict) == null ? void 0 : _b.project) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c)) || null;
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
          users: next,
          project: ((_e = change.row) == null ? void 0 : _e.project) || pageProject,
          exp_start_date: (_g = (_f = change.row) == null ? void 0 : _f.exp_start_date) != null ? _g : null,
          exp_end_date: (_i = (_h = change.row) == null ? void 0 : _h.exp_end_date) != null ? _i : null,
          row: change.row || null
        });
        next.forEach((u) => usersForInfo.add(u));
      }
      if (!ops.length) {
        return true;
      }
      await syncTaskAssignMany(ops);
      for (const op of ops) {
        if (op.row) {
          stampAssignMetaAfterPwa(op.row, op.users);
        }
      }
      clearTaskDocs(ops.map((op) => op.taskId));
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
    var _a, _b, _c, _d;
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
    const relationsOk = await saveRelationChanges(changes);
    if (!relationsOk) {
      return false;
    }
    if ((changes || []).some((c) => c.field === "relations")) {
      (_d = (_c = table == null ? void 0 : table.api) == null ? void 0 : _c.refreshCells) == null ? void 0 : _d.call(_c, {
        columns: ["relations"],
        force: true
      });
    }
    if (!taskPayload.length) {
      return true;
    }
    return saveCells2(taskPayload, { table });
  }
  function changesAffectGantt(changes) {
    return (changes || []).some(
      (c) => c.field === "exp_start_date" || c.field === "exp_end_date" || c.field === "status" || c.field === "priority" || c.field === "subject" || c.field === "progress" || c.field === "assign" || c.field === "relations"
    );
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/assign/dialog.js
  function openAssignDialog({ row, project = null, onSaved }) {
    if (!fieldCanEdit(row, "assign")) {
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
  function projectFromPage() {
    var _a, _b, _c;
    const page = getColumnsPage();
    return ((_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b)) || null;
  }
  async function openBulkAssignDialog({ rows, project, onConfirm }) {
    const writable = (rows || []).filter((r) => fieldCanEdit(r, "assign"));
    if (!writable.length) {
      frappe.show_alert({
        message: __("No writable tasks selected"),
        indicator: "orange"
      });
      return;
    }
    const projectName = project || projectFromPage();
    if (!projectName) {
      frappe.show_alert({
        message: __("Select a project"),
        indicator: "orange"
      });
      return;
    }
    let teamUsers = [];
    try {
      teamUsers = normalizeUsers(await fetchProjectTeamUsers(projectName));
    } catch (e) {
      frappe.show_alert({
        message: e.message || __("Failed to load project team"),
        indicator: "red"
      });
      return;
    }
    if (!teamUsers.length) {
      frappe.show_alert({
        message: __("No users in the project team"),
        indicator: "orange"
      });
      return;
    }
    const teamSet = new Set(teamUsers);
    const dialog = new frappe.ui.Dialog({
      title: __("Assign users"),
      fields: [
        {
          fieldtype: "HTML",
          fieldname: "hint",
          options: `<p class="text-muted small">${__(
            "Add users to {0} selected task(s). Creates workload (PWA) with default dates and first project role; no assignment dialog.",
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
              name: ["in", teamUsers],
              user_type: "System User",
              enabled: 1
            });
          }
        }
      ],
      primary_action_label: __("Assign"),
      primary_action(values) {
        var _a, _b;
        const users = parseDialogUsers(values == null ? void 0 : values.users);
        if (!users.length) {
          frappe.show_alert({
            message: __("Select at least one user"),
            indicator: "orange"
          });
          return;
        }
        const outside = users.filter((u) => !teamSet.has(u));
        if (outside.length) {
          frappe.show_alert({
            message: __("User {0} is not in the project team", [
              ((_b = (_a = frappe.user) == null ? void 0 : _a.full_name) == null ? void 0 : _b.call(_a, outside[0])) || outside[0]
            ]),
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
  function projectFromPage2() {
    var _a, _b, _c, _d;
    return ((_d = (_c = (_b = (_a = getColumnsPage()) == null ? void 0 : _a.fields_dict) == null ? void 0 : _b.project) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c)) || null;
  }
  function writableChecked(table) {
    var _a, _b, _c, _d;
    const checkedIds = ((_a = table == null ? void 0 : table.getCheckedRowIds) == null ? void 0 : _a.call(table)) || [];
    const out = [];
    for (const rowId of checkedIds) {
      const node = (_c = (_b = table.api) == null ? void 0 : _b.getRowNode) == null ? void 0 : _c.call(_b, String(rowId));
      const row = (node == null ? void 0 : node.data) || ((_d = table.findSourceRow) == null ? void 0 : _d.call(table, rowId));
      if (!fieldCanEdit(row, "assign") || !node) {
        continue;
      }
      out.push({ rowId, node, row });
    }
    return out;
  }
  function commitAssignReplace(table, node, row, users) {
    var _a, _b;
    const oldValue = normalizeUsers(row == null ? void 0 : row.assign);
    const newValue = normalizeUsers(users);
    stampAssignMetaAfterPwa(row, newValue);
    if (node.data && node.data !== row) {
      stampAssignMetaAfterPwa(node.data, newValue);
    }
    if (sameUsers(oldValue, newValue)) {
      (_b = (_a = table.api) == null ? void 0 : _a.refreshCells) == null ? void 0 : _b.call(_a, {
        rowNodes: [node],
        columns: ["assign"],
        force: true
      });
      return 0;
    }
    const { applied } = table.commitCellChanges({
      source: editSource(),
      changes: [
        {
          node,
          field: "assign",
          oldValue,
          newValue,
          rowIndex: node.rowIndex,
          colId: "assign"
        }
      ]
    });
    return applied;
  }
  function commitBulkAssignDelta(table, delta) {
    var _a, _b, _c, _d, _e, _f;
    const add = normalizeUsers(delta == null ? void 0 : delta.add);
    const removeSet = new Set(normalizeUsers(delta == null ? void 0 : delta.remove));
    if (!add.length && !removeSet.size || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      return 0;
    }
    const checkedIds = ((_a = table.getCheckedRowIds) == null ? void 0 : _a.call(table)) || [];
    const changes = [];
    for (const rowId of checkedIds) {
      const node = (_c = (_b = table.api) == null ? void 0 : _b.getRowNode) == null ? void 0 : _c.call(_b, String(rowId));
      const row = (node == null ? void 0 : node.data) || ((_d = table.findSourceRow) == null ? void 0 : _d.call(table, rowId));
      if (!fieldCanEdit(row, "assign") || !node) {
        continue;
      }
      const oldValue = normalizeUsers(row.assign);
      const kept = oldValue.filter((u) => !removeSet.has(u));
      const newValue = normalizeUsers([...kept, ...add]);
      stampAssignMetaAfterPwa(row, newValue);
      if (node.data && node.data !== row) {
        stampAssignMetaAfterPwa(node.data, newValue);
      }
      if (sameUsers(oldValue, newValue)) {
        (_f = (_e = table.api) == null ? void 0 : _e.refreshCells) == null ? void 0 : _f.call(_e, {
          rowNodes: [node],
          columns: ["assign"],
          force: true
        });
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
      return 0;
    }
    const { applied } = table.commitCellChanges({
      source: editSource(),
      changes
    });
    return applied;
  }
  function commitBulkAssign(table, addUsers) {
    return commitBulkAssignDelta(table, { add: addUsers, remove: [] });
  }
  function openSinglePwa(table, item, project) {
    openAssignDialog({
      row: item.row,
      project,
      onSaved: (users) => {
        void ensureAssignUserInfo(users).then(() => {
          commitAssignReplace(table, item.node, item.row, users);
        });
      }
    });
  }
  function openMultiPwa(table, items, project) {
    const tasks = items.map(({ row }) => ({
      name: row.id,
      project: project || void 0,
      subject: row.subject || void 0,
      exp_start_date: row.exp_start_date || void 0,
      exp_end_date: row.exp_end_date || void 0,
      assign: Array.isArray(row.assign) ? row.assign : []
    }));
    window.start_pwa_multi_dialog(
      (result) => {
        const added = Array.isArray(result) ? result : (result == null ? void 0 : result.added) || [];
        const removed = Array.isArray(result) ? [] : (result == null ? void 0 : result.removed) || [];
        const infoUsers = Array.isArray(result) ? result : [...(result == null ? void 0 : result.users) || [], ...removed];
        void ensureAssignUserInfo(normalizeUsers(infoUsers)).then(() => {
          var _a;
          commitBulkAssignDelta(table, { add: added, remove: removed });
          (_a = table.clearRowCheck) == null ? void 0 : _a.call(table);
        });
      },
      tasks,
      { project }
    );
  }
  function bulkAssignToolbarItem() {
    return {
      id: "tree-gantt-bulk-assign",
      label: __("Assign"),
      title: __("Assign users to checked tasks (workload)"),
      iconSvg: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M8 9.5a3 3 0 1 0-3-3 3 3 0 0 0 3 3z"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M2.5 13.5c.6-2 2.4-3 5.5-3s4.9 1 5.5 3"/><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M12.5 3.5v4M10.5 5.5h4"/></svg>',
      disabled: ({ table }) => {
        var _a;
        const rows = ((_a = table == null ? void 0 : table.getCheckedRows) == null ? void 0 : _a.call(table)) || [];
        return !rows.some((r) => fieldCanEdit(r, "assign"));
      },
      onClick: ({ table }) => {
        const items = writableChecked(table);
        if (!items.length) {
          frappe.show_alert({
            message: __("No writable tasks selected"),
            indicator: "orange"
          });
          return;
        }
        const project = projectFromPage2();
        if (items.length === 1) {
          openSinglePwa(table, items[0], project);
          return;
        }
        if (typeof window.start_pwa_multi_dialog === "function") {
          openMultiPwa(table, items, project);
          return;
        }
        void openBulkAssignDialog({
          rows: items.map((it) => it.row),
          project,
          onConfirm: (users) => {
            void ensureAssignUserInfo(users).then(() => {
              var _a;
              const applied = commitBulkAssign(table, users);
              if (applied > 0) {
                (_a = table.clearRowCheck) == null ? void 0 : _a.call(table);
              }
            });
          }
        });
      }
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/dates/visibility.js
  var PLAN_FIELDS = ["custom_planned_start_date", "custom_planned_end_date"];
  var ACTUAL_FIELDS = ["act_start_date", "act_end_date"];
  function storageKey2(kind) {
    return `${frappe.user.name}:tree:dates:${kind}`;
  }
  function readFlag2(kind) {
    try {
      return localStorage.getItem(storageKey2(kind)) === "1";
    } catch (e) {
      return false;
    }
  }
  function writeFlag2(kind, on) {
    try {
      localStorage.setItem(storageKey2(kind), on ? "1" : "0");
    } catch (e) {
    }
  }
  function isPlanDatesVisible() {
    return readFlag2("plan");
  }
  function isActualDatesVisible() {
    return readFlag2("actual");
  }
  function setDateColumnsVisible(table, fields, visible) {
    var _a;
    const api = table == null ? void 0 : table.api;
    if (!api || !(fields == null ? void 0 : fields.length)) {
      return;
    }
    if (typeof api.setColumnsVisible === "function") {
      api.setColumnsVisible(fields, !!visible);
      return;
    }
    (_a = api.applyColumnState) == null ? void 0 : _a.call(api, {
      state: fields.map((colId) => ({ colId, hide: !visible }))
    });
  }
  function dateToggleItem({ id, kind, fields, label, title }) {
    return {
      type: "checkbox",
      id,
      label,
      title,
      checked: () => readFlag2(kind),
      onChange: ({ table, checked }) => {
        writeFlag2(kind, checked);
        setDateColumnsVisible(table, fields, checked);
      }
    };
  }
  function dateVisibilityToolbarItems() {
    return [
      dateToggleItem({
        id: "tree-gantt-dates-actual",
        kind: "actual",
        fields: ACTUAL_FIELDS,
        label: __("Fact"),
        title: __("Show fact start and completion dates")
      }),
      dateToggleItem({
        id: "tree-gantt-dates-plan",
        kind: "plan",
        fields: PLAN_FIELDS,
        label: __("Plan"),
        title: __("Show plan start and completion dates")
      })
    ];
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
    const d2 = new frappe.ui.Dialog({
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
              d2.hide();
              return;
            }
            if (message == null ? void 0 : message.success) {
              frappe.show_alert(
                __("Changes applied: {0}", [message.changed])
              );
              d2.hide();
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
        d2.hide();
      }
    });
    d2.show();
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

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/removed.js
  var removedIds = /* @__PURE__ */ new Set();
  function rememberRemovedIds(ids) {
    for (const id of ids || []) {
      if (id) {
        removedIds.add(String(id));
      }
    }
    return removedIds;
  }
  function forgetRemovedIds(ids) {
    for (const id of ids || []) {
      if (id) {
        removedIds.delete(String(id));
      }
    }
  }
  function clearRemovedIds() {
    removedIds.clear();
  }
  function getRemovedIdSet() {
    return removedIds;
  }
  function getRemovedIdList() {
    return [...removedIds];
  }
  function filterRemovedRows(rows, dropSet = removedIds) {
    if (!(dropSet == null ? void 0 : dropSet.size) || !(rows == null ? void 0 : rows.length)) {
      return rows || [];
    }
    return rows.filter((row) => !dropSet.has(String(row == null ? void 0 : row.id)));
  }
  function stripRemovedTree(rows, dropSet = removedIds) {
    var _a;
    if (!(dropSet == null ? void 0 : dropSet.size) || !(rows == null ? void 0 : rows.length)) {
      return rows || [];
    }
    const next = [];
    for (const row of rows) {
      if (dropSet.has(String(row == null ? void 0 : row.id))) {
        continue;
      }
      if (!((_a = row.children) == null ? void 0 : _a.length)) {
        next.push(row);
        continue;
      }
      const children = stripRemovedTree(row.children, dropSet);
      next.push(children === row.children ? row : __spreadProps(__spreadValues({}, row), { children }));
    }
    return next;
  }
  function pathTouchesRemoved(path, dropSet) {
    return String(path || "").split(":").some((part) => dropSet.has(part));
  }
  function pruneSourceByRemovedIds(rows, dropSet = removedIds) {
    var _a;
    if (!(dropSet == null ? void 0 : dropSet.size) || !Array.isArray(rows)) {
      return rows || [];
    }
    const next = [];
    for (const row of rows) {
      if (dropSet.has(String(row == null ? void 0 : row.id))) {
        continue;
      }
      if ((_a = row.children) == null ? void 0 : _a.length) {
        row.children = pruneSourceByRemovedIds(row.children, dropSet);
        if (!row.children.length) {
          row.hasChildren = false;
        }
      }
      next.push(row);
    }
    return next;
  }
  function dropRemovedTasks(table, ids) {
    var _a, _b, _c, _d, _e, _f;
    if (ids == null ? void 0 : ids.length) {
      rememberRemovedIds(ids);
    }
    const dropSet = getRemovedIdSet();
    if (!table || !dropSet.size) {
      return false;
    }
    if (Array.isArray(table.sourceData)) {
      const next = pruneSourceByRemovedIds(table.sourceData, dropSet);
      table.sourceData = next;
      if (table.options) {
        table.options.data = next;
      }
    }
    if ((_a = table.expandedIds) == null ? void 0 : _a.size) {
      for (const id of [...table.expandedIds]) {
        if (pathTouchesRemoved(id, dropSet)) {
          table.expandedIds.delete(id);
        }
      }
    }
    (_b = table.pruneSortBaseline) == null ? void 0 : _b.call(table, [...dropSet]);
    const toRemove = [];
    (_d = (_c = table.api) == null ? void 0 : _c.forEachNode) == null ? void 0 : _d.call(_c, (node) => {
      const data = node == null ? void 0 : node.data;
      if (!data) {
        return;
      }
      const biz = String(data.id || "");
      const path = String(data._rowId || "");
      if (dropSet.has(biz) || pathTouchesRemoved(path, dropSet)) {
        toRemove.push(data);
      }
    });
    if (toRemove.length) {
      table.api.applyTransaction({ remove: toRemove });
    }
    (_e = table.syncRowDataFromGrid) == null ? void 0 : _e.call(table);
    (_f = table.refreshAllTreeToggles) == null ? void 0 : _f.call(table);
    return true;
  }
  function installRemovedIdFilter(table) {
    if (!(table == null ? void 0 : table.setRowChildren) || table._removedIdFilter) {
      return;
    }
    table._removedIdFilter = true;
    const orig = table.setRowChildren.bind(table);
    table.setRowChildren = (rowId, children) => orig(rowId, filterRemovedRows(children));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/actions.js
  function projectFromPage3() {
    var _a, _b, _c;
    const page = getColumnsPage();
    return ((_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b)) || null;
  }
  function mutateTree(opts) {
    var _a;
    (_a = getOnTreeMutate()) == null ? void 0 : _a(opts);
  }
  function rowTreeId(row) {
    return (row == null ? void 0 : row._rowId) || (row == null ? void 0 : row.id) || null;
  }
  function taskFilterFromPage() {
    var _a, _b, _c;
    const page = getColumnsPage();
    const raw = (_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.task) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b);
    const ids = Array.isArray(raw) ? raw.filter(Boolean) : raw ? [raw] : [];
    return ids.length === 1 ? ids[0] : null;
  }
  function taskOpenTarget(row) {
    const taskId = row == null ? void 0 : row.id;
    if (!taskId)
      return null;
    const doc = row._doc || row;
    const type = doc.task_type || doc.type;
    if (type === "Issue" && doc.custom_linked_issue) {
      return { doctype: "Issue", name: doc.custom_linked_issue };
    }
    return { doctype: "Task", name: taskId };
  }
  function openTaskForm(taskId, row) {
    const target = taskOpenTarget(row || { id: taskId });
    if (!target)
      return;
    frappe.set_route("Form", target.doctype, target.name);
  }
  function renameTask(taskId) {
    if (!taskId)
      return;
    frappe.model.rename_doc("Task", taskId, () => mutateTree());
  }
  function deleteTask(taskId) {
    if (!taskId)
      return;
    frappe.model.delete_doc("Task", taskId, () => {
      var _a;
      rememberRemovedIds([taskId]);
      const table = getTreeTable();
      if (table) {
        dropRemovedTasks(table, [taskId]);
        (_a = getOnGanttRefresh()) == null ? void 0 : _a();
      }
      mutateTree({ removeIds: [taskId] });
    });
  }
  function openRootTaskQuickEntry({ project, parentTask }) {
    frappe.model.with_doctype("Task", () => {
      const doc = frappe.model.get_new_doc("Task");
      doc.project = project;
      doc.is_group = 0;
      if (parentTask) {
        doc.parent_task = parentTask;
      }
      frappe.ui.form.make_quick_entry("Task", () => mutateTree(), null, doc);
    });
  }
  function openNewTaskDialog({ parentId, project, expandRowId }) {
    const d2 = new frappe.ui.Dialog({
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
        d2.hide();
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
              mutateTree({
                expandRowIds: expandRowId ? [expandRowId] : void 0
              });
            }
          },
          always() {
            frappe.dom.unfreeze();
          }
        });
      }
    });
    d2.set_value("is_group", 0);
    d2.show();
  }
  async function addChildTask(row) {
    const parentId = row == null ? void 0 : row.id;
    const project = projectFromPage3();
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
    openNewTaskDialog({
      parentId,
      project,
      expandRowId: rowTreeId(row)
    });
  }
  function addRootTask() {
    const project = projectFromPage3();
    if (!project) {
      frappe.show_alert({ message: __("Select a project"), indicator: "orange" });
      return;
    }
    if (!frappe.model.can_create("Task"))
      frappe.throw(__("Not permitted"));
    openRootTaskQuickEntry({
      project,
      parentTask: taskFilterFromPage() || null
    });
  }
  function addRootTaskToolbarItem() {
    return {
      id: "tree-gantt-add-root",
      label: __("Add Child"),
      title: __("Add Child"),
      iconSvg: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 3.2h8.5M2 6h8.5M2 9h4.2M2 12h4.2"/><path d="M11.2 9v5M8.7 11.5h5"/></g></svg>',
      disabled: ({ table }) => {
        var _a, _b;
        if (!frappe.model.can_create("Task") || !projectFromPage3()) {
          return true;
        }
        const rows = ((_a = table == null ? void 0 : table.getCheckedRows) == null ? void 0 : _a.call(table)) || [];
        if (rows.length > 1) {
          return true;
        }
        if (rows.length === 1 && !((_b = rows[0]) == null ? void 0 : _b.can_write)) {
          return true;
        }
        return false;
      },
      onClick: ({ table }) => {
        var _a;
        const rows = ((_a = table == null ? void 0 : table.getCheckedRows) == null ? void 0 : _a.call(table)) || [];
        if (rows.length === 1) {
          void addChildTask(rows[0]);
          return;
        }
        addRootTask();
      }
    };
  }
  async function addMultipleTasks(row) {
    const parentId = row == null ? void 0 : row.id;
    if (!parentId)
      return;
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
              mutateTree({
                expandRowIds: [rowTreeId(row)].filter(Boolean)
              });
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
    const tags = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
    return limit == null ? tags : tags.slice(0, limit);
  }
  function formatDate(value) {
    if (!value) {
      return "";
    }
    return frappe.format(value, { fieldtype: "Date" });
  }
  function formatPercent(value) {
    if (value == null || value === "") {
      return "";
    }
    const n2 = Number(value);
    if (Number.isNaN(n2)) {
      return "";
    }
    return `${Math.round(n2)}%`;
  }
  function searchableTranslated(value) {
    const raw = value ? String(value) : "";
    if (!raw) {
      return "";
    }
    const label = __(raw);
    return label && label !== raw ? `${raw} ${label}` : raw;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/widths.js
  var TREE_COL_WIDTH = {
    assign: 100,
    relations: 180,
    plan_fact: 35,
    status: 130,
    priority: 110,
    custom_planned_start_date: 85,
    custom_planned_end_date: 105,
    exp_start_date: 85,
    exp_end_date: 105,
    act_start_date: 85,
    act_end_date: 105,
    expected_time: 87,
    progress: 96,
    custom_include: 35,
    type: 85,
    user_tags: 120
  };
  function fixedCol(width) {
    return {
      width,
      minWidth: 32
    };
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
      "list-assignments tree-gantt-assign-avatars avatar-group overlap"
    );
    const todoOnly = todoOnlySet(row);
    const shown = users.slice(0, 3);
    for (const user of shown) {
      const fullName = ((_b = (_a = frappe.user) == null ? void 0 : _a.full_name) == null ? void 0 : _b.call(_a, user)) || user;
      const isTodoOnly = todoOnly.has(user);
      const tmp = document.createElement("div");
      tmp.innerHTML = frappe.avatar(user, "avatar-small");
      const avatarNode = tmp.firstElementChild;
      if (!avatarNode) {
        continue;
      }
      avatarNode.classList.add(
        "tree-gantt-assign-avatar",
        isTodoOnly ? "tree-gantt-assign-avatar--todo" : "tree-gantt-assign-avatar--pwa"
      );
      const tip = isTodoOnly ? __("{0}: assigned via ToDo only (no workload)", [fullName]) : fullName;
      avatarNode.setAttribute("aria-label", tip);
      avatarNode.title = tip;
      const frame = avatarNode.querySelector(".avatar-frame");
      if (frame) {
        frame.title = tip;
      }
      list.appendChild(avatarNode);
    }
    if (users.length > 3) {
      const more = el("span", "avatar-group-more text-muted");
      more.textContent = `+${users.length - 3}`;
      list.appendChild(more);
    }
    return list;
  }
  function commitAssignChange(params, row, nextUsers, oldUsers) {
    var _a, _b, _c, _d;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = normalizeUsers(
      oldUsers !== void 0 ? oldUsers : row == null ? void 0 : row.assign
    );
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
    var _a, _b, _c, _d;
    const newValue = normalizeUsers(users);
    await ensureAssignUserInfo(newValue);
    const oldValue = normalizeUsers(row == null ? void 0 : row.assign);
    stampAssignMetaAfterPwa(row, newValue);
    if (((_a = params.node) == null ? void 0 : _a.data) && params.node.data !== row) {
      stampAssignMetaAfterPwa(params.node.data, newValue);
    }
    const ok = commitAssignChange(params, row, newValue, oldValue);
    if (!ok) {
      (_c = (_b = params.api) == null ? void 0 : _b.refreshCells) == null ? void 0 : _c.call(_b, {
        rowNodes: params.node ? [params.node] : void 0,
        columns: ["assign"],
        force: true
      });
    }
    if (ok) {
      (_d = getOnAssignSaved) == null ? void 0 : _d(row.id, newValue);
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
  function openAssignForTask(table, taskId) {
    if (!(table == null ? void 0 : table.api) || !taskId) {
      return;
    }
    const id = String(taskId);
    let node = null;
    table.api.forEachNode((n2) => {
      if (!node && (n2 == null ? void 0 : n2.data) && String(n2.data.id) === id) {
        node = n2;
      }
    });
    if (!(node == null ? void 0 : node.data)) {
      return;
    }
    openAssign(node.data, {
      node,
      api: table.api,
      context: { dinextTable: table },
      column: { getColId: () => "assign" }
    });
  }
  function wireAssignActions(wrap, params, row, avatarsEl) {
    if (!fieldCanEdit(row, "assign")) {
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
      edit: (row) => fieldCanEdit(row, "assign"),
      suppressClickEdit: true,
      sortable: false,
      cellDataType: false,
      cellRenderer: renderAssign,
      valueFormatter: assignValueFormatter,
      valueParser: assignValueParser,
      cellClass: "dinext-table-cell--align-center",
      filterValueGetter: (row) => {
        var _a, _b;
        const users = Array.isArray(row == null ? void 0 : row.assign) ? row.assign : [];
        const parts = [];
        for (const user of users) {
          if (!user) {
            continue;
          }
          parts.push(String(user));
          const fullName = (_b = (_a = frappe.user) == null ? void 0 : _a.full_name) == null ? void 0 : _b.call(_a, user);
          if (fullName && fullName !== user) {
            parts.push(fullName);
          }
        }
        return parts.join(" ");
      }
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/dates/frappe-date-editor.js
  function toIso2(value) {
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
    if (s.includes("T") && /^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }
    const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return s;
    }
    return null;
  }
  var FrappeDateCellEditor = class {
    init(params) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
      this.params = params;
      this._stopped = false;
      this._parsed = null;
      this._value = toIso2(params.value);
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
      (_i = (_h = this.control.$input) == null ? void 0 : _h.addClass) == null ? void 0 : _i.call(
        _h,
        "dinext-table-date-editor tree-gantt-frappe-date-input"
      );
      this._bindDatepicker();
      this.control.update_datepicker_position = () => this._placeDatepicker();
      (_k = (_j = this.control.$input) == null ? void 0 : _j.on) == null ? void 0 : _k.call(_j, "change", () => {
        this._parsed = null;
        const parsed = this._readValidated();
        if (parsed.invalid) {
          this.stopEditing(true);
          return;
        }
        this._value = parsed.iso;
        this.stopEditing(false);
      });
      (_m = (_l = this.control.$input) == null ? void 0 : _l.on) == null ? void 0 : _m.call(_l, "keydown", (ev) => {
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
      this._adoptDatepicker();
    }
    _adoptDatepicker() {
      var _a, _b, _c, _d, _e;
      const node = (_c = (_b = (_a = this.control) == null ? void 0 : _a.datepicker) == null ? void 0 : _b.$datepicker) == null ? void 0 : _c[0];
      if (!node || typeof (DinextTable == null ? void 0 : DinextTable.adoptOverlay) !== "function") {
        return;
      }
      DinextTable.adoptOverlay(node, { anchor: (_e = (_d = this.control) == null ? void 0 : _d.$input) == null ? void 0 : _e[0] });
    }
    _placeDatepicker() {
      var _a, _b, _c, _d, _e, _f;
      const dp = (_a = this.control) == null ? void 0 : _a.datepicker;
      const node = (_b = dp == null ? void 0 : dp.$datepicker) == null ? void 0 : _b[0];
      const input = (_d = (_c = this.control) == null ? void 0 : _c.$input) == null ? void 0 : _d[0];
      if (!dp || !node || !input) {
        return;
      }
      const inputRect = input.getBoundingClientRect();
      const pickerH = node.offsetHeight || 260;
      const pickerW = node.offsetWidth || 250;
      const pad = 8;
      const gap = 4;
      const spaceBelow = window.innerHeight - inputRect.bottom - pad;
      const spaceAbove = inputRect.top - pad;
      const openAbove = spaceBelow < pickerH && spaceAbove > spaceBelow;
      const position = openAbove ? "top left" : "bottom left";
      if (((_e = dp.opts) == null ? void 0 : _e.position) !== position) {
        (_f = dp.update) == null ? void 0 : _f.call(dp, "position", position);
      }
      let left = inputRect.left;
      if (left + pickerW > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - pickerW - pad);
      }
      const measuredH = node.offsetHeight || pickerH;
      const rawTop = openAbove ? inputRect.top - measuredH - gap : inputRect.bottom + gap;
      const maxTop = Math.max(pad, window.innerHeight - measuredH - pad);
      node.style.position = "fixed";
      node.style.left = `${Math.max(pad, left)}px`;
      node.style.top = `${Math.min(maxTop, Math.max(pad, rawTop))}px`;
      node.style.right = "auto";
    }
    getGui() {
      return this.host;
    }
    afterGuiAttached() {
      var _a, _b, _c, _d, _e, _f;
      (_c = (_b = (_a = this.control) == null ? void 0 : _a.$input) == null ? void 0 : _b.trigger) == null ? void 0 : _c.call(_b, "focus");
      this._bindDatepicker();
      (_f = (_e = (_d = this.control) == null ? void 0 : _d.datepicker) == null ? void 0 : _e.show) == null ? void 0 : _f.call(_e);
      this._adoptDatepicker();
      this._placeDatepicker();
      requestAnimationFrame(() => {
        if (this._stopped || !this.control) {
          return;
        }
        this._placeDatepicker();
      });
    }
    _readValidated() {
      var _a, _b, _c, _d;
      if (this._parsed) {
        return this._parsed;
      }
      const raw = (_b = (_a = this.control) == null ? void 0 : _a.get_value) == null ? void 0 : _b.call(_a);
      if (raw == null || raw === "") {
        this._parsed = { iso: null, invalid: false };
        return this._parsed;
      }
      const validated = (_d = (_c = this.control).validate) == null ? void 0 : _d.call(_c, raw);
      if (validated === "" || validated == null) {
        this._parsed = { iso: null, invalid: true };
        return this._parsed;
      }
      const iso = toIso2(validated);
      this._parsed = { iso, invalid: !iso };
      return this._parsed;
    }
    getValue() {
      var _a, _b, _c, _d;
      const parsed = this._readValidated();
      if (parsed.invalid) {
        return (_b = (_a = this.params) == null ? void 0 : _a.value) != null ? _b : null;
      }
      if (parsed.iso !== void 0) {
        return parsed.iso;
      }
      if (this._value !== void 0) {
        return this._value;
      }
      return toIso2((_d = (_c = this.control) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c));
    }
    isCancelAfterEnd() {
      return this._readValidated().invalid;
    }
    stopEditing(cancel = false) {
      var _a, _b;
      if (this._stopped) {
        return;
      }
      this._stopped = true;
      if (!cancel) {
        this._parsed = null;
        const parsed = this._readValidated();
        if (!parsed.invalid) {
          this._value = parsed.iso;
        }
      }
      (_b = (_a = this.params) == null ? void 0 : _a.stopEditing) == null ? void 0 : _b.call(_a, cancel);
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
  function dateColumnBase(field, headerName, opts = {}) {
    const {
      edit = "perm",
      tooltipValueGetter,
      hide = false,
      conflicts = false
    } = opts;
    const col = __spreadProps(__spreadValues({
      field,
      headerName
    }, fixedCol(TREE_COL_WIDTH[field] || TREE_COL_WIDTH.exp_start_date)), {
      type: "date",
      cellClass: "dinext-table-cell--align-center",
      wrapHeaderText: true,
      headerClass: "tree-gantt-header--wrap",
      filterValueGetter: (row) => formatDate(row == null ? void 0 : row[field]) || (row == null ? void 0 : row[field]) || "",
      hide: !!hide
    });
    if (edit === false) {
      col.edit = false;
      return col;
    }
    col.edit = (row) => fieldCanEdit(row, field);
    col.cellEditor = FrappeDateCellEditor;
    if (conflicts) {
      col.cellClassRules = dateConflictClassRules();
    }
    if (tooltipValueGetter) {
      col.tooltipValueGetter = tooltipValueGetter;
    }
    return col;
  }
  function plannedStartColumn() {
    return dateColumnBase("custom_planned_start_date", __("Plan Start"), {
      hide: !isPlanDatesVisible()
    });
  }
  function plannedEndColumn() {
    return dateColumnBase("custom_planned_end_date", __("Plan Completion"), {
      hide: !isPlanDatesVisible()
    });
  }
  function expStartColumn() {
    return dateColumnBase("exp_start_date", __("Forecast Start"), {
      conflicts: true,
      tooltipValueGetter: startDateConflictTooltip
    });
  }
  function expEndColumn() {
    return dateColumnBase("exp_end_date", __("Forecast Completion"), {
      conflicts: true,
      tooltipValueGetter: endDateConflictTooltip
    });
  }
  function actualStartColumn() {
    return dateColumnBase("act_start_date", __("Fact Start"), {
      edit: false,
      hide: !isActualDatesVisible()
    });
  }
  function actualEndColumn() {
    return dateColumnBase("act_end_date", __("Fact Completion"), {
      edit: false,
      hide: !isActualDatesVisible()
    });
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
      edit: false,
      filterValueGetter: (row) => {
        var _a, _b;
        return (_b = (_a = row == null ? void 0 : row.expected_time) != null ? _a : row == null ? void 0 : row.duration) != null ? _b : "";
      }
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
      edit: (row) => fieldCanEdit(row, "custom_include"),
      filterValueGetter: (row) => {
        const on = !!(row == null ? void 0 : row.custom_include);
        const flag = on ? "1" : "0";
        const label = on ? __("Yes") : __("No");
        return `${flag} ${label}`;
      }
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/plan_fact/dialog.js
  function showForecastColumn() {
    var _a;
    return Boolean((_a = frappe.boot) == null ? void 0 : _a.dinext_timesheet_show_forecast);
  }
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
    const showForecast = showForecastColumn();
    const fields = [
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
      }
    ];
    if (showForecast) {
      fields.push({
        label: __("Forecast"),
        fieldname: "forecast_hours",
        fieldtype: "Float",
        precision: 1,
        read_only: 1,
        in_list_view: 1,
        columns: 1
      });
    }
    fields.push(
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
        columns: showForecast ? 3 : 4
      }
    );
    const d2 = new frappe.ui.Dialog({
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
          fields,
          data: taskData
        }
      ],
      size: "large",
      primary_action_label: __("Done"),
      primary_action() {
        var _a, _b;
        d2.hide();
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
      d2.$wrapper.find(".modal-body").prepend(warning);
    }
    d2.show();
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
      cellClass: "dinext-table-cell--align-center",
      filterable: false
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/select-edit.js
  function cachedTaskDoc(taskId) {
    var _a, _b;
    if (!taskId) {
      return null;
    }
    try {
      const doc = (_a = frappe.get_doc) == null ? void 0 : _a.call(frappe, "Task", taskId);
      if (doc) {
        return doc;
      }
    } catch (e) {
    }
    return ((_b = locals == null ? void 0 : locals.Task) == null ? void 0 : _b[taskId]) || null;
  }
  function openNativeSelect($input) {
    var _a, _b;
    const el3 = ((_a = $input == null ? void 0 : $input.get) == null ? void 0 : _a.call($input, 0)) || $input;
    if (!el3) {
      return;
    }
    (_b = el3.focus) == null ? void 0 : _b.call(el3);
    if (typeof el3.showPicker === "function") {
      try {
        el3.showPicker();
      } catch (e) {
      }
    }
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/frappe-select-editor.js
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
  function fieldIsWritable(doc, taskId, fieldname) {
    var _a, _b;
    if ((_b = (_a = frappe.workflow) == null ? void 0 : _a.is_read_only) == null ? void 0 : _b.call(_a, "Task", taskId))
      return false;
    const df = frappe.meta.get_field("Task", fieldname, taskId);
    if (!df)
      return true;
    let status = frappe.perm.get_field_display_status(df, doc, null, false);
    if (status === "Write" && df.read_only_depends_on && evaluateReadOnlyDependsOn(df.read_only_depends_on, doc)) {
      status = "Read";
    }
    return status === "Write";
  }
  function resolveValues(params) {
    var _a;
    const cep = (_a = params == null ? void 0 : params.colDef) == null ? void 0 : _a.cellEditorParams;
    const spec = typeof cep === "function" ? cep(params) : cep;
    let values = spec == null ? void 0 : spec.values;
    if (typeof values === "function") {
      values = values(params);
    }
    if (!Array.isArray(values)) {
      return [];
    }
    return values.map((v) => String(v).trim()).filter(Boolean);
  }
  function parseKey(raw, values) {
    if (typeof (DinextTable == null ? void 0 : DinextTable.parseSelectValue) === "function") {
      return DinextTable.parseSelectValue(raw, values);
    }
    if (raw == null || raw === "") {
      return null;
    }
    const s = String(raw).trim();
    return values.includes(s) ? s : null;
  }
  var FrappeSelectCellEditor = class {
    init(params) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      this.params = params;
      this._stopped = false;
      this._cancel = false;
      this._values = resolveValues(params);
      this._field = ((_a = params.colDef) == null ? void 0 : _a.field) || "select";
      this.host = document.createElement("div");
      this.host.className = "tree-gantt-frappe-select-editor";
      const initial = params.value == null ? "" : String(params.value);
      this.control = frappe.ui.form.make_control({
        parent: $(this.host),
        doctype: "Task",
        docname: (_b = params.data) == null ? void 0 : _b.id,
        only_input: true,
        df: {
          fieldname: this._field,
          fieldtype: "Select",
          label: "",
          options: this._values.join("\n")
        },
        value: initial,
        render_input: true
      });
      (_d = (_c = this.control.$wrapper) == null ? void 0 : _c.addClass) == null ? void 0 : _d.call(_c, "tree-gantt-frappe-select-control");
      (_h = (_g = (_f = (_e = this.control.$wrapper) == null ? void 0 : _e.find) == null ? void 0 : _f.call(_e, ".control-label, .help-box, .clearfix")) == null ? void 0 : _g.hide) == null ? void 0 : _h.call(_g);
      (_j = (_i = this.control.$input) == null ? void 0 : _i.addClass) == null ? void 0 : _j.call(
        _i,
        "dinext-table-select-editor tree-gantt-frappe-select-input"
      );
      (_l = (_k = this.control.$input) == null ? void 0 : _k.on) == null ? void 0 : _l.call(_k, "change", () => {
        this.stopEditing(false);
      });
      (_n = (_m = this.control.$input) == null ? void 0 : _m.on) == null ? void 0 : _n.call(_m, "keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          this.stopEditing(true);
        }
      });
    }
    getGui() {
      return this.host;
    }
    afterGuiAttached() {
      var _a;
      openNativeSelect((_a = this.control) == null ? void 0 : _a.$input);
      void this._checkWritable();
    }
    async _checkWritable() {
      var _a, _b;
      const taskId = (_b = (_a = this.params) == null ? void 0 : _a.data) == null ? void 0 : _b.id;
      if (!taskId || this._stopped) {
        return;
      }
      let doc = cachedTaskDoc(taskId);
      if (!doc) {
        try {
          doc = await frappe.model.with_doc("Task", taskId);
        } catch (e) {
          console.error("[task_tree_gantt] select with_doc", e);
          return;
        }
      }
      if (this._stopped) {
        return;
      }
      if (doc && !fieldIsWritable(doc, taskId, this._field)) {
        this.stopEditing(true);
      }
    }
    getValue() {
      var _a, _b, _c, _d;
      if (this._cancel) {
        return (_b = (_a = this.params) == null ? void 0 : _a.value) != null ? _b : null;
      }
      return parseKey((_d = (_c = this.control) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c), this._values);
    }
    isCancelAfterEnd() {
      return this._cancel;
    }
    stopEditing(cancel = false) {
      var _a, _b;
      if (this._stopped) {
        return;
      }
      this._stopped = true;
      this._cancel = !!cancel;
      (_b = (_a = this.params) == null ? void 0 : _a.stopEditing) == null ? void 0 : _b.call(_a, cancel);
    }
    destroy() {
      this.control = null;
      this.host = null;
      this.params = null;
      this._values = null;
    }
  };

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
  function renderPriority(params) {
    const row = params.data || {};
    const value = row.priority || params.value || "";
    const wrap = el("div", "tree-gantt-priority-cell");
    const label = priorityLabel(value);
    wrap.textContent = label;
    wrap.title = label;
    wrap.dataset.priority = value;
    if (fieldCanEdit(row, "priority")) {
      wrap.classList.add("tree-gantt-priority--editable");
    }
    return wrap;
  }
  function priorityColumn() {
    return __spreadProps(__spreadValues({
      field: "priority",
      headerName: __("Priority")
    }, fixedCol(TREE_COL_WIDTH.priority)), {
      type: "select",
      edit: (row) => fieldCanEdit(row, "priority"),
      cellEditor: FrappeSelectCellEditor,
      cellEditorParams: {
        values: (params) => getPriorityOptions(params.data)
      },
      cellRenderer: renderPriority,
      valueFormatter: (params) => priorityLabel(params.value),
      cellClass: priorityCellClass,
      cellClassRules: priorityCellClassRules(),
      filterValueGetter: (row) => searchableTranslated(row == null ? void 0 : row.priority)
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
      cellClass: "dinext-table-cell--align-center",
      filterKind: "number",
      filterValueGetter: (row) => {
        var _a;
        return (_a = row == null ? void 0 : row.progress) != null ? _a : 0;
      }
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/relations/popover.js
  var POPOVER_SCROLL_MAX_PX = 500;
  var activePopover = null;
  function closeActivePopover() {
    if (activePopover) {
      activePopover.destroy();
      activePopover = null;
    }
  }
  function getPopoverMountParent() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || document.body;
  }
  function placeNearAnchor(panel, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const pad = 8;
    const w = panel.offsetWidth || 420;
    const h = panel.offsetHeight || 200;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + w > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - w - pad);
    }
    if (top + h > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - h - 4);
    }
    panel.style.left = `${Math.max(pad, left)}px`;
    panel.style.top = `${Math.max(pad, top)}px`;
  }
  function openRelationsPopover({
    anchorEl,
    taskId,
    project = null,
    relations = [],
    onSave
  }) {
    closeActivePopover();
    if (!anchorEl || !taskId) {
      return;
    }
    const typeOptions = getRelationTypeOptions();
    const draft = normalizeRelations(relations).map((r) => __spreadValues({}, r));
    const rowCtrls = [];
    const panel = document.createElement("div");
    panel.className = "tree-gantt-relations-popover";
    panel.setAttribute("role", "dialog");
    const rowsWrap = document.createElement("div");
    rowsWrap.className = "tree-gantt-relations-popover__rows";
    const table = document.createElement("table");
    table.className = "tree-gantt-relations-popover__table";
    table.innerHTML = `<thead><tr>
		<th>${__("Related Task")}</th>
		<th>${__("Link type")}</th>
		<th></th>
	</tr></thead>`;
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    rowsWrap.appendChild(table);
    panel.appendChild(rowsWrap);
    const footer = document.createElement("div");
    footer.className = "tree-gantt-relations-popover__footer";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-xs btn-default";
    addBtn.textContent = __("Add row");
    const spacer = document.createElement("span");
    spacer.className = "tree-gantt-relations-popover__spacer";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-xs btn-primary";
    saveBtn.textContent = __("Save");
    footer.append(addBtn, spacer, saveBtn);
    panel.appendChild(footer);
    const mountParent = getPopoverMountParent();
    mountParent.appendChild(panel);
    function updateScrollMode() {
      rowsWrap.classList.remove("tree-gantt-relations-popover__rows--scrollable");
      rowsWrap.style.maxHeight = "";
      void panel.offsetHeight;
      if (panel.offsetHeight > POPOVER_SCROLL_MAX_PX) {
        const chrome = footer.offsetHeight + 28;
        rowsWrap.style.maxHeight = `${Math.max(
          120,
          POPOVER_SCROLL_MAX_PX - chrome
        )}px`;
        rowsWrap.classList.add("tree-gantt-relations-popover__rows--scrollable");
      }
      placeNearAnchor(panel, anchorEl);
    }
    function collectDraft() {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      for (const row of rowCtrls) {
        const predecessor = String(((_b = (_a = row.predCtrl) == null ? void 0 : _a.get_value) == null ? void 0 : _b.call(_a)) || "").trim();
        if (!predecessor) {
          throw new Error(__("Predecessor is required"));
        }
        const type = String(((_d = (_c = row.typeCtrl) == null ? void 0 : _c.get_value) == null ? void 0 : _d.call(_c)) || "").trim() || DEFAULT_RELATION_TYPE;
        const key = relationKey(predecessor, type);
        if (seen.has(key)) {
          throw new Error(__("Duplicate relation exists"));
        }
        seen.add(key);
        if (predecessor === taskId) {
          throw new Error(__("Predecessor can't be same as successor"));
        }
        const prevExact = draft.find(
          (d2) => relationKey(d2.predecessor, d2.type) === key
        );
        const prevPred = draft.find((d2) => d2.predecessor === predecessor);
        let subject = (prevExact == null ? void 0 : prevExact.predecessor_subject) || (prevPred == null ? void 0 : prevPred.predecessor_subject) || "";
        try {
          subject = ((_f = (_e = frappe.utils).get_link_title) == null ? void 0 : _f.call(_e, "Task", predecessor)) || subject;
        } catch (e) {
        }
        if (subject === predecessor) {
          subject = (prevExact == null ? void 0 : prevExact.predecessor_subject) || (prevPred == null ? void 0 : prevPred.predecessor_subject) || "";
        }
        out.push({
          predecessor,
          predecessor_subject: subject || void 0,
          type,
          buffer_days: (_h = (_g = prevExact == null ? void 0 : prevExact.buffer_days) != null ? _g : prevPred == null ? void 0 : prevPred.buffer_days) != null ? _h : 0,
          is_active: 1,
          name: prevExact == null ? void 0 : prevExact.name,
          project: (prevExact == null ? void 0 : prevExact.project) || (prevPred == null ? void 0 : prevPred.project) || project || void 0
        });
      }
      return out;
    }
    function removeRow(entry) {
      var _a, _b, _c, _d, _e, _f;
      const idx = rowCtrls.indexOf(entry);
      if (idx < 0) {
        return;
      }
      rowCtrls.splice(idx, 1);
      entry.el.remove();
      try {
        (_c = (_b = (_a = entry.predCtrl) == null ? void 0 : _a.$wrapper) == null ? void 0 : _b.remove) == null ? void 0 : _c.call(_b);
      } catch (e) {
      }
      try {
        (_f = (_e = (_d = entry.typeCtrl) == null ? void 0 : _d.$wrapper) == null ? void 0 : _e.remove) == null ? void 0 : _f.call(_e);
      } catch (e) {
      }
      updateScrollMode();
    }
    function addRow(initial = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
      const tr = document.createElement("tr");
      const tdPred = document.createElement("td");
      const tdType = document.createElement("td");
      const tdDel = document.createElement("td");
      tdDel.className = "tree-gantt-relations-popover__del";
      const predHost = document.createElement("div");
      predHost.className = "tree-gantt-relations-popover__ctrl";
      tdPred.appendChild(predHost);
      const typeHost = document.createElement("div");
      typeHost.className = "tree-gantt-relations-popover__ctrl";
      tdType.appendChild(typeHost);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-xs btn-default";
      delBtn.title = __("Delete");
      delBtn.innerHTML = `<i class="fa fa-trash"></i>`;
      tdDel.appendChild(delBtn);
      tr.append(tdPred, tdType, tdDel);
      tbody.appendChild(tr);
      const predCtrl = frappe.ui.form.make_control({
        parent: $(predHost),
        only_input: true,
        df: {
          fieldname: "predecessor",
          fieldtype: "Link",
          options: "Task",
          label: "",
          get_query: () => {
            const filters = [["Task", "name", "!=", taskId]];
            if (project) {
              filters.push(["Task", "project", "=", project]);
            }
            return { filters };
          }
        },
        render_input: true
      });
      (_b = (_a = predCtrl.$wrapper) == null ? void 0 : _a.addClass) == null ? void 0 : _b.call(_a, "tree-gantt-relations-popover-control");
      (_f = (_e = (_d = (_c = predCtrl.$wrapper) == null ? void 0 : _c.find) == null ? void 0 : _d.call(_c, ".control-label, .help-box, .clearfix")) == null ? void 0 : _e.hide) == null ? void 0 : _f.call(_e);
      if (initial.predecessor) {
        (_g = predCtrl.set_value) == null ? void 0 : _g.call(predCtrl, initial.predecessor);
      }
      const typeCtrl = frappe.ui.form.make_control({
        parent: $(typeHost),
        only_input: true,
        df: {
          fieldname: "type",
          fieldtype: "Select",
          label: "",
          options: typeOptions.join("\n")
        },
        render_input: true
      });
      (_i = (_h = typeCtrl.$wrapper) == null ? void 0 : _h.addClass) == null ? void 0 : _i.call(_h, "tree-gantt-relations-popover-control");
      (_m = (_l = (_k = (_j = typeCtrl.$wrapper) == null ? void 0 : _j.find) == null ? void 0 : _k.call(_j, ".control-label, .help-box, .clearfix")) == null ? void 0 : _l.hide) == null ? void 0 : _m.call(_l);
      (_n = typeCtrl.set_value) == null ? void 0 : _n.call(typeCtrl, initial.type || DEFAULT_RELATION_TYPE);
      const entry = { el: tr, predCtrl, typeCtrl };
      delBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        removeRow(entry);
      });
      rowCtrls.push(entry);
      updateScrollMode();
    }
    if (draft.length) {
      for (const r of draft) {
        addRow(r);
      }
    } else {
      addRow({});
    }
    function destroy() {
      var _a, _b, _c, _d, _e, _f;
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      for (const row of rowCtrls) {
        try {
          (_c = (_b = (_a = row.predCtrl) == null ? void 0 : _a.$wrapper) == null ? void 0 : _b.remove) == null ? void 0 : _c.call(_b);
        } catch (e) {
        }
        try {
          (_f = (_e = (_d = row.typeCtrl) == null ? void 0 : _d.$wrapper) == null ? void 0 : _e.remove) == null ? void 0 : _f.call(_e);
        } catch (e) {
        }
      }
      rowCtrls.length = 0;
      panel.remove();
      if (activePopover === api) {
        activePopover = null;
      }
    }
    function onDocDown(ev) {
      var _a, _b, _c, _d;
      const t = ev.target;
      if (panel.contains(t) || ((_a = t == null ? void 0 : t.closest) == null ? void 0 : _a.call(t, ".awesomplete > ul")) || ((_b = t == null ? void 0 : t.closest) == null ? void 0 : _b.call(t, '.awesomplete > [role="listbox"]')) || ((_c = t == null ? void 0 : t.closest) == null ? void 0 : _c.call(t, ".datepicker")) || ((_d = t == null ? void 0 : t.closest) == null ? void 0 : _d.call(t, ".modal"))) {
        return;
      }
      destroy();
    }
    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        destroy();
      }
    }
    function onReposition() {
      placeNearAnchor(panel, anchorEl);
    }
    addBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      addRow({});
    });
    saveBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      try {
        const next = collectDraft();
        onSave == null ? void 0 : onSave(next);
        destroy();
      } catch (e) {
        frappe.show_alert({
          message: e.message || __("Invalid relation"),
          indicator: "orange"
        });
      }
    });
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    updateScrollMode();
    const api = { destroy };
    activePopover = api;
    return api;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/relations/index.js
  function formatRelationLine(rel) {
    const label = predecessorLabel(rel);
    if (!label) {
      return "";
    }
    return `${label}[${shortRelationType(rel.type)}]`;
  }
  function relsForParams(params) {
    return relationsFromRow(params.data, params.value, params.api);
  }
  function relationsValueFormatter(params) {
    const rels = relsForParams(params);
    if (!rels.length) {
      return "";
    }
    const first = formatRelationLine(rels[0]);
    if (rels.length === 1) {
      return first;
    }
    return `${first} +${rels.length - 1}`;
  }
  function relationsValueParser(params) {
    const raw = params.newValue;
    if (Array.isArray(raw) && raw.length && typeof raw[0] === "object") {
      return normalizeRelations(raw);
    }
    return normalizeRelations(params.oldValue);
  }
  function commitRelationsChange(params, row, nextRelations) {
    var _a, _b, _c, _d, _e;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = relationsFromRow(row, null, params.api);
    const newValue = withResolvedSubjects(
      normalizeRelations(nextRelations),
      params.api
    );
    if (sameRelations(oldValue, newValue)) {
      return false;
    }
    if (!params.node || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      console.error("[task_tree_gantt] relations commit: table/node missing");
      return false;
    }
    const source = typeof ((_b = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _b.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
    stampRelationsOnRow(row, newValue);
    if (((_c = params.node) == null ? void 0 : _c.data) && params.node.data !== row) {
      stampRelationsOnRow(params.node.data, newValue);
    }
    const { applied } = table.commitCellChanges({
      source,
      changes: [
        {
          node: params.node,
          field: "relations",
          oldValue,
          newValue,
          rowIndex: params.node.rowIndex,
          colId: ((_e = (_d = params.column) == null ? void 0 : _d.getColId) == null ? void 0 : _e.call(_d)) || "relations"
        }
      ]
    });
    return applied > 0;
  }
  function cancelRelationsFocus() {
    var _a;
    (_a = getOnRelationsFocus()) == null ? void 0 : _a({ cancel: true });
  }
  function openEditor(row, params, wrap) {
    var _a, _b, _c;
    cancelRelationsFocus();
    const page = getColumnsPage();
    const project = ((_c = (_b = (_a = page == null ? void 0 : page.fields_dict) == null ? void 0 : _a.project) == null ? void 0 : _b.get_value) == null ? void 0 : _c.call(_b)) || null;
    openRelationsPopover({
      anchorEl: wrap,
      taskId: row.id,
      project,
      relations: relationsFromRow(row, params.value, params.api),
      onSave: (next) => {
        void (async () => {
          var _a2, _b2;
          const enriched = await enrichPredecessorSubjects(next);
          const ok = commitRelationsChange(params, row, enriched);
          if (ok) {
            (_b2 = (_a2 = params.api) == null ? void 0 : _a2.refreshCells) == null ? void 0 : _b2.call(_a2, {
              rowNodes: params.node ? [params.node] : void 0,
              columns: ["relations"],
              force: true
            });
          }
        })();
      }
    });
  }
  function renderRelations(params) {
    const row = params.data || {};
    const rels = relsForParams(params);
    const wrap = el("div", "tree-gantt-relations");
    const tipLines = rels.map((r) => {
      const line = formatRelationLine(r);
      if (!line) {
        return "";
      }
      if (r.predecessor_subject && r.predecessor_subject !== r.predecessor) {
        return `${line}
${r.predecessor}`;
      }
      return line;
    }).filter(Boolean);
    const tipHint = fieldCanEdit(row, "relations") ? `${__("Click to highlight related tasks")}
${__("Double-click to edit")}` : __("Click to highlight related tasks");
    wrap.title = tipLines.length ? `${tipLines.join("\n\n")}
${tipHint}` : fieldCanEdit(row, "relations") ? __("Double-click to edit") : "";
    if (!rels.length) {
      wrap.classList.add("text-muted");
      wrap.textContent = "-";
    } else {
      wrap.textContent = relationsValueFormatter(params);
    }
    if (rels.length && row.relations) {
      stampRelationsOnRow(row, rels);
    }
    if (rels.length) {
      wrap.classList.add("tree-gantt-relations--clickable");
    }
    wrap.addEventListener("click", (ev) => {
      var _a, _b, _c;
      if ((_b = (_a = ev.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".dinext-table-fill-handle")) {
        return;
      }
      if (ev.detail > 1) {
        cancelRelationsFocus();
        return;
      }
      (_c = getOnRelationsFocus()) == null ? void 0 : _c({ row, params });
    });
    if (fieldCanEdit(row, "relations")) {
      wrap.classList.add("tree-gantt-relations--editable");
      wrap.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openEditor(row, params, wrap);
      });
    }
    return wrap;
  }
  function startRelationsFromEvent(event) {
    var _a, _b, _c, _d, _e, _f;
    const wrap = (_e = (_d = (_c = (_b = (_a = event == null ? void 0 : event.event) == null ? void 0 : _a.target) == null ? void 0 : _b.closest) == null ? void 0 : _c.call(_b, ".ag-cell")) == null ? void 0 : _d.querySelector) == null ? void 0 : _e.call(_d, ".tree-gantt-relations");
    if (!wrap) {
      return;
    }
    const row = event.data || ((_f = event.node) == null ? void 0 : _f.data) || {};
    if (!fieldCanEdit(row, "relations")) {
      return;
    }
    openEditor(row, event, wrap);
  }
  function relationsColumn() {
    return __spreadProps(__spreadValues({
      field: "relations",
      headerName: __("Relations")
    }, fixedCol(TREE_COL_WIDTH.relations)), {
      edit: (row) => fieldCanEdit(row, "relations"),
      suppressClickEdit: true,
      onActiveClickEdit: startRelationsFromEvent,
      sortable: false,
      cellDataType: false,
      cellRenderer: renderRelations,
      valueFormatter: relationsValueFormatter,
      valueParser: relationsValueParser,
      filterValueGetter: (row) => {
        const rels = Array.isArray(row == null ? void 0 : row.relations) ? row.relations : [];
        return rels.map(
          (r) => [r == null ? void 0 : r.predecessor_subject, r == null ? void 0 : r.predecessor, r == null ? void 0 : r.type].filter(Boolean).join(" ")
        ).join(" ");
      }
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
  function renderStatus(params) {
    const row = params.data || {};
    const value = row.status || params.value || "";
    const wrap = el("div", "tree-gantt-status-cell");
    const label = statusLabel(value);
    wrap.textContent = label;
    wrap.title = label;
    wrap.dataset.status = value;
    if (fieldCanEdit(row, "status")) {
      wrap.classList.add("tree-gantt-status--editable");
    }
    return wrap;
  }
  function statusColumn() {
    return __spreadProps(__spreadValues({
      field: "status",
      headerName: __("Status")
    }, fixedCol(TREE_COL_WIDTH.status)), {
      type: "select",
      edit: (row) => fieldCanEdit(row, "status"),
      cellEditor: FrappeSelectCellEditor,
      cellEditorParams: {
        values: (params) => getStatusOptions(params.data)
      },
      cellRenderer: renderStatus,
      valueFormatter: (params) => statusLabel(params.value),
      cellClass: statusCellClass,
      cellClassRules: statusCellClassRules(),
      filterValueGetter: (row) => searchableTranslated(row == null ? void 0 : row.status)
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/preview.js
  var OPEN_MS = 1e3;
  var CLOSE_MS = 300;
  var descriptionCache = /* @__PURE__ */ new Map();
  var activePreview = null;
  var openTimer = null;
  var closeTimer = null;
  var fetchSeq = 0;
  var hoverKey = null;
  var lastPointerX = Number.NaN;
  var lastPointerY = Number.NaN;
  var pointerTracking = false;
  function clearOpenTimer() {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
  }
  function clearCloseTimer() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }
  function onPointerMoveTrack(ev) {
    lastPointerX = ev.clientX;
    lastPointerY = ev.clientY;
  }
  function startPointerTracking() {
    if (pointerTracking) {
      return;
    }
    pointerTracking = true;
    document.addEventListener("pointermove", onPointerMoveTrack, { passive: true });
  }
  function stopPointerTracking() {
    if (!pointerTracking) {
      return;
    }
    pointerTracking = false;
    document.removeEventListener("pointermove", onPointerMoveTrack);
  }
  function closeActivePreview() {
    clearOpenTimer();
    clearCloseTimer();
    if (activePreview) {
      activePreview.destroy();
      activePreview = null;
    }
    if (!hoverKey) {
      stopPointerTracking();
    }
  }
  function getPopoverMountParent2() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || document.body;
  }
  function placeNearAnchor2(panel, anchorEl) {
    if (!(anchorEl == null ? void 0 : anchorEl.isConnected)) {
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const pad = 8;
    const gap = 10;
    const w = panel.offsetWidth || 360;
    const h = panel.offsetHeight || 120;
    let left = rect.right + gap;
    if (left + w > window.innerWidth - pad) {
      left = rect.left - w - gap;
    }
    if (left < pad) {
      left = pad;
    }
    let top = rect.top;
    if (top + h > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - h - pad);
    }
    if (top < pad) {
      top = pad;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function isEmptyDescription(html) {
    return !strip_html(cstr(html || "")).trim();
  }
  function formatDescriptionHtml(html) {
    let content = cstr(html || "");
    const tmp = document.createElement("div");
    tmp.innerHTML = content;
    const editor = tmp.querySelector(".ql-editor");
    if (editor) {
      content = editor.innerHTML;
    }
    content = frappe.dom.remove_script_and_style(content);
    return `<div class="tree-gantt-subject-preview__richtext">${content}</div>`;
  }
  function descriptionFromResponse(r) {
    var _a;
    const msg = (r == null ? void 0 : r.message) !== void 0 ? r.message : r;
    if (typeof msg === "string") {
      return msg;
    }
    if (msg && typeof msg === "object") {
      return (_a = msg.description) != null ? _a : "";
    }
    return "";
  }
  function fetchDescription(taskId) {
    if (descriptionCache.has(taskId)) {
      return Promise.resolve(descriptionCache.get(taskId) || "");
    }
    return frappe.db.get_value("Task", taskId, "description").then((r) => {
      const html = descriptionFromResponse(r);
      descriptionCache.set(taskId, html);
      return html;
    }).catch((err) => {
      console.warn("[task_tree_gantt] description fetch failed", taskId, err);
      return null;
    });
  }
  function invalidateSubjectDescriptionCache(taskId) {
    if (taskId) {
      descriptionCache.delete(taskId);
    } else {
      descriptionCache.clear();
    }
  }
  function subjectWrapUnderPointer(taskId) {
    var _a, _b, _c, _d;
    if (!Number.isFinite(lastPointerX) || !Number.isFinite(lastPointerY)) {
      return null;
    }
    const el3 = document.elementFromPoint(lastPointerX, lastPointerY);
    if (!el3) {
      return null;
    }
    if ((activePreview == null ? void 0 : activePreview.taskId) === taskId && ((_b = (_a = activePreview.panel) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, el3))) {
      return activePreview.wrap || null;
    }
    const subject = (_c = el3.closest) == null ? void 0 : _c.call(el3, ".tree-gantt-subject");
    if (((_d = subject == null ? void 0 : subject.dataset) == null ? void 0 : _d.taskId) === taskId) {
      return subject;
    }
    return null;
  }
  function pointerOnTaskOrPanel(taskId) {
    var _a, _b, _c, _d, _e;
    if (!Number.isFinite(lastPointerX) || !Number.isFinite(lastPointerY)) {
      return false;
    }
    const el3 = document.elementFromPoint(lastPointerX, lastPointerY);
    if (!el3) {
      return false;
    }
    if ((activePreview == null ? void 0 : activePreview.taskId) === taskId && ((_b = (_a = activePreview.panel) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, el3))) {
      return true;
    }
    return ((_e = (_d = (_c = el3.closest) == null ? void 0 : _c.call(el3, ".tree-gantt-subject")) == null ? void 0 : _d.dataset) == null ? void 0 : _e.taskId) === taskId;
  }
  function ensureOpenScheduled(taskId, wrap) {
    var _a;
    clearCloseTimer();
    clearOpenTimer();
    hoverKey = taskId;
    if ((activePreview == null ? void 0 : activePreview.taskId) === taskId && ((_a = activePreview.panel) == null ? void 0 : _a.isConnected)) {
      activePreview.wrap = wrap;
      placeNearAnchor2(activePreview.panel, wrap);
      return;
    }
    openTimer = setTimeout(() => {
      openTimer = null;
      if (hoverKey !== taskId) {
        return;
      }
      const liveWrap = subjectWrapUnderPointer(taskId) || wrap;
      if (!(liveWrap == null ? void 0 : liveWrap.isConnected)) {
        return;
      }
      openPreview({
        wrap: liveWrap,
        taskId
      });
    }, OPEN_MS);
  }
  function scheduleCloseCheck(taskId) {
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (pointerOnTaskOrPanel(taskId)) {
        hoverKey = taskId;
        const wrap = subjectWrapUnderPointer(taskId) || (activePreview == null ? void 0 : activePreview.wrap);
        if (wrap == null ? void 0 : wrap.isConnected) {
          if (!activePreview || activePreview.taskId !== taskId) {
            ensureOpenScheduled(taskId, wrap);
          }
        }
        return;
      }
      if (hoverKey && hoverKey !== taskId) {
        return;
      }
      if (hoverKey === taskId) {
        hoverKey = null;
      }
      if ((activePreview == null ? void 0 : activePreview.taskId) === taskId) {
        closeActivePreview();
      } else if (!hoverKey) {
        stopPointerTracking();
      }
    }, CLOSE_MS);
  }
  function openPreview({ wrap, taskId }) {
    var _a, _b;
    if (!wrap || !taskId || hoverKey !== taskId) {
      return;
    }
    if ((_a = wrap.querySelector) == null ? void 0 : _a.call(wrap, ".tree-gantt-subject-edit")) {
      return;
    }
    if ((activePreview == null ? void 0 : activePreview.taskId) === taskId && ((_b = activePreview.panel) == null ? void 0 : _b.isConnected)) {
      activePreview.wrap = wrap;
      placeNearAnchor2(activePreview.panel, wrap);
      return;
    }
    if (activePreview) {
      activePreview.destroy();
      activePreview = null;
    }
    startPointerTracking();
    const panel = document.createElement("div");
    panel.className = "tree-gantt-subject-preview";
    panel.setAttribute("role", "dialog");
    panel.dataset.taskId = taskId;
    const body = document.createElement("div");
    body.className = "tree-gantt-subject-preview__body";
    body.innerHTML = `<div class="text-muted tree-gantt-subject-preview__loading">${__(
      "Loading\u2026"
    )}</div>`;
    panel.appendChild(body);
    getPopoverMountParent2().appendChild(panel);
    placeNearAnchor2(panel, wrap);
    const seq = ++fetchSeq;
    function destroy() {
      document.removeEventListener("pointerdown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
      panel.removeEventListener("pointerenter", onPanelEnter);
      panel.removeEventListener("pointerleave", onPanelLeave);
      panel.remove();
      if ((activePreview == null ? void 0 : activePreview.panel) === panel) {
        activePreview = null;
      }
    }
    function onDocDown(ev) {
      var _a2, _b2, _c;
      const t = ev.target;
      if (panel.contains(t)) {
        return;
      }
      const otherId = (_c = (_b2 = (_a2 = t == null ? void 0 : t.closest) == null ? void 0 : _a2.call(t, ".tree-gantt-subject")) == null ? void 0 : _b2.dataset) == null ? void 0 : _c.taskId;
      if (otherId === taskId) {
        return;
      }
      hoverKey = otherId || null;
      closeActivePreview();
    }
    function onKey(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        hoverKey = null;
        closeActivePreview();
      }
    }
    function onReposition() {
      var _a2;
      const anchor = ((_a2 = activePreview == null ? void 0 : activePreview.wrap) == null ? void 0 : _a2.isConnected) ? activePreview.wrap : subjectWrapUnderPointer(taskId) || wrap;
      placeNearAnchor2(panel, anchor);
    }
    function onPanelEnter() {
      hoverKey = taskId;
      clearCloseTimer();
    }
    function onPanelLeave() {
      scheduleCloseCheck(taskId);
    }
    function renderBody(html) {
      if (html == null) {
        body.innerHTML = `<div class="text-muted">${__("Could not load description")}</div>`;
      } else if (isEmptyDescription(html)) {
        body.innerHTML = `<div class="text-muted tree-gantt-subject-preview__empty">${__(
          "No description"
        )}</div>`;
      } else {
        body.innerHTML = formatDescriptionHtml(html);
      }
      onReposition();
    }
    const cached = descriptionCache.has(taskId) ? descriptionCache.get(taskId) || "" : null;
    if (cached !== null) {
      renderBody(cached);
    } else {
      fetchDescription(taskId).then((html) => {
        if (seq !== fetchSeq || (activePreview == null ? void 0 : activePreview.panel) !== panel) {
          return;
        }
        renderBody(html);
      });
    }
    document.addEventListener("pointerdown", onDocDown, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    panel.addEventListener("pointerenter", onPanelEnter);
    panel.addEventListener("pointerleave", onPanelLeave);
    activePreview = { destroy, taskId, panel, wrap };
  }
  function wireSubjectPreview(wrap, row) {
    const taskId = row == null ? void 0 : row.id;
    if (!wrap || !taskId) {
      return;
    }
    bindRouteCacheInvalidation();
    wrap.dataset.taskId = taskId;
    const onWrapEnter = (ev) => {
      var _a, _b;
      if ((_b = (_a = ev.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".tree-gantt-subject-toolbar")) {
        return;
      }
      lastPointerX = ev.clientX;
      lastPointerY = ev.clientY;
      startPointerTracking();
      if (activePreview && activePreview.taskId !== taskId) {
        activePreview.destroy();
        activePreview = null;
      }
      ensureOpenScheduled(taskId, wrap);
    };
    const onWrapLeave = (ev) => {
      scheduleCloseCheck(taskId);
    };
    wrap.addEventListener("pointerenter", onWrapEnter);
    wrap.addEventListener("pointerleave", onWrapLeave);
    wrap.addEventListener(
      "pointerdown",
      (ev) => {
        var _a, _b;
        if ((_b = (_a = ev.target).closest) == null ? void 0 : _b.call(_a, ".tree-gantt-subject-toolbar")) {
          clearOpenTimer();
          if (hoverKey === taskId) {
            hoverKey = null;
          }
          closeActivePreview();
        }
      },
      true
    );
  }
  function closeSubjectPreview() {
    hoverKey = null;
    closeActivePreview();
    stopPointerTracking();
  }
  var routeInvalidateBound = false;
  function bindRouteCacheInvalidation() {
    if (routeInvalidateBound)
      return;
    routeInvalidateBound = true;
    window.addEventListener("popstate", () => {
      invalidateSubjectDescriptionCache();
      closeSubjectPreview();
    });
    $(document).on("page-change.treeGanttSubjectPreview", () => {
      invalidateSubjectDescriptionCache();
      closeSubjectPreview();
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/edit.js
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
    const df = frappe.meta.get_field("Task", "subject", taskId);
    if (!df)
      return true;
    let status = frappe.perm.get_field_display_status(df, doc, null, false);
    if (status === "Write" && df.read_only_depends_on && evaluateReadOnlyDependsOn2(df.read_only_depends_on, doc)) {
      status = "Read";
    }
    return status === "Write";
  }
  function commitSubjectChange(params, row, next) {
    var _a, _b, _c, _d;
    const table = (_a = params.context) == null ? void 0 : _a.dinextTable;
    const oldValue = row.subject || "";
    const newValue = String(next != null ? next : "").trim();
    if (String(oldValue) === String(newValue)) {
      return false;
    }
    if (!params.node || typeof (table == null ? void 0 : table.commitCellChanges) !== "function") {
      console.error("[task_tree_gantt] subject commit: table/node missing");
      return false;
    }
    const source = typeof ((_b = DinextTable == null ? void 0 : DinextTable.CELL_CHANGE_SOURCES) == null ? void 0 : _b.EDIT) === "string" ? DinextTable.CELL_CHANGE_SOURCES.EDIT : "edit";
    const { applied } = table.commitCellChanges({
      source,
      changes: [
        {
          node: params.node,
          field: "subject",
          oldValue,
          newValue,
          rowIndex: params.node.rowIndex,
          colId: ((_d = (_c = params.column) == null ? void 0 : _c.getColId) == null ? void 0 : _d.call(_c)) || "subject"
        }
      ]
    });
    return applied > 0;
  }
  async function startSubjectInlineEdit({ mainEl, textEl, row, params }) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    if (!fieldCanEdit(row, "subject"))
      return;
    if (mainEl.dataset.subjectEditing === "1" || mainEl.querySelector(".tree-gantt-subject-edit")) {
      return;
    }
    closeSubjectPreview();
    const taskId = row.id;
    let doc = cachedTaskDoc(taskId);
    if (doc && !fieldIsWritable2(doc, taskId)) {
      return;
    }
    mainEl.dataset.subjectEditing = "1";
    const oldValue = row.subject || "";
    textEl.style.display = "none";
    const host = document.createElement("span");
    host.className = "tree-gantt-subject-edit";
    mainEl.appendChild(host);
    let finished = false;
    let unbindKeys = () => {
    };
    const finish = (commit) => {
      var _a2, _b2, _c2, _d2;
      if (finished)
        return;
      finished = true;
      unbindKeys();
      const control2 = host._control;
      const next = control2 ? control2.get_value() : oldValue;
      if (commit && next != null && String(next).trim() !== String(oldValue)) {
        const ok = commitSubjectChange(params, row, next);
        if (ok) {
          (_b2 = (_a2 = frappe.model).clear_doc) == null ? void 0 : _b2.call(_a2, "Task", taskId);
        }
      }
      host._control = null;
      host.remove();
      textEl.style.display = "";
      delete mainEl.dataset.subjectEditing;
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
    const inputEl = (_j = (_i = control.$input) == null ? void 0 : _i.get) == null ? void 0 : _j.call(_i, 0);
    if (inputEl) {
      const onKey = (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          ev.stopPropagation();
          finish(true);
        } else if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          finish(false);
        }
      };
      inputEl.addEventListener("keydown", onKey, true);
      unbindKeys = () => inputEl.removeEventListener("keydown", onKey, true);
    }
    const focusInput = () => {
      if (!inputEl || mainEl.dataset.subjectEditing !== "1") {
        return;
      }
      inputEl.focus();
      inputEl.select();
    };
    requestAnimationFrame(focusInput);
    if (!doc) {
      try {
        doc = await frappe.model.with_doc("Task", taskId);
        if (doc && !fieldIsWritable2(doc, taskId)) {
          finish(false);
        }
      } catch (e) {
        console.error("[task_tree_gantt] subject with_doc", e);
      }
    }
    (_l = (_k = control.$input) == null ? void 0 : _k.on) == null ? void 0 : _l.call(_k, "blur", () => {
      setTimeout(() => finish(true), 120);
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/subject/toolbar.js
  function el2(tag, className) {
    const node = document.createElement(tag);
    if (className)
      node.className = className;
    return node;
  }
  function makeBtn({ iconClass, title, onClick, href }) {
    const btn = el2(
      href ? "a" : "button",
      `btn btn-default btn-xs tree-toolbar-button ${iconClass}`
    );
    if (href) {
      btn.href = href;
    } else {
      btn.type = "button";
    }
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (ev) => {
      if (href && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) {
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    btn.addEventListener("mousedown", (ev) => {
      ev.stopPropagation();
    });
    if (href) {
      btn.addEventListener("contextmenu", (ev) => {
        ev.stopPropagation();
      });
    }
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
      const target = taskOpenTarget(row);
      bar.appendChild(
        makeBtn({
          iconClass: "fa fa-pencil-square-o",
          title: canWrite ? __("Edit") : __("Details"),
          href: frappe.utils.get_form_link(target.doctype, target.name),
          onClick: () => openTaskForm(row.id, row)
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
          onClick: () => void addMultipleTasks(row)
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
  function subjectTitle(row) {
    if (row == null ? void 0 : row.dep_conflict) {
      return row.dep_conflict_start || row.dep_conflict_end || __("Dependency conflict");
    }
    return (row == null ? void 0 : row.id) || "";
  }
  function subjectEditEls(event) {
    var _a, _b, _c, _d, _e;
    const target = (_a = event == null ? void 0 : event.event) == null ? void 0 : _a.target;
    if ((_b = target == null ? void 0 : target.closest) == null ? void 0 : _b.call(target, ".tree-gantt-subject-toolbar, .dinext-table-tree-toggle")) {
      return null;
    }
    const cell = (_c = target == null ? void 0 : target.closest) == null ? void 0 : _c.call(target, ".ag-cell");
    const main = (_d = cell == null ? void 0 : cell.querySelector) == null ? void 0 : _d.call(cell, ".tree-gantt-subject-main");
    const text = (_e = cell == null ? void 0 : cell.querySelector) == null ? void 0 : _e.call(cell, ".tree-gantt-subject-text");
    if (!main || !text) {
      return null;
    }
    return { main, text };
  }
  function startSubjectFromEvent(event) {
    var _a;
    const els = subjectEditEls(event);
    if (!els) {
      return;
    }
    const row = event.data || ((_a = event.node) == null ? void 0 : _a.data) || {};
    if (!fieldCanEdit(row, "subject")) {
      return;
    }
    void startSubjectInlineEdit({
      mainEl: els.main,
      textEl: els.text,
      row,
      params: event
    });
  }
  function wireEdit(wrap, main, text, row, params) {
    if (!fieldCanEdit(row, "subject")) {
      return;
    }
    wrap.classList.add("tree-gantt-subject--editable");
    wrap.addEventListener("dblclick", (ev) => {
      var _a, _b;
      if ((_b = (_a = ev.target).closest) == null ? void 0 : _b.call(_a, ".tree-gantt-subject-toolbar")) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      void startSubjectInlineEdit({
        mainEl: main,
        textEl: text,
        row,
        params
      });
    });
  }
  function renderSubject(params) {
    const row = params.data || {};
    const wrap = el("span", "tree-gantt-subject");
    if (row.dep_conflict) {
      wrap.title = subjectTitle(row);
      wrap.classList.add("tree-gantt-dep-conflict");
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
    if (isTaskCritical(row.id)) {
      const mark = el("span", CRITICAL_MARK_CLASS);
      const label = __("Critical path");
      mark.innerHTML = criticalPathIconSvg();
      mark.title = label;
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", label);
      main.appendChild(mark);
    }
    const text = el(
      "span",
      "tree-gantt-subject-text",
      row.subject || params.value || ""
    );
    main.appendChild(text);
    wrap.appendChild(main);
    const toolbar = buildSubjectToolbar(row);
    if (toolbar) {
      wrap.appendChild(toolbar);
    }
    wireEdit(wrap, main, text, row, params);
    wireSubjectPreview(wrap, row);
    return wrap;
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
      treeContentKey: (params) => {
        var _a;
        return `${subjectTreeContentKey(params)}\0${isTaskCritical((_a = params == null ? void 0 : params.data) == null ? void 0 : _a.id) ? "1" : "0"}`;
      },
      cellClassRules: subjectConflictClassRules(),
      edit: (row) => fieldCanEdit(row, "subject"),
      suppressClickEdit: true,
      onActiveClickEdit: startSubjectFromEvent,
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
    const current = normalizeMulti(field.get_value());
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    await field.set_value(next);
  }
  function renderTags(params) {
    var _a;
    const tags = parseTags(params.value, TAG_LIMIT);
    if (!tags.length) {
      return el("span", "text-muted", "");
    }
    const wrap = el("div", "tree-gantt-tags");
    for (const tag of tags) {
      const pill = el("span", "tag-pill tree-gantt-tag-pill ellipsis", tag);
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
      cellDataType: false,
      cellRenderer: renderTags,
      cellClass: "dinext-table-cell--align-center",
      filterValueGetter: (row) => parseTags(row == null ? void 0 : row.user_tags).join(" ")
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/type.js
  function typeLabel(value) {
    if (!value) {
      return "";
    }
    return __(String(value));
  }
  function typeColumn() {
    return __spreadProps(__spreadValues({
      field: "type",
      headerName: __("Type")
    }, fixedCol(TREE_COL_WIDTH.type)), {
      sortable: false,
      edit: false,
      cellClass: "dinext-table-cell--align-center",
      valueFormatter: (params) => typeLabel(params.value),
      filterValueGetter: (row) => searchableTranslated(row == null ? void 0 : row.type)
    });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/columns/index.js
  function withHiddenMask(col) {
    if (!col.field) {
      return col;
    }
    const field = col.field;
    const prevGetter = col.valueGetter;
    const prevRenderer = col.cellRenderer;
    const next = __spreadProps(__spreadValues({}, col), {
      valueGetter: (params) => {
        var _a;
        if (fieldIsHidden(params.data, field)) {
          return null;
        }
        if (typeof prevGetter === "function") {
          return prevGetter(params);
        }
        return (_a = params.data) == null ? void 0 : _a[field];
      }
    });
    if (typeof prevRenderer === "function") {
      next.cellRenderer = (params) => {
        if (fieldIsHidden(params.data, field)) {
          return "";
        }
        return prevRenderer(params);
      };
    }
    return next;
  }
  function withWriteDeniedHint(col) {
    if (typeof col.edit !== "function" || !col.field) {
      return col;
    }
    const field = col.field;
    const prevRules = col.cellClassRules || {};
    const prevTip = col.tooltipValueGetter;
    const prevCellRenderer = col.cellRenderer;
    const next = __spreadProps(__spreadValues({}, col), {
      cellClassRules: __spreadProps(__spreadValues({}, prevRules), {
        "tree-gantt-cell--write-denied": (params) => !col.edit(params.data)
      })
    });
    if (field !== "subject") {
      next.tooltipValueGetter = (params) => deniedTitle(params.data, field) || (typeof prevTip === "function" ? prevTip(params) : void 0);
    }
    if (typeof prevCellRenderer === "function") {
      next.cellRenderer = (params) => {
        const el3 = prevCellRenderer(params);
        const tip = deniedTitle(params.data, field);
        if (tip && el3 instanceof HTMLElement) {
          el3.title = tip;
        }
        return el3;
      };
    }
    return next;
  }
  function getColumns() {
    return [
      subjectColumn(),
      assignColumn(),
      relationsColumn(),
      planFactColumn(),
      statusColumn(),
      priorityColumn(),
      plannedStartColumn(),
      plannedEndColumn(),
      expStartColumn(),
      expEndColumn(),
      actualStartColumn(),
      actualEndColumn(),
      durationColumn(),
      progressColumn(),
      includeColumn(),
      typeColumn(),
      tagsColumn()
    ].map((col) => withWriteDeniedHint(withHiddenMask(col)));
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/delete.js
  function canDeleteTask(row) {
    if (!(row == null ? void 0 : row.id)) {
      return false;
    }
    if (!frappe.model.can_delete("Task")) {
      return false;
    }
    if (!frappe.perm.has_perm("Task", 0, "delete", row.id)) {
      return false;
    }
    return true;
  }
  function depthByParentChain(row, byId) {
    var _a;
    let depth = 0;
    let pid = row.parent_task;
    const seen = /* @__PURE__ */ new Set();
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      depth += 1;
      pid = ((_a = byId.get(pid)) == null ? void 0 : _a.parent_task) || null;
    }
    return depth;
  }
  function sortDeepestFirst(rows) {
    const byId = new Map((rows || []).map((r) => [r.id, r]));
    return [...rows || []].sort(
      (a, b) => depthByParentChain(b, byId) - depthByParentChain(a, byId)
    );
  }
  function confirmDelete(rows) {
    return new Promise((resolve) => {
      const n2 = rows.length;
      const message = n2 === 1 ? __("Permanently delete {0}?", [
        String(rows[0].subject || rows[0].id).bold()
      ]) : __("Permanently delete {0} tasks?", [String(n2)]);
      frappe.confirm(
        message,
        () => resolve(true),
        () => resolve(false)
      );
    });
  }
  function createOnBeforeDeleteRows() {
    return async ({ rows }) => {
      if (!(rows == null ? void 0 : rows.length)) {
        return false;
      }
      const blocked = rows.filter((r) => !canDeleteTask(r));
      if (blocked.length) {
        frappe.msgprint(__("Not permitted to delete selected task(s)"));
        return false;
      }
      const ok = await confirmDelete(rows);
      if (ok) {
        rememberRemovedIds(rows.map((r) => r.id).filter(Boolean));
      }
      return ok;
    };
  }
  function createOnDeleteRows() {
    return async ({ rows, table }) => {
      var _a;
      const ordered = sortDeepestFirst(rows);
      const removeIds = ordered.map((row) => row.id).filter(Boolean);
      rememberRemovedIds(removeIds);
      frappe.dom.freeze(__("Deleting\u2026"));
      try {
        for (const row of ordered) {
          await frappe.xcall("frappe.client.delete", {
            doctype: "Task",
            name: row.id
          });
        }
        frappe.utils.play_sound("delete");
        dropRemovedTasks(table, removeIds);
        (_a = getOnTreeMutate()) == null ? void 0 : _a({
          removeIds
        });
        return true;
      } catch (e) {
        forgetRemovedIds(removeIds);
        console.error("[task_tree_gantt] delete tasks", e);
        frappe.msgprint({
          title: __("Delete failed"),
          indicator: "red",
          message: (e == null ? void 0 : e.message) || (e == null ? void 0 : e.exc) || __(
            "Could not delete task(s). Parents with child tasks cannot be deleted until children are removed."
          )
        });
        return false;
      } finally {
        frappe.dom.unfreeze();
      }
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/related.js
  function collectPathById(rows, parentPath = null, map = /* @__PURE__ */ new Map()) {
    for (const row of rows || []) {
      if (!(row == null ? void 0 : row.id)) {
        continue;
      }
      const path = parentPath ? `${parentPath}:${row.id}` : String(row.id);
      map.set(String(row.id), path);
      if (Array.isArray(row.children) && row.children.length) {
        collectPathById(row.children, path, map);
      }
    }
    return map;
  }
  function ancestorExpandIds(pathId) {
    const parts = String(pathId || "").split(":").filter(Boolean);
    const ids = [];
    for (let i = 1; i < parts.length; i++) {
      ids.push(parts.slice(0, i).join(":"));
    }
    return ids;
  }
  function collectRelatedTaskIds(nested, originId) {
    const origin = String(originId || "");
    const ids = /* @__PURE__ */ new Set();
    if (origin) {
      ids.add(origin);
    }
    function walk(rows) {
      for (const row of rows || []) {
        const rowId = (row == null ? void 0 : row.id) != null ? String(row.id) : "";
        const rels = Array.isArray(row == null ? void 0 : row.relations) ? row.relations : [];
        for (const rel of rels) {
          const pred = String((rel == null ? void 0 : rel.predecessor) || "").trim();
          if (!pred) {
            continue;
          }
          if (rowId === origin) {
            ids.add(pred);
          }
          if (pred === origin && rowId) {
            ids.add(rowId);
          }
        }
        if (Array.isArray(row == null ? void 0 : row.children) && row.children.length) {
          walk(row.children);
        }
      }
    }
    walk(nested);
    return [...ids];
  }
  function relatedHighlightIds(nested, originId) {
    const origin = String(originId || "");
    const ids = collectRelatedTaskIds(nested, origin);
    if (!origin) {
      return ids;
    }
    return ids.some((id) => id !== origin) ? ids : [];
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/table/merge.js
  var ROW_FIELDS = [
    "subject",
    "assign",
    "assign_pwa",
    "assign_todo_only",
    "status",
    "priority",
    "custom_planned_start_date",
    "custom_planned_end_date",
    "exp_start_date",
    "exp_end_date",
    "act_start_date",
    "act_end_date",
    "completed_on",
    "expected_time",
    "duration",
    "progress",
    "custom_include",
    "type",
    "user_tags",
    "is_milestone",
    "color",
    "relations",
    "predecessors",
    "parent_task",
    "custom_tree_order",
    "can_read",
    "can_write",
    "confirm",
    "owner",
    "hasChildren",
    "_doc"
  ];
  var GANTT_FIELDS = /* @__PURE__ */ new Set([
    "exp_start_date",
    "exp_end_date",
    "status",
    "priority",
    "subject",
    "progress",
    "assign",
    "relations"
  ]);
  var SIDE_FIELDS = /* @__PURE__ */ new Set(["exp_start_date", "exp_end_date", "relations"]);
  function sameValue(left, right) {
    let a = left;
    let b = right;
    if (a == null || a === "") {
      a = null;
    }
    if (b == null || b === "") {
      b = null;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      return JSON.stringify(a != null ? a : []) === JSON.stringify(b != null ? b : []);
    }
    if (a && typeof a === "object" || b && typeof b === "object") {
      return JSON.stringify(a != null ? a : null) === JSON.stringify(b != null ? b : null);
    }
    if (typeof a === "boolean" || typeof b === "boolean") {
      return Boolean(a) === Boolean(b);
    }
    return Object.is(a, b);
  }
  function indexById(rows, map = /* @__PURE__ */ new Map()) {
    var _a;
    for (const row of rows || []) {
      if (row == null ? void 0 : row.id) {
        map.set(String(row.id), row);
      }
      if ((_a = row.children) == null ? void 0 : _a.length) {
        indexById(row.children, map);
      }
    }
    return map;
  }
  function cloneNewRow(row) {
    const copy = __spreadValues({}, row);
    if (Array.isArray(row.children)) {
      copy.children = row.children.map(cloneNewRow);
    }
    return copy;
  }
  function collectFieldChanges(existing, incoming, acc) {
    const id = String(existing.id);
    for (const field of ROW_FIELDS) {
      if (sameValue(existing[field], incoming[field])) {
        continue;
      }
      acc.fieldChanges.push({ id, field, value: incoming[field] });
      if (GANTT_FIELDS.has(field)) {
        acc.ganttChanged = true;
      }
      if (SIDE_FIELDS.has(field)) {
        acc.sideChanged = true;
      }
    }
  }
  function rowRemoved(row, removeSet) {
    return !!((row == null ? void 0 : row.id) != null && (removeSet == null ? void 0 : removeSet.has(String(row.id))));
  }
  function mergeLevel(oldList, newList, parentPath, deep, oldById, acc, removeSet) {
    const rawOld = oldList || [];
    const next = (newList || []).filter((row) => !rowRemoved(row, removeSet));
    const merged = [];
    for (const incoming of next) {
      const id = String(incoming.id);
      const existing = oldById.get(id);
      if (!existing) {
        merged.push(cloneNewRow(incoming));
        continue;
      }
      collectFieldChanges(existing, incoming, acc);
      const childPath = parentPath ? `${parentPath}:${id}` : id;
      if (deep) {
        mergeLevel(
          existing.children || [],
          incoming.children || [],
          childPath,
          true,
          oldById,
          acc,
          removeSet
        );
      } else if (removeSet == null ? void 0 : removeSet.size) {
        mergeLevel(
          existing.children || [],
          existing.children || [],
          childPath,
          false,
          oldById,
          acc,
          removeSet
        );
      }
      merged.push(existing);
    }
    const hadRemoved = rawOld.some((row) => rowRemoved(row, removeSet));
    const oldIds = rawOld.filter((row) => !rowRemoved(row, removeSet)).map((row) => String(row.id));
    const newIds = merged.map((row) => String(row.id));
    const structChanged = hadRemoved || oldIds.length !== newIds.length || oldIds.some((id, i) => id !== newIds[i]);
    if (structChanged) {
      acc.structureOps.push({ parentPath, children: merged });
      acc.ganttChanged = true;
      acc.sideChanged = true;
    }
    return merged;
  }
  function pathDepth(parentPath) {
    if (!parentPath) {
      return 0;
    }
    return String(parentPath).split(":").length;
  }
  function visibleCount(row, path, expandedIds) {
    let count = 1;
    const kids = row == null ? void 0 : row.children;
    if ((expandedIds == null ? void 0 : expandedIds.has(path)) && Array.isArray(kids)) {
      for (const child of kids) {
        count += visibleCount(child, `${path}:${child.id}`, expandedIds);
      }
    }
    return count;
  }
  function visibleIndexForRoot(roots, rootIndex, expandedIds) {
    let index = 0;
    for (let i = 0; i < rootIndex; i++) {
      index += visibleCount(roots[i], String(roots[i].id), expandedIds);
    }
    return index;
  }
  function toVisibleRoot(row) {
    var _a;
    return __spreadProps(__spreadValues({}, row), {
      _rowId: String(row.id),
      _level: 0,
      _hasChildren: !!(row.hasChildren || ((_a = row.children) == null ? void 0 : _a.length))
    });
  }
  function syncRootRows(table, nextRoots) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const oldRoots = table.sourceData || [];
    const oldIds = oldRoots.map((row) => String(row.id));
    const nextIds = nextRoots.map((row) => String(row.id));
    const oldSet = new Set(oldIds);
    const nextSet = new Set(nextIds);
    const added = nextIds.filter((id) => !oldSet.has(id));
    const removed = oldIds.filter((id) => !nextSet.has(id));
    const survivorOld = oldIds.filter((id) => nextSet.has(id));
    const survivorNext = nextIds.filter((id) => oldSet.has(id));
    const sameOrder = survivorOld.join("\0") === survivorNext.join("\0");
    table.sourceData = nextRoots;
    if (table.options) {
      table.options.data = nextRoots;
    }
    if (!added.length && !removed.length && sameOrder) {
      return;
    }
    if (!sameOrder) {
      (_a = table.refresh) == null ? void 0 : _a.call(table);
      return;
    }
    if (removed.length) {
      const toRemove = [];
      (_c = (_b = table.api) == null ? void 0 : _b.forEachNode) == null ? void 0 : _c.call(_b, (node) => {
        var _a2;
        const rowId = String(((_a2 = node.data) == null ? void 0 : _a2._rowId) || "");
        const rootId = rowId.split(":")[0];
        if (rootId && !nextSet.has(rootId)) {
          toRemove.push(node.data);
        }
      });
      if (toRemove.length) {
        table.api.applyTransaction({ remove: toRemove });
      }
    }
    for (const id of added) {
      const row = nextRoots.find((item) => String(item.id) === id);
      if (!row) {
        continue;
      }
      const addIndex = visibleIndexForRoot(
        nextRoots,
        nextIds.indexOf(id),
        table.expandedIds
      );
      (_e = (_d = table.api) == null ? void 0 : _d.applyTransaction) == null ? void 0 : _e.call(_d, {
        add: [toVisibleRoot(row)],
        addIndex
      });
      if (((_f = table.expandedIds) == null ? void 0 : _f.has(id)) && ((_g = row.children) == null ? void 0 : _g.length)) {
        (_h = table.setRowChildren) == null ? void 0 : _h.call(table, id, row.children);
      }
    }
    (_i = table.syncRowDataFromGrid) == null ? void 0 : _i.call(table);
  }
  function refreshHasChildrenToggles(table, changes) {
    var _a, _b, _c;
    for (const change of changes) {
      const node = (_a = table.findGridNodeByBusinessId) == null ? void 0 : _a.call(table, change.id);
      const rowId = ((_b = node == null ? void 0 : node.data) == null ? void 0 : _b._rowId) || change.id;
      (_c = table.refreshTreeToggle) == null ? void 0 : _c.call(table, rowId);
    }
  }
  function applyTreeMerge(table, nextRoots, { deep = false, removeIds } = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const acc = {
      fieldChanges: [],
      structureOps: [],
      ganttChanged: false,
      sideChanged: false
    };
    const removeSet = new Set((removeIds || []).map(String).filter(Boolean));
    if (removeSet.size) {
      (_a = table.pruneSortBaseline) == null ? void 0 : _a.call(table, removeIds);
    }
    const oldRoots = table.sourceData || [];
    mergeLevel(oldRoots, nextRoots || [], null, deep, indexById(oldRoots), acc, removeSet);
    const cellChanges = acc.fieldChanges.filter((c) => c.field !== "hasChildren");
    const toggleChanges = acc.fieldChanges.filter((c) => c.field === "hasChildren");
    if (cellChanges.length) {
      (_b = table.applyExternalCellValues) == null ? void 0 : _b.call(table, cellChanges);
      const docNodes = cellChanges.filter((c) => c.field === "_doc").map((c) => {
        var _a2;
        return (_a2 = table.findGridNodeByBusinessId) == null ? void 0 : _a2.call(table, c.id);
      }).filter(Boolean);
      if (docNodes.length) {
        (_d = (_c = table.api) == null ? void 0 : _c.refreshCells) == null ? void 0 : _d.call(_c, { rowNodes: docNodes, force: true });
      }
    }
    if (toggleChanges.length) {
      (_e = table.applyExternalCellValues) == null ? void 0 : _e.call(table, toggleChanges);
      refreshHasChildrenToggles(table, toggleChanges);
    }
    const ops = [...acc.structureOps].sort(
      (a, b) => pathDepth(b.parentPath) - pathDepth(a.parentPath)
    );
    for (const op of ops) {
      if (!op.parentPath) {
        syncRootRows(table, op.children);
        continue;
      }
      if (!op.children.length) {
        const parent = (_f = table.findTreeSourceRow) == null ? void 0 : _f.call(table, op.parentPath);
        if (parent) {
          parent.hasChildren = false;
        }
        (_h = (_g = table.expandedIds) == null ? void 0 : _g.delete) == null ? void 0 : _h.call(_g, op.parentPath);
      }
      (_i = table.setRowChildren) == null ? void 0 : _i.call(table, op.parentPath, op.children);
    }
    return {
      changed: acc.fieldChanges.length > 0 || acc.structureOps.length > 0,
      ganttChanged: acc.ganttChanged,
      sideChanged: acc.sideChanged
    };
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
  function fail(message) {
    throw new Error(message);
  }
  function toTaskNames(ids) {
    return (ids || []).map((id) => taskNameFromRowId(id) || String(id)).filter(Boolean);
  }
  async function persistTaskRowReorder({ move, table }) {
    var _a, _b, _c;
    if (!move) {
      fail(__("Task reorder: missing move payload"));
    }
    const {
      toParentRowId,
      rowId,
      blockSize = 1,
      orderedLocalRowIds,
      fromOrderedLocalRowIds,
      fromParentRowId
    } = move;
    if (cint(blockSize) > 1) {
      fail(__("Moving multiple tasks at once is not supported"));
    }
    const taskName = taskNameFromRowId(rowId);
    if (!taskName) {
      fail(__("Task reorder: invalid task id"));
    }
    if (!frappe.model.can_write("Task")) {
      fail(__("Not permitted"));
    }
    const sourceRow = ((_a = table == null ? void 0 : table.findSourceRow) == null ? void 0 : _a.call(table, rowId)) || ((_b = table == null ? void 0 : table.findSourceRow) == null ? void 0 : _b.call(table, move.newRowId));
    if (sourceRow && (!rowCanRead(sourceRow) || !rowCanWrite(sourceRow))) {
      fail(__("Not permitted"));
    }
    const orderedIds = toTaskNames(orderedLocalRowIds);
    if (!orderedIds.length || !orderedIds.includes(taskName)) {
      fail(__("Task reorder: missing sibling order"));
    }
    const parentTask = taskNameFromRowId(toParentRowId) || "";
    const reparent = fromParentRowId !== toParentRowId;
    if (reparent && toParentRowId) {
      const parentRow = (_c = table == null ? void 0 : table.findSourceRow) == null ? void 0 : _c.call(table, toParentRowId);
      if (parentRow && !rowCanRead(parentRow)) {
        fail(__("Not permitted"));
      }
    }
    const fromOrderedIds = reparent ? toTaskNames(fromOrderedLocalRowIds) : [];
    frappe.dom.freeze(__("Updating {0}", [__("Task")]));
    try {
      const message = await frappe.xcall(
        "dinext_project_tasks_gantt.api.reorder_siblings",
        {
          task: taskName,
          parent_task: parentTask,
          ordered_ids: orderedIds,
          from_ordered_ids: fromOrderedIds
        }
      );
      if (reparent) {
        applySideEffectDateRows(table, message == null ? void 0 : message.rows);
      }
    } finally {
      frappe.dom.unfreeze();
    }
    return true;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/dnd/index.js
  function canReorderTaskRow({ row }) {
    return rowCanRead(row) && rowCanWrite(row);
  }
  function validateTaskRowReorder({ move, table }) {
    var _a, _b;
    const row = (_a = table == null ? void 0 : table.findSourceRow) == null ? void 0 : _a.call(table, move == null ? void 0 : move.rowId);
    if (!rowCanRead(row) || !rowCanWrite(row)) {
      return false;
    }
    if ((move == null ? void 0 : move.fromParentRowId) !== (move == null ? void 0 : move.toParentRowId) && (move == null ? void 0 : move.toParentRowId)) {
      const parent = (_b = table == null ? void 0 : table.findSourceRow) == null ? void 0 : _b.call(table, move.toParentRowId);
      if (parent && !rowCanRead(parent)) {
        return false;
      }
    }
    return true;
  }
  function createOnRowReorder() {
    return async (ctx) => {
      var _a;
      try {
        await persistTaskRowReorder(ctx);
        (_a = getOnGanttRefresh()) == null ? void 0 : _a();
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
  var HOST_LOADING = "task-tree-gantt-table-host--loading";
  function clearHostChrome(container) {
    container.classList.remove("text-muted", HOST_LOADING);
  }
  function showPlaceholder(container, text) {
    clearHostChrome(container);
    container.classList.add("text-muted");
    container.textContent = text;
  }
  function showLoading(container) {
    clearHostChrome(container);
    container.classList.add(HOST_LOADING);
    container.replaceChildren();
    const spin = document.createElement("div");
    spin.className = "task-tree-gantt-table-spinner";
    spin.setAttribute("role", "status");
    spin.setAttribute("aria-label", __("Loading\u2026"));
    container.appendChild(spin);
  }
  function showError(container, err) {
    clearHostChrome(container);
    container.classList.add("text-muted");
    container.textContent = (err == null ? void 0 : err.message) || String(err);
  }
  function destroyState(state) {
    var _a;
    if ((_a = state == null ? void 0 : state.table) == null ? void 0 : _a.destroy) {
      state.table.destroy();
    }
    state.table = null;
    state.loadedProject = null;
    state.lastMerge = null;
    state.treeFullyLoaded = false;
  }
  function bindReorderDeniedHint(container) {
    if (container._writeDeniedHandleHint) {
      return;
    }
    container._writeDeniedHandleHint = true;
    container.addEventListener("pointerover", (e) => {
      var _a, _b, _c, _d, _e;
      const handle = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".dinext-table-row-reorder-handle");
      if (!handle || !container.contains(handle)) {
        return;
      }
      const table = getState(container).table;
      const sortLocked = container.classList.contains("dinext-table--row-reorder-sort-locked") || !!((_c = table == null ? void 0 : table.isRowReorderSortLocked) == null ? void 0 : _c.call(table));
      const denied = (_d = handle.closest(".ag-row")) == null ? void 0 : _d.classList.contains("tree-gantt-row--reorder-denied");
      const tip = sortLocked ? ((_e = table == null ? void 0 : table.getRowReorderSortLockTooltip) == null ? void 0 : _e.call(table)) || __("Clear sort to move a task") : denied ? writeDeniedTitle() : __("Move");
      if (handle.getAttribute("title") !== tip) {
        handle.setAttribute("title", tip);
        handle.setAttribute("aria-label", tip);
      }
      const host = handle.parentElement;
      if (host == null ? void 0 : host.classList.contains("dinext-table-row-reorder-handle-host")) {
        host.setAttribute("title", tip);
      }
    });
  }
  function readArgs(getArgs) {
    return typeof getArgs === "function" ? getArgs() || {} : getArgs || {};
  }
  function childrenQuery(getArgs, parent_task = null, extra = {}) {
    const args = readArgs(getArgs);
    return __spreadValues({
      project: args.project || null,
      parent_task,
      task: multiPayload(args.task),
      status: multiPayload(args.status),
      priority: multiPayload(args.priority),
      assign: multiPayload(args.assign),
      tag: multiPayload(args.tag),
      limit: args.limit || null
    }, extra);
  }
  async function fetchRootRows(getArgs) {
    const args = readArgs(getArgs);
    if (!args.project) {
      return [];
    }
    if (hasMulti(args.task)) {
      const flat = toTableRows(
        await getChildren(
          childrenQuery(getArgs, null, { all_tasks: 1, limit: null })
        )
      );
      return nestRows(flat);
    }
    return toTableRows(await getChildren(childrenQuery(getArgs, null)));
  }
  async function fetchFullTreeRows(getArgs) {
    const args = readArgs(getArgs);
    if (!args.project) {
      return [];
    }
    const flat = toTableRows(
      await getChildren(
        childrenQuery(getArgs, null, {
          all_tasks: 1,
          limit: null
        })
      )
    );
    return nestRows(flat);
  }
  function taskPathExpandIds(rows, taskIds) {
    const ids = normalizeMulti(taskIds);
    if (!ids.length) {
      return [];
    }
    const map = collectPathById(rows);
    const out = [];
    for (const id of ids) {
      out.push(...ancestorExpandIds(map.get(String(id))));
    }
    return [...new Set(out)];
  }
  function shouldFetchFullTree(state, expandedIds) {
    if ((state == null ? void 0 : state.treeFullyLoaded) && expandedIds.length) {
      return true;
    }
    if ((expandedIds || []).some((id) => String(id).includes(":"))) {
      return true;
    }
    return expandedIds.length > 1;
  }
  function sideDataCtx(getArgs, table) {
    const args = readArgs(getArgs);
    return { project: args.project || null, table };
  }
  function snapshotExpandedIds(table, extraIds) {
    const ids = [];
    if (table == null ? void 0 : table.expandedIds) {
      ids.push(...table.expandedIds);
    }
    if (extraIds == null ? void 0 : extraIds.length) {
      ids.push(...extraIds);
    }
    return ids;
  }
  function sortExpandedIds(ids) {
    return [...new Set((ids || []).map(String).filter(Boolean))].sort(
      (a, b) => a.split(":").length - b.split(":").length || a.localeCompare(b)
    );
  }
  function seedExpandedIds(table, ids) {
    if (!(table == null ? void 0 : table.expandedIds)) {
      return;
    }
    table.expandedIds.clear();
    for (const id of sortExpandedIds(ids)) {
      table.expandedIds.add(id);
    }
  }
  function collectExpandablePathIds(rows, parentPath = null, out = []) {
    for (const row of rows || []) {
      const id = parentPath ? `${parentPath}:${row.id}` : String(row.id);
      const kids = row.children;
      const expandable = row.hasChildren === true || Array.isArray(kids) && kids.length > 0;
      if (expandable) {
        out.push(id);
        if (Array.isArray(kids) && kids.length) {
          collectExpandablePathIds(kids, id, out);
        }
      }
    }
    return out;
  }
  function rowHasVisibleDescendants(table, rowId) {
    var _a, _b;
    const prefix = `${String(rowId)}:`;
    let found = false;
    (_b = (_a = table.api) == null ? void 0 : _a.forEachNode) == null ? void 0 : _b.call(_a, (node) => {
      var _a2;
      if (found) {
        return;
      }
      const id = String(((_a2 = node.data) == null ? void 0 : _a2._rowId) || "");
      if (id.startsWith(prefix)) {
        found = true;
      }
    });
    return found;
  }
  async function ensureExpanded(table, ids, gen, state) {
    var _a, _b, _c, _d, _e;
    if (!(table == null ? void 0 : table.expandRow) || !(ids == null ? void 0 : ids.length)) {
      return;
    }
    for (const id of sortExpandedIds(ids)) {
      if (gen != null && (state == null ? void 0 : state.loadGen) !== gen) {
        return;
      }
      const kids = ((_a = table.getSourceChildren) == null ? void 0 : _a.call(table, id)) || [];
      const visible = rowHasVisibleDescendants(table, id);
      if (kids.length && visible && ((_b = table.isRowExpanded) == null ? void 0 : _b.call(table, id))) {
        continue;
      }
      if ((_d = (_c = table.expandedIds) == null ? void 0 : _c.has) == null ? void 0 : _d.call(_c, id)) {
        table.expandedIds.delete(id);
      }
      try {
        await table.expandRow(id);
      } catch (e) {
        console.error("[task_tree_gantt] ensure expand", id, e);
      }
    }
    (_e = table.refreshAllTreeToggles) == null ? void 0 : _e.call(table);
  }
  async function refetchParentLayers(table, getArgs, parentRowIds) {
    var _a, _b;
    for (const rowId of sortExpandedIds(parentRowIds)) {
      const parentTask = ((_b = (_a = table.findTreeSourceRow) == null ? void 0 : _a.call(table, rowId)) == null ? void 0 : _b.id) || String(rowId).split(":").filter(Boolean).pop() || null;
      const children = toTableRows(
        await getChildren(childrenQuery(getArgs, parentTask))
      ).filter((child) => String((child == null ? void 0 : child.id) || "") !== String(parentTask || ""));
      table.setRowChildren(rowId, children);
    }
  }
  function scheduleSideDataRefresh(getArgs, table, rows) {
    const ctx = sideDataCtx(getArgs, table);
    if (!ctx.project || !ctx.table) {
      return;
    }
    refreshPlanFact(ctx, rows).catch((e) => {
      console.error("[task_tree_gantt] plan_fact refresh", e);
    });
    refreshConflicts(getArgs, table).catch((e) => {
      console.error("[task_tree_gantt] deps conflict refresh", e);
    });
  }
  function createExpandHandler(getArgs, onTreeChange) {
    return async ({ rowId, row, table }) => {
      const parentTask = (row == null ? void 0 : row.id) || String(rowId || "").split(":").filter(Boolean).pop() || null;
      const children = toTableRows(
        await getChildren(childrenQuery(getArgs, parentTask))
      ).filter((child) => String((child == null ? void 0 : child.id) || "") !== String(parentTask || ""));
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
    var _a, _b, _c;
    if (!container) {
      throw new Error("loadTable: container required");
    }
    const state = getState(container);
    const args = readArgs(getArgs);
    const {
      onTreeChange,
      onCellsSaved,
      onSortChange,
      onFilterChange,
      fullscreenShell,
      expandRowIds,
      removeIds
    } = hooks;
    const fullscreen = resolveFullscreenOpts(container, fullscreenShell);
    clearHostChrome(container);
    if (!args.project) {
      clearRemovedIds();
      destroyState(state);
      delete container._treeGanttTable;
      showPlaceholder(container, __("Select a project"));
      return null;
    }
    if (state.table && state.loadedProject && state.loadedProject !== args.project) {
      clearRemovedIds();
      destroyState(state);
    }
    rememberRemovedIds(removeIds);
    const gen = state.loadGen = (state.loadGen || 0) + 1;
    const removed = getRemovedIdList();
    if (state.table && removed.length) {
      installRemovedIdFilter(state.table);
      dropRemovedTasks(state.table, removed);
      onTreeChange == null ? void 0 : onTreeChange();
    }
    if (!state.table) {
      showLoading(container);
    }
    await ensureBundle();
    if (gen !== state.loadGen) {
      return null;
    }
    try {
      const expanded = hasMulti(args.task) ? [...expandRowIds || []] : state.table ? snapshotExpandedIds(state.table, expandRowIds) : [...expandRowIds || []];
      const wantFull = Boolean(state.table) && shouldFetchFullTree(state, expanded);
      const rows = stripRemovedTree(
        wantFull ? await fetchFullTreeRows(getArgs) : await fetchRootRows(getArgs)
      );
      if (gen !== state.loadGen) {
        return null;
      }
      const pathExpand = taskPathExpandIds(rows, args.task);
      if (pathExpand.length) {
        for (const id of pathExpand) {
          if (!expanded.includes(id)) {
            expanded.push(id);
          }
        }
      }
      state.treeFullyLoaded = wantFull || hasMulti(args.task);
      if (state.table) {
        if (state.table._lastClickedCell !== void 0) {
          state.table._lastClickedCell = null;
        }
        (_b = (_a = state.table.api) == null ? void 0 : _a.stopEditing) == null ? void 0 : _b.call(_a);
        const deep = wantFull || hasMulti(args.task);
        installRemovedIdFilter(state.table);
        const merge = applyTreeMerge(state.table, rows, {
          deep,
          removeIds: getRemovedIdList()
        });
        state.lastMerge = merge;
        if (pathExpand.length) {
          for (const id of pathExpand) {
            (_c = state.table.expandedIds) == null ? void 0 : _c.add(id);
          }
        }
        if (expandRowIds == null ? void 0 : expandRowIds.length) {
          if (!deep) {
            await refetchParentLayers(state.table, getArgs, expandRowIds);
            merge.ganttChanged = true;
            merge.sideChanged = true;
            merge.changed = true;
          }
          await ensureExpanded(state.table, expanded, gen, state);
        } else if (pathExpand.length) {
          await ensureExpanded(state.table, pathExpand, gen, state);
        }
        if (gen !== state.loadGen) {
          return null;
        }
        if (merge.ganttChanged) {
          onTreeChange == null ? void 0 : onTreeChange();
        }
        if (merge.sideChanged) {
          scheduleSideDataRefresh(getArgs, state.table);
        }
        state.loadedProject = args.project;
        return state.table;
      }
      clearHostChrome(container);
      container.replaceChildren();
      bindReorderDeniedHint(container);
      const projectKey = args.project || "no-project";
      const taskKey = hasMulti(args.task) ? `:${normalizeMulti(args.task).join(",")}` : "";
      state.table = await DinextTable.create(__spreadProps(__spreadValues({
        container,
        data: rows,
        expandedIds: expanded,
        columns: getColumns(),
        edit: true,
        selection: { enabled: true },
        clipboard: { enabled: true },
        fillHandle: { enabled: true },
        rowCheck: { enabled: true },
        toolbar: {
          persistKey: `task-tree-gantt:${projectKey}${taskKey}`,
          defaultPinned: true,
          lockPinned: true,
          presets: ["history", "tree", "rows", "fullscreen"],
          items: [
            addRootTaskToolbarItem(),
            bulkAssignToolbarItem(),
            ...dateVisibilityToolbarItems(),
            criticalPathToolbarItem({
              getProject: () => {
                var _a2;
                return ((_a2 = getArgs()) == null ? void 0 : _a2.project) || null;
              }
            })
          ]
        },
        onBeforeDeleteRows: createOnBeforeDeleteRows(),
        onDeleteRows: createOnDeleteRows(),
        rowReorder: {
          enabled: true,
          allowTree: "reparent",
          toolbarMove: false,
          blockWhenSorted: true,
          blockWhenSortedTooltip: "Clear sort to move a task"
        },
        canReorderRow: canReorderTaskRow,
        onValidateRowReorder: validateTaskRowReorder,
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
        onFilterChange: (ctx) => {
          onFilterChange == null ? void 0 : onFilterChange(ctx);
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
        gridOptions: {
          rowHeight: ROW_HEIGHT,
          headerHeight: HEADER_HEIGHT,
          floatingFiltersHeight: 28,
          enableBrowserTooltips: true,
          getRowClass: (params) => {
            var _a2, _b2, _c2;
            const classes = [];
            if (!canReorderTaskRow({ row: params.data })) {
              classes.push("tree-gantt-row--reorder-denied");
            }
            const ids = getState(container).relatedTaskIds;
            if (((_b2 = ids == null ? void 0 : ids.has) == null ? void 0 : _b2.call(ids, String(((_a2 = params.data) == null ? void 0 : _a2.id) || ""))) && ((_c2 = params.data) == null ? void 0 : _c2.id)) {
              classes.push("tree-gantt-row--related");
            }
            return classes.length ? classes : void 0;
          }
        }
      }, fullscreen ? { fullscreen } : {}), {
        onExpandRow: createExpandHandler(getArgs, onTreeChange),
        onValidateCells,
        onSaveCells: async (ctx) => {
          var _a2;
          const ok = await onSaveCells(ctx);
          if (ok) {
            if (changesAffectGantt(ctx.changes)) {
              onCellsSaved == null ? void 0 : onCellsSaved(ctx.changes);
            }
            if (dateFieldsAffectConflicts(ctx.changes)) {
              scheduleSideDataRefresh(getArgs, state.table);
            }
            if (dateFieldsAffectConflicts(ctx.changes) || (ctx.changes || []).some((c) => c.field === "status")) {
              void invalidateCriticalPath(((_a2 = getArgs()) == null ? void 0 : _a2.project) || null);
            }
          }
          return ok;
        }
      }));
      installRemovedIdFilter(state.table);
      if (gen !== state.loadGen) {
        destroyState(state);
        return null;
      }
      if (expandRowIds == null ? void 0 : expandRowIds.length) {
        await ensureExpanded(state.table, expandRowIds, gen, state);
        if (gen !== state.loadGen) {
          destroyState(state);
          return null;
        }
      }
      state.lastMerge = { changed: true, ganttChanged: true, sideChanged: true };
      state.loadedProject = args.project;
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
  async function expandAllRows(table, getArgs, container) {
    var _a, _b;
    const args = readArgs(getArgs);
    if (!args.project || !table)
      return;
    const hostState = container == null ? void 0 : container._treeGanttTable;
    const gen = hostState == null ? void 0 : hostState.loadGen;
    frappe.dom.freeze(__("Loading\u2026"));
    try {
      const nested = await fetchFullTreeRows(getArgs);
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return;
      }
      if (hostState) {
        hostState.treeFullyLoaded = true;
      }
      const tree = stripRemovedTree(nested);
      applyTreeMerge(table, tree, {
        deep: true,
        removeIds: getRemovedIdList()
      });
      seedExpandedIds(table, collectExpandablePathIds(tree));
      for (const root of table.sourceData || []) {
        if ((_a = root.children) == null ? void 0 : _a.length) {
          table.setRowChildren(String(root.id), root.children);
        }
      }
      (_b = table.refreshAllTreeToggles) == null ? void 0 : _b.call(table);
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return;
      }
      scheduleSideDataRefresh(getArgs, table);
    } finally {
      frappe.dom.unfreeze();
    }
  }
  async function revealRelatedTasks(table, getArgs, container, originId) {
    var _a, _b, _c, _d;
    const args = readArgs(getArgs);
    if (!args.project || !table || !originId) {
      return null;
    }
    const hostState = container == null ? void 0 : container._treeGanttTable;
    const gen = hostState == null ? void 0 : hostState.loadGen;
    let fetched = false;
    let nested = (hostState == null ? void 0 : hostState.treeFullyLoaded) ? table.sourceData : null;
    if (!Array.isArray(nested) || !nested.length) {
      frappe.dom.freeze(__("Loading\u2026"));
      try {
        nested = await fetchFullTreeRows(getArgs);
        fetched = true;
        if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
          return null;
        }
        if (hostState) {
          hostState.treeFullyLoaded = true;
        }
      } finally {
        frappe.dom.unfreeze();
      }
    }
    const related = collectRelatedTaskIds(nested, originId);
    const pathById = collectPathById(nested);
    const ancestors = [];
    for (const id of related) {
      const path = pathById.get(String(id));
      if (path) {
        ancestors.push(...ancestorExpandIds(path));
      }
    }
    const needed = sortExpandedIds(ancestors);
    if (hostState) {
      hostState.relatedTaskIds = new Set(related.map(String));
    }
    if (fetched) {
      applyTreeMerge(table, stripRemovedTree(nested), {
        deep: true,
        removeIds: getRemovedIdList()
      });
      seedExpandedIds(table, snapshotExpandedIds(table, needed));
      for (const id of needed) {
        const kids = ((_a = table.getSourceChildren) == null ? void 0 : _a.call(table, id)) || [];
        if (kids.length) {
          table.setRowChildren(id, kids);
        }
      }
      (_b = table.refreshAllTreeToggles) == null ? void 0 : _b.call(table);
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return null;
      }
      scheduleSideDataRefresh(getArgs, table);
      return { related, treeChanged: true };
    }
    const missing = needed.filter((id) => {
      var _a2;
      return !((_a2 = table.expandedIds) == null ? void 0 : _a2.has(String(id)));
    });
    for (const id of missing) {
      if (gen != null && (hostState == null ? void 0 : hostState.loadGen) !== gen) {
        return null;
      }
      try {
        await ((_c = table.expandRow) == null ? void 0 : _c.call(table, id));
      } catch (e) {
        console.error("[task_tree_gantt] related expand", id, e);
      }
    }
    if (missing.length) {
      (_d = table.refreshAllTreeToggles) == null ? void 0 : _d.call(table);
    }
    return { related, treeChanged: missing.length > 0 };
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
  function ganttDatesVisible(row) {
    const start = fieldIsHidden(row, "exp_start_date") ? null : row == null ? void 0 : row.exp_start_date;
    const end = fieldIsHidden(row, "exp_end_date") ? null : row == null ? void 0 : row.exp_end_date;
    return !!(start || end);
  }
  function placeholderDay(rows) {
    for (const row of rows || []) {
      const day = row.exp_start_date || row.exp_end_date;
      if (day) {
        return day;
      }
    }
    return frappe.datetime.get_today();
  }
  function rowToGanttTask(row, dummyDay) {
    const startDay = fieldIsHidden(row, "exp_start_date") ? null : row.exp_start_date || null;
    const endDay = fieldIsHidden(row, "exp_end_date") ? null : row.exp_end_date || null;
    const hasBar = !!(startDay || endDay);
    const start = startDay || endDay || dummyDay;
    const end = endDay || startDay || dummyDay;
    const milestone = !!row.is_milestone;
    return {
      id: row.id,
      name: row.subject || row.id,
      start: `${start} 00:00:00`,
      end: `${end}${milestone || !endDay ? " 00:00:00" : " 23:59:59"}`,
      progress: Number(row.progress) || 0,
      dependencies: (row.relations || []).map((r) => r.predecessor).filter(Boolean),
      thumbnail: milestone ? "/files/rhombus.png" : null,
      custom_class: row.priority || "",
      color: statusColor(row.status),
      color_progress: "var(--bg-green)",
      invalid: !hasBar,
      row
    };
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var RING_PAD = 2;
  function criticalRingBox(bar) {
    const x = Number(bar.getAttribute("x"));
    const y = Number(bar.getAttribute("y"));
    const w = Number(bar.getAttribute("width"));
    const h = Number(bar.getAttribute("height"));
    if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
      return null;
    }
    const rx = Number(bar.getAttribute("rx"));
    return {
      x: x - RING_PAD,
      y: y - RING_PAD,
      width: w + RING_PAD * 2,
      height: h + RING_PAD * 2,
      rx: (Number.isFinite(rx) ? rx : 0) + RING_PAD
    };
  }
  function applyCriticalRings(ganttEl) {
    if (!(ganttEl == null ? void 0 : ganttEl.querySelectorAll)) {
      return;
    }
    ganttEl.querySelectorAll(".bar-wrapper[data-id]").forEach((wrap) => {
      const id = wrap.getAttribute("data-id");
      const group = wrap.querySelector(":scope > .bar-group") || wrap;
      const bar = group.querySelector("rect.bar");
      const ring = group.querySelector(`:scope > rect.${CRITICAL_RING_CLASS}`);
      const show = isTaskCritical(id) && bar && !bar.classList.contains("bar-invalid");
      if (!show) {
        ring == null ? void 0 : ring.remove();
        return;
      }
      const box = criticalRingBox(bar);
      if (!box) {
        ring == null ? void 0 : ring.remove();
        return;
      }
      const node = ring || document.createElementNS(SVG_NS, "rect");
      if (!ring) {
        node.setAttribute("class", CRITICAL_RING_CLASS);
        group.insertBefore(node, group.firstChild);
      }
      node.setAttribute("x", String(box.x));
      node.setAttribute("y", String(box.y));
      node.setAttribute("width", String(box.width));
      node.setAttribute("height", String(box.height));
      node.setAttribute("rx", String(box.rx));
      node.setAttribute("ry", String(box.rx));
    });
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
    const list = rows || [];
    const dummy = placeholderDay(list);
    return list.map((row) => rowToGanttTask(row, dummy));
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
  function topHScrollHeight(tableHost) {
    var _a;
    const el3 = (_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(tableHost, ".dinext-table-hscroll-top");
    if (!el3 || el3.classList.contains("is-idle")) {
      return 0;
    }
    return el3.offsetHeight || 0;
  }
  var FILTER_ROW_FALLBACK = 28;
  function filterRowHeight(tableHost) {
    var _a, _b;
    const row = (_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(tableHost, ".ag-header-row-column-filter");
    if (row) {
      return row.offsetHeight || FILTER_ROW_FALLBACK;
    }
    if ((_b = tableHost == null ? void 0 : tableHost.classList) == null ? void 0 : _b.contains("dinext-table--filter-row")) {
      return FILTER_ROW_FALLBACK;
    }
    return 0;
  }
  function parkParent(ganttEl) {
    var _a;
    return ((_a = ganttEl == null ? void 0 : ganttEl.closest) == null ? void 0 : _a.call(ganttEl, ".task-tree-gantt-panel--right")) || (ganttEl == null ? void 0 : ganttEl.parentElement) || null;
  }
  function findGanttHScroll(ganttEl, parked) {
    var _a, _b, _c;
    if ((parked == null ? void 0 : parked.isConnected) || parked) {
      return parked;
    }
    return ((_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, "[data-role=gantt-hscroll-top]")) || ((_c = (_b = parkParent(ganttEl)) == null ? void 0 : _b.querySelector) == null ? void 0 : _c.call(_b, "[data-role=gantt-hscroll-top]")) || null;
  }
  function createGanttHScroll() {
    const bar = document.createElement("div");
    bar.className = "task-tree-gantt-hscroll-top is-idle";
    bar.dataset.role = "gantt-hscroll-top";
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = [
      '<div class="task-tree-gantt-hscroll-top-viewport">',
      '<div class="task-tree-gantt-hscroll-top-content"></div>',
      "</div>"
    ].join("");
    return bar;
  }
  function placeGanttHScroll(ganttEl, bar) {
    var _a, _b;
    if (!bar) {
      return null;
    }
    const header = (_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, ".grid-header");
    if (header) {
      header.after(bar);
      return bar;
    }
    const container = (_b = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _b.call(ganttEl, ".gantt-container");
    if (container) {
      container.prepend(bar);
    }
    return bar;
  }
  function parkGanttHScroll(ganttEl, bar) {
    const host = parkParent(ganttEl);
    if (!bar || !host) {
      return;
    }
    bar.classList.add("is-idle");
    if (bar.parentElement !== host) {
      host.appendChild(bar);
    }
  }
  function tableTitleHeaderHeight(tableHost) {
    var _a;
    const row = (_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(
      tableHost,
      ".ag-header-row:not(.ag-header-row-column-filter)"
    );
    return (row == null ? void 0 : row.offsetHeight) || HEADER_HEIGHT;
  }
  function setupToolbarOffsetSync(tableHost, ganttEl, parkedBar) {
    var _a, _b, _c;
    if (!ganttEl) {
      return () => {
      };
    }
    const toolbar = (_a = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _a.call(tableHost, ".dinext-table-toolbar");
    const bar = findGanttHScroll(ganttEl, parkedBar) || createGanttHScroll();
    const viewport = bar.querySelector(".task-tree-gantt-hscroll-top-viewport");
    const content = bar.querySelector(".task-tree-gantt-hscroll-top-content");
    const ganttVp = ganttViewport(ganttEl);
    let hLock = false;
    const onBarScroll = () => {
      if (hLock || !ganttVp || !viewport || ganttVp.dataset.ganttHProg) {
        return;
      }
      hLock = true;
      ganttVp.scrollLeft = viewport.scrollLeft;
      requestAnimationFrame(() => {
        hLock = false;
      });
    };
    const onGanttHScroll = () => {
      if (hLock || !ganttVp || !viewport) {
        return;
      }
      hLock = true;
      viewport.scrollLeft = ganttVp.scrollLeft;
      requestAnimationFrame(() => {
        hLock = false;
      });
    };
    let headerEl = null;
    let ro;
    const apply = () => {
      const toolbarH = (toolbar == null ? void 0 : toolbar.offsetHeight) || 0;
      const filterH = filterRowHeight(tableHost);
      const header = ganttEl.querySelector(".grid-header");
      if (ro && header && header !== headerEl) {
        if (headerEl) {
          ro.unobserve(headerEl);
        }
        headerEl = header;
        ro.observe(header);
      }
      const ganttHeaderH = (header == null ? void 0 : header.offsetHeight) || GANTT_HEADER_HEIGHT;
      const tableHeaderH = tableTitleHeaderHeight(tableHost);
      const headerDelta = Math.max(0, ganttHeaderH - tableHeaderH);
      ganttEl.style.paddingTop = `${GANTT_BASE_TOP_PAD + toolbarH + filterH - headerDelta}px`;
      const scrollH = topHScrollHeight(tableHost);
      ganttEl.style.setProperty("--gantt-top-scroll-h", `${scrollH}px`);
      ganttEl.style.setProperty("--gantt-header-h", `${ganttHeaderH}px`);
      placeGanttHScroll(ganttEl, bar);
      bar.classList.toggle("is-idle", scrollH === 0);
      if (scrollH > 0 && content && ganttVp) {
        content.style.width = `${ganttVp.scrollWidth || 0}px`;
        if (viewport) {
          viewport.scrollLeft = ganttVp.scrollLeft;
        }
      }
    };
    viewport == null ? void 0 : viewport.addEventListener("scroll", onBarScroll, { passive: true });
    ganttVp == null ? void 0 : ganttVp.addEventListener("scroll", onGanttHScroll, { passive: true });
    ro = new ResizeObserver(apply);
    if (toolbar) {
      ro.observe(toolbar);
    }
    const hscroll = (_b = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _b.call(tableHost, ".dinext-table-hscroll-top");
    if (hscroll) {
      ro.observe(hscroll);
    }
    const agHeader = (_c = tableHost == null ? void 0 : tableHost.querySelector) == null ? void 0 : _c.call(tableHost, ".ag-header");
    if (agHeader) {
      ro.observe(agHeader);
    }
    if (ganttVp) {
      ro.observe(ganttVp);
    }
    apply();
    const mo = tableHost ? new MutationObserver(() => {
      requestAnimationFrame(apply);
    }) : null;
    mo == null ? void 0 : mo.observe(tableHost, { attributes: true, attributeFilter: ["class"] });
    function cleanup() {
      var _a2;
      ro.disconnect();
      mo == null ? void 0 : mo.disconnect();
      viewport == null ? void 0 : viewport.removeEventListener("scroll", onBarScroll);
      ganttVp == null ? void 0 : ganttVp.removeEventListener("scroll", onGanttHScroll);
      ganttEl.style.paddingTop = "";
      ganttEl.style.removeProperty("--gantt-top-scroll-h");
      ganttEl.style.removeProperty("--gantt-header-h");
      parkGanttHScroll(ganttEl, bar);
      (_a2 = ganttEl.querySelector(".task-tree-gantt-hscroll-spacer")) == null ? void 0 : _a2.remove();
    }
    cleanup.apply = apply;
    return cleanup;
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/dates.js
  var DEBOUNCE_MS = 1e3;
  function toDateStr(value) {
    if (value == null || value === "") {
      return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return frappe.datetime.obj_to_str(value);
    }
    if (typeof (DinextTable == null ? void 0 : DinextTable.toIsoDateString) === "function") {
      return DinextTable.toIsoDateString(value);
    }
    const s = String(value).trim();
    if (!s) {
      return null;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return s.slice(0, 10);
    }
    return null;
  }
  function ganttRowFromBarWrap(state, wrap) {
    var _a, _b, _c, _d, _e;
    const id = (_a = wrap == null ? void 0 : wrap.getAttribute) == null ? void 0 : _a.call(wrap, "data-id");
    if (!id) {
      return null;
    }
    return ((_e = (_d = (_c = (_b = state.gantt) == null ? void 0 : _b.get_bar) == null ? void 0 : _c.call(_b, id)) == null ? void 0 : _d.task) == null ? void 0 : _e.row) || null;
  }
  function ganttDateDragAllowed(row, eventTarget) {
    var _a, _b, _c;
    if (!ganttDatesVisible(row)) {
      return false;
    }
    const handle = (_a = eventTarget == null ? void 0 : eventTarget.closest) == null ? void 0 : _a.call(eventTarget, ".handle");
    if ((_b = handle == null ? void 0 : handle.classList) == null ? void 0 : _b.contains("left")) {
      return fieldCanEdit(row, "exp_start_date");
    }
    if ((_c = handle == null ? void 0 : handle.classList) == null ? void 0 : _c.contains("right")) {
      return fieldCanEdit(row, "exp_end_date");
    }
    return fieldCanEdit(row, "exp_start_date") && fieldCanEdit(row, "exp_end_date");
  }
  var BAR_DENIED_CLASS = "tree-gantt-bar--write-denied";
  function markGanttBarWriteDenied(bar) {
    var _a;
    const group = bar == null ? void 0 : bar.bar_group;
    if (!group) {
      return;
    }
    const denied = !ganttDateDragAllowed((_a = bar.task) == null ? void 0 : _a.row, null);
    group.classList.toggle(BAR_DENIED_CLASS, denied);
    const existing = group.querySelector(":scope > title");
    if (denied) {
      if (!existing) {
        const title = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "title"
        );
        title.textContent = writeDeniedTitle();
        group.insertBefore(title, group.firstChild);
      } else {
        existing.textContent = writeDeniedTitle();
      }
    } else if (existing) {
      existing.remove();
    }
  }
  function stripGanttDateHandles(state) {
    var _a, _b, _c, _d;
    const bars = (_a = state.gantt) == null ? void 0 : _a.bars;
    if (!(bars == null ? void 0 : bars.length)) {
      return;
    }
    for (const bar of bars) {
      markGanttBarWriteDenied(bar);
      const row = (_b = bar.task) == null ? void 0 : _b.row;
      const group = bar.handle_group;
      if (!group) {
        continue;
      }
      if (!fieldCanEdit(row, "exp_start_date")) {
        (_c = group.querySelector(".handle.left")) == null ? void 0 : _c.remove();
      }
      if (!fieldCanEdit(row, "exp_end_date")) {
        (_d = group.querySelector(".handle.right")) == null ? void 0 : _d.remove();
      }
    }
  }
  function bindGanttDateDragGuard(state) {
    stripGanttDateHandles(state);
    const el3 = state == null ? void 0 : state.ganttEl;
    if (!el3 || el3._ganttDateDragGuard) {
      return;
    }
    el3._ganttDateDragGuard = true;
    el3.addEventListener(
      "mousedown",
      (ev) => {
        var _a, _b;
        const wrap = (_b = (_a = ev.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".bar-wrapper");
        if (!wrap || !el3.contains(wrap)) {
          return;
        }
        const row = ganttRowFromBarWrap(state, wrap);
        if (!ganttDateDragAllowed(row, ev.target)) {
          ev.stopPropagation();
        }
      },
      true
    );
  }
  async function persistGanttDates(state, { id, row, start, end }, onDone) {
    var _a, _b;
    const startIso = toDateStr(start);
    const endIso = toDateStr(end);
    const payload = [];
    if (startIso && startIso !== ((row == null ? void 0 : row.exp_start_date) || null) && fieldCanEdit(row, "exp_start_date")) {
      payload.push({ id, field: "exp_start_date", value: startIso });
    }
    if (endIso && endIso !== ((row == null ? void 0 : row.exp_end_date) || null) && fieldCanEdit(row, "exp_end_date")) {
      payload.push({ id, field: "exp_end_date", value: endIso });
    }
    if (!payload.length) {
      return;
    }
    await saveCells2(payload, { table: state.table });
    void invalidateCriticalPath(((_b = (_a = state.getArgs) == null ? void 0 : _a.call(state)) == null ? void 0 : _b.project) || null);
    onDone == null ? void 0 : onDone();
  }
  function clearGanttDateTimers(state) {
    const timers = state == null ? void 0 : state._ganttDateTimers;
    if (timers) {
      for (const id of Object.keys(timers)) {
        clearTimeout(timers[id]);
      }
    }
    if (state) {
      state._ganttDateTimers = null;
      state._ganttDatePending = null;
    }
  }
  function createGanttDateChangeHandler(state, onDone) {
    clearGanttDateTimers(state);
    const timers = /* @__PURE__ */ Object.create(null);
    const pending = /* @__PURE__ */ Object.create(null);
    state._ganttDateTimers = timers;
    state._ganttDatePending = pending;
    return function onDateChange(task, start, end) {
      const id = task == null ? void 0 : task.id;
      if (!id) {
        return;
      }
      if (!fieldCanEdit(task.row, "exp_start_date") && !fieldCanEdit(task.row, "exp_end_date")) {
        onDone == null ? void 0 : onDone();
        return;
      }
      pending[id] = { id, row: task.row, start, end };
      if (timers[id]) {
        clearTimeout(timers[id]);
      }
      timers[id] = setTimeout(() => {
        delete timers[id];
        const item = pending[id];
        delete pending[id];
        if (item) {
          void persistGanttDates(state, item, onDone);
        }
      }, DEBOUNCE_MS);
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/hover.js
  var ROW_HOVER = "tree-gantt-row--hover";
  var BAR_HOVER = "tree-gantt-bar--hover";
  var ROW_SELECT = "tree-gantt-row--select";
  var BAR_SELECT = "tree-gantt-bar--select";
  var ROW_RELATED = "tree-gantt-row--related";
  var BAR_RELATED = "tree-gantt-bar--related";
  var ARROW_RELATED = "tree-gantt-arrow--related";
  var INTERACTIVE = "button, a, input, select, textarea, .ag-checkbox, .ag-selection-checkbox, .ag-header, .dinext-table-toolbar, .tree-gantt-subject-toolbar, .dinext-table-tree-toggle, .tree-gantt-frappe-date-editor, .ag-floating-filter, .ag-header-cell-resize, .dinext-table-fill-handle";
  function clearTableClass(tableHost, className) {
    var _a;
    (_a = tableHost == null ? void 0 : tableHost.querySelectorAll) == null ? void 0 : _a.call(tableHost, ".ag-row." + className).forEach((el3) => el3.classList.remove(className));
  }
  function clearGanttClass(ganttEl, className) {
    var _a;
    (_a = ganttEl == null ? void 0 : ganttEl.querySelectorAll) == null ? void 0 : _a.call(ganttEl, ".bar-wrapper." + className).forEach((el3) => el3.classList.remove(className));
  }
  function taskIdFromAgRow(table, rowEl) {
    var _a, _b, _c, _d;
    const pathId = (_a = rowEl == null ? void 0 : rowEl.getAttribute) == null ? void 0 : _a.call(rowEl, "row-id");
    if (!pathId) {
      return "";
    }
    const node = (_c = (_b = table == null ? void 0 : table.api) == null ? void 0 : _b.getRowNode) == null ? void 0 : _c.call(_b, pathId);
    if ((_d = node == null ? void 0 : node.data) == null ? void 0 : _d.id) {
      return String(node.data.id);
    }
    const parts = String(pathId).split(":");
    return parts[parts.length - 1] || pathId;
  }
  function addTableRowClass(tableHost, table, taskId, className) {
    var _a, _b;
    if (!tableHost || !taskId) {
      return;
    }
    const id = String(taskId);
    const indexes = /* @__PURE__ */ new Set();
    (_b = (_a = table == null ? void 0 : table.api) == null ? void 0 : _a.forEachNode) == null ? void 0 : _b.call(_a, (node) => {
      if ((node == null ? void 0 : node.data) && String(node.data.id) === id && node.rowIndex != null) {
        indexes.add(node.rowIndex);
      }
    });
    if (indexes.size) {
      indexes.forEach((idx) => {
        tableHost.querySelectorAll(`.ag-row[row-index="${idx}"]`).forEach((row) => row.classList.add(className));
      });
      return;
    }
    tableHost.querySelectorAll(".ag-row[row-id]").forEach((row) => {
      const rid = row.getAttribute("row-id") || "";
      if (rid === id || rid.endsWith(`:${id}`)) {
        row.classList.add(className);
      }
    });
  }
  function highlightTableRow(tableHost, table, taskId, on, className) {
    if (!tableHost) {
      return;
    }
    clearTableClass(tableHost, className);
    if (on && taskId) {
      addTableRowClass(tableHost, table, taskId, className);
    }
  }
  function highlightGanttBars(ganttEl, taskIds, className) {
    clearGanttClass(ganttEl, className);
    if (!ganttEl || !(taskIds == null ? void 0 : taskIds.length)) {
      return;
    }
    for (const taskId of taskIds) {
      const bar = ganttEl.querySelector(
        `.bar-wrapper[data-id="${CSS.escape(String(taskId))}"]`
      );
      bar == null ? void 0 : bar.classList.add(className);
    }
  }
  function stripRelatedGanttPaint(ganttEl) {
    if (!ganttEl) {
      return;
    }
    ganttEl.querySelectorAll(`.bar-wrapper.${BAR_RELATED}`).forEach((el3) => {
      el3.classList.remove(BAR_RELATED);
    });
    ganttEl.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`).forEach((el3) => {
      el3.classList.remove(ARROW_RELATED);
    });
  }
  function paintRelatedArrows(ganttEl, taskIds, originId) {
    if (!ganttEl) {
      return;
    }
    ganttEl.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`).forEach((el3) => {
      el3.classList.remove(ARROW_RELATED);
    });
    const ids = new Set((taskIds || []).map(String).filter(Boolean));
    const origin = originId ? String(originId) : "";
    if (!ids.size && !origin) {
      return;
    }
    ganttEl.querySelectorAll("path[data-from][data-to]").forEach((path) => {
      var _a;
      const from = path.getAttribute("data-from");
      const to = path.getAttribute("data-to");
      if (!from || !to) {
        return;
      }
      const both = ids.has(from) && ids.has(to);
      const originHop = origin && (from === origin || to === origin);
      if (!both && !originHop) {
        return;
      }
      path.classList.add(ARROW_RELATED);
      (_a = path.closest("g.arrow")) == null ? void 0 : _a.classList.add(ARROW_RELATED);
    });
  }
  function applyRelatedGanttPaint(ganttEl, taskIds, originId) {
    stripRelatedGanttPaint(ganttEl);
    highlightGanttBars(ganttEl, taskIds, BAR_RELATED);
    paintRelatedArrows(ganttEl, taskIds, originId);
  }
  function paintRelatedRows(tableHost, table, taskIds) {
    if (!tableHost) {
      return;
    }
    clearTableClass(tableHost, ROW_RELATED);
    for (const taskId of taskIds || []) {
      addTableRowClass(tableHost, table, taskId, ROW_RELATED);
    }
  }
  function highlightGanttBar(ganttEl, taskId, on, className) {
    highlightGanttBars(ganttEl, on && taskId ? [taskId] : [], className);
  }
  var GANTT_COL_W = 25;
  function ganttViewportEl(ganttEl) {
    var _a;
    return ((_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, ".gantt-container")) || null;
  }
  function lockGanttHProg(box) {
    if (!box) {
      return;
    }
    box.dataset.ganttHProg = "1";
    let done = false;
    const unlock = () => {
      if (done) {
        return;
      }
      done = true;
      delete box.dataset.ganttHProg;
      box.removeEventListener("scrollend", unlock);
    };
    box.addEventListener("scrollend", unlock);
    setTimeout(unlock, 2500);
  }
  function syncGanttHScroll(ganttEl) {
    var _a;
    const vp = ganttViewportEl(ganttEl);
    const bar = (_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(
      ganttEl,
      ".task-tree-gantt-hscroll-top-viewport"
    );
    if (vp && bar) {
      bar.scrollLeft = vp.scrollLeft;
    }
  }
  function ganttColumnWidth(gantt, ganttEl) {
    var _a;
    const fromCfg = Number((_a = gantt == null ? void 0 : gantt.config) == null ? void 0 : _a.column_width);
    if (fromCfg > 0) {
      return fromCfg;
    }
    const box = ganttViewportEl(ganttEl);
    const raw = box && getComputedStyle(box).getPropertyValue("--gv-column-width");
    const css = parseFloat(raw);
    return css > 0 ? css : GANTT_COL_W;
  }
  function ganttDateScrollLeft(gantt, ganttEl, day) {
    var _a, _b, _c;
    if (typeof (gantt == null ? void 0 : gantt.set_scroll_position) === "function") {
      gantt.set_scroll_position(day);
      return true;
    }
    const col = ganttColumnWidth(gantt, ganttEl);
    const step = Number((_a = gantt == null ? void 0 : gantt.config) == null ? void 0 : _a.step) || 1;
    const start = gantt == null ? void 0 : gantt.gantt_start;
    if (start instanceof Date && col > 0 && step > 0) {
      const days = (Date.parse(`${day}T00:00:00`) - start.getTime()) / 864e5;
      if (Number.isFinite(days)) {
        (_c = (_b = ganttViewportEl(ganttEl)) == null ? void 0 : _b.scrollTo) == null ? void 0 : _c.call(_b, {
          left: Math.max(0, days / step * col - col / 6),
          behavior: "smooth"
        });
        return true;
      }
    }
    return false;
  }
  function scrollGanttToDate(gantt, ganttEl, date) {
    const day = String(date || "").slice(0, 10);
    const box = ganttViewportEl(ganttEl);
    if (!box || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return;
    }
    lockGanttHProg(box);
    if (!ganttDateScrollLeft(gantt, ganttEl, day)) {
      box.scrollTo({
        left: 0,
        behavior: "smooth"
      });
    }
    requestAnimationFrame(() => syncGanttHScroll(ganttEl));
  }
  function taskRowData(table, taskId) {
    var _a;
    if (!taskId || !((_a = table == null ? void 0 : table.api) == null ? void 0 : _a.forEachNode)) {
      return null;
    }
    const id = String(taskId);
    let data = null;
    table.api.forEachNode((node) => {
      if (!data && (node == null ? void 0 : node.data) && String(node.data.id) === id) {
        data = node.data;
      }
    });
    return data;
  }
  function scrollGanttToTask(gantt, ganttEl, table, taskId, dateHint) {
    var _a, _b, _c;
    if (dateHint) {
      scrollGanttToDate(gantt, ganttEl, dateHint);
      return;
    }
    const box = ganttViewportEl(ganttEl);
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(taskId || "")) : String(taskId || "").replace(/"/g, '\\"');
    const bar = (_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(
      ganttEl,
      `.bar-wrapper[data-id="${esc}"] rect.bar`
    );
    const x = Number((_b = bar == null ? void 0 : bar.getAttribute) == null ? void 0 : _b.call(bar, "x"));
    if (box && Number.isFinite(x) && x >= 0) {
      const col = ganttColumnWidth(gantt, ganttEl);
      lockGanttHProg(box);
      box.scrollTo({
        left: Math.max(0, x - col / 6),
        behavior: "smooth"
      });
      requestAnimationFrame(() => syncGanttHScroll(ganttEl));
      return;
    }
    const start = (_c = taskRowData(table, taskId)) == null ? void 0 : _c.exp_start_date;
    if (start) {
      scrollGanttToDate(gantt, ganttEl, start);
    }
  }
  function dateFromHeaderEl(el3) {
    var _a;
    const node = (_a = el3 == null ? void 0 : el3.closest) == null ? void 0 : _a.call(el3, ".lower-text, .upper-text");
    if (!node) {
      return "";
    }
    const cls = [...node.classList || []].find((c) => c.startsWith("date_"));
    if (!cls) {
      return "";
    }
    const raw = cls.slice(5).replace(/_/g, "-");
    return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
  }
  function dateFromTableCell(target) {
    var _a, _b;
    const cell = (_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, ".ag-cell");
    const col = ((_b = cell == null ? void 0 : cell.getAttribute) == null ? void 0 : _b.call(cell, "col-id")) || "";
    if (col !== "exp_start_date" && col !== "exp_end_date") {
      return "";
    }
    const row = cell.closest(".ag-row");
    return row ? col : "";
  }
  function setupHoverSync(tableHost, ganttEl, table, gantt, initialSelect, state) {
    if (!tableHost || !ganttEl) {
      return () => {
      };
    }
    let lastHover = null;
    let lastSelect = null;
    let leaveTimer = null;
    function paintHover(taskId) {
      if (!taskId) {
        clearTableClass(tableHost, ROW_HOVER);
        clearGanttClass(ganttEl, BAR_HOVER);
        return;
      }
      highlightTableRow(tableHost, table, taskId, true, ROW_HOVER);
      highlightGanttBar(ganttEl, taskId, true, BAR_HOVER);
    }
    function paintSelect(taskId) {
      if (!taskId) {
        clearTableClass(tableHost, ROW_SELECT);
        clearGanttClass(ganttEl, BAR_SELECT);
        return;
      }
      highlightTableRow(tableHost, table, taskId, true, ROW_SELECT);
      highlightGanttBar(ganttEl, taskId, true, BAR_SELECT);
    }
    function paintRelatedBars() {
      applyRelatedGanttPaint(
        ganttEl,
        (state == null ? void 0 : state.relatedTaskIds) || [],
        state == null ? void 0 : state.relatedOriginId
      );
    }
    function clearRelated() {
      var _a;
      const host = tableHost._treeGanttTable;
      const hadPaint = !!(state && (state.relatedTaskIds.length > 0 || state.relatedOriginId)) || ((_a = host == null ? void 0 : host.relatedTaskIds) == null ? void 0 : _a.size) > 0;
      if (!hadPaint) {
        return;
      }
      if (state) {
        state.relatedFocusGen = (state.relatedFocusGen || 0) + 1;
        if (state.relatedRevealTimer) {
          clearTimeout(state.relatedRevealTimer);
          state.relatedRevealTimer = 0;
        }
        state.relatedTaskIds = [];
        state.relatedOriginId = "";
      }
      if (host) {
        host.relatedTaskIds = /* @__PURE__ */ new Set();
      }
      clearTableClass(tableHost, ROW_RELATED);
      applyRelatedGanttPaint(ganttEl, [], "");
    }
    function setHover(taskId) {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (lastHover === taskId) {
        return;
      }
      lastHover = taskId;
      paintHover(taskId);
    }
    function setSelect(taskId) {
      if (lastSelect === taskId) {
        return;
      }
      lastSelect = taskId;
      paintSelect(taskId);
    }
    function scheduleClear() {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
      }
      leaveTimer = setTimeout(() => setHover(null), 80);
    }
    function onTableOver(e) {
      var _a, _b;
      const row = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".ag-row");
      const id = taskIdFromAgRow(table, row);
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
    function onRelationsCell(target) {
      var _a, _b, _c;
      const cell = (_a = target == null ? void 0 : target.closest) == null ? void 0 : _a.call(target, ".ag-cell");
      if (((_b = cell == null ? void 0 : cell.getAttribute) == null ? void 0 : _b.call(cell, "col-id")) === "relations") {
        return true;
      }
      return !!((_c = target == null ? void 0 : target.closest) == null ? void 0 : _c.call(target, ".tree-gantt-relations"));
    }
    function onTableClick(e) {
      var _a, _b, _c, _d;
      if ((_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, INTERACTIVE)) {
        return;
      }
      const row = (_d = (_c = e.target) == null ? void 0 : _c.closest) == null ? void 0 : _d.call(_c, ".ag-row");
      const id = taskIdFromAgRow(table, row);
      if (!id) {
        return;
      }
      if (!onRelationsCell(e.target)) {
        clearRelated();
      }
      const already = lastSelect === id;
      setSelect(id);
      if (already) {
        return;
      }
      const dateCol = dateFromTableCell(e.target);
      const rowData = taskRowData(table, id);
      const hint = dateCol && rowData ? rowData[dateCol] : null;
      scrollGanttToTask(gantt, ganttEl, table, id, hint);
    }
    function onGanttClick(e) {
      var _a, _b, _c;
      const headerDate = dateFromHeaderEl(e.target);
      if (headerDate) {
        scrollGanttToDate(gantt, ganttEl, headerDate);
        return;
      }
      const wrap = (_b = (_a = e.target) == null ? void 0 : _a.closest) == null ? void 0 : _b.call(_a, ".bar-wrapper[data-id]");
      const id = (_c = wrap == null ? void 0 : wrap.getAttribute) == null ? void 0 : _c.call(wrap, "data-id");
      if (!id) {
        return;
      }
      clearRelated();
      setSelect(id);
    }
    tableHost.addEventListener("mouseover", onTableOver, { passive: true });
    tableHost.addEventListener("mouseleave", scheduleClear, { passive: true });
    tableHost.addEventListener("click", onTableClick, true);
    ganttEl.addEventListener("mouseover", onGanttOver, { passive: true });
    ganttEl.addEventListener("mouseleave", scheduleClear, { passive: true });
    ganttEl.addEventListener("click", onGanttClick, true);
    if (initialSelect) {
      setSelect(initialSelect);
    }
    paintRelatedBars();
    return function cleanup() {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
      }
      tableHost.removeEventListener("mouseover", onTableOver);
      tableHost.removeEventListener("mouseleave", scheduleClear);
      tableHost.removeEventListener("click", onTableClick, true);
      ganttEl.removeEventListener("mouseover", onGanttOver);
      ganttEl.removeEventListener("mouseleave", scheduleClear);
      ganttEl.removeEventListener("click", onGanttClick, true);
      clearTableClass(tableHost, ROW_HOVER);
      clearTableClass(tableHost, ROW_SELECT);
      clearGanttClass(ganttEl, BAR_HOVER);
      clearGanttClass(ganttEl, BAR_SELECT);
      clearGanttClass(ganttEl, BAR_RELATED);
      ganttEl.querySelectorAll(`path.${ARROW_RELATED}, g.arrow.${ARROW_RELATED}`).forEach((el3) => {
        el3.classList.remove(ARROW_RELATED);
      });
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/arrows.js
  var STUB = 10;
  var CURVE = 6;
  var NS = "http://www.w3.org/2000/svg";
  var MK_START = "tree-gantt-mk-start";
  var MK_END = "tree-gantt-mk-end";
  var MK_START_REL = "tree-gantt-mk-start-rel";
  var MK_END_REL = "tree-gantt-mk-end-rel";
  var HIT_CLASS = "tree-gantt-arrow-hit";
  var HOVER_CLASS = "tree-gantt-arrow--hover";
  function n(v) {
    return Math.round(Number(v) * 10) / 10;
  }
  function d(...parts) {
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
  function samePoint(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }
  function collinear(a, b, c) {
    return (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x);
  }
  function uniquePoints(points) {
    const out = [];
    for (const p of points) {
      const next = { x: n(p.x), y: n(p.y) };
      if (!samePoint(out[out.length - 1], next)) {
        out.push(next);
      }
    }
    const slim = [];
    for (const p of out) {
      while (slim.length >= 2 && collinear(slim[slim.length - 2], slim[slim.length - 1], p)) {
        slim.pop();
      }
      slim.push(p);
    }
    return slim;
  }
  function roundedPath(points, radius = CURVE) {
    const pts = uniquePoints(points);
    if (pts.length === 0) {
      return "";
    }
    if (pts.length === 1) {
      return d("M", pts[0].x, pts[0].y);
    }
    if (pts.length === 2) {
      return d("M", pts[0].x, pts[0].y, "L", pts[1].x, pts[1].y);
    }
    const parts = ["M", pts[0].x, pts[0].y];
    for (let i = 1; i < pts.length - 1; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const next = pts[i + 1];
      const inLen = dist(prev, cur);
      const outLen = dist(cur, next);
      const r = Math.min(radius, inLen / 2, outLen / 2);
      if (r < 0.5 || inLen < 0.5 || outLen < 0.5) {
        parts.push("L", cur.x, cur.y);
        continue;
      }
      const ux = (cur.x - prev.x) / inLen;
      const uy = (cur.y - prev.y) / inLen;
      const vx = (next.x - cur.x) / outLen;
      const vy = (next.y - cur.y) / outLen;
      parts.push("L", n(cur.x - ux * r), n(cur.y - uy * r));
      parts.push("Q", cur.x, cur.y, n(cur.x + vx * r), n(cur.y + vy * r));
    }
    const last = pts[pts.length - 1];
    parts.push("L", last.x, last.y);
    return d(...parts);
  }
  function midY(box) {
    return box.y + box.h / 2;
  }
  function sameRow(a, b) {
    return Math.abs(midY(a) - midY(b)) < 2;
  }
  function loopY(from, to) {
    return Math.max(from.y + from.h, to.y + to.h) + STUB;
  }
  function pathFS(from, to) {
    const x1 = from.x + from.w;
    const y1 = midY(from);
    const x2 = to.x;
    const y2 = midY(to);
    const goLeft = x2 < x1 + STUB;
    if (sameRow(from, to)) {
      if (!goLeft) {
        return roundedPath([
          { x: x1, y: y1 },
          { x: x2, y: y2 }
        ]);
      }
      const ly = loopY(from, to);
      return roundedPath([
        { x: x1, y: y1 },
        { x: x1, y: ly },
        { x: x2 - STUB, y: ly },
        { x: x2 - STUB, y: y2 },
        { x: x2, y: y2 }
      ]);
    }
    if (!goLeft) {
      const sx = x1 + STUB;
      return roundedPath([
        { x: x1, y: y1 },
        { x: sx, y: y1 },
        { x: sx, y: y2 },
        { x: x2, y: y2 }
      ]);
    }
    return roundedPath([
      { x: x1, y: y1 },
      { x: x1, y: y2 },
      { x: x2, y: y2 }
    ]);
  }
  function pathSS(from, to) {
    const x1 = from.x;
    const y1 = midY(from);
    const x2 = to.x;
    const y2 = midY(to);
    const left = Math.min(x1, x2) - STUB;
    if (sameRow(from, to)) {
      const ly = loopY(from, to);
      return roundedPath([
        { x: x1, y: y1 },
        { x: left, y: y1 },
        { x: left, y: ly },
        { x: x2 - STUB, y: ly },
        { x: x2 - STUB, y: y2 },
        { x: x2, y: y2 }
      ]);
    }
    return roundedPath([
      { x: x1, y: y1 },
      { x: left, y: y1 },
      { x: left, y: y2 },
      { x: x2, y: y2 }
    ]);
  }
  function pathFF(from, to) {
    const x1 = from.x + from.w;
    const y1 = midY(from);
    const x2 = to.x + to.w;
    const y2 = midY(to);
    const right = Math.max(x1, x2) + STUB;
    if (sameRow(from, to)) {
      const ly = loopY(from, to);
      return roundedPath([
        { x: x1, y: y1 },
        { x: right, y: y1 },
        { x: right, y: ly },
        { x: x2 + STUB, y: ly },
        { x: x2 + STUB, y: y2 },
        { x: x2, y: y2 }
      ]);
    }
    return roundedPath([
      { x: x1, y: y1 },
      { x: right, y: y1 },
      { x: right, y: y2 },
      { x: x2, y: y2 }
    ]);
  }
  function pathSF(from, to) {
    const x1 = from.x;
    const y1 = midY(from);
    const x2 = to.x + to.w;
    const y2 = midY(to);
    const sx = x1 - STUB;
    const ex = x2 + STUB;
    if (sameRow(from, to)) {
      const ly = loopY(from, to);
      return roundedPath([
        { x: x1, y: y1 },
        { x: sx, y: y1 },
        { x: sx, y: ly },
        { x: ex, y: ly },
        { x: ex, y: y2 },
        { x: x2, y: y2 }
      ]);
    }
    return roundedPath([
      { x: x1, y: y1 },
      { x: sx, y: y1 },
      { x: sx, y: y2 },
      { x: ex, y: y2 },
      { x: x2, y: y2 }
    ]);
  }
  var PATH_BY_TYPE = {
    FS: pathFS,
    SS: pathSS,
    FF: pathFF,
    SF: pathSF
  };
  function relationPath(fromBox, toBox, type) {
    const fn = PATH_BY_TYPE[type] || pathFS;
    return fn(fromBox, toBox);
  }
  function svgEl(name, attrs) {
    const el3 = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs || {})) {
      el3.setAttribute(key, value);
    }
    return el3;
  }
  var MARKER_VER = "3";
  var RELATED_COLOR_FALLBACK = "#c4a9f3";
  function relatedMarkerColor(ganttEl) {
    var _a;
    const host = ((_a = ganttEl == null ? void 0 : ganttEl.closest) == null ? void 0 : _a.call(ganttEl, ".task-tree-gantt-chart")) || ganttEl;
    if (!host || typeof window.getComputedStyle !== "function") {
      return RELATED_COLOR_FALLBACK;
    }
    const color = window.getComputedStyle(host).getPropertyValue("--g-related-color").trim();
    return color || RELATED_COLOR_FALLBACK;
  }
  function makeStartMarker(id, fill) {
    const marker = svgEl("marker", {
      id,
      markerWidth: "12",
      markerHeight: "12",
      refX: "6",
      refY: "6",
      orient: "auto",
      markerUnits: "userSpaceOnUse",
      overflow: "visible"
    });
    marker.appendChild(
      svgEl("circle", {
        cx: "6",
        cy: "6",
        r: "3.6",
        fill,
        stroke: "none"
      })
    );
    return marker;
  }
  function makeEndMarker(id, fill) {
    const marker = svgEl("marker", {
      id,
      markerWidth: "14",
      markerHeight: "12",
      refX: "13",
      refY: "6",
      orient: "auto",
      markerUnits: "userSpaceOnUse",
      overflow: "visible"
    });
    marker.appendChild(
      svgEl("path", {
        d: "M 0 1 L 14 6 L 0 11 Z",
        fill,
        stroke: "none"
      })
    );
    return marker;
  }
  function ensureArrowMarkers(ganttEl) {
    var _a;
    const svg = (_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, "svg");
    if (!svg) {
      return;
    }
    let defs = svg.querySelector("defs.tree-gantt-arrow-defs");
    const related = relatedMarkerColor(ganttEl);
    if ((defs == null ? void 0 : defs.getAttribute("data-ver")) === MARKER_VER && (defs == null ? void 0 : defs.getAttribute("data-c")) === related) {
      return;
    }
    defs == null ? void 0 : defs.remove();
    defs = svgEl("defs", {
      class: "tree-gantt-arrow-defs",
      "data-ver": MARKER_VER,
      "data-c": related
    });
    const muted = "#a4a4a4";
    defs.appendChild(makeStartMarker(MK_START, muted));
    defs.appendChild(makeEndMarker(MK_END, muted));
    defs.appendChild(makeStartMarker(MK_START_REL, related));
    defs.appendChild(makeEndMarker(MK_END_REL, related));
    svg.insertBefore(defs, svg.firstChild);
  }
  function raiseArrowLayer(ganttEl) {
    var _a, _b, _c;
    const svg = ((_a = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _a.call(ganttEl, "svg.gantt")) || ((_b = ganttEl == null ? void 0 : ganttEl.querySelector) == null ? void 0 : _b.call(ganttEl, "svg"));
    const layer = (_c = svg == null ? void 0 : svg.querySelector) == null ? void 0 : _c.call(svg, ":scope > g.arrow");
    if (svg && layer && svg.lastElementChild !== layer) {
      svg.appendChild(layer);
    }
  }
  function underlayFor(group, key) {
    var _a;
    if (!group) {
      return null;
    }
    for (const el3 of group.children) {
      if (((_a = el3.classList) == null ? void 0 : _a.contains(CRITICAL_ARROW_UNDERLAY_CLASS)) && el3.getAttribute("data-critical-pair") === key) {
        return el3;
      }
    }
    return null;
  }
  function syncCriticalUnderlay(path) {
    var _a, _b;
    const group = path.parentNode;
    if (!group) {
      return;
    }
    const fromId = path.getAttribute("data-from");
    const toId = path.getAttribute("data-to");
    const key = `${fromId}\0${toId}`;
    const existing = underlayFor(group, key);
    if (!isCriticalEdge(fromId, toId)) {
      existing == null ? void 0 : existing.remove();
      return;
    }
    const node = existing || svgEl("path", {
      class: CRITICAL_ARROW_UNDERLAY_CLASS,
      fill: "none",
      "pointer-events": "none"
    });
    if (!existing) {
      node.setAttribute("data-critical-pair", key);
    }
    const anchor = ((_b = (_a = path.previousElementSibling) == null ? void 0 : _a.classList) == null ? void 0 : _b.contains(HIT_CLASS)) ? path.previousElementSibling : path;
    if (node.parentNode !== group || node.nextElementSibling !== anchor) {
      group.insertBefore(node, anchor);
    }
    const next = path.getAttribute("d") || "";
    if (node.getAttribute("d") !== next) {
      node.setAttribute("d", next);
    }
  }
  function syncHitPath(path) {
    const group = path.parentNode;
    if (!group) {
      return;
    }
    let hit = group.querySelector(`:scope > path.${HIT_CLASS}`);
    if (!hit) {
      hit = svgEl("path", { class: HIT_CLASS });
      group.insertBefore(hit, path);
    }
    const next = path.getAttribute("d") || "";
    if (hit.getAttribute("d") !== next) {
      hit.setAttribute("d", next);
    }
  }
  function barBox(ganttEl, taskId) {
    var _a;
    if (!ganttEl || !taskId) {
      return null;
    }
    const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(taskId)) : String(taskId).replace(/"/g, '\\"');
    const wrap = ganttEl.querySelector(`.bar-wrapper[data-id="${esc}"]`);
    const bar = (_a = wrap == null ? void 0 : wrap.querySelector) == null ? void 0 : _a.call(wrap, "rect.bar");
    if (!bar) {
      return null;
    }
    const x = Number(bar.getAttribute("x"));
    const y = Number(bar.getAttribute("y"));
    const w = Number(bar.getAttribute("width"));
    const h = Number(bar.getAttribute("height"));
    if (![x, y, w, h].every(Number.isFinite) || w < 0 || h < 0) {
      return null;
    }
    return { x, y, w, h };
  }
  function relationTypeMap(table) {
    var _a, _b;
    const map = /* @__PURE__ */ new Map();
    (_b = (_a = table == null ? void 0 : table.api) == null ? void 0 : _a.forEachNode) == null ? void 0 : _b.call(_a, (node) => {
      const row = node == null ? void 0 : node.data;
      if (!(row == null ? void 0 : row.id) || !Array.isArray(row.relations)) {
        return;
      }
      for (const rel of row.relations) {
        if (!(rel == null ? void 0 : rel.predecessor)) {
          continue;
        }
        const key = `${rel.predecessor}\0${row.id}`;
        if (!map.has(key)) {
          map.set(key, shortRelationType(rel.type));
        }
      }
    });
    return map;
  }
  function isArrowPathNode(el3) {
    var _a, _b, _c, _d;
    return (el3 == null ? void 0 : el3.nodeType) === 1 && ((_a = el3.getAttribute) == null ? void 0 : _a.call(el3, "data-from")) && ((_b = el3.getAttribute) == null ? void 0 : _b.call(el3, "data-to")) && !((_d = (_c = el3.classList) == null ? void 0 : _c.contains) == null ? void 0 : _d.call(_c, HIT_CLASS));
  }
  function mutationTouchesArrows(mutations) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "d") {
        if (isArrowPathNode(m.target)) {
          return true;
        }
        continue;
      }
      if (m.type !== "childList") {
        continue;
      }
      for (const node of m.addedNodes) {
        if ((node == null ? void 0 : node.nodeType) !== 1) {
          continue;
        }
        if ((_b = (_a = node.classList) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, HIT_CLASS)) {
          continue;
        }
        if ((_d = (_c = node.classList) == null ? void 0 : _c.contains) == null ? void 0 : _d.call(_c, CRITICAL_ARROW_UNDERLAY_CLASS)) {
          continue;
        }
        if ((_f = (_e = node.classList) == null ? void 0 : _e.contains) == null ? void 0 : _f.call(_e, "tree-gantt-arrow-defs")) {
          continue;
        }
        if (isArrowPathNode(node) || ((_g = node.matches) == null ? void 0 : _g.call(node, "svg.gantt, g.arrow")) || ((_h = node.querySelector) == null ? void 0 : _h.call(node, "path[data-from][data-to]"))) {
          return true;
        }
      }
    }
    return false;
  }
  function applyRelationArrowGeometry(ganttEl, table) {
    if (!ganttEl) {
      return;
    }
    ganttEl._arrowGeomApplying = true;
    try {
      ensureArrowMarkers(ganttEl);
      const types = relationTypeMap(table);
      ganttEl.querySelectorAll("path[data-from][data-to]").forEach((path) => {
        const fromId = path.getAttribute("data-from");
        const toId = path.getAttribute("data-to");
        if (!fromId || !toId) {
          return;
        }
        const from = barBox(ganttEl, fromId);
        const to = barBox(ganttEl, toId);
        if (!from || !to) {
          return;
        }
        const type = types.get(`${fromId}\0${toId}`) || "FS";
        const next = relationPath(from, to, type);
        if (path.getAttribute("data-rel-type") !== type) {
          path.setAttribute("data-rel-type", type);
        }
        if (path.getAttribute("d") !== next) {
          path.setAttribute("d", next);
        }
        syncHitPath(path);
        syncCriticalUnderlay(path);
      });
      raiseArrowLayer(ganttEl);
    } finally {
      queueMicrotask(() => {
        ganttEl._arrowGeomApplying = false;
      });
    }
  }
  function watchRelationArrowGeometry(ganttEl, apply) {
    if (!ganttEl || typeof MutationObserver === "undefined") {
      return () => {
      };
    }
    let raf = 0;
    const obs = new MutationObserver((mutations) => {
      if (ganttEl._arrowGeomApplying || raf) {
        return;
      }
      if (!mutationTouchesArrows(mutations)) {
        return;
      }
      raf = requestAnimationFrame(() => {
        raf = 0;
        apply();
      });
    });
    obs.observe(ganttEl, {
      attributes: true,
      attributeFilter: ["d"],
      childList: true,
      subtree: true
    });
    return () => {
      obs.disconnect();
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }
  function visualArrowPath(target) {
    var _a, _b, _c, _d, _e, _f;
    if (!target) {
      return null;
    }
    const direct = (_a = target.closest) == null ? void 0 : _a.call(target, "path[data-from][data-to]");
    if (direct) {
      return direct;
    }
    const hit = ((_c = (_b = target.classList) == null ? void 0 : _b.contains) == null ? void 0 : _c.call(_b, HIT_CLASS)) ? target : (_d = target.closest) == null ? void 0 : _d.call(target, `path.${HIT_CLASS}`);
    if (!hit) {
      return null;
    }
    const next = hit.nextElementSibling;
    if ((_e = next == null ? void 0 : next.getAttribute) == null ? void 0 : _e.call(next, "data-from")) {
      return next;
    }
    const prev = hit.previousElementSibling;
    if ((_f = prev == null ? void 0 : prev.getAttribute) == null ? void 0 : _f.call(prev, "data-from")) {
      return prev;
    }
    return null;
  }
  function raiseArrowPath(path) {
    var _a, _b;
    const parent = path == null ? void 0 : path.parentNode;
    if (!parent) {
      return;
    }
    const key = `${path.getAttribute("data-from")}\0${path.getAttribute("data-to")}`;
    const under = underlayFor(parent, key);
    const prev = path.previousElementSibling;
    const hit = ((_b = (_a = prev == null ? void 0 : prev.classList) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, HIT_CLASS)) ? prev : null;
    if (under) {
      parent.appendChild(under);
    }
    if (hit) {
      parent.appendChild(hit);
    }
    parent.appendChild(path);
  }
  function clearArrowHover(ganttEl) {
    var _a;
    (_a = ganttEl == null ? void 0 : ganttEl.querySelectorAll) == null ? void 0 : _a.call(ganttEl, `path.${HOVER_CLASS}`).forEach((el3) => el3.classList.remove(HOVER_CLASS));
  }
  function bindArrowHover(ganttEl) {
    if (!ganttEl) {
      return () => {
      };
    }
    let current = null;
    function setHover(path) {
      if (current === path) {
        return;
      }
      clearArrowHover(ganttEl);
      current = path || null;
      if (!path) {
        return;
      }
      path.classList.add(HOVER_CLASS);
      raiseArrowPath(path);
    }
    function onOver(e) {
      const path = visualArrowPath(e.target);
      if (!path || !ganttEl.contains(path)) {
        return;
      }
      setHover(path);
    }
    function onOut(e) {
      var _a, _b;
      const path = visualArrowPath(e.target) || current;
      if (!path || current !== path) {
        return;
      }
      const next = visualArrowPath(e.relatedTarget);
      if (next === path) {
        return;
      }
      if (e.relatedTarget && ((_b = (_a = path.parentNode) == null ? void 0 : _a.contains) == null ? void 0 : _b.call(_a, e.relatedTarget))) {
        const relatedPath = visualArrowPath(e.relatedTarget);
        if (relatedPath === path) {
          return;
        }
      }
      setHover(null);
    }
    ganttEl.addEventListener("mouseover", onOver);
    ganttEl.addEventListener("mouseout", onOut);
    return () => {
      ganttEl.removeEventListener("mouseover", onOver);
      ganttEl.removeEventListener("mouseout", onOut);
      clearArrowHover(ganttEl);
      current = null;
    };
  }
  function bindRelationArrowGeometry(ganttEl, apply) {
    apply();
    const unwatch = watchRelationArrowGeometry(ganttEl, apply);
    const unhover = bindArrowHover(ganttEl);
    return () => {
      unwatch();
      unhover();
    };
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/gantt/index.js
  var assetsPromise = null;
  async function ensureAssets() {
    if (typeof window.Gantt === "function") {
      return;
    }
    if (!assetsPromise) {
      assetsPromise = frappe.require([...GANTT_ASSETS]).catch((err) => {
        assetsPromise = null;
        throw err;
      });
    }
    await assetsPromise;
    if (typeof window.Gantt !== "function") {
      assetsPromise = null;
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
      return ((doc == null ? void 0 : doc.holidays) || []).map((d2) => ({
        date: d2.holiday_date,
        name: d2.description,
        weekly_off: !!d2.weekly_off
      }));
    } catch (e) {
      console.warn("[task_tree_gantt] holidays", e);
      return [];
    }
  }
  function formatPopupDate(value) {
    var _a, _b, _c, _d;
    if (!value) {
      return "";
    }
    const iso = value instanceof Date ? ((_b = (_a = frappe.datetime) == null ? void 0 : _a.obj_to_str) == null ? void 0 : _b.call(_a, value)) || moment(value).format("YYYY-MM-DD") : String(value).slice(0, 10);
    if (typeof ((_c = frappe.datetime) == null ? void 0 : _c.str_to_user) === "function") {
      return frappe.datetime.str_to_user(iso);
    }
    return moment(iso).locale(((_d = frappe.boot) == null ? void 0 : _d.lang) || "en").format("D MMM");
  }
  function fillAssignPopup(assignEl, row) {
    const users = Array.isArray(row == null ? void 0 : row.assign) ? row.assign.filter(Boolean) : [];
    if (!users.length) {
      assignEl.innerHTML = frappe.utils.icon("assign", "md") || "+";
      return;
    }
    assignEl.appendChild(renderAvatars(users, row));
  }
  function hideGanttPopup(ctx) {
    var _a, _b, _c, _d, _e, _f, _g;
    (_c = (_b = (_a = ctx == null ? void 0 : ctx.chart) == null ? void 0 : _a.popup) == null ? void 0 : _b.hide) == null ? void 0 : _c.call(_b);
    (_g = (_f = (_e = (_d = ctx.get_details) == null ? void 0 : _d.call(ctx)) == null ? void 0 : _e.closest) == null ? void 0 : _f.call(_e, ".popup-wrapper")) == null ? void 0 : _g.classList.add("hide");
  }
  function localizeGanttChrome(ganttEl) {
    if (!ganttEl) {
      return;
    }
    const todayBtn = ganttEl.querySelector(".today-button");
    if (todayBtn) {
      todayBtn.textContent = __("Today");
    }
    const modeSelect = ganttEl.querySelector(".viewmode-select");
    if (!modeSelect) {
      return;
    }
    for (const opt of modeSelect.options) {
      const source = opt.disabled ? "Mode" : opt.value;
      if (source) {
        opt.textContent = __(source);
      }
    }
  }
  function showPopup(ctx, state) {
    var _a, _b;
    ctx.set_title(ctx.task.name);
    const start = formatPopupDate(ctx.task.start);
    const end = formatPopupDate(ctx.task.end);
    const progress = Math.floor((Number(ctx.task.progress) || 0) * 100) / 100;
    ctx.set_subtitle(`${start} - ${end}<br/>${__("Progress")}: ${progress}%`);
    const row = ctx.task.row;
    ctx.set_details(`<div class="gantt-assign-avatars"></div>`);
    const details = (_a = ctx.get_details) == null ? void 0 : _a.call(ctx);
    const assignEl = (_b = details == null ? void 0 : details.querySelector) == null ? void 0 : _b.call(details, ".gantt-assign-avatars");
    if (!assignEl) {
      return;
    }
    fillAssignPopup(assignEl, row);
    if (!fieldCanEdit(row, "assign")) {
      assignEl.classList.add("tree-gantt-cell--write-denied");
      assignEl.title = deniedTitle(row, "assign");
      return;
    }
    assignEl.classList.add("gantt-assign-avatars--action");
    assignEl.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideGanttPopup(ctx);
      openAssignForTask(state == null ? void 0 : state.table, ctx.task.id);
    });
  }
  function buildOptions(holidays, state) {
    const weekend = holidays.filter((d2) => d2.weekly_off);
    const fest = holidays.filter((d2) => !d2.weekly_off);
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
      popup: (ctx) => showPopup(ctx, state),
      on_double_click: (task) => {
        if (task == null ? void 0 : task.id) {
          frappe.set_route("Form", "Task", task.id);
        }
      },
      language: frappe.boot.lang,
      upper_header_height: GANTT_UPPER_HEADER,
      lower_header_height: GANTT_LOWER_HEADER,
      bar_corner_radius: 3,
      padding: GANTT_PADDING,
      bar_height: GANTT_BAR_HEIGHT,
      column_width: 25,
      holidays: {
        "var(--g-weekend-highlight-color)": weekend,
        "var(--g-holiday-highlight-color)": fest
      },
      readonly: !frappe.model.can_write("Task"),
      readonly_progress: true,
      readonly_dates: false,
      on_date_change: createGanttDateChangeHandler(
        state,
        () => scheduleGanttRefresh(state)
      ),
      on_view_change: () => {
        const gen = ganttGen(state);
        localizeGanttChrome(state.ganttEl);
        reapplyGanttArrows(state);
        requestAnimationFrame(() => {
          var _a;
          if (ganttStillCurrent(state, gen)) {
            localizeGanttChrome(state.ganttEl);
            (_a = state.applyGanttOffset) == null ? void 0 : _a.call(state);
          }
        });
      }
    };
  }
  function ganttGen(state) {
    return state._ganttGen || 0;
  }
  function ganttStillCurrent(state, gen) {
    var _a;
    return ganttGen(state) === gen && !!((_a = state.ganttEl) == null ? void 0 : _a.isConnected);
  }
  function watchGanttWidth(state) {
    const el3 = state.ganttEl;
    if (!el3 || state._ganttWidthRO) {
      return;
    }
    const ro = new ResizeObserver(() => {
      if (state.ganttEl !== el3 || !el3.isConnected) {
        ro.disconnect();
        state._ganttWidthRO = null;
        return;
      }
      if (el3.clientWidth > 0) {
        ro.disconnect();
        state._ganttWidthRO = null;
        scheduleGanttRefresh(state);
      }
    });
    state._ganttWidthRO = ro;
    ro.observe(el3);
  }
  function reapplyGanttArrows(state) {
    if (!(state == null ? void 0 : state.ganttEl)) {
      return;
    }
    const gen = ganttGen(state);
    const el3 = state.ganttEl;
    const run = () => {
      if (!ganttStillCurrent(state, gen) || state.ganttEl !== el3) {
        return;
      }
      applyRelationArrowGeometry(state.ganttEl, state.table);
      applyCriticalRings(state.ganttEl);
      applyRelatedGanttPaint(
        state.ganttEl,
        state.relatedTaskIds || [],
        state.relatedOriginId
      );
    };
    run();
    requestAnimationFrame(run);
  }
  function bindSync(state) {
    var _a, _b;
    const selectedRow = (_b = (_a = state.tableHost) == null ? void 0 : _a.querySelector) == null ? void 0 : _b.call(
      _a,
      ".ag-row.tree-gantt-row--select"
    );
    const selectedId = taskIdFromAgRow(state.table, selectedRow);
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
    if (typeof state.ganttArrowGeomCleanup === "function") {
      state.ganttArrowGeomCleanup();
      state.ganttArrowGeomCleanup = null;
    }
    state.applyGanttOffset = null;
    if (state.tableHost && state.ganttEl) {
      state.ganttSyncCleanup = setupScrollSync(state.tableHost, state.ganttEl);
      state.ganttHoverCleanup = setupHoverSync(
        state.tableHost,
        state.ganttEl,
        state.table,
        state.gantt,
        selectedId,
        state
      );
      const offsetSync = setupToolbarOffsetSync(
        state.tableHost,
        state.ganttEl,
        state.ganttHScroll
      );
      state.ganttToolbarSyncCleanup = offsetSync;
      state.applyGanttOffset = offsetSync.apply;
      state.ganttArrowGeomCleanup = bindRelationArrowGeometry(
        state.ganttEl,
        () => reapplyGanttArrows(state)
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
    const gen = ganttGen(state);
    if (state.ganttEl.clientWidth <= 0) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!ganttStillCurrent(state, gen)) {
        return null;
      }
      if (state.ganttEl.clientWidth <= 0) {
        watchGanttWidth(state);
        return null;
      }
    }
    const project = (_b = (_a = state.getArgs) == null ? void 0 : _a.call(state)) == null ? void 0 : _b.project;
    if (!project || !state.table) {
      destroyGantt(state);
      return null;
    }
    await ensureAssets();
    if (!ganttStillCurrent(state, gen)) {
      return null;
    }
    const tasks = collectGanttTasks(state.table);
    if (!tasks.length) {
      destroyGantt(state);
      return null;
    }
    if (!state.holidays || state.holidaysProject !== project) {
      state.holidays = await loadHolidays(project);
      state.holidaysProject = project;
    }
    if (!ganttStillCurrent(state, gen) || ((_d = (_c = state.getArgs) == null ? void 0 : _c.call(state)) == null ? void 0 : _d.project) !== project || !state.table) {
      return null;
    }
    if (((_e = state.gantt) == null ? void 0 : _e.refresh) && ((_g = (_f = state.ganttEl).querySelector) == null ? void 0 : _g.call(_f, ".gantt"))) {
      state.gantt.refresh(tasks);
      applyCriticalRings(state.ganttEl);
      localizeGanttChrome(state.ganttEl);
      bindSync(state);
      bindGanttDateDragGuard(state);
      return state.gantt;
    }
    state.gantt = null;
    state.ganttEl.innerHTML = "";
    state.gantt = new Gantt(
      state.ganttEl,
      tasks,
      buildOptions(state.holidays || [], state)
    );
    localizeGanttChrome(state.ganttEl);
    applyCriticalRings(state.ganttEl);
    bindSync(state);
    bindGanttDateDragGuard(state);
    return state.gantt;
  }
  async function pumpGanttUpdates(state) {
    if (state._ganttPumping) {
      return;
    }
    state._ganttPumping = true;
    const pumpId = ganttGen(state);
    try {
      while (state._ganttDirty && ganttGen(state) === pumpId) {
        state._ganttDirty = false;
        await runGanttUpdate(state);
      }
    } finally {
      if (ganttGen(state) === pumpId) {
        state._ganttPumping = false;
        if (state._ganttDirty) {
          void pumpGanttUpdates(state);
        }
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
    state._ganttGen = ganttGen(state) + 1;
    state._ganttDirty = false;
    if (state._ganttWidthRO) {
      state._ganttWidthRO.disconnect();
      state._ganttWidthRO = null;
    }
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
    if (typeof state.ganttArrowGeomCleanup === "function") {
      state.ganttArrowGeomCleanup();
      state.ganttArrowGeomCleanup = null;
    }
    state.applyGanttOffset = null;
    clearGanttDateTimers(state);
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
    var _a, _b, _c, _d, _e;
    if (!table || table._treeGanttHooks) {
      return;
    }
    table._treeGanttHooks = true;
    const expandAll = (_a = table.expandAll) == null ? void 0 : _a.bind(table);
    if (expandAll) {
      table.expandAll = () => expandAllRows(table, state.getArgs, state.tableHost).then(() => scheduleGanttRefresh(state)).catch((e) => {
        console.error(e);
        frappe.msgprint(e.message || String(e));
      });
    }
    const expandRow = (_b = table.expandRow) == null ? void 0 : _b.bind(table);
    if (expandRow) {
      table.expandRow = async (rowId) => {
        const result = await expandRow(rowId);
        scheduleGanttRefresh(state);
        return result;
      };
    }
    const collapse = (_c = table.collapseRow) == null ? void 0 : _c.bind(table);
    if (collapse) {
      table.collapseRow = (rowId) => {
        collapse(rowId);
        scheduleGanttRefresh(state);
      };
    }
    const collapseAll = (_d = table.collapseAll) == null ? void 0 : _d.bind(table);
    if (collapseAll) {
      table.collapseAll = () => {
        collapseAll();
        scheduleGanttRefresh(state);
      };
    }
    const refreshAfterReorder = (_e = table.refreshAfterRowReorder) == null ? void 0 : _e.bind(table);
    if (refreshAfterReorder) {
      table.refreshAfterRowReorder = (section) => {
        refreshAfterReorder(section);
        if (section !== "summary") {
          scheduleGanttRefresh(state);
        }
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
    const ganttHScroll = document.createElement("div");
    ganttHScroll.className = "task-tree-gantt-hscroll-top is-idle";
    ganttHScroll.dataset.role = "gantt-hscroll-top";
    ganttHScroll.setAttribute("aria-hidden", "true");
    ganttHScroll.innerHTML = [
      '<div class="task-tree-gantt-hscroll-top-viewport">',
      '<div class="task-tree-gantt-hscroll-top-content"></div>',
      "</div>"
    ].join("");
    right.append(gantt, ganttHScroll);
    shell.append(left, border, right);
    parent.appendChild(shell);
    applyWidths(left, right, readStoredLeftPct());
    return { shell, left, border, right, tableHost, gantt, ganttHScroll };
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
  var RELATED_REVEAL_MS = 400;
  function stripRelatedRowClass(state) {
    var _a, _b;
    (_b = (_a = state.tableHost) == null ? void 0 : _a.querySelectorAll) == null ? void 0 : _b.call(_a, ".ag-row.tree-gantt-row--related").forEach((el3) => el3.classList.remove("tree-gantt-row--related"));
  }
  function cancelRelatedReveal(state) {
    if (state.relatedRevealTimer) {
      clearTimeout(state.relatedRevealTimer);
      state.relatedRevealTimer = 0;
    }
    state.relatedFocusGen = (state.relatedFocusGen || 0) + 1;
  }
  function clearRelatedIds(state) {
    var _a;
    cancelRelatedReveal(state);
    state.relatedTaskIds = [];
    state.relatedOriginId = "";
    const host = (_a = state.tableHost) == null ? void 0 : _a._treeGanttTable;
    if (host) {
      host.relatedTaskIds = /* @__PURE__ */ new Set();
    }
    stripRelatedRowClass(state);
    applyRelatedGanttPaint(state.ganttEl, [], "");
  }
  function setRelatedIds(state, ids, originId) {
    var _a;
    const next = [...new Set((ids || []).map(String).filter(Boolean))];
    state.relatedTaskIds = next;
    state.relatedOriginId = originId ? String(originId) : "";
    const host = (_a = state.tableHost) == null ? void 0 : _a._treeGanttTable;
    if (host) {
      host.relatedTaskIds = new Set(next);
    }
    paintRelatedRows(state.tableHost, state.table, next);
    applyRelatedGanttPaint(state.ganttEl, next, state.relatedOriginId);
  }
  function paintLoadedRelated(state, originId) {
    var _a;
    const nested = (_a = state.table) == null ? void 0 : _a.sourceData;
    const ids = Array.isArray(nested) && nested.length ? relatedHighlightIds(nested, originId) : [];
    if (!ids.length) {
      return false;
    }
    setRelatedIds(state, ids, originId);
    return true;
  }
  function scheduleRelatedReveal(state, row) {
    cancelRelatedReveal(state);
    state.relatedRevealTimer = window.setTimeout(() => {
      state.relatedRevealTimer = 0;
      void revealHiddenRelated(state, row);
    }, RELATED_REVEAL_MS);
  }
  async function revealHiddenRelated(state, row) {
    const originId = String((row == null ? void 0 : row.id) || "");
    if (!originId || !state.table) {
      return;
    }
    const gen = ++state.relatedFocusGen;
    try {
      const result = await revealRelatedTasks(
        state.table,
        state.getArgs,
        state.tableHost,
        row.id
      );
      if (gen !== state.relatedFocusGen) {
        return;
      }
      if (!result) {
        return;
      }
      const origin = String(row.id);
      const ids = (result.related || []).filter(Boolean).map(String);
      if (!ids.some((id) => id !== origin)) {
        clearRelatedIds(state);
        return;
      }
      setRelatedIds(state, ids, row.id);
      if (result.treeChanged) {
        await ensureGantt(state);
      }
      if (gen !== state.relatedFocusGen) {
        return;
      }
      scrollGanttToTask(state.gantt, state.ganttEl, state.table, originId);
    } catch (e) {
      console.error("[task_tree_gantt] relations focus", e);
      frappe.msgprint(e.message || String(e));
    }
  }
  function handleRelationsFocus(state, opts = {}) {
    var _a;
    if (opts.cancel) {
      cancelRelatedReveal(state);
      return;
    }
    if (!((_a = opts.row) == null ? void 0 : _a.id)) {
      return;
    }
    const rels = Array.isArray(opts.row.relations) ? opts.row.relations : [];
    const painted = paintLoadedRelated(state, String(opts.row.id));
    if (!painted && !rels.length) {
      clearRelatedIds(state);
      return;
    }
    scheduleRelatedReveal(state, opts.row);
  }
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
      fullscreenShell: null,
      relatedTaskIds: [],
      relatedOriginId: "",
      relatedFocusGen: 0,
      relatedRevealTimer: 0,
      mountGen: 0
    };
    setCriticalPathPainter(() => {
      var _a2, _b2, _c;
      (_c = (_b2 = (_a2 = state.table) == null ? void 0 : _a2.api) == null ? void 0 : _b2.redrawRows) == null ? void 0 : _c.call(_b2);
      scheduleGanttRefresh(state);
    });
    const reload = async (opts = {}) => {
      var _a2, _b2, _c, _d, _e, _f;
      const gen = ++state.mountGen;
      clearRelatedIds(state);
      const project = ((_b2 = (_a2 = state.getArgs) == null ? void 0 : _a2.call(state)) == null ? void 0 : _b2.project) || "";
      const loaded = (_d = (_c = state.tableHost) == null ? void 0 : _c._treeGanttTable) == null ? void 0 : _d.loadedProject;
      if (loaded && project && loaded !== project) {
        destroyGantt(state);
      }
      const table = await loadTable(state.tableHost, state.getArgs, {
        onTreeChange: () => scheduleGanttRefresh(state),
        onCellsSaved: () => scheduleGanttRefresh(state),
        onSortChange: () => scheduleGanttRefresh(state),
        onFilterChange: (ctx) => {
          var _a3;
          clearRelatedIds(state);
          (_a3 = state.applyGanttOffset) == null ? void 0 : _a3.call(state);
          const json = JSON.stringify((ctx == null ? void 0 : ctx.filter) || {});
          if (json !== state._ganttFilterJson) {
            state._ganttFilterJson = json;
            scheduleGanttRefresh(state);
          }
        },
        fullscreenShell: state.fullscreenShell,
        expandRowIds: opts.expandRowIds,
        removeIds: opts.removeIds
      });
      if (gen !== state.mountGen) {
        return;
      }
      state.table = table;
      if (isCriticalPathVisible()) {
        await reloadCriticalPath(project);
      }
      if (state.table) {
        wireTreeGanttHooks(state.table, state);
        const merge = (_f = (_e = state.tableHost) == null ? void 0 : _e._treeGanttTable) == null ? void 0 : _f.lastMerge;
        if (!state.gantt || (merge == null ? void 0 : merge.ganttChanged) !== false) {
          await ensureGantt(state);
        }
      } else {
        destroyGantt(state);
      }
    };
    const filters = await setupFilters({
      page,
      onChange: () => {
        if (state.tableHost) {
          void reload();
        }
      }
    });
    state.getArgs = filters.getArgs;
    state.applyRouteProject = filters.applyRouteProject;
    const refreshGantt = () => scheduleGanttRefresh(state);
    setColumnContext({
      page,
      onAssignSaved: refreshGantt,
      onGanttRefresh: refreshGantt,
      onRelationsFocus: (opts) => {
        handleRelationsFocus(state, opts);
      },
      getTreeTable: () => state.table,
      onTreeMutate: (opts) => {
        void reload(opts);
      }
    });
    const main = page.main.get(0);
    state.fullscreenShell = main;
    const zones = buildShell(main);
    state.tableHost = zones.tableHost;
    state.ganttEl = zones.gantt;
    state.ganttHScroll = zones.ganttHScroll;
    const disposeResize = setupResize(zones);
    await reload();
    const onShow = async () => {
      var _a2, _b2, _c, _d;
      invalidateSubjectDescriptionCache();
      const project = ((_b2 = (_a2 = state.getArgs) == null ? void 0 : _a2.call(state)) == null ? void 0 : _b2.project) || "";
      const loaded = (_d = (_c = state.tableHost) == null ? void 0 : _c._treeGanttTable) == null ? void 0 : _d.loadedProject;
      if (state.table && loaded === project) {
        await ensureGantt(state);
      }
      await reload();
    };
    const onHide = () => {
      state.mountGen += 1;
      closeSubjectPreview();
      invalidateSubjectDescriptionCache();
      destroyGantt(state);
    };
    const resetView = async () => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
      await ((_a2 = filters.resetExceptProject) == null ? void 0 : _a2.call(filters));
      if (state.table) {
        (_c = (_b2 = state.table).clearSort) == null ? void 0 : _c.call(_b2, { silent: true });
        (_e = (_d = state.table).clearFilter) == null ? void 0 : _e.call(_d, { silent: true });
        if ((_g = (_f = state.table).isFilterRowOpen) == null ? void 0 : _g.call(_f)) {
          (_i = (_h = state.table).toggleFilterRow) == null ? void 0 : _i.call(_h, false);
        }
      }
      await reload();
    };
    return __spreadProps(__spreadValues({}, zones), { state, disposeResize, onShow, onHide, resetView });
  }

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/task_tree_gantt/index.js
  frappe.provide("dinext_project_tasks_gantt.treeGantt");
  dinext_project_tasks_gantt.treeGantt = {
    mount
  };
})();
//# sourceMappingURL=task_tree_gantt.bundle.GIFG776F.js.map
