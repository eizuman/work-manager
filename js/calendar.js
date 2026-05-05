// Calendar module

const CalendarModule = (() => {
    let container = null;
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth();
    let workLogs = [];

    const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const CHECKMARK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            workLogs = await App.withLoading(() => Sheets.getWorkLogs(true));
        } catch (err) {
            App.handleError(err, 'Загрузка календаря');
            workLogs = [];
        }
    }

    function getWorkLogForDate(ds) {
        return workLogs.find(w => w.date === ds);
    }

    function dateStr(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function formatHours(h) {
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return mins > 0 ? `${hrs}ч ${String(mins).padStart(2, '0')}м` : `${hrs}ч 00м`;
    }

    // ===== Checklist helpers =====

    function parseItems(desc) {
        if (!desc || !desc.trim()) return [];
        return desc.split('|')
            .map(s => ({
                checked: s.startsWith('✓'),
                text: s.startsWith('✓') ? s.slice(1) : s
            }))
            .filter(it => it.text.trim());
    }

    function serializeItems(items) {
        return items
            .filter(it => it.text.trim())
            .map(it => (it.checked ? '✓' : '') + it.text.trim())
            .join('|');
    }

    function getAllTasksText(desc) {
        if (!desc || !desc.trim()) return '';
        return desc.split('|')
            .map(s => s.startsWith('✓') ? s.slice(1).trim() : s.trim())
            .filter(Boolean)
            .join(', ');
    }

    function getTaskProgress(desc) {
        if (!desc) return null;
        const parts = desc.split('|').filter(s => s.trim());
        if (!parts.length) return null;
        const done = parts.filter(s => s.startsWith('✓')).length;
        return { done, total: parts.length };
    }

    function getDayStatus(entry) {
        if (!entry) return null;
        if (!entry.description && !entry.hours) return null;
        return entry.hours > 0 ? 'done' : 'plan';
    }

    // ===== Render =====

    function render() {
        const today = new Date();
        const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate());
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        const startDow = (firstDay.getDay() + 6) % 7;
        const daysInMonth = lastDay.getDate();

        let daysHTML = '';

        const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = startDow - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dow = (startDow - i - 1 + 7) % 7;
            daysHTML += `<div class="cal-day other-month${dow >= 5 ? ' weekend' : ''}">
                <div class="cal-day-top"><div class="cal-day-inner"><span class="cal-day-num">${day}</span></div></div>
            </div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const ds = dateStr(currentYear, currentMonth, day);
            const isToday = ds === todayStr;
            const dow = (startDow + day - 1) % 7;
            const entry = getWorkLogForDate(ds);
            const status = getDayStatus(entry);

            const isMissed = !entry && dow < 5 && ds < todayStr;

            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (dow >= 5) classes += ' weekend';
            if (isMissed) classes += ' missed';

            let dot = '';
            let content = '';

            const noteIcon = (entry && entry.note)
                ? `<span class="cal-day-note-icon" title="${escapeHtml(entry.note)}">i</span>`
                : '';

            if (entry && status) {
                const prog = getTaskProgress(entry.description);
                const allTasks = getAllTasksText(entry.description);
                const progHtml = prog ? `<span class="cal-day-task-progress">${prog.done}/${prog.total}</span>` : '';
                const descHtml = allTasks ? `<span class="cal-day-desc-text">${escapeHtml(allTasks)}</span>` : '';

                if (status === 'done') {
                    dot = '<div class="cal-day-dot"></div>';
                    content = `<div class="cal-day-content">
                        <div class="cal-day-meta"><span class="cal-hours-pill">${formatHours(entry.hours)}</span>${progHtml}${noteIcon}</div>
                        ${descHtml}
                    </div>`;
                } else {
                    dot = '<div class="cal-day-dot plan"></div>';
                    content = `<div class="cal-day-content plan">
                        <div class="cal-day-meta"><span class="cal-plan-badge">ПЛАН</span>${progHtml}${noteIcon}</div>
                        ${descHtml}
                    </div>`;
                }
            }

            daysHTML += `<div class="${classes}" data-date="${ds}">
                <div class="cal-day-top"><div class="cal-day-inner"><span class="cal-day-num">${day}</span></div></div>
                ${dot}${content}
            </div>`;
        }

        const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
        for (let day = 1; day <= totalCells - startDow - daysInMonth; day++) {
            const dow = (startDow + daysInMonth + day - 1) % 7;
            daysHTML += `<div class="cal-day other-month${dow >= 5 ? ' weekend' : ''}">
                <div class="cal-day-top"><div class="cal-day-inner"><span class="cal-day-num">${day}</span></div></div>
            </div>`;
        }

        const weekdaysHTML = WEEKDAYS.map((d, i) =>
            `<div class="cal-weekday${i >= 5 ? ' weekend' : ''}">${d}</div>`
        ).join('');

        container.innerHTML = `
        <div class="calendar-wrap">
            <div class="calendar-nav">
                <span class="calendar-month-title">${App.formatMonthYear(currentYear, currentMonth)}</span>
                <div class="calendar-nav-btns">
                    <button class="cal-nav-btn" id="cal-prev" aria-label="Предыдущий месяц">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15,18 9,12 15,6"/></svg>
                    </button>
                    <button class="cal-nav-btn cal-today-btn" id="cal-today" style="display:none">Сегодня</button>
                    <button class="cal-nav-btn" id="cal-next" aria-label="Следующий месяц">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                    </button>
                </div>
            </div>
            <div class="calendar-grid">
                <div class="calendar-weekdays">${weekdaysHTML}</div>
                <div class="calendar-days" id="calendar-days">${daysHTML}</div>
            </div>
        </div>`;

        bindEvents();
    }

    function bindEvents() {
        const today = new Date();

        document.getElementById('cal-prev').addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            render();
        });

        document.getElementById('cal-next').addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            render();
        });

        const todayBtn = document.getElementById('cal-today');
        if (todayBtn) {
            if (window.innerWidth >= 768) todayBtn.style.display = '';
            todayBtn.addEventListener('click', () => {
                currentYear = today.getFullYear();
                currentMonth = today.getMonth();
                render();
            });
        }

        document.getElementById('calendar-days').addEventListener('click', (e) => {
            const cell = e.target.closest('.cal-day[data-date]');
            if (!cell) return;
            openDaySheet(cell.dataset.date);
        });
    }

    // ===== Checklist DOM =====

    function addChecklistRow(cont, item, insertAfter = null) {
        const row = document.createElement('div');
        row.className = 'checklist-row';

        const cb = document.createElement('button');
        cb.type = 'button';
        cb.className = 'checklist-cb' + (item.checked ? ' checked' : '');
        if (item.checked) cb.innerHTML = CHECKMARK;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'checklist-input';
        input.value = item.text;
        input.placeholder = 'Описание работы...';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'checklist-del';
        del.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

        row.append(cb, input, del);

        if (insertAfter) insertAfter.after(row);
        else cont.appendChild(row);

        cb.addEventListener('click', () => {
            cb.classList.toggle('checked');
            cb.innerHTML = cb.classList.contains('checked') ? CHECKMARK : '';
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addChecklistRow(cont, { checked: false, text: '' }, row)
                    .querySelector('.checklist-input').focus();
            } else if (e.key === 'Backspace' && input.value === '') {
                e.preventDefault();
                if (cont.querySelectorAll('.checklist-row').length > 1) {
                    const prev = row.previousElementSibling;
                    row.remove();
                    if (prev) prev.querySelector('.checklist-input').focus();
                }
            }
        });

        del.addEventListener('click', () => {
            if (cont.querySelectorAll('.checklist-row').length > 1) {
                const prev = row.previousElementSibling || row.nextElementSibling;
                row.remove();
                if (prev) prev.querySelector('.checklist-input').focus();
            } else {
                input.value = '';
                cb.classList.remove('checked');
                cb.innerHTML = '';
            }
        });

        return row;
    }

    function collectChecklistItems(cont) {
        return Array.from(cont.querySelectorAll('.checklist-row')).map(row => ({
            checked: row.querySelector('.checklist-cb').classList.contains('checked'),
            text: row.querySelector('.checklist-input').value
        }));
    }

    // ===== Day detail sheet =====

    function openDaySheet(ds) {
        const entry = getWorkLogForDate(ds);
        const [y, m, d] = ds.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;

        let html;
        if (entry) {
            const status = getDayStatus(entry);
            const items = parseItems(entry.description);

            const tasksHtml = items.map((item, idx) => `
                <div class="cal-detail-task">
                    <button type="button" class="cal-detail-cb${item.checked ? ' checked' : ''}" data-idx="${idx}">
                        ${item.checked ? CHECKMARK : ''}
                    </button>
                    <span class="cal-detail-task-text${item.checked ? ' checked' : ''}">${escapeHtml(item.text)}</span>
                </div>`).join('');

            html = `
            <div class="bs-header">
                <span class="bs-title">${dateLabel}</span>
                <button class="icon-btn" id="bs-close-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="cal-detail-card">
                ${status === 'done'
                    ? `<div class="cal-detail-time">${formatHours(entry.hours)} · ${entry.rate || 700} ₽/ч · ${App.formatAmount(entry.amount)}</div>`
                    : `<div class="cal-detail-plan-label">ПЛАН</div>`}
                ${tasksHtml ? `<div class="cal-detail-tasks">${tasksHtml}</div>` : ''}
                ${entry.note ? `<div class="cal-detail-note">📝 ${escapeHtml(entry.note)}</div>` : ''}
            </div>
            ${status === 'plan' ? `
            <button class="btn btn-outline" id="cal-reschedule-btn" style="margin-bottom:10px">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Перенести
            </button>` : ''}
            <button class="btn btn-outline" id="cal-edit-btn" style="margin-bottom:10px">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                РЕДАКТИРОВАТЬ
            </button>
            <button class="btn btn-danger" id="cal-delete-btn">Удалить запись</button>`;
        } else {
            html = `
            <div class="bs-header">
                <span class="bs-title">${dateLabel}</span>
                <button class="icon-btn" id="bs-close-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="cal-detail-empty">Нет записи за этот день</div>
            <button class="btn btn-primary" id="cal-add-btn">Добавить рабочий день</button>`;
        }

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        if (entry) {
            // Interactive checkboxes — save on click without opening form
            content.querySelectorAll('.cal-detail-cb').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const idx = parseInt(btn.dataset.idx);
                    const items = parseItems(entry.description);
                    items[idx].checked = !items[idx].checked;
                    const newDesc = serializeItems(items);
                    const isChecked = items[idx].checked;

                    // Optimistic UI
                    btn.classList.toggle('checked', isChecked);
                    btn.innerHTML = isChecked ? CHECKMARK : '';
                    btn.nextElementSibling.classList.toggle('checked', isChecked);

                    const prevDesc = entry.description;
                    entry.description = newDesc;

                    try {
                        const saved = await Sheets.saveWorkLog({
                            date: ds,
                            hours: entry.hours,
                            rate: entry.rate || App.getHourlyRate(),
                            description: newDesc,
                            note: entry.note || ''
                        });
                        const i = workLogs.findIndex(w => w.date === ds);
                        if (i >= 0) workLogs[i] = saved;
                        render();
                    } catch (err) {
                        // Revert
                        entry.description = prevDesc;
                        btn.classList.toggle('checked', !isChecked);
                        btn.innerHTML = !isChecked ? CHECKMARK : '';
                        btn.nextElementSibling.classList.toggle('checked', !isChecked);
                        App.handleError(err, 'Обновление');
                    }
                });
            });

            content.querySelector('#cal-reschedule-btn')?.addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openRescheduleSheet(ds, entry), 320);
            });

            content.querySelector('#cal-edit-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openEditForm(ds, entry), 320);
            });

            content.querySelector('#cal-delete-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog(`Удалить запись за ${dateLabel}?`, async () => {
                        try {
                            await App.withLoading(() => Sheets.deleteWorkLog(entry.id));
                            workLogs = workLogs.filter(w => w.id !== entry.id);
                            render();
                            App.showToast('Запись удалена');
                        } catch (err) {
                            App.handleError(err, 'Удаление');
                        }
                    });
                }, 320);
            });
        } else {
            content.querySelector('#cal-add-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openEditForm(ds, null), 320);
            });
        }
    }

    // ===== Reschedule =====

    function openRescheduleSheet(ds, entry) {
        const [y, m, d] = ds.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Перенести план</span>
            <div style="width:40px"></div>
        </div>
        <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Из: <strong style="color:var(--text-primary)">${dateLabel}</strong></div>
        <div class="form-group">
            <label class="form-label">Новая дата</label>
            <input type="date" class="form-control" id="reschedule-date" value="${ds}" min="${ds}">
        </div>
        <button class="btn btn-primary" id="reschedule-confirm-btn">Перенести</button>`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#reschedule-confirm-btn').addEventListener('click', async () => {
            const newDs = content.querySelector('#reschedule-date').value;
            if (!newDs || newDs === ds) { App.showToast('Выберите другую дату', 'error'); return; }
            if (getWorkLogForDate(newDs)) { App.showToast('На эту дату уже есть запись', 'error'); return; }

            try {
                await App.withLoading(async () => {
                    await Sheets.saveWorkLog({
                        date: newDs,
                        hours: entry.hours || 0,
                        rate: entry.rate || App.getHourlyRate(),
                        description: entry.description || '',
                        note: entry.note || ''
                    });
                    await Sheets.deleteWorkLog(entry.id);
                });
                workLogs = workLogs.filter(w => w.id !== entry.id);
                const [ny, nm, nd] = newDs.split('-').map(Number);
                App.hideBottomSheet();
                currentYear = ny;
                currentMonth = nm - 1;
                await loadData();
                render();
                App.showToast(`План перенесён на ${nd} ${App.MONTHS_RU[nm - 1]}`);
            } catch (err) {
                App.handleError(err, 'Перенос');
            }
        });
    }

    // ===== Edit form =====

    function openEditForm(ds, existingEntry) {
        const [y, m, d] = ds.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;
        const isEdit = !!existingEntry;
        const existingH = existingEntry ? Math.floor(existingEntry.hours) : 0;
        const existingM = existingEntry ? Math.round((existingEntry.hours - Math.floor(existingEntry.hours)) * 60) : 0;

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">${isEdit ? 'Редактирование дня' : 'Добавить день'}</span>
            <div style="width:40px"></div>
        </div>

        <div class="form-group">
            <label class="form-label">Дата</label>
            <div class="form-control-with-icon">
                <input type="date" class="form-control" id="cal-date" value="${ds}" readonly>
                <span class="form-control-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </span>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Время работы / Ставка</label>
            <div style="display:flex;gap:10px;align-items:center">
                <div style="display:flex;gap:6px;align-items:center;flex:1.2">
                    <input type="number" inputmode="numeric" class="form-control" id="cal-hours-h"
                        min="0" max="24" placeholder="0"
                        style="width:56px;text-align:center;flex:none;padding-left:4px;padding-right:4px"
                        value="${existingH || ''}">
                    <span style="color:var(--text-muted);font-size:14px;white-space:nowrap">ч</span>
                    <input type="number" inputmode="numeric" class="form-control" id="cal-hours-m"
                        min="0" max="59" placeholder="0"
                        style="width:56px;text-align:center;flex:none;padding-left:4px;padding-right:4px"
                        value="${existingM || ''}">
                    <span style="color:var(--text-muted);font-size:14px;white-space:nowrap">мин</span>
                </div>
                <div class="form-control-with-icon" style="flex:1">
                    <input type="text" inputmode="decimal" class="form-control" id="cal-rate" value="${(existingEntry && existingEntry.hours) ? (existingEntry.rate || App.getHourlyRate()) : App.getHourlyRate()}" placeholder="700.00">
                    <span class="form-control-icon" style="font-size:12px;font-weight:600;color:var(--text-muted)">₽/ч</span>
                </div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Список работ</label>
            <div class="cal-checklist" id="cal-tasks"></div>
            <button type="button" class="add-checklist-btn" id="cal-add-task">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Добавить пункт
            </button>
        </div>

        <div class="form-group">
            <label class="form-label">Заметка (личное)</label>
            <textarea class="form-control textarea" id="cal-note" placeholder="Например: Не забыть отправить отчёт">${existingEntry ? escapeHtml(existingEntry.note || '') : ''}</textarea>
        </div>

        <button class="btn btn-primary" id="cal-save-btn" style="margin-bottom:10px">Сохранить</button>
        ${isEdit ? '<button class="btn btn-danger" id="cal-del-btn">Удалить запись</button>' : ''}`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        // Init checklist
        const tasksContainer = content.querySelector('#cal-tasks');
        const initialItems = existingEntry ? parseItems(existingEntry.description) : [];
        if (initialItems.length === 0) initialItems.push({ checked: false, text: '' });
        initialItems.forEach(item => addChecklistRow(tasksContainer, item));

        content.querySelector('#cal-add-task').addEventListener('click', () => {
            addChecklistRow(tasksContainer, { checked: false, text: '' })
                .querySelector('.checklist-input').focus();
        });

        content.querySelector('#cal-save-btn').addEventListener('click', async () => {
            const hVal = Math.max(0, parseInt(content.querySelector('#cal-hours-h').value) || 0);
            const mVal = Math.min(59, Math.max(0, parseInt(content.querySelector('#cal-hours-m').value) || 0));
            const hours = hVal + mVal / 60;
            const rate = parseFloat(content.querySelector('#cal-rate').value.replace(',', '.')) || App.getHourlyRate();
            const items = collectChecklistItems(tasksContainer);
            const description = serializeItems(items);

            if (!hours && !description.trim()) {
                App.showToast('Добавьте список работ или укажите часы', 'error');
                return;
            }

            try {
                const saved = await App.withLoading(() => Sheets.saveWorkLog({
                    date: ds, hours, rate, description,
                    note: content.querySelector('#cal-note').value.trim()
                }));
                const idx = workLogs.findIndex(w => w.date === ds);
                if (idx >= 0) workLogs[idx] = saved;
                else workLogs.push(saved);
                App.hideBottomSheet();
                render();
                App.showToast('Сохранено');
            } catch (err) {
                App.handleError(err, 'Сохранение');
            }
        });

        if (isEdit) {
            content.querySelector('#cal-del-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog(`Удалить запись за ${dateLabel}?`, async () => {
                        try {
                            await App.withLoading(() => Sheets.deleteWorkLog(existingEntry.id));
                            workLogs = workLogs.filter(w => w.id !== existingEntry.id);
                            render();
                            App.showToast('Запись удалена');
                        } catch (err) {
                            App.handleError(err, 'Удаление');
                        }
                    });
                }, 320);
            });
        }
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { init };
})();
