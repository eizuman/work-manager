// Calendar module

const CalendarModule = (() => {
    let container = null;
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth(); // 0-based
    let workLogs = [];

    const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            workLogs = await App.withLoading(() => Sheets.getWorkLogs());
        } catch (err) {
            App.handleError(err, 'Загрузка календаря');
            workLogs = [];
        }
    }

    function getWorkLogForDate(dateStr) {
        return workLogs.find(w => w.date === dateStr);
    }

    function dateStr(year, month, day) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function formatHours(h) {
        const hrs = Math.floor(h);
        const mins = Math.round((h - hrs) * 60);
        return mins > 0 ? `${hrs}ч ${String(mins).padStart(2,'0')}м` : `${hrs}ч 00м`;
    }

    function render() {
        const today = new Date();
        const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate());
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);

        // Monday-first: getDay() returns 0=Sun, so we shift
        const startDow = (firstDay.getDay() + 6) % 7; // 0=Mon
        const daysInMonth = lastDay.getDate();

        let daysHTML = '';

        // Previous month padding
        const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
        for (let i = startDow - 1; i >= 0; i--) {
            const day = prevMonthLastDay - i;
            const dow = (startDow - i - 1 + 7) % 7;
            const isWeekend = dow >= 5;
            daysHTML += `<div class="cal-day other-month${isWeekend ? ' weekend' : ''}">
                <div class="cal-day-inner"><span class="cal-day-num">${day}</span></div>
            </div>`;
        }

        // Current month
        for (let day = 1; day <= daysInMonth; day++) {
            const ds = dateStr(currentYear, currentMonth, day);
            const isToday = ds === todayStr;
            const dow = (startDow + day - 1) % 7;
            const isWeekend = dow >= 5;
            const entry = getWorkLogForDate(ds);

            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (isWeekend) classes += ' weekend';

            const dot = entry ? '<div class="cal-day-dot"></div>' : '';
            const content = entry ? `<div class="cal-day-content">
                <span class="cal-hours-pill">${formatHours(entry.hours)}</span>
                ${entry.description ? `<span class="cal-day-desc-text">${escapeHtml(entry.description.slice(0, 60))}</span>` : ''}
            </div>` : '';

            daysHTML += `<div class="${classes}" data-date="${ds}">
                <div class="cal-day-inner">
                    <span class="cal-day-num">${day}</span>
                </div>
                ${dot}
                ${content}
            </div>`;
        }

        // Next month padding
        const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
        const endPad = totalCells - startDow - daysInMonth;
        for (let day = 1; day <= endPad; day++) {
            const dow = (startDow + daysInMonth + day - 1) % 7;
            const isWeekend = dow >= 5;
            daysHTML += `<div class="cal-day other-month${isWeekend ? ' weekend' : ''}">
                <div class="cal-day-inner"><span class="cal-day-num">${day}</span></div>
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15,18 9,12 15,6"/>
                        </svg>
                    </button>
                    <button class="cal-nav-btn cal-today-btn hidden" id="cal-today" style="display:none">Сегодня</button>
                    <button class="cal-nav-btn" id="cal-next" aria-label="Следующий месяц">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9,18 15,12 9,6"/>
                        </svg>
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
            // Show "Сегодня" on desktop
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

    function openDaySheet(dateStr) {
        const entry = getWorkLogForDate(dateStr);
        const [y, m, d] = dateStr.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;

        let html;
        if (entry) {
            html = `
            <div class="bs-header">
                <span class="bs-title">${dateLabel}</span>
                <button class="icon-btn" id="bs-close-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            <div class="cal-detail-card">
                <div class="cal-detail-time">${entry.hours} ч</div>
                <div class="cal-detail-desc">${escapeHtml(entry.description || 'Без описания')}</div>
                ${entry.note ? `<div class="cal-detail-desc" style="margin-top:6px;color:var(--text-muted);font-size:13px;">📝 ${escapeHtml(entry.note)}</div>` : ''}
            </div>
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
            content.querySelector('#cal-edit-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openEditForm(dateStr, entry), 320);
            });
            content.querySelector('#cal-delete-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog(
                        `Удалить запись за ${dateLabel}?`,
                        async () => {
                            try {
                                await App.withLoading(() => Sheets.deleteWorkLog(entry.id));
                                workLogs = workLogs.filter(w => w.id !== entry.id);
                                render();
                                App.showToast('Запись удалена');
                            } catch (err) {
                                App.handleError(err, 'Удаление');
                            }
                        }
                    );
                }, 320);
            });
        } else {
            content.querySelector('#cal-add-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => openEditForm(dateStr, null), 320);
            });
        }
    }

    function openEditForm(ds, existingEntry) {
        const [y, m, d] = ds.split('-').map(Number);
        const dateLabel = `${d} ${App.MONTHS_RU[m - 1]} ${y}`;
        const isEdit = !!existingEntry;

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
            <label class="form-label">Отработанные часы</label>
            <div class="form-control-with-icon">
                <input type="number" class="form-control" id="cal-hours" value="${existingEntry ? existingEntry.hours : ''}" placeholder="8" min="0" max="24" step="0.5">
                <span class="form-control-icon" style="font-size:13px;font-weight:600;color:var(--text-muted)">ч</span>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Описание работ</label>
            <textarea class="form-control textarea" id="cal-desc" placeholder="Что было сделано...">${existingEntry ? escapeHtml(existingEntry.description) : ''}</textarea>
        </div>

        <div class="form-group">
            <label class="form-label">Заметка (личное)</label>
            <textarea class="form-control textarea" id="cal-note" placeholder="Например: Не забыть отправить отчёт">${existingEntry ? escapeHtml(existingEntry.note) : ''}</textarea>
        </div>

        <button class="btn btn-primary" id="cal-save-btn" style="margin-bottom:10px">Сохранить</button>
        ${isEdit ? '<button class="btn btn-danger" id="cal-del-btn">Удалить запись</button>' : ''}`;

        const content = App.showBottomSheet(html);

        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#cal-save-btn').addEventListener('click', async () => {
            const hours = parseFloat(content.querySelector('#cal-hours').value);
            if (!hours || hours <= 0) {
                App.showToast('Укажите количество часов', 'error');
                return;
            }

            try {
                const saved = await App.withLoading(() => Sheets.saveWorkLog({
                    date: ds,
                    hours,
                    description: content.querySelector('#cal-desc').value.trim(),
                    note: content.querySelector('#cal-note').value.trim()
                }));

                // Update local cache
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
                    App.showConfirmDialog(
                        `Удалить запись за ${dateLabel}?`,
                        async () => {
                            try {
                                await App.withLoading(() => Sheets.deleteWorkLog(existingEntry.id));
                                workLogs = workLogs.filter(w => w.id !== existingEntry.id);
                                render();
                                App.showToast('Запись удалена');
                            } catch (err) {
                                App.handleError(err, 'Удаление');
                            }
                        }
                    );
                }, 320);
            });
        }
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { init };
})();
