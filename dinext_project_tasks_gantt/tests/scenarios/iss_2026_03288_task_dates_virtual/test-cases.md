# ISS-2026-03288 Task dates + virtual mirror (слои 1–2)

Порт runnable-кейсов ISS-2025-02606 TC-06…07, TC-11…16, TC-19, TC-21…23, TC-26…28 и двух extra-методов (resolution widen, parent expand via Issue). Новые кейсы не добавлялись.

- issue: `ISS-2026-03288` (источник кейсов: `ISS-2025-02606`)
- site: `dev.dinext.localhost`
- owner_app: `dinext_project_tasks_gantt`
- dependent_apps:
  - `erpnext`
  - `dinext_projects` (TC-06 / TC-11: UTP rollup → `Task.save`)
- primary_surface: `Python`
- secondary_surfaces: []
- scenario_dir: `frappe-bench/apps/dinext_project_tasks_gantt/dinext_project_tasks_gantt/tests/scenarios/iss_2026_03288_task_dates_virtual`
- data_helper: `data_setup.py`
- source_of_truth:
  - `dinext_project_tasks_gantt/task_dates/actual.py`
  - `dinext_project_tasks_gantt/task_dates/depend.py`
  - `dinext_project_tasks_gantt/virtual_task/sync/issue_to_task.py`
  - `dinext_project_tasks_gantt/virtual_task/sync/task_to_issue.py`
  - `dinext_project_tasks_gantt/hooks.py`
- sync_required: `no`
- run_targets:
  - `dinext_project_tasks_gantt.tests.scenarios.iss_2026_03288_task_dates_virtual.test_task_dates_virtual`
- actors:
  - setup_user: `Administrator`
  - business_user: `test.iss-2026-03288-g@example.com`
- runtime_inputs:
  - SS `Issue_To_Virtual_Task` / `Task_Virtual_To_Issue` / `Task_Actual_Dates_Sync` на local disabled; runtime = hooks
  - `run_issue_virtual_task_sync` зовёт `sync_issue_to_virtual_task` напрямую (изолированный ITVT, как старый `execute_doc`)
  - `save_issue_via_doctype_hooks` — полный `Issue.save()` (TC-16, TC-28)
  - `run_task_virtual_issue_sync` зовёт `sync_virtual_task_to_issue`; guard = `flags.itvt_save_depth`
  - ping-pong режет `itvt_save_depth`; временное disable SS больше не нужно
  - `resolution_date` / `sla_resolution_date`: helper пишет оба поля, если есть в meta
- reset_scope:
  - prefix `TEST ISS-2026-03288-G`
  - user `test.iss-2026-03288-g@example.com`
- primary_test_artifacts:
  - `test_task_dates_virtual.py`
- last_run: 2026-08-12 — `dev.dinext.localhost`, `dinext-frappe-local-backend-1`, модуль `test_task_dates_virtual` **17/17 OK**; unit `test_task_dates` 7 OK, `test_virtual_task` 14 OK; smoke `smoke_03288_manual` TC0–TC10 PASS, `smoke_layer5` PASS

## Status Legend

- ⚪ не составлен
- 🟡 не запущен
- 🟢 пройден
- 🔴 не пройден

## Test Cases

- 🟢 TC-06: Согласование UTP выставляет факт обычной Task и расширяет родительские `exp_*`
  - surface: `Python`
  - artifacts: `test_approved_utp_updates_regular_task_and_parent_dates`

- 🟢 TC-07: Completed обычная Task подтягивает `completed_on` и плановые даты из факта
  - surface: `Python`
  - artifacts: `test_completed_task_syncs_completed_on_and_plan_dates_from_fact`

- 🟢 TC-11: Виртуальная Task повторяет UTP-факт обычной Task
  - surface: `Python`
  - artifacts: `test_virtual_task_uses_same_utp_fact_rules_as_regular_task`

