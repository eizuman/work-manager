// Tasks module with drag-and-drop and tag autocomplete

const TasksModule = (() => {
    let container = null;
    let tasks = [];
    let tags = [];

    // Active filters
    let filterStatus = 'all';
    let filterWeather = 'all';
    let filterTag = 'all';
    let filterAssignee = 'all';

    // Drag state
    let dragEl = null;
    let dragGhost = null;
    let dragStartY = 0;
    let dragCurrentIndex = -1;

    const WEATHER_ICONS = {
        sun:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
        rain: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="16" y1="19" x2="16" y2="21"/><line x1="16" y1="13" x2="16" y2="15"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="12" y1="15" x2="12" y2="17"/></svg>`,
        any:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`
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
            [tasks, tags] = await App.withLoading(() => Promise.all([Sheets.getTasks(), Sheets.getTags()]));
        } catch (err) {
            App.handleError(err, 'Загрузка задач');
            tasks = []; tags = [];
        }
    }

    function getFilteredTasks() {
        return tasks.filter(t => {
            if (filterStatus !== 'all' && t.status !== filterStatus) return false;
            if (filterWeather !== 'all' && t.weather !== filterWeather && t.weather !== 'any') return false;
            if (filterTag !== 'all' && !t.tags.includes(filterTag)) return false;
            if (filterAssignee !== 'all') {
                const map = { me: 'Я', worker: 'Работник' };
                if (!t.assignees.includes(map[filterAssignee])) return false;
            }
            return true;
        });
    }

    function getTagById(id) {
        return tags.find(t => t.id === id);
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
        const statusChips = [
            { val: 'all', label: 'Все' },
            { val: 'new', label: 'Новые' },
            { val: 'in_progress', label: 'В работе' },
            { val: 'done', label: 'Выполнены' }
        ];

        const chipHtml = statusChips.map(c =>
            `<button class="filter-chip${filterStatus === c.val ? ' active' : ''}" data-filter-status="${c.val}">${c.label}</button>`
        ).join('');

        const weatherChips = [
            { val: 'sun', label: '☀️ Ясно' },
            { val: 'rain', label: '🌧 Дождь' }
        ].map(c =>
            `<button class="filter-chip${filterWeather === c.val ? ' active' : ''}" data-filter-weather="${c.val}">${c.label}</button>`
        ).join('');

        const tagChips = uniqueTagIds.map(tid => {
            const tag = getTagById(tid);
            if (!tag) return '';
            return `<button class="filter-chip${filterTag === tid ? ' active' : ''}" data-filter-tag="${tid}">${escapeHtml(tag.title)}</button>`;
        }).join('');

        // Task list
        const taskItemsHtml = filtered.length === 0
            ? '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">Задач нет</div></div>'
            : `<div class="task-list-inner" id="task-list-inner">${filtered.map(renderTaskItem).join('')}</div>`;

        container.innerHTML = `
        <div class="tasks-wrap">
            <div class="filters-bar" id="filters-bar">
                ${chipHtml}
                ${weatherChips}
                ${tagChips}
            </div>
            <div class="task-list" id="task-list">
                ${taskItemsHtml}
            </div>
            ${renderTagsManage()}
        </div>
        <button class="fab" id="add-task-btn" aria-label="Добавить задачу">
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
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : (WEATHER_ICONS[task.weather] || WEATHER_ICONS.any);

        return `
        <div class="task-item${isDone ? ' done' : ''}" data-id="${task.id}" draggable="true">
            <div class="task-drag-handle" data-drag-handle>
                <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                    <circle cx="5" cy="5" r="2" fill="#9A8E7A"/>
                    <circle cx="11" cy="5" r="2" fill="#9A8E7A"/>
                    <circle cx="5" cy="10" r="2" fill="#9A8E7A"/>
                    <circle cx="11" cy="10" r="2" fill="#9A8E7A"/>
                    <circle cx="5" cy="15" r="2" fill="#9A8E7A"/>
                    <circle cx="11" cy="15" r="2" fill="#9A8E7A"/>
                </svg>
            </div>
            <div class="task-body">
                <div class="task-title">${escapeHtml(task.title)}</div>
                ${tagPills ? `<div class="task-tags">${tagPills}</div>` : ''}
            </div>
            <div class="task-weather${isDone ? ' done' : ''}">${weatherIcon}</div>
            <div class="task-actions">
                <button class="task-action-btn edit-task" data-id="${task.id}" aria-label="Редактировать">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="task-action-btn delete-task" data-id="${task.id}" aria-label="Удалить">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
            </div>
        </div>`;
    }

    function renderTagsManage() {
        if (tags.length === 0) return '';
        return `
        <div class="tags-manage-wrap">
            <div class="tags-manage-title">Теги</div>
            <div id="tags-manage-list">
                ${tags.map(tag => `
                <div class="tag-manage-item" data-tag-id="${tag.id}">
                    <span class="tag-pill ${App.tagColorClass(tag.id)} tag-manage-name">${escapeHtml(tag.title)}</span>
                    <div class="tag-manage-actions">
                        <button class="tx-action-btn rename-tag" data-tag-id="${tag.id}" aria-label="Переименовать">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="tx-action-btn delete delete-tag" data-tag-id="${tag.id}" aria-label="Удалить">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                    </div>
                </div>`).join('')}
            </div>
        </div>`;
    }

    function bindEvents() {
        // Filters
        container.querySelector('#filters-bar').addEventListener('click', (e) => {
            const chip = e.target.closest('.filter-chip');
            if (!chip) return;
            if (chip.dataset.filterStatus) {
                filterStatus = chip.dataset.filterStatus;
            } else if (chip.dataset.filterWeather) {
                filterWeather = filterWeather === chip.dataset.filterWeather ? 'all' : chip.dataset.filterWeather;
            } else if (chip.dataset.filterTag) {
                filterTag = filterTag === chip.dataset.filterTag ? 'all' : chip.dataset.filterTag;
            }
            render();
        });

        // FAB
        container.querySelector('#add-task-btn').addEventListener('click', () => openTaskForm(null));

        // Task list actions
        const taskList = container.querySelector('#task-list');
        if (!taskList) return;

        taskList.addEventListener('click', (e) => {
            if (e.target.closest('[data-drag-handle]')) return;
            const editBtn = e.target.closest('.edit-task');
            const delBtn = e.target.closest('.delete-task');
            const item = e.target.closest('.task-item[data-id]');

            if (editBtn) {
                const task = tasks.find(t => t.id === editBtn.dataset.id);
                if (task) openTaskForm(task);
            } else if (delBtn) {
                const id = delBtn.dataset.id;
                App.showConfirmDialog('Удалить задачу?', async () => {
                    try {
                        await App.withLoading(() => Sheets.deleteTask(id));
                        tasks = tasks.filter(t => t.id !== id);
                        render();
                        App.showToast('Задача удалена');
                    } catch (err) {
                        App.handleError(err, 'Удаление');
                    }
                });
            }
        });

        // Tags management
        const tagsManage = container.querySelector('#tags-manage-list');
        if (tagsManage) {
            tagsManage.addEventListener('click', async (e) => {
                const renameBtn = e.target.closest('.rename-tag');
                const deleteBtn = e.target.closest('.delete-tag');
                if (renameBtn) {
                    const tag = tags.find(t => t.id === renameBtn.dataset.tagId);
                    if (tag) openRenameTag(tag);
                } else if (deleteBtn) {
                    const tagId = deleteBtn.dataset.tagId;
                    const tag = tags.find(t => t.id === tagId);
                    const usedInTasks = tasks.filter(t => t.tags.includes(tagId));
                    const msg = usedInTasks.length > 0
                        ? `Тег "${tag?.title}" используется в ${usedInTasks.length} задачах. Удалить всё равно?`
                        : `Удалить тег "${tag?.title}"?`;
                    App.showConfirmDialog(msg, async () => {
                        try {
                            await App.withLoading(() => Sheets.deleteTag(tagId));
                            tags = tags.filter(t => t.id !== tagId);
                            render();
                            App.showToast('Тег удалён');
                        } catch (err) {
                            App.handleError(err, 'Удаление тега');
                        }
                    });
                }
            });
        }
    }

    function openRenameTag(tag) {
        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Переименовать тег</span>
            <div style="width:40px"></div>
        </div>
        <div class="form-group">
            <label class="form-label">Название тега</label>
            <input type="text" class="form-control" id="rename-tag-input" value="${escapeHtml(tag.title)}">
        </div>
        <button class="btn btn-primary" id="rename-tag-save">Сохранить</button>`;

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
    }

    // ===== Task form =====
    function openTaskForm(existing) {
        const isEdit = !!existing;
        let selectedAssignees = isEdit ? [...(existing.assignees || [])] : [];
        let selectedWeather = isEdit ? (existing.weather || 'any') : 'any';
        let selectedStatus = isEdit ? (existing.status || 'new') : 'new';
        let selectedTagIds = isEdit ? [...(existing.tags || [])] : [];

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
            <div class="assignees-group">
                <button class="assignee-btn${selectedAssignees.includes('Я') ? ' active' : ''}" data-assignee="Я">Я</button>
                <button class="assignee-btn${selectedAssignees.includes('Работник') ? ' active' : ''}" data-assignee="Работник">Работник</button>
            </div>
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

        <button class="btn btn-primary" id="task-save-btn" style="margin-bottom:10px">
            ${isEdit ? 'Сохранить изменения' : 'Создать задачу'}
        </button>
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
                if (isEdit) {
                    const updated = await App.withLoading(() => Sheets.updateTask(existing.id, data));
                    const idx = tasks.findIndex(t => t.id === existing.id);
                    if (idx >= 0) tasks[idx] = { ...tasks[idx], ...updated };
                    App.showToast('Сохранено');
                } else {
                    const newTask = await App.withLoading(() => Sheets.addTask(data));
                    tasks.push(newTask);
                    App.showToast('Задача создана');
                }
                App.hideBottomSheet();
                render();
            } catch (err) {
                App.handleError(err, 'Сохранение задачи');
            }
        });

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

    return { init };
})();
