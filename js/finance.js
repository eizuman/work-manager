// Finance module

const FinanceModule = (() => {
    let container = null;
    let entries = [];
    let workLogs = [];
    let filterMode = 'all'; // 'all' | 'year' | 'month' | 'custom'
    let filterFrom = '';
    let filterTo = '';

    const TYPE_LABELS = {
        work: 'Работа',
        advance: 'Аванс',
        payment: 'Расчёт'
    };

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            [entries, workLogs] = await App.withLoading(() => Promise.all([Sheets.getFinanceEntries(), Sheets.getWorkLogs()]));
        } catch (err) {
            App.handleError(err, 'Загрузка финансов');
            entries = [];
        }
    }

    function getBalance() {
        return entries.reduce((bal, e) => bal + (e.type === 'work' ? e.amount : -e.amount), 0);
    }

    function getFilteredEntries() {
        if (filterMode === 'all') return entries;
        const now = new Date();
        let from = '', to = '';
        if (filterMode === 'month') {
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
            from = `${y}-${m}-01`;
            to = `${y}-${m}-31`;
        } else if (filterMode === 'year') {
            from = `${now.getFullYear()}-01-01`;
            to = `${now.getFullYear()}-12-31`;
        } else if (filterMode === 'custom') {
            from = filterFrom;
            to = filterTo;
        }
        return entries.filter(e => {
            if (from && e.date < from) return false;
            if (to && e.date > to) return false;
            return true;
        });
    }

    function getTotalStats(ents) {
        let earned = 0, paid = 0;
        ents.forEach(e => {
            if (e.type === 'work') earned += e.amount;
            else paid += e.amount;
        });
        const hours = earned / App.getHourlyRate();
        return { hours, earned, paid };
    }

    function workHoursStr(e) {
        const log = workLogs.find(l => l.date === e.date);
        if (!log || !log.hours) return '';
        const hrs = Math.floor(log.hours);
        const mins = Math.round((log.hours - hrs) * 60);
        return mins > 0 ? `${hrs}ч ${String(mins).padStart(2, '0')}м` : `${hrs}ч`;
    }

    function render() {
        const balance = getBalance();
        const filtered = getFilteredEntries();
        const stats = getTotalStats(filtered);

        const balanceStatus = balance > 0 ? 'debt' : balance < 0 ? 'credit' : 'zero';
        const balanceText = balance === 0
            ? '0 ₽'
            : (balance > 0 ? '+' : '−') + App.formatAmount(Math.abs(balance));

        const now = new Date();
        const filterBar = `
        <div class="finance-filter-bar">
            <button class="fin-filter-btn${filterMode === 'all' ? ' active' : ''}" data-fmode="all">Всё время</button>
            <button class="fin-filter-btn${filterMode === 'year' ? ' active' : ''}" data-fmode="year">${now.getFullYear()}</button>
            <button class="fin-filter-btn${filterMode === 'month' ? ' active' : ''}" data-fmode="month">${App.MONTHS_FULL_RU[now.getMonth()]}</button>
            <button class="fin-filter-btn${filterMode === 'custom' ? ' active' : ''}" data-fmode="custom">Период</button>
        </div>
        ${filterMode === 'custom' ? `<div class="finance-filter-dates">
            <label class="fin-filter-date-lbl">с <input type="date" class="fin-date-input" id="filter-from" value="${filterFrom}"></label>
            <span class="fin-filter-sep">—</span>
            <label class="fin-filter-date-lbl">по <input type="date" class="fin-date-input" id="filter-to" value="${filterTo}"></label>
        </div>` : ''}`;

        const sortedEntries = [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp));

        const addBtnHtml = `<button class="fab" id="add-finance-btn" aria-label="Добавить транзакцию">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span class="fab-label">Новая транзакция</span>
        </button>`;

        container.innerHTML = `
        <div class="finance-wrap">
            <div class="balance-card">
                <div>
                    <div class="balance-label">ТЕКУЩИЙ БАЛАНС</div>
                    <div class="balance-amount ${balanceStatus}">${balanceText}</div>
                </div>
            </div>

            ${filterBar}

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-lbl">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        ОТРАБОТАНО
                    </div>
                    <div class="stat-val">${stats.hours.toFixed(0)} ч</div>
                </div>
                <div class="stat-card">
                    <div class="stat-lbl">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:4px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                        ОТРАБОТАНО В ₽
                    </div>
                    <div class="stat-val">${App.formatAmount(stats.earned)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-lbl">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        ВЫПЛАЧЕНО
                    </div>
                    <div class="stat-val">${App.formatAmount(stats.paid)}</div>
                </div>
            </div>

            <div class="finance-list-title">
                <span>История транзакций</span>
                <span class="desktop-only">${addBtnHtml.replace('class="fab"', 'class="fab desktop-add-btn"')}</span>
            </div>

            <div class="tx-list" id="tx-list">
                <div class="tx-table-head">
                    <span>Дата</span>
                    <span>Тип операции</span>
                    <span style="text-align:right">Сумма</span>
                    <span></span>
                </div>
                ${sortedEntries.length === 0
                    ? '<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">Транзакций нет</div></div>'
                    : sortedEntries.map(e => renderTxItem(e)).join('')}
            </div>
        </div>

        <button class="fab mobile-only" id="add-finance-btn" aria-label="Добавить транзакцию">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </button>`;

        bindEvents();
    }

    function renderTxItem(e) {
        const isWork = e.type === 'work';
        const sign = isWork ? '−' : '+';
        const cls = isWork ? 'tx-work' : 'tx-pay';
        const hoursStr = isWork ? workHoursStr(e) : '';
        const label = isWork
            ? `Смена ${App.formatDate(e.date)}${hoursStr ? ', ' + hoursStr : ''}`
            : (e.description || TYPE_LABELS[e.type] || e.type);
        return `
        <div class="tx-item" data-id="${e.id}">
            <div class="tx-info">
                <div class="tx-date">${App.formatDate(e.date)}</div>
                <div class="tx-desc">
                    <span class="tx-type-dot ${e.type}"></span>${escapeHtml(label)}
                </div>
            </div>
            <div class="tx-amount ${cls}">${sign}${App.formatAmount(e.amount)}</div>
            <div class="tx-actions">
                <button class="tx-action-btn edit-tx" aria-label="Редактировать" data-id="${e.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="tx-action-btn delete tx-delete" aria-label="Удалить" data-id="${e.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
            </div>
        </div>`;
    }

    function bindEvents() {
        container.querySelector('#add-finance-btn')?.addEventListener('click', () => openFinanceForm(null));
        container.querySelector('.desktop-add-btn')?.addEventListener('click', () => openFinanceForm(null));

        container.querySelector('.finance-filter-bar')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.fin-filter-btn');
            if (!btn) return;
            filterMode = btn.dataset.fmode;
            render();
        });
        container.querySelector('#filter-from')?.addEventListener('change', (e) => {
            filterFrom = e.target.value; render();
        });
        container.querySelector('#filter-to')?.addEventListener('change', (e) => {
            filterTo = e.target.value; render();
        });

        container.querySelector('#tx-list').addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-tx');
            const delBtn = e.target.closest('.tx-delete');

            if (editBtn) {
                const entry = entries.find(en => en.id === editBtn.dataset.id);
                if (entry) openFinanceForm(entry);
            } else if (delBtn) {
                const id = delBtn.dataset.id;
                App.showConfirmDialog('Удалить транзакцию?', async () => {
                    try {
                        await App.withLoading(() => Sheets.deleteFinanceEntry(id));
                        entries = entries.filter(e => e.id !== id);
                        render();
                        App.showToast('Транзакция удалена');
                    } catch (err) {
                        App.handleError(err, 'Удаление');
                    }
                });
            }
        });
    }

    function openFinanceForm(existing) {
        const isEdit = !!existing;

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">${isEdit ? 'Редактирование' : 'Новая выплата'}</span>
            <div style="width:40px"></div>
        </div>

        <div class="form-group">
            <div class="form-label">ТИП ОПЕРАЦИИ</div>
            <div class="toggle-group three" id="tx-type-group">
                <button class="toggle-btn${!isEdit || existing.type === 'work' ? ' active' : ''}" data-type="work">Работа</button>
                <button class="toggle-btn${isEdit && existing.type === 'advance' ? ' active' : ''}" data-type="advance">Аванс</button>
                <button class="toggle-btn${isEdit && existing.type === 'payment' ? ' active' : ''}" data-type="payment">Расчёт</button>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">СУММА</label>
            <div class="form-control-with-icon">
                <input type="number" class="form-control" id="tx-amount" value="${isEdit ? existing.amount : ''}" placeholder="0" min="0" step="100">
                <span class="form-control-icon" style="font-size:18px;font-weight:600;color:var(--text-muted)">₽</span>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">ДАТА</label>
            <div class="form-control-with-icon">
                <input type="date" class="form-control" id="tx-date" value="${isEdit ? existing.date : new Date().toISOString().slice(0,10)}">
                <span class="form-control-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </span>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">КОММЕНТАРИЙ</label>
            <textarea class="form-control textarea" id="tx-desc" placeholder="Описание...">${isEdit ? escapeHtml(existing.description) : ''}</textarea>
        </div>

        <button class="btn btn-primary" id="tx-save-btn" style="margin-bottom:10px">
            ${isEdit ? 'Сохранить изменения' : 'Добавить транзакцию'}
        </button>
        ${isEdit ? `<button class="btn btn-danger" id="tx-delete-btn">Удалить выплату</button>` : ''}`;

        const content = App.showBottomSheet(html);

        // Type toggle
        let selectedType = isEdit ? existing.type : 'work';
        content.querySelector('#tx-type-group').addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn');
            if (!btn) return;
            selectedType = btn.dataset.type;
            content.querySelectorAll('.toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        });

        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        content.querySelector('#tx-save-btn').addEventListener('click', async () => {
            const amount = parseFloat(content.querySelector('#tx-amount').value);
            if (!amount || amount <= 0) {
                App.showToast('Укажите сумму', 'error');
                return;
            }

            const data = {
                type: selectedType,
                amount,
                date: content.querySelector('#tx-date').value,
                description: content.querySelector('#tx-desc').value.trim()
            };

            try {
                if (isEdit) {
                    await App.withLoading(() => Sheets.updateFinanceEntry(existing.id, data));
                    App.showToast('Сохранено');
                } else {
                    await App.withLoading(() => Sheets.addFinanceEntry(data));
                    App.showToast('Транзакция добавлена');
                }
                entries = await Sheets.getFinanceEntries(true);
                App.hideBottomSheet();
                render();
            } catch (err) {
                App.handleError(err, 'Сохранение');
            }
        });

        if (isEdit) {
            content.querySelector('#tx-delete-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog('Удалить транзакцию?', async () => {
                        try {
                            await App.withLoading(() => Sheets.deleteFinanceEntry(existing.id));
                            entries = entries.filter(e => e.id !== existing.id);
                            render();
                            App.showToast('Транзакция удалена');
                        } catch (err) {
                            App.handleError(err, 'Удаление');
                        }
                    });
                }, 320);
            });
        }
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    return { init };
})();
