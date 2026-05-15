# Dinext Project Tasks Gantt

## 📖 Обзор

**Dinext Project Tasks Gantt** — приложение на [Frappe](https://frappeframework.com/), расширяющее ERPNext **Project / Task** для Dinext: представления Gantt и дерева, работа с зависимостями, оценки в story points, **журнал изменений поля «% выполнения»** (`progress`) у задач, **автоматический пересчёт `%` у групповых родителей** по весам дочерних задач (с монотонным «полом» и цепочкой вверх по иерархии), а также **серии для графиков** (тренд прогноза/факта на форме задачи и отчёт Epic Burndown).

В составе приложения — **фикстуры** (Custom Field, Client Script, Server Script, записи Story Point) и **DocTypes** (например `Task Relation`, `Story Point`, `Task Progress History`). Серверная логика аудита прогресса и rollup групповых задач вызывается при сохранении и удалении `Task` через `doc_events`, поэтому изменения фиксируются при сохранении из формы, через API и в скриптах — не только из интерфейса Desk. Данные для графиков отдаёт модуль [`burndown.py`](dinext_project_tasks_gantt/burndown.py) (whitelisted-методы для клиента и отчёта).

## ✨ Возможности

- **Расширение UI задачи** — Client Script на `Task` (дерево, Gantt, оформление и поведение зависимостей).
- **Логика зависимостей** — Server Script и дочерняя таблица **`Task Relation`** на `Task` (`custom_relations`) для связей предшественник/последователь и связанной автоматизации.
- **Story points** — DocType **`Story Point`** и поле-связь **`story_point`** на `Task`.
- **Аудит прогресса** — при сохранении уже существующей задачи, если **`progress`** реально изменился, в **`custom_progress_history`** (таблица **`Task Progress History`**) добавляется строка с `changed_on`, `changed_by`, `old_progress`, `new_progress`. При первой вставке документа строка не создаётся; при неизменном прогрессе дубликаты не пишутся.
- **Прогресс групповых задач (rollup)** — после сохранения или удаления `Task` пересчитывается **только прямой** родитель-группа: взвешенное среднее по прямым детям с `task_weight > 0`; итог **`max(raw, текущий %)`** и не выше 100%, то есть сохранённый у родителя процент **не понижается** автоматикой; при росте расчётного значения выполняется `save` родителя, что запускает тот же механизм для **его** родителя (цепочка без явного цикла по всем предкам в одном хуке). Отключение: `doc.flags.skip_parent_progress_rollup = True`. Реализация: [`task_parent_progress.py`](dinext_project_tasks_gantt/task_parent_progress.py), события `Task` в [`hooks.py`](dinext_project_tasks_gantt/hooks.py) — `on_update`, `after_delete`.
- **Progress Trend на форме Task** — виджет в дашборде формы (подключается через `hooks.py`: `doctype_js` / `app_include_css`). Данные: `dinext_project_tasks_gantt.burndown.get_task_progress_trend`; клиент: [`public/js/task_progress_trend.js`](dinext_project_tasks_gantt/public/js/task_progress_trend.js) (ECharts). Вертикальные маркеры дат на оси X по возможности совпадают по цвету с соответствующими линиями рядов: **Today** — фактический прогресс, **Progress forecast end** — прогноз прогресса, **Work hours forecast end** — прогноз трудозатрат; если в одном bucket объединены маркеры разных типов, используется нейтральный цвет темы.
- **Отчёт Task Epic Burndown** — Script Report в модуле приложения; график строится из `get_burndown_series` (см. `dinext_project_tasks_gantt/report/task_epic_burndown/`).
- **Инструменты качества** — `pre-commit` с ruff, ESLint, Prettier, pyupgrade (см. `.pre-commit-config.yaml`).

## 🚀 Установка

Нужна рабочая среда [bench](https://github.com/frappe/bench) с уже установленным на целевом сайте **ERPNext** (и Frappe).

```bash
cd /path/to/frappe-bench
bench get-app https://github.com/YOUR_ORG/dinext_project_tasks_gantt.git --branch develop
bench --site your-site.local install-app dinext_project_tasks_gantt
bench --site your-site.local migrate
bench build --app dinext_project_tasks_gantt
```

После установки перезагрузите сайт и убедитесь, что **migrate** выполнился успешно, чтобы появились Custom Field и таблицы DocType.

## 🛠️ Использование

- **Desk** — откройте **Task** как обычно; блок **Progress History** отображается после поля **% Progress**, если кастомное поле есть. Строки заполняются автоматически; таблица только для чтения. Секция **Progress Trend** (если задача не новая и не milestone) показывает график по периоду (день / неделя / месяц). У **групповых** задач поле **% Progress** при сохранении или удалении дочерних задач может обновиться автоматически по правилам rollup (см. раздел «Возможности»).
- **Разработчикам** — аудит прогресса: `dinext_project_tasks_gantt.task_progress_audit.before_save_task` (`doc_events["Task"]["before_save"]`). Rollup родителя: `dinext_project_tasks_gantt.task_parent_progress.on_update_task` и `after_delete_task`. Логика аудита — `task_progress_audit.py`; rollup — [`task_parent_progress.py`](dinext_project_tasks_gantt/task_parent_progress.py). Burndown и тренд — `burndown.py`; тесты — `test_burndown.py`, [`test_task_parent_progress.py`](dinext_project_tasks_gantt/test_task_parent_progress.py).

Запуск тестов:

```bash
bench --site your-site.local run-tests --app dinext_project_tasks_gantt
bench --site your-site.local run-tests --app dinext_project_tasks_gantt --module dinext_project_tasks_gantt.test_task_parent_progress
```

## 📦 Технологии

- **Python** 3.10+ (см. `pyproject.toml`)
- **Frappe Framework** / **ERPNext** (через bench)
- **JavaScript** — Client Script (фикстуры) для Desk
- **Линтинг / форматирование** — Ruff, ESLint, Prettier, pyupgrade через pre-commit

## 🔧 Конфигурация

- **Hooks** — `dinext_project_tasks_gantt/hooks.py`: `app_name`, `fixtures` (Custom Field, Story Point, Client Script, Server Script), `doc_events` для `Task`: **`before_save`** (аудит прогресса), **`on_update`** и **`after_delete`** (rollup `%` у прямого родителя-группы).
- **Фикстуры** — экспортированные метаданные в `dinext_project_tasks_gantt/fixtures/`. Новые Custom Field не добавляют правкой файлов вручную: создают в системе (или через MCP) и выполняют `bench export-fixtures` по принятому у команды процессу (см. `AGENTS.md`).
- **Патчи** — `dinext_project_tasks_gantt/patches.txt` для патчей миграций при необходимости.

## ✅ Требования

- [bench](https://github.com/frappe/bench) и сайт с установленным **ERPNext**
- **Python** >= 3.10
- **MariaDB** (или СУБД, поддерживаемая вашей версией Frappe), **Redis**, **Node** — как требует ваш стек bench

## 🤝 Участие в разработке

1. Клонируйте приложение в `apps/dinext_project_tasks_gantt`.
2. Установите pre-commit и включите его для репозитория:

```bash
cd apps/dinext_project_tasks_gantt
pre-commit install
```

3. Соблюдайте соглашения проекта в [`AGENTS.md`](AGENTS.md) (метаданные Frappe, фикстуры, правила MCP-first где применимо).

## 📄 Документация

- **[AGENTS.md](AGENTS.md)** — руководство по разработке в этом проекте (паттерны Frappe, DocType, фикстуры, тесты).
- **Frappe** — [документация Frappe](https://frappeframework.com/docs)
- **ERPNext** — [документация ERPNext](https://docs.erpnext.com)

## ❤️ Благодарности

Разработано **Dinext** для ERPNext/Frappe. Используются [Frappe Framework](https://frappeframework.com/) и [ERPNext](https://erpnext.com/).

## 📝 История изменений

Недавние коммиты (полная история — `git log`):

- Каскадный пересчёт `%` у групповых `Task` по весам детей (`task_parent_progress`, хуки `on_update` / `after_delete`, тесты `test_task_parent_progress`).
- Виджет Progress Trend на Task: API `get_task_progress_trend`, маркеры дат согласованы с цветами рядов (при одном типе маркера в bucket).
- Документация и навыки Cursor (AGENTS, инструменты для README).
- DocType Story Point и связанное поведение.
- Task Relation и фикстуры для зависимостей.
- Первичная инициализация приложения.

*Аудит прогресса, rollup групп, burndown: см. текущую ветку и `git log`.*

## 🗂️ Структура репозитория

```text
dinext_project_tasks_gantt/          # Корень репозитория
├── README.md
├── license.txt
├── pyproject.toml                   # Метаданные пакета Python, ruff
├── .pre-commit-config.yaml
├── AGENTS.md                        # Руководство для контрибьюторов / Frappe
└── dinext_project_tasks_gantt/      # Основной Python-пакет
    ├── __init__.py
    ├── hooks.py                     # Фикстуры, doc_events Task (аудит, rollup прогресса родителя)
    ├── task_progress_audit.py       # before_save: строки истории прогресса
    ├── task_parent_progress.py      # on_update / after_delete: взвешенный rollup группы, монотонность
    ├── burndown.py                  # get_task_progress_trend, get_burndown_series, расчёт серий
    ├── test_burndown.py
    ├── test_task_parent_progress.py # Тесты rollup прогресса групповых задач
    ├── modules.txt
    ├── patches.txt
    ├── fixtures/                    # JSON: Custom Field, Client/Server Script, Story Point
    ├── dinext_project_tasks_gantt/  # Модуль «Dinext Project Tasks Gantt»
    │   ├── doctype/                 # JSON DocType, контроллеры, тесты
    │   │   ├── story_point/
    │   │   ├── task_relation/
    │   │   └── task_progress_history/
    │   └── report/                  # Script Report Task Epic Burndown (+ JS графика)
    │       └── task_epic_burndown/
    ├── api/
    ├── config/
    ├── public/                      # JS/CSS ассеты (например js/task_progress_trend.js, css/task_progress_trend.css)
    ├── templates/
    └── www/
```

- **`fixtures/`** — сериализованные метаданные Desk для установки/миграции; при `export-fixtures` источником истины остаётся целевой сайт.
- **`doctype/`** — DocType приложения (дочерняя таблица `Task Progress History`, `Task Relation`, `Story Point` и др.).
- **`task_progress_audit.py`** — серверный аудит при изменении `Task.progress`.
- **`task_parent_progress.py`** — пересчёт `%` у прямого родителя-группы по весам детей (монотонный пол).
- **`burndown.py`** — расчёт серий для виджета Progress Trend и отчёта Epic Burndown.

## 🔗 Схема потока

### Аудит изменения `progress`

```mermaid
flowchart TD
    save[Сохранение Task] --> hook[before_save_task]
    hook --> checkField{Есть custom_progress_history?}
    checkField -->|нет| skip1[Выход]
    checkField -->|да| checkNew{doc.is_new?}
    checkNew -->|да| skip2[Выход — при вставке аудит не пишем]
    checkNew -->|нет| loadPrev[get_doc_before_save]
    loadPrev --> compare{progress изменился?}
    compare -->|нет| skip3[Выход]
    compare -->|да| append[Добавить строку: changed_on, changed_by, old, new]
    append --> persist[Frappe сохраняет Task и дочерние строки]
```

### Rollup прогресса у родителя-группы

После успешной записи или удаления задачи (если не установлен `skip_parent_progress_rollup`):

```mermaid
flowchart TD
    ou[Task on_update или after_delete] --> gate{skip или нет parent_task}
    gate -->|да| end1[Выход]
    gate -->|нет| raw[Сырой % по детям с task_weight gt 0]
    raw -->|нет весов| end2[Выход]
    raw -->|есть| mono[max raw текущий cap 100]
    mono --> grow{target gt текущий?}
    grow -->|нет| end3[Выход без save родителя]
    grow -->|да| psave[save родителя]
    psave --> chain[on_update родителя — пересчёт его родителя]
```
