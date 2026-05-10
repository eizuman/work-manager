// Tasks module with drag-and-drop and tag autocomplete

const TasksModule = (() => {
    let container = null;
    let tasks = [];
    let tags = [];
    let purchases = [];
    let workers = [];
    let scheduledMap = new Map();

    // Active filters (Sets for multi-select; empty = show all)
    let filterStatuses = new Set();
    let filterWeathers = new Set();
    let filterTagIds = new Set();

    let statusDropdownOpen = false;
    let tagsExpanded = false;
    let filtersExpanded = false;
    let _docHandler = null;

    // Drag state
    let dragEl = null;
    let dragGhost = null;
    let dragStartY = 0;
    let dragCurrentIndex = -1;

    const WEATHER_ICONS = {
        sun:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
        rain: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/></svg>`,
        any:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`
    };

    const STATUS_LABELS = { new: 'Новая', in_progress: 'В работе', done: 'Выполнена' };
    const WEATHER_LABELS = { sun: 'Ясно', rain: 'Дождь', any: 'Любая' };

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            [tasks, tags, purchases, workers] = await App.withLoading(() => Promise.all([
                Sheets.getTasks(), Sheets.getTags(), Sheets.getPurchases(), Sheets.getWorkers()
            ]));
        } catch (err) {
            App.handleError(err, 'Загрузка задач');
            tasks = []; tags = []; workers = [];
        }
        try { scheduledMap = await Sheets.getScheduledTaskIds(); } catch (_) { scheduledMap = new Map(); }
    }

    async function reloadWorkers() {
        try { workers = await Sheets.getWorkers(true); } catch (_) {}
    }

    function formatScheduledBadge(dates) {
        const today = new Date(); today.setHours(0,0,0,0);
        const future = dates.map(d => new Date(d)).filter(d => d >= today).sort((a,b) => a-b);
        const ref = future.length ? future[0] : new Date(dates.sort().at(-1));
        return `${ref.getDate()} ${App.MONTHS_RU[ref.getMonth()]}`;
    }

    function getFilteredTasks() {
        return tasks.filter(t => {
            if (filterStatuses.size > 0 && !filterStatuses.has(t.status)) return false;
            if (filterWeathers.size > 0 && !filterWeathers.has(t.weather) && t.weather !== 'any') return false;
            if (filterTagIds.size > 0 && !t.tags.some(tid => filterTagIds.has(tid))) return false;
            return true;
        });
    }

    function getTagById(id) {
        return tags.find(t => t.id === id);
    }

    function getWorkerName(id) {
        const w = workers.find(w => w.id === id);
        return w ? w.name : id;
    }

    function renderTagPill(tagId, showRemove = false) {
        const tag = getTagById(tagId);
        if (!tag) return '';
        const cls = App.tagColorClass(tagId);
        return `<span class="tag-pill ${cls}" data-tag-id="${tagId}">${escapeHtml(tag.title)}${showRemove ? `<button class="selected-tag-remove" data-remove-tag="${tagId}">×</button>` : ''}</span>`;
    }

    function render() {
        const filtered = getFilteredTasks();
        const uniqueTagIds = [...new Set(tasks.flatMap(t => t.tags))];

        // Build filter chips
        const statusHtml = [
            { val: 'all', label: 'Все' },
            { val: 'new', label: 'Новые' },
            { val: 'in_progress', label: 'В работе' },
            { val: 'done', label: 'Выполнены' }
        ].map(c => {
            const isActive = c.val === 'all' ? filterStatuses.size === 0 : filterStatuses.has(c.val);
            return `<button class="filter-chip${isActive ? ' active' : ''}" data-filter-status="${c.val}">${c.label}</button>`;
        }).join('');

        const weatherHtml = [
            { val: 'sun', label: '☀️ Ясно' },
            { val: 'rain', label: '🌧 Дождь' }
        ].map(c =>
            `<button class="filter-chip${filterWeathers.has(c.val) ? ' active' : ''}" data-filter-weather="${c.val}">${c.label}</button>`
        ).join('');

        const tagChipsHtml = uniqueTagIds.map(tid => {
            const tag = getTagById(tid);
            if (!tag) return '';
            const colorCls = App.tagColorClass(tid);
            return `<button class="filter-chip-tag ${colorCls}${filterTagIds.has(tid) ? ' active' : ''}" data-filter-tag="${tid}">${escapeHtml(tag.title)}</button>`;
        }).join('');

        const hasActiveFilters = filterStatuses.size > 0 || filterTagIds.size > 0;

        // Desktop: status filter dropdown
        const statusDropdownHtml = statusDropdownOpen ? `
        <div class="task-status-dropdown" id="status-dropdown">
            ${['new', 'in_progress', 'done'].map(s => `
            <label class="task-status-option">
                <input type="checkbox" value="${s}"${filterStatuses.has(s) ? ' checked' : ''}>
                <span>${STATUS_LABELS[s]}</span>
            </label>`).join('')}
        </div>` : '';

        // Task list
        const taskItemsHtml = filtered.length === 0
            ? '<div class="empty-state"><div class="empty-state-text">Задач нет</div></div>'
            : `<div class="task-list-inner" id="task-list-inner">${filtered.map(renderTaskItem).join('')}</div>`;

        container.innerHTML = `
        <div class="tasks-wrap">

            <!-- Desktop Row 1: title only -->
            <div class="tasks-row tasks-row-1 desktop-only">
                <div class="tasks-desktop-title">Задачи</div>
            </div>

            <!-- Desktop Row 2: add button -->
            <div class="tasks-row tasks-row-2 desktop-only">
                <button class="fab desktop-add-btn" id="add-task-btn-desktop" aria-label="Новая задача">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span class="fab-label">Новая задача</span>
                </button>
            </div>

            <!-- Desktop Row 3: [Теги toggle + chips] ... [Фильтр dropdown + weather] -->
            <div class="tasks-row tasks-row-3 desktop-only">
                <div class="tasks-row3-left">
                    <button class="task-filter-btn${filterTagIds.size > 0 ? ' active' : ''}" id="tags-toggle-btn">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                        Теги${filterTagIds.size > 0 ? ' · ' + filterTagIds.size : ''}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="${tagsExpanded ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/></svg>
                    </button>
                    ${tagsExpanded && tagChipsHtml ? `<div class="filters-tags-row-inline">${tagChipsHtml}</div>` : ''}
                </div>
                <div class="tasks-row3-right">
                    <div class="task-filter-wrap" id="status-filter-wrap">
                        <button class="task-filter-btn${filterStatuses.size > 0 ? ' active' : ''}" id="status-filter-btn">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                            Фильтр${filterStatuses.size > 0 ? ' · ' + filterStatuses.size : ''}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="${statusDropdownOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'}"/></svg>
                        </button>
                        ${statusDropdownHtml}
                    </div>
                    <div class="filters-row-weather">${weatherHtml}</div>
                </div>
            </div>

            <!-- Mobile filter bar -->
            <div class="filters-bar mobile-only" id="filters-bar">
                <div class="filters-mobile-main">
                    <button class="filter-toggle-btn${filterStatuses.size > 0 ? ' has-active' : ''}${filtersExpanded ? ' is-open' : ''}" id="filters-toggle-btn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    </button>
                    <button class="filter-tags-btn${filterTagIds.size > 0 ? ' has-active' : ''}" id="tags-filter-btn">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    </button>
                </div>
                <div class="filters-row-weather">${weatherHtml}</div>
                ${filtersExpanded ? `<div class="filters-panel" id="filters-panel" style="width:100%;padding-top:6px">
                    <div class="filters-row-status">${statusHtml}</div>
                </div>` : ''}
            </div>

            <div class="task-list" id="task-list">
                ${taskItemsHtml}
            </div>
        </div>
        <button class="fab mobile-only" id="add-task-btn" aria-label="Добавить задачу">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </button>`;

        bindEvents();
        initDragAndDrop();
    }

    function renderTaskItem(task) {
        const isDone = task.status === 'done';
        const tagPills = task.tags.map(tid => renderTagPill(tid)).join('');
        const weatherIcon = isDone
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : (WEATHER_ICONS[task.weather] || WEATHER_ICONS.any);

        const statusLabels = { new: 'Ожидает', in_progress: 'В работе', done: 'Завершено' };
        const statusCls = { new: 'new', in_progress: 'in_progress', done: 'done' };

        const scheduledDates = scheduledMap.get(task.id);
        const scheduledBadge = (scheduledDates && scheduledDates.length)
            ? `<div class="task-scheduled-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${formatScheduledBadge(scheduledDates)}</div>`
            : '';

        return `
        <div class="task-item${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
            <div class="task-drag-handle" data-drag-handle>
                <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                    <circle cx="2.5" cy="2.5" r="1.5" fill="#9A8E7A"/>
                    <circle cx="7.5" cy="2.5" r="1.5" fill="#9A8E7A"/>
                    <circle cx="2.5" cy="7" r="1.5" fill="#9A8E7A"/>
                    <circle cx="7.5" cy="7" r="1.5" fill="#9A8E7A"/>
                    <circle cx="2.5" cy="11.5" r="1.5" fill="#9A8E7A"/>
                    <circle cx="7.5" cy="11.5" r="1.5" fill="#9A8E7A"/>
                </svg>
            </div>
            <div class="task-body">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${task.assignees && task.assignees.length ? `<div class="task-assignees">${task.assignees.map(a => `<span class="task-assignee-badge">${escapeHtml(getWorkerName(a))}</span>`).join('')}</div>` : ''}
                ${tagPills ? `<div class="task-tags">${tagPills}</div>` : ''}
            </div>
            <div class="task-weather${isDone ? ' done' : ''}">${weatherIcon}</div>
            <div class="task-right">
                <div class="task-status-badge ${statusCls[task.status] || 'new'}">
                    ${statusLabels[task.status] || task.status}
                </div>
                ${scheduledBadge}
            </div>
            <div class="task-actions">
                <button class="task-action-btn edit-task" data-id="${task.id}" aria-label="Редактировать">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
            </div>
        </div>`;
    }

    function renderTagsManage() {
        if (tags.length === 0) return '';
        return `
        <div class="tags-manage-wrap">
            <div class="tags-manage-title">Теги</div>
            <div id="tags-manage-list" class="tags-manage-pills">
                ${tags.map(tag => `
                <span class="tag-pill ${App.tagColorClass(tag.id)} tag-manage-pill" data-tag-id="${tag.id}">${escapeHtml(tag.title)}</span>
                `).join('')}
            </div>
        </div>`;
    }

    function applyFilterChip(chip) {
        if ('filterStatus' in chip.dataset) {
            const val = chip.dataset.filterStatus;
            if (val === 'all') filterStatuses.clear();
            else if (filterStatuses.has(val)) filterStatuses.delete(val);
            else filterStatuses.add(val);
        } else if ('filterWeather' in chip.dataset) {
            const val = chip.dataset.filterWeather;
            if (filterWeathers.has(val)) filterWeathers.delete(val);
            else filterWeathers.add(val);
        } else if ('filterTag' in chip.dataset) {
            const val = chip.dataset.filterTag;
            if (filterTagIds.has(val)) filterTagIds.delete(val);
            else filterTagIds.add(val);
        }
    }

    function bindEvents() {
        // Clear old doc handler
        if (_docHandler) { document.removeEventListener('click', _docHandler); _docHandler = null; }

        // Mobile filter bar
        const filtersBar = container.querySelector('#filters-bar');
        if (filtersBar) {
            filtersBar.addEventListener('click', (e) => {
                const toggleBtn = e.target.closest('#filters-toggle-btn');
                if (toggleBtn) { filtersExpanded = !filtersExpanded; render(); return; }
                const chip = e.target.closest('.filter-chip, .filter-chip-tag');
                if (!chip) return;
                applyFilterChip(chip);
                render();
            });
        }

        // Desktop status filter dropdown
        const statusFilterWrap = container.querySelector('#status-filter-wrap');
        if (statusFilterWrap) {
            // Stop clicks inside wrap from reaching document (prevents premature close)
            statusFilterWrap.addEventListener('click', e => e.stopPropagation());

            container.querySelector('#status-filter-btn')?.addEventListener('click', () => {
                statusDropdownOpen = !statusDropdownOpen;
                render();
            });

            const statusDropdown = container.querySelector('#status-dropdown');
            if (statusDropdown) {
                statusDropdown.addEventListener('change', (e) => {
                    const cb = e.target.closest('input[type="checkbox"]');
                    if (!cb) return;
                    if (cb.checked) filterStatuses.add(cb.value);
                    else filterStatuses.delete(cb.value);
                    render();
                });
            }

            // Close dropdown on outside click
            if (statusDropdownOpen) {
                _docHandler = () => {
                    document.removeEventListener('click', _docHandler);
                    _docHandler = null;
                    statusDropdownOpen = false;
                    render();
                };
                setTimeout(() => { if (_docHandler) document.addEventListener('click', _docHandler); }, 0);
            }
        }

        // Desktop row 3
        const row3 = container.querySelector('.tasks-row-3');
        if (row3) {
            // Tags toggle button
            row3.querySelector('#tags-toggle-btn')?.addEventListener('click', () => {
                tagsExpanded = !tagsExpanded;
                render();
            });
            // Tag chip + weather chip clicks
            row3.addEventListener('click', (e) => {
                if (e.target.closest('#tags-toggle-btn')) return;
                const chip = e.target.closest('.filter-chip, .filter-chip-tag');
                if (!chip) return;
                applyFilterChip(chip);
                render();
            });
        }

        // Mobile tags filter (opens filter sheet)
        container.querySelector('#tags-filter-btn')?.addEventListener('click', openTagsFilterSheet);

        // FAB
        container.querySelector('#add-task-btn')?.addEventListener('click', () => openTaskForm(null));
        container.querySelector('#add-task-btn-desktop')?.addEventListener('click', () => openTaskForm(null));

        // Task list
        const taskList = container.querySelector('#task-list');
        if (!taskList) return;
        taskList.addEventListener('click', (e) => {
            if (e.target.closest('[data-drag-handle]')) return;
            const editBtn = e.target.closest('.edit-task');
            if (editBtn) {
                const task = tasks.find(t => t.id === editBtn.dataset.id);
                if (task) openTaskForm(task);
            }
        });
    }

    function openTagsManageSheet() {
        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Редактирование тегов</span>
            <div style="width:40px"></div>
        </div>
        ${tags.length === 0
            ? '<div style="padding:20px 0;text-align:center;color:var(--text-muted)">Теги не созданы</div>'
            : `<div class="tags-manage-pills" id="tags-sheet-list">
                ${tags.map(tag => `
                <span class="tag-pill ${App.tagColorClass(tag.id)} tag-manage-pill" data-tag-id="${tag.id}">${escapeHtml(tag.title)}</span>
                `).join('')}
               </div>`
        }`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        const list = content.querySelector('#tags-sheet-list');
        if (list) {
            list.addEventListener('click', (e) => {
                const pill = e.target.closest('.tag-manage-pill');
                if (!pill) return;
                const tag = tags.find(t => t.id === pill.dataset.tagId);
                if (tag) {
                    App.hideBottomSheet();
                    setTimeout(() => openEditTag(tag), 320);
                }
            });
        }
    }

    function openTagsFilterSheet() {
        const uniqueTagIds = [...new Set(tasks.flatMap(t => t.tags))];
        const availableTags = uniqueTagIds.map(id => tags.find(t => t.id === id)).filter(Boolean);

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Фильтр по тегам</span>
            <button class="icon-btn" id="tags-filter-reset" style="visibility:${filterTagIds.size > 0 ? 'visible' : 'hidden'};font-size:12px;color:var(--text-muted)">Сброс</button>
        </div>
        ${availableTags.length === 0
            ? '<div style="padding:20px 0;text-align:center;color:var(--text-muted)">Нет тегов в задачах</div>'
            : `<div class="tags-filter-sheet-pills" id="tags-filter-pills">
                ${availableTags.map(tag => {
                    const colorCls = App.tagColorClass(tag.id);
                    const isActive = filterTagIds.has(tag.id);
                    return `<button class="filter-chip-tag ${colorCls}${isActive ? ' active' : ''}" data-filter-tag="${tag.id}">${escapeHtml(tag.title)}</button>`;
                }).join('')}
               </div>`
        }`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#tags-filter-reset')?.addEventListener('click', () => {
            filterTagIds.clear();
            App.hideBottomSheet();
            render();
        });

        const pillsEl = content.querySelector('#tags-filter-pills');
        if (pillsEl) {
            pillsEl.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-filter-tag]');
                if (!btn) return;
                const tid = btn.dataset.filterTag;
                if (filterTagIds.has(tid)) filterTagIds.delete(tid);
                else filterTagIds.add(tid);
                btn.classList.toggle('active', filterTagIds.has(tid));
                const resetBtn = content.querySelector('#tags-filter-reset');
                if (resetBtn) resetBtn.style.visibility = filterTagIds.size > 0 ? 'visible' : 'hidden';
                render();
            });
        }
    }

    function openEditTag(tag) {
        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Редактировать тег</span>
            <div style="width:40px"></div>
        </div>
        <div class="form-group">
            <label class="form-label">Название тега</label>
            <input type="text" class="form-control" id="rename-tag-input" value="${escapeHtml(tag.title)}">
        </div>
        <button class="btn btn-primary" id="rename-tag-save" style="margin-bottom:10px">Сохранить</button>
        <button class="btn btn-danger" id="tag-delete-btn">Удалить тег</button>`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);
        content.querySelector('#rename-tag-input').focus();

        content.querySelector('#rename-tag-save').addEventListener('click', async () => {
            const newTitle = content.querySelector('#rename-tag-input').value.trim();
            if (!newTitle) { App.showToast('Введите название', 'error'); return; }
            try {
                await App.withLoading(() => Sheets.updateTag(tag.id, newTitle));
                const t = tags.find(t => t.id === tag.id);
                if (t) t.title = newTitle;
                App.hideBottomSheet();
                render();
                App.showToast('Тег переименован');
            } catch (err) {
                App.handleError(err, 'Переименование');
            }
        });

        content.querySelector('#tag-delete-btn').addEventListener('click', () => {
            const usedInTasks = tasks.filter(t => t.tags.includes(tag.id));
            const msg = usedInTasks.length > 0
                ? `Тег "${tag.title}" используется в ${usedInTasks.length} задачах. Удалить всё равно?`
                : `Удалить тег "${tag.title}"?`;
            App.hideBottomSheet();
            setTimeout(() => {
                App.showConfirmDialog(msg, async () => {
                    try {
                        await App.withLoading(() => Sheets.deleteTag(tag.id));
                        tags = tags.filter(t => t.id !== tag.id);
                        render();
                        App.showToast('Тег удалён');
                    } catch (err) {
                        App.handleError(err, 'Удаление тега');
                    }
                });
            }, 320);
        });
    }

    // ===== Task form =====
    function openTaskForm(existing) {
        const isEdit = !!existing;
        let selectedAssignees = isEdit ? [...(existing.assignees || [])] : [];
        let selectedWeather = isEdit ? (existing.weather || 'any') : 'any';
        let selectedStatus = isEdit ? (existing.status || 'new') : 'new';
        let selectedTagIds = isEdit ? [...(existing.tags || [])] : [];
        const linkedPurchases = isEdit ? purchases.filter(p => p.task_id === existing.id) : [];

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">${isEdit ? 'Редактирование задачи' : 'Новая задача'}</span>
            <div style="width:40px"></div>
        </div>

        <div class="form-group">
            <label class="form-label">Название</label>
            <input type="text" class="form-control" id="task-title" value="${isEdit ? escapeHtml(existing.title) : ''}" placeholder="Название задачи">
        </div>

        <div class="form-group">
            <label class="form-label">Описание</label>
            <textarea class="form-control textarea" id="task-desc" placeholder="Подробности...">${isEdit ? escapeHtml(existing.description || '') : ''}</textarea>
        </div>

        <div class="form-group">
            <label class="form-label">Исполнители</label>
            ${workers.length === 0
                ? `<div style="font-size:13px;color:var(--text-muted)">Исполнители не добавлены. Добавьте в <b>Настройках → Исполнители</b>.</div>`
                : `<div class="assignees-group">${workers.map(w =>
                    `<button class="assignee-btn${selectedAssignees.includes(w.id) ? ' active' : ''}" data-assignee="${w.id}">${escapeHtml(w.name)}</button>`
                ).join('')}</div>`
            }
        </div>

        <div class="form-group">
            <label class="form-label">Статус</label>
            <div class="toggle-group three" id="task-status-group">
                <button class="toggle-btn${selectedStatus === 'new' ? ' active' : ''}" data-status="new">Новая</button>
                <button class="toggle-btn${selectedStatus === 'in_progress' ? ' active' : ''}" data-status="in_progress">В работе</button>
                <button class="toggle-btn${selectedStatus === 'done' ? ' active' : ''}" data-status="done">Готово</button>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Погода</label>
            <div class="toggle-group three" id="task-weather-group">
                <button class="toggle-btn${selectedWeather === 'sun' ? ' active' : ''}" data-weather="sun">☀️ Ясно</button>
                <button class="toggle-btn${selectedWeather === 'rain' ? ' active' : ''}" data-weather="rain">🌧 Дождь</button>
                <button class="toggle-btn${selectedWeather === 'any' ? ' active' : ''}" data-weather="any">🌤 Любая</button>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Теги</label>
            <div class="tag-input-wrap">
                <input type="text" class="form-control" id="tag-search" placeholder="Поиск тегов...">
                <div class="tag-dropdown hidden" id="tag-dropdown"></div>
            </div>
            <div class="selected-tags" id="selected-tags">
                ${selectedTagIds.map(tid => {
                    const tag = getTagById(tid);
                    if (!tag) return '';
                    const cls = App.tagColorClass(tid);
                    return `<span class="selected-tag ${cls}" data-tid="${tid}">${escapeHtml(tag.title)}<button class="selected-tag-remove" data-remove-tag="${tid}">×</button></span>`;
                }).join('')}
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">К покупке</label>
            ${linkedPurchases.length > 0 ? `<div class="task-purchases-linked">${linkedPurchases.map(p => `
                <div class="task-purchase-linked-item${p.status === 'bought' ? ' bought' : ''}">
                    <span class="task-purchase-linked-check">${p.status === 'bought' ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}</span>
                    <span class="task-purchase-linked-name">${escapeHtml(p.title)}</span>
                    ${p.price > 0 ? `<span class="task-purchase-linked-price">${App.formatAmount(p.price)}</span>` : ''}
                </div>`).join('')}</div>` : ''}
            <div id="task-new-purchases"></div>
            <button type="button" class="add-checklist-btn" id="add-task-purchase-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Добавить позицию
            </button>
        </div>

        <button class="btn btn-primary" id="task-save-btn" style="margin-bottom:10px">
            ${isEdit ? 'Сохранить изменения' : 'Создать задачу'}
        </button>
        ${isEdit && existing.status !== 'done' ? `<button class="btn btn-outline" id="task-to-calendar-btn" style="margin-bottom:10px">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            В календарь
        </button>` : ''}
        ${isEdit ? '<button class="btn btn-danger" id="task-delete-btn">Удалить задачу</button>' : ''}`;

        const content = App.showBottomSheet(html);

        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        // Assignees
        content.querySelectorAll('.assignee-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.dataset.assignee;
                if (selectedAssignees.includes(val)) {
                    selectedAssignees = selectedAssignees.filter(a => a !== val);
                    btn.classList.remove('active');
                } else {
                    selectedAssignees.push(val);
                    btn.classList.add('active');
                }
            });
        });

        // Status toggle
        content.querySelector('#task-status-group').addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn[data-status]');
            if (!btn) return;
            selectedStatus = btn.dataset.status;
            content.querySelectorAll('#task-status-group .toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        });

        // Weather toggle
        content.querySelector('#task-weather-group').addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn[data-weather]');
            if (!btn) return;
            selectedWeather = btn.dataset.weather;
            content.querySelectorAll('#task-weather-group .toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        });

        // Tag search
        const tagSearch = content.querySelector('#tag-search');
        const tagDropdown = content.querySelector('#tag-dropdown');
        const selectedTagsEl = content.querySelector('#selected-tags');

        function renderDropdown(query) {
            const q = query.toLowerCase().trim();
            const available = tags.filter(t => !selectedTagIds.includes(t.id) && t.title.toLowerCase().includes(q));
            if (!q && available.length === 0) { tagDropdown.classList.add('hidden'); return; }

            let html = available.map(t =>
                `<div class="tag-dropdown-item" data-tag-select="${t.id}">${escapeHtml(t.title)}</div>`
            ).join('');

            const exactMatch = tags.find(t => t.title.toLowerCase() === q);
            if (q && !exactMatch) {
                html += `<div class="tag-dropdown-item create" data-create-tag="${escapeHtml(q)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Создать тег "${escapeHtml(q)}"
                </div>`;
            }

            tagDropdown.innerHTML = html;
            tagDropdown.classList.toggle('hidden', !html);
        }

        function addSelectedTag(tagId) {
            if (selectedTagIds.includes(tagId)) return;
            selectedTagIds.push(tagId);
            const tag = getTagById(tagId);
            if (!tag) return;
            const cls = App.tagColorClass(tagId);
            const span = document.createElement('span');
            span.className = `selected-tag ${cls}`;
            span.dataset.tid = tagId;
            span.innerHTML = `${escapeHtml(tag.title)}<button class="selected-tag-remove" data-remove-tag="${tagId}">×</button>`;
            selectedTagsEl.appendChild(span);
        }

        tagSearch.addEventListener('input', () => renderDropdown(tagSearch.value));
        tagSearch.addEventListener('focus', () => renderDropdown(tagSearch.value));

        document.addEventListener('click', function closeDropdown(e) {
            if (!content.contains(e.target)) {
                tagDropdown.classList.add('hidden');
                document.removeEventListener('click', closeDropdown);
            }
        });

        tagDropdown.addEventListener('click', async (e) => {
            const selectItem = e.target.closest('[data-tag-select]');
            const createItem = e.target.closest('[data-create-tag]');

            if (selectItem) {
                addSelectedTag(selectItem.dataset.tagSelect);
                tagSearch.value = '';
                tagDropdown.classList.add('hidden');
            } else if (createItem) {
                const title = createItem.dataset.createTag;
                try {
                    const newTag = await App.withLoading(() => Sheets.addTag(title));
                    tags.push(newTag);
                    addSelectedTag(newTag.id);
                    tagSearch.value = '';
                    tagDropdown.classList.add('hidden');
                    App.showToast('Тег создан');
                } catch (err) {
                    App.handleError(err, 'Создание тега');
                }
            }
        });

        selectedTagsEl.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-tag]');
            if (!btn) return;
            const tid = btn.dataset.removeTag;
            selectedTagIds = selectedTagIds.filter(id => id !== tid);
            btn.closest('.selected-tag').remove();
        });

        // New purchase rows
        const newPurchasesEl = content.querySelector('#task-new-purchases');
        content.querySelector('#add-task-purchase-btn').addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'task-purchase-new-row';
            row.innerHTML = `
                <input type="text" class="form-control tp-title" placeholder="Что купить">
                <input type="text" inputmode="decimal" class="form-control tp-price" placeholder="₽" style="width:80px;flex-shrink:0">
                <button type="button" class="icon-btn tp-remove" style="flex-shrink:0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>`;
            row.querySelector('.tp-remove').addEventListener('click', () => row.remove());
            newPurchasesEl.appendChild(row);
            row.querySelector('.tp-title').focus();
        });

        // Save
        content.querySelector('#task-save-btn').addEventListener('click', async () => {
            const title = content.querySelector('#task-title').value.trim();
            if (!title) { App.showToast('Введите название задачи', 'error'); return; }

            const data = {
                title,
                description: content.querySelector('#task-desc').value.trim(),
                assignees: selectedAssignees,
                status: selectedStatus,
                weather: selectedWeather,
                tags: selectedTagIds
            };

            try {
                let taskId;
                if (isEdit) {
                    const updated = await App.withLoading(() => Sheets.updateTask(existing.id, data));
                    const idx = tasks.findIndex(t => t.id === existing.id);
                    if (idx >= 0) tasks[idx] = { ...tasks[idx], ...updated };
                    taskId = existing.id;
                    App.showToast('Сохранено');
                } else {
                    const newTask = await App.withLoading(() => Sheets.addTask(data));
                    tasks.push(newTask);
                    taskId = newTask.id;
                    App.showToast('Задача создана');
                }

                // Save any new purchase rows
                const newRows = [...content.querySelectorAll('.task-purchase-new-row')];
                const newPurchases = newRows
                    .map(r => ({ title: r.querySelector('.tp-title').value.trim(), price: parseFloat(r.querySelector('.tp-price').value) || 0 }))
                    .filter(p => p.title);
                if (newPurchases.length > 0) {
                    const saved = await Promise.all(newPurchases.map(p => Sheets.addPurchase({ ...p, task_id: taskId, status: 'pending' })));
                    purchases.push(...saved);
                }

                App.hideBottomSheet();
                render();
            } catch (err) {
                App.handleError(err, 'Сохранение задачи');
            }
        });

        if (isEdit && existing.status !== 'done') {
            content.querySelector('#task-to-calendar-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openScheduleTaskSheet(existing), 320);
            });
        }

        if (isEdit) {
            content.querySelector('#task-delete-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog('Удалить задачу?', async () => {
                        try {
                            await App.withLoading(() => Sheets.deleteTask(existing.id));
                            tasks = tasks.filter(t => t.id !== existing.id);
                            render();
                            App.showToast('Задача удалена');
                        } catch (err) {
                            App.handleError(err, 'Удаление');
                        }
                    });
                }, 320);
            });
        }
    }

    // ===== Schedule task to calendar =====

    function openScheduleTaskSheet(task) {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">В календарь</span>
            <div style="width:40px"></div>
        </div>
        <div class="card" style="margin-bottom:16px;padding:12px 14px;font-size:14px;color:var(--text-muted)">
            <span style="color:var(--text-primary);font-weight:500">${escapeHtml(task.title)}</span><br>
            Задача будет добавлена в список работ выбранного дня
        </div>
        <div class="form-group">
            <label class="form-label">Дата</label>
            <input type="date" class="form-control" id="schedule-date" value="${todayStr}">
        </div>
        <button class="btn btn-primary" id="schedule-confirm-btn">Запланировать</button>`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#schedule-confirm-btn').addEventListener('click', async () => {
            const ds = content.querySelector('#schedule-date').value;
            if (!ds) { App.showToast('Выберите дату', 'error'); return; }

            try {
                const logs = await Sheets.getWorkLogs();
                const existing = logs.find(l => l.date === ds);

                let description, task_ids, hours, rate, note;
                if (existing) {
                    const existingItems = existing.description ? existing.description.split('|').filter(Boolean) : [];
                    existingItems.push(task.title);
                    description = existingItems.join('|');
                    task_ids = [...(existing.task_ids || []), task.id];
                    hours = existing.hours;
                    rate = existing.rate;
                    note = existing.note || '';
                } else {
                    description = task.title;
                    task_ids = [task.id];
                    hours = 0;
                    rate = App.getHourlyRate();
                    note = '';
                }

                await App.withLoading(() => Sheets.saveWorkLog({ date: ds, hours, rate, description, task_ids, note }));

                if (!scheduledMap.has(task.id)) scheduledMap.set(task.id, []);
                if (!scheduledMap.get(task.id).includes(ds)) scheduledMap.get(task.id).push(ds);

                App.hideBottomSheet();
                render();
                const [, m, d] = ds.split('-').map(Number);
                App.showToast(`Запланировано на ${d} ${App.MONTHS_RU[m-1]}`);
            } catch (err) {
                App.handleError(err, 'Планирование');
            }
        });
    }

    // ===== Drag-and-drop (touch + mouse) =====
    function initDragAndDrop() {
        const listEl = container.querySelector('#task-list-inner');
        if (!listEl) return;

        // Mouse/HTML5 drag
        listEl.addEventListener('dragstart', (e) => {
            dragEl = e.target.closest('.task-item');
            if (!dragEl) return;
            dragEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        listEl.addEventListener('dragend', () => {
            if (dragEl) {
                dragEl.classList.remove('dragging');
                dragEl = null;
                saveNewOrder();
            }
            listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        listEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.task-item');
            if (!target || target === dragEl) return;
            listEl.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            const rect = target.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                listEl.insertBefore(dragEl, target);
            } else {
                listEl.insertBefore(dragEl, target.nextSibling);
            }
        });

        // Touch drag
        listEl.addEventListener('touchstart', (e) => {
            const handle = e.target.closest('[data-drag-handle]');
            if (!handle) return;
            e.preventDefault();
            dragEl = handle.closest('.task-item');
            dragStartY = e.touches[0].clientY;
            dragEl.classList.add('dragging');
        }, { passive: false });

        listEl.addEventListener('touchmove', (e) => {
            if (!dragEl) return;
            e.preventDefault();
            const touch = e.touches[0];
            const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!elBelow) return;
            const target = elBelow.closest('.task-item');
            if (target && target !== dragEl) {
                const rect = target.getBoundingClientRect();
                if (touch.clientY < rect.top + rect.height / 2) {
                    listEl.insertBefore(dragEl, target);
                } else {
                    listEl.insertBefore(dragEl, target.nextSibling);
                }
            }
        }, { passive: false });

        listEl.addEventListener('touchend', () => {
            if (dragEl) {
                dragEl.classList.remove('dragging');
                dragEl = null;
                saveNewOrder();
            }
        });
    }

    async function saveNewOrder() {
        const listEl = container.querySelector('#task-list-inner');
        if (!listEl) return;
        const orderedIds = [...listEl.querySelectorAll('.task-item[data-id]')].map(el => el.dataset.id);
        try {
            await Sheets.reorderTasks(orderedIds);
            // Update local order
            orderedIds.forEach((id, i) => {
                const t = tasks.find(t => t.id === id);
                if (t) t.order = (i + 1) * 10;
            });
        } catch (err) {
            App.handleError(err, 'Сохранение порядка');
        }
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return { init, openTagsManageSheet, reloadWorkers };
})();
