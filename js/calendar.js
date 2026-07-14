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
        if (!entry.description && !entry.hours && !entry.note) return null;
        if (!entry.description && !entry.hours) return 'note';
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

            const isMissed = (!entry || status === 'note') && ds < todayStr;

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
                } else if (status === 'plan') {
                    dot = '<div class="cal-day-dot plan"></div>';
                    content = `<div class="cal-day-content plan">
                        <div class="cal-day-meta"><span class="cal-plan-badge">ПЛАН</span>${progHtml}${noteIcon}</div>
                        ${descHtml}
                    </div>`;
                } else if (status === 'note') {
                    dot = '<div class="cal-day-dot note"></div>';
                    content = `<div class="cal-day-content">
                        <div class="cal-day-meta">${noteIcon}</div>
                        <span class="cal-day-desc-text">${escapeHtml(entry.note)}</span>
                    </div>`;
                }
            }

            daysHTML += `<div class="${classes}"${entry ? ' draggable="true"' : ''} data-date="${ds}">
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
            if (window.innerWidth >= 768 && window.innerHeight >= 600) todayBtn.style.display = '';
            todayBtn.addEventListener('click', () => {
                currentYear = today.getFullYear();
                currentMonth = today.getMonth();
                render();
            });
        }

        document.getElementById('calendar-days').addEventListener('click', (e) => {
            if (_dragJustHappened) { _dragJustHappened = false; return; }
            const cell = e.target.closest('.cal-day[data-date]');
            if (!cell) return;
            openDaySheet(cell.dataset.date);
        });

        bindDrag(document.getElementById('calendar-days'));
    }

    // ===== Day drag-and-drop =====

    let _dragJustHappened = false;

    function bindDrag(daysEl) {
        let dragSrcDate = null;

        // — Desktop: HTML5 DnD —
        daysEl.addEventListener('dragstart', (e) => {
            const cell = e.target.closest('.cal-day[data-date]');
            if (!cell || cell.classList.contains('other-month')) { e.preventDefault(); return; }
            if (!getWorkLogForDate(cell.dataset.date)) { e.preventDefault(); return; }
            dragSrcDate = cell.dataset.date;
            cell.classList.add('drag-source');
            e.dataTransfer.effectAllowed = 'move';
        });

        daysEl.addEventListener('dragend', () => {
            daysEl.querySelectorAll('.drag-source,.drag-over').forEach(c => c.classList.remove('drag-source','drag-over'));
            dragSrcDate = null;
        });

        daysEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const cell = e.target.closest('.cal-day[data-date]');
            daysEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
            if (cell && !cell.classList.contains('other-month') && cell.dataset.date !== dragSrcDate) {
                cell.classList.add('drag-over');
            }
        });

        daysEl.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || !daysEl.contains(e.relatedTarget)) {
                daysEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
            }
        });

        daysEl.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetCell = e.target.closest('.cal-day[data-date]');
            daysEl.querySelectorAll('.drag-source,.drag-over').forEach(c => c.classList.remove('drag-source','drag-over'));
            if (!targetCell || !dragSrcDate || targetCell.dataset.date === dragSrcDate) return;
            _dragJustHappened = true;
            executeDrop(dragSrcDate, targetCell.dataset.date);
            dragSrcDate = null;
        });

        // — Mobile: long-press drag —
        let touchSrcDate = null;
        let touchSrcCell = null;
        let touchStartX = 0, touchStartY = 0;
        let touchTimer = null;
        let touchDragging = false;

        daysEl.addEventListener('touchstart', (e) => {
            const cell = e.target.closest('.cal-day[data-date]');
            if (!cell || cell.classList.contains('other-month')) return;
            if (!getWorkLogForDate(cell.dataset.date)) return;
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchSrcCell = cell;
            daysEl.style.userSelect = 'none';
            daysEl.style.webkitUserSelect = 'none';
            touchTimer = setTimeout(() => {
                touchSrcDate = cell.dataset.date;
                touchDragging = true;
                cell.classList.add('drag-source');
                if (navigator.vibrate) navigator.vibrate(50);
            }, 550);
        }, { passive: true });

        daysEl.addEventListener('touchmove', (e) => {
            if (touchDragging) {
                e.preventDefault();
                const touch = e.touches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const cell = el?.closest('.cal-day[data-date]');
                daysEl.querySelectorAll('.drag-over').forEach(c => c.classList.remove('drag-over'));
                if (cell && !cell.classList.contains('other-month') && cell.dataset.date !== touchSrcDate) {
                    cell.classList.add('drag-over');
                }
                return;
            }
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        }, { passive: false });

        daysEl.addEventListener('touchend', (e) => {
            clearTimeout(touchTimer);
            touchTimer = null;
            daysEl.style.userSelect = '';
            daysEl.style.webkitUserSelect = '';
            if (!touchDragging) { touchSrcDate = null; touchSrcCell = null; return; }

            const touch = e.changedTouches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCell = el?.closest('.cal-day[data-date]');

            daysEl.querySelectorAll('.drag-source,.drag-over').forEach(c => c.classList.remove('drag-source','drag-over'));

            const srcDate = touchSrcDate;
            touchSrcDate = null;
            touchSrcCell = null;
            touchDragging = false;

            if (targetCell && !targetCell.classList.contains('other-month') && targetCell.dataset.date !== srcDate) {
                executeDrop(srcDate, targetCell.dataset.date);
            }
        });

        daysEl.addEventListener('touchcancel', () => {
            clearTimeout(touchTimer);
            touchTimer = null;
            daysEl.style.userSelect = '';
            daysEl.style.webkitUserSelect = '';
            touchSrcDate = null;
            touchSrcCell = null;
            touchDragging = false;
            daysEl.querySelectorAll('.drag-source,.drag-over').forEach(c => c.classList.remove('drag-source','drag-over'));
        });
    }

    function executeDrop(srcDs, tgtDs) {
        const srcEntry = getWorkLogForDate(srcDs);
        if (!srcEntry) return;

        const [sy, sm, sd] = srcDs.split('-').map(Number);
        const [ty, tm, td] = tgtDs.split('-').map(Number);
        const srcLabel = `${sd} ${App.MONTHS_RU[sm - 1]}`;
        const tgtLabel = `${td} ${App.MONTHS_RU[tm - 1]}`;

        const tgtEntry = getWorkLogForDate(tgtDs);
        const warnPart = tgtEntry ? `\n\nНа ${tgtLabel} уже есть запись — она будет удалена.` : '';

        App.showConfirmDialog(
            `Перенести запись с ${srcLabel} на ${tgtLabel}?${warnPart}`,
            async () => {
                try {
                    await App.withLoading(async () => {
                        if (tgtEntry) {
                            await Sheets.deleteWorkLog(tgtEntry.id);
                            workLogs = workLogs.filter(w => w.id !== tgtEntry.id);
                        }
                        const saved = await Sheets.saveWorkLog({
                            date: tgtDs,
                            hours: srcEntry.hours,
                            rate: srcEntry.rate || App.getHourlyRate(),
                            description: srcEntry.description || '',
                            task_ids: srcEntry.task_ids || [],
                            note: srcEntry.note || ''
                        });
                        const ti = workLogs.findIndex(w => w.date === tgtDs);
                        if (ti >= 0) workLogs[ti] = saved; else workLogs.push(saved);
                        await Sheets.deleteWorkLog(srcEntry.id);
                        workLogs = workLogs.filter(w => w.id !== srcEntry.id);
                    });
                    render();
                    App.showToast(`Перенесено на ${tgtLabel}`);
                } catch (err) {
                    App.handleError(err, 'Перенос');
                }
            },
            'Перенести'
        );
    }

    // ===== Checklist DOM =====

    function addChecklistRow(cont, item, insertAfter = null) {
        const row = document.createElement('div');
        row.className = 'checklist-row';
        row.setAttribute('draggable', 'true');
        row.dataset.taskId = item.taskId || '';

        const handle = document.createElement('div');
        handle.className = 'task-drag-handle';
        handle.setAttribute('data-drag-handle', '');
        handle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.2" fill="currentColor" stroke="none"/></svg>';

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

        row.append(handle, cb, input, del);

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
            text: row.querySelector('.checklist-input').value,
            taskId: row.dataset.taskId || ''
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
            const hasTaskItems = items.some(it => it.text.trim());

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
                    : status === 'plan'
                    ? `<div class="cal-detail-plan-label">ПЛАН</div>`
                    : ''}
                ${tasksHtml ? `<div class="cal-detail-tasks">${tasksHtml}</div>` : ''}
                ${entry.note ? `<div class="cal-detail-note">📝 ${escapeHtml(entry.note)}</div>` : ''}
            </div>
            ${status === 'plan' ? `
            <button class="btn btn-outline" id="cal-reschedule-btn" style="margin-bottom:10px">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Перенести
            </button>` : ''}
            ${hasTaskItems ? `
            <button class="btn btn-outline" id="cal-move-tasks-btn" style="margin-bottom:10px">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                Перенести задачи
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

            content.querySelector('#cal-move-tasks-btn')?.addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openMoveTasksSheet(ds, entry), 320);
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

    // ===== Move tasks to another day =====

    function openMoveTasksSheet(ds, entry) {
        const [y, m, d] = ds.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;
        const items = parseItems(entry.description).filter(it => it.text.trim());
        const allTaskIds = entry.task_ids || [];

        const itemsHtml = items.map((item, i) => `
            <label class="cal-task-picker-item">
                <input type="checkbox" class="cal-move-cb" value="${i}" checked>
                <span style="flex:1">${escapeHtml(item.text)}${item.checked
                    ? ' <span style="color:var(--text-muted);font-size:11px">(выполнено)</span>'
                    : ''}</span>
            </label>`).join('');

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Перенести задачи</span>
            <div style="width:40px"></div>
        </div>
        <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">Из: <strong style="color:var(--text-primary)">${dateLabel}</strong></div>
        <div class="form-group">
            <label class="form-label">Выберите задачи</label>
            <div class="cal-task-picker-list" id="move-items-list">${itemsHtml}</div>
        </div>
        <div class="form-group">
            <label class="form-label">Перенести на дату</label>
            <input type="date" class="form-control" id="move-target-date">
        </div>
        <button class="btn btn-primary" id="move-confirm-btn">Перенести</button>`;

        const content = App.showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#move-confirm-btn').addEventListener('click', async () => {
            const targetDs = content.querySelector('#move-target-date').value;
            if (!targetDs || targetDs === ds) {
                App.showToast('Выберите другую дату', 'error');
                return;
            }

            const selectedIndices = new Set(
                Array.from(content.querySelectorAll('.cal-move-cb:checked')).map(cb => parseInt(cb.value))
            );
            if (!selectedIndices.size) {
                App.showToast('Выберите задачи для переноса', 'error');
                return;
            }

            const movedItems = items.filter((_, i) => selectedIndices.has(i)).map(it => ({ ...it, checked: false }));
            const movedTaskIds = items.map((_, i) => allTaskIds[i] || '').filter((_, i) => selectedIndices.has(i));
            const remainingItems = items.filter((_, i) => !selectedIndices.has(i));
            const remainingTaskIds = items.map((_, i) => allTaskIds[i] || '').filter((_, i) => !selectedIndices.has(i));

            try {
                await App.withLoading(async () => {
                    // Update or delete source entry
                    const remainingDesc = serializeItems(remainingItems);
                    if (remainingDesc || entry.hours || entry.note) {
                        const updated = await Sheets.saveWorkLog({
                            date: ds,
                            hours: entry.hours,
                            rate: entry.rate || App.getHourlyRate(),
                            description: remainingDesc,
                            task_ids: remainingTaskIds,
                            note: entry.note || ''
                        });
                        const si = workLogs.findIndex(w => w.date === ds);
                        if (si >= 0) workLogs[si] = updated;
                    } else {
                        await Sheets.deleteWorkLog(entry.id);
                        workLogs = workLogs.filter(w => w.id !== entry.id);
                    }

                    // Append to target entry (create if doesn't exist)
                    const targetEntry = getWorkLogForDate(targetDs);
                    const targetItems = targetEntry
                        ? parseItems(targetEntry.description).filter(it => it.text.trim())
                        : [];
                    const targetTaskIds = targetEntry ? (targetEntry.task_ids || []) : [];

                    const savedTarget = await Sheets.saveWorkLog({
                        date: targetDs,
                        hours: targetEntry ? targetEntry.hours : 0,
                        rate: targetEntry ? targetEntry.rate : App.getHourlyRate(),
                        description: serializeItems([...targetItems, ...movedItems]),
                        task_ids: [...targetTaskIds, ...movedTaskIds],
                        note: targetEntry ? (targetEntry.note || '') : ''
                    });
                    const ti = workLogs.findIndex(w => w.date === targetDs);
                    if (ti >= 0) workLogs[ti] = savedTarget;
                    else workLogs.push(savedTarget);
                });

                const [ty, tm, td] = targetDs.split('-').map(Number);
                App.hideBottomSheet();
                render();
                App.showToast(`${selectedIndices.size === 1 ? 'Задача перенесена' : 'Задачи перенесены'} на ${td} ${App.MONTHS_RU[tm - 1]}`);
            } catch (err) {
                App.handleError(err, 'Перенос задач');
            }
        });
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
                        note: entry.note || '',
                        task_ids: entry.task_ids || []
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

    // ===== Checklist drag-and-drop =====

    function bindChecklistDrag(cont) {
        let dragEl = null;

        cont.addEventListener('dragstart', (e) => {
            dragEl = e.target.closest('.checklist-row');
            if (!dragEl) return;
            dragEl.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        cont.addEventListener('dragend', () => {
            if (dragEl) { dragEl.classList.remove('dragging'); dragEl = null; }
        });

        cont.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.checklist-row');
            if (!target || target === dragEl) return;
            const rect = target.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
                cont.insertBefore(dragEl, target);
            } else {
                cont.insertBefore(dragEl, target.nextSibling);
            }
        });

        cont.addEventListener('touchstart', (e) => {
            const handle = e.target.closest('[data-drag-handle]');
            if (!handle) return;
            e.preventDefault();
            dragEl = handle.closest('.checklist-row');
            dragEl.classList.add('dragging');
        }, { passive: false });

        cont.addEventListener('touchmove', (e) => {
            if (!dragEl) return;
            e.preventDefault();
            const touch = e.touches[0];
            const elBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            if (!elBelow) return;
            const target = elBelow.closest('.checklist-row');
            if (target && target !== dragEl) {
                const rect = target.getBoundingClientRect();
                if (touch.clientY < rect.top + rect.height / 2) {
                    cont.insertBefore(dragEl, target);
                } else {
                    cont.insertBefore(dragEl, target.nextSibling);
                }
            }
        }, { passive: false });

        cont.addEventListener('touchend', () => {
            if (dragEl) { dragEl.classList.remove('dragging'); dragEl = null; }
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
                <input type="date" class="form-control" id="cal-date" value="${ds}">
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
            <div class="cal-task-picker" id="cal-task-picker" style="display:none">
                <div class="cal-task-picker-list" id="cal-task-picker-list"></div>
                <div style="display:flex;gap:8px;margin-top:8px">
                    <button type="button" class="btn btn-primary" id="cal-picker-add-btn" style="flex:1;padding:8px;font-size:13px">Добавить выбранные</button>
                    <button type="button" class="btn btn-outline" id="cal-picker-cancel-btn" style="flex:1;padding:8px;font-size:13px">Отмена</button>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="add-checklist-btn" id="cal-add-task">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Добавить пункт
                </button>
                <button type="button" class="add-checklist-btn" id="cal-from-tasks-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Из задач
                </button>
            </div>
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
        const initialItems = existingEntry
            ? parseItems(existingEntry.description).map((item, i) => ({
                ...item, taskId: (existingEntry.task_ids || [])[i] || ''
              }))
            : [];
        if (initialItems.length === 0) initialItems.push({ checked: false, text: '' });
        initialItems.forEach(item => addChecklistRow(tasksContainer, item));
        bindChecklistDrag(tasksContainer);

        content.querySelector('#cal-add-task').addEventListener('click', () => {
            addChecklistRow(tasksContainer, { checked: false, text: '' })
                .querySelector('.checklist-input').focus();
        });

        // Task picker
        content.querySelector('#cal-from-tasks-btn').addEventListener('click', async () => {
            const picker = content.querySelector('#cal-task-picker');
            const pickerList = content.querySelector('#cal-task-picker-list');
            if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
            picker.style.display = 'block';
            pickerList.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">Загрузка...</div>';
            try {
                const allTasks = await Sheets.getTasks();
                const active = allTasks.filter(t => t.status !== 'done');
                if (!active.length) {
                    pickerList.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:6px 0">Нет активных задач</div>';
                    return;
                }
                pickerList.innerHTML = active.map(t => `
                    <label class="cal-task-picker-item" data-task-id="${t.id}">
                        <input type="checkbox" class="cal-picker-cb" value="${t.id}">
                        <span>${escapeHtml(t.title)}</span>
                    </label>`).join('');
            } catch (e) {
                pickerList.innerHTML = '<div style="color:var(--red-medium);font-size:13px;padding:6px 0">Ошибка загрузки задач</div>';
            }
        });

        content.querySelector('#cal-picker-add-btn').addEventListener('click', () => {
            content.querySelectorAll('.cal-picker-cb:checked').forEach(cb => {
                const label = cb.closest('.cal-task-picker-item');
                addChecklistRow(tasksContainer, {
                    checked: false,
                    text: label.querySelector('span').textContent,
                    taskId: label.dataset.taskId
                });
            });
            content.querySelector('#cal-task-picker').style.display = 'none';
        });

        content.querySelector('#cal-picker-cancel-btn').addEventListener('click', () => {
            content.querySelector('#cal-task-picker').style.display = 'none';
        });

        content.querySelector('#cal-save-btn').addEventListener('click', async () => {
            const newDs = content.querySelector('#cal-date').value;
            if (!newDs) { App.showToast('Укажите дату', 'error'); return; }
            const hVal = Math.max(0, parseInt(content.querySelector('#cal-hours-h').value) || 0);
            const mVal = Math.min(59, Math.max(0, parseInt(content.querySelector('#cal-hours-m').value) || 0));
            const hours = hVal + mVal / 60;
            const rate = parseFloat(content.querySelector('#cal-rate').value.replace(',', '.')) || App.getHourlyRate();
            const items = collectChecklistItems(tasksContainer);
            const description = serializeItems(items);
            const task_ids = items.map(i => i.taskId || '');
            const note = content.querySelector('#cal-note').value.trim();

            if (!hours && !description.trim() && !note) {
                App.showToast('Добавьте список работ, укажите часы или напишите заметку', 'error');
                return;
            }

            const dateChanged = isEdit && newDs !== ds;
            if (dateChanged && getWorkLogForDate(newDs)) {
                App.showToast('На эту дату уже есть запись', 'error');
                return;
            }

            try {
                const saved = await App.withLoading(async () => {
                    const entry = await Sheets.saveWorkLog({ date: newDs, hours, rate, description, task_ids, note });
                    if (dateChanged) await Sheets.deleteWorkLog(existingEntry.id);
                    return entry;
                });
                if (dateChanged) workLogs = workLogs.filter(w => w.id !== existingEntry.id);
                const idx = workLogs.findIndex(w => w.date === newDs);
                if (idx >= 0) workLogs[idx] = saved;
                else workLogs.push(saved);
                App.hideBottomSheet();
                if (dateChanged) {
                    const [ny, nm] = newDs.split('-').map(Number);
                    currentYear = ny; currentMonth = nm - 1;
                    await loadData();
                }
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
