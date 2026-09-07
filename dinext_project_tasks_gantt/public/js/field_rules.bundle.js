/**
 * app_include_js: provides the global `dinext.fieldRules` registry on every
 * Desk page (Task form adapter + Task Tree consume it; owner apps register).
 */
import { installFieldRules } from "./task_tree_gantt/table/field_rules.js";

installFieldRules(window);