- 🟢 TC-12: Виртуальная Task синхронизирует `completed_on` / `exp_*` без потери связки с Issue
  - surface: `Python`
  - artifacts: `test_virtual_task_syncs_completed_fields_without_losing_issue_link`

- 🟢 TC-13: Пересохранение Issue не удаляет `act_*` у virtual task
  - surface: `Python`
  - notes: `opening_date` тоже меняем — `act_start` не из opening (02606)
  - artifacts: `test_issue_resave_does_not_clear_virtual_task_actual_dates`

- 🟢 TC-14: `Issue.custom_expected_resolution_date` влияет на `exp_end` только пока нет `act_end`
  - surface: `Python`
  - artifacts: `test_issue_expected_resolution_date_affects_virtual_task_only_before_act_end_exists`

- 🟢 TC-15: Закрытие Issue: `completed_on = act_end`, иначе `today`
  - surface: `Python`
  - artifacts: `test_closing_issue_sets_virtual_task_completed_on_from_act_end_or_today`

- 🟢 TC-16: After-save путь `Issue.save()` сохраняет факт и завершает virtual task по `act_end`
  - surface: `Python`
  - artifacts: `test_issue_after_save_cascade_keeps_virtual_task_fact_and_completes_by_act_end`

- 🟢 extra: `Issue.resolution_*` только расширяет `virtual Task.act_end`
  - surface: `Python`
  - notes: метод был в 02606, отдельного TC-номера в md не имел
  - artifacts: `test_issue_resolution_date_can_only_extend_virtual_task_act_end_date`

- 🟢 TC-19: Прогноз через Issue совпадает с прямым `Task.save()` (валидная дата)
  - surface: `Python`
  - artifacts: `test_issue_expected_resolution_date_matches_direct_task_save_for_valid_date`

- ⚪ TC-20: Негатив — то же блокирующее сообщение, что и прямой `Task.save()`
  - notes: в 02606 runnable-метода не было; не выдумываем

- 🟢 TC-21: Факт на leaf расширяет `exp_*` по цепочке родителей
  - surface: `Python`
  - artifacts: `test_leaf_fact_expands_expected_dates_through_all_parents`

- 🟢 TC-22: Completed-родитель расширяет только `exp_*`, не `act_*` / `completed_on`
  - surface: `Python`
  - artifacts: `test_completed_parent_only_expands_expected_dates`

- 🟢 TC-23: Cancelled-родитель не меняется при расширении leaf
  - surface: `Python`
  - artifacts: `test_cancelled_parent_does_not_change_when_leaf_fact_expands`

- 🟢 extra: прогноз через Issue расширяет родителя так же, как прямой `Task.save()`
  - artifacts: `test_issue_expected_resolution_date_expands_parent_like_direct_task_save`

- 🟢 TC-26: Прямой TVTI обновляет Issue
  - surface: `Python`
  - action: `sync_virtual_task_to_issue` без `Issue.save()`
  - artifacts: `test_virtual_task_reverse_sync_updates_issue_when_issue_hook_isolated`

- 🟢 TC-27: `itvt_save_depth` блокирует TVTI
  - surface: `Python`
  - artifacts: `test_itvt_save_depth_blocks_reverse_sync_from_virtual_task_to_issue`

- 🟢 TC-28: Полный loop `Issue.save() → Task.save() → …` без RecursionError
  - surface: `Python`
  - artifacts: `test_full_issue_task_issue_loop_completes_without_recursion`

## Last run

- date: `2026-08-12`
- site: `dev.dinext.localhost`
- command: `docker exec dinext-frappe-local-backend-1 bench --site dev.dinext.localhost run-tests --module dinext_project_tasks_gantt.tests.scenarios.iss_2026_03288_task_dates_virtual.test_task_dates_virtual`
- result: **17/17 OK**
- notes: restored `ensure_issue` (db_insert, без ITVT на create). TC-13 ещё меняет `opening_date` — `act_start` не из opening. D1/D4 не чиним. Depend live — smoke TC9, не этот модуль.
