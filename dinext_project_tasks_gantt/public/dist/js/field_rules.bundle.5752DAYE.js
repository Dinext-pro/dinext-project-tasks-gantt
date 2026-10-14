(() => {
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

  // ../dinext_project_tasks_gantt/dinext_project_tasks_gantt/public/js/field_rules.bundle.js
  installFieldRules(window);
})();
//# sourceMappingURL=field_rules.bundle.5752DAYE.js.map
