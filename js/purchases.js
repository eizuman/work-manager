// Purchases module

const PurchasesModule = (() => {
    let container = null;
    let purchases = [];
    let allTasks = [];

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            [purchases, allTasks] = await App.withLoading(() =>
                Promise.all([Sheets.getPurchases(), Sheets.getTasks()])
            );
        } catch (err) {
            App.handleError(err, 'Загрузка закупок');
            purchases = []; allTasks = [];
        }
    }

    function getTaskTitle(taskId) {
        if (!taskId) return '';
        const t = allTasks.find(t => t.id === taskId);
        return t ? t.title : '';
    }

    function getPendingTotal() {
        return purchases.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.price, 0);
    }

    function render() {
        const pending = purchases.filter(p => p.status === 'pending');
        const bought = purchases.filter(p => p.status === 'bought');
        const total = getPendingTotal();

        container.innerHTML = `
        <div class="purchases-wrap">
            <!-- Mobile total card -->
            <div class="total-card mobile-only" style="margin-bottom:20px">
                <div class="total-label">ИТОГО К ПОКУПКЕ</div>
                <div class="total-amount">${App.formatAmount(total)}</div>
            </div>

            <!-- Desktop header -->
            <div class="purchases-desktop-header desktop-only">
                <div class="purchases-title-block">
                    <div class="purchase-section-title" style="font-size:22px;font-weight:700;margin-bottom:2px">Закупки</div>
                    <div class="purchases-subtitle">Управление необходимыми приобретениями для задач.</div>
                </div>
                <div style="display:flex;align-items:center;gap:16px">
                    <div class="purchase-total-card">
                        <div class="purchase-total-label">ИТОГО К ПОКУПКЕ</div>
                        <div class="purchase-total-amount">${App.formatAmount(total)}</div>
                    </div>
                </div>
            </div>

            <div class="section-list-title desktop-only">
                <span>Список закупок</span>
                <button class="fab desktop-add-btn" id="add-purchase-btn-desktop" aria-label="Добавить позицию">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span class="fab-label">Добавить позицию</span>
                </button>
            </div>

            <div class="purchase-section-header">
                <div class="purchase-section-title">К покупке</div>
                <span class="purchase-count">${pending.length} позиц${pending.length === 1 ? 'ия' : pending.length < 5 ? 'ии' : 'ий'}</span>
            </div>
            ${pending.length === 0
                ? '<div class="empty-state" style="padding:20px 0"><div class="empty-state-text" style="color:var(--text-muted)">Список пуст</div></div>'
                : `<div class="purchase-list">${pending.map(p => renderPurchaseItem(p)).join('')}</div>`}

            ${bought.length > 0 ? `
            <div class="purchase-section-header">
                <div class="purchase-section-title bought">Куплено</div>
            </div>
            <div class="purchase-list">${bought.map(p => renderPurchaseItem(p)).join('')}</div>
            ` : ''}
        </div>

        <button class="fab mobile-only" id="add-purchase-btn" aria-label="Добавить закупку">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </button>`;

        bindEvents();
    }

    function renderPurchaseItem(p) {
        const isBought = p.status === 'bought';
        const taskTitle = getTaskTitle(p.task_id);

        return `
        <div class="purchase-item${isBought ? ' bought' : ''}" data-id="${p.id}">
            <div class="purchase-checkbox${isBought ? ' checked' : ''}" data-toggle-id="${p.id}" role="checkbox" aria-checked="${isBought}">
                ${isBought ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
            </div>
            <div class="purchase-info">
                <div class="purchase-name">${escapeHtml(p.title)}</div>
                ${taskTitle ? `<div class="purchase-task-link">→ ${escapeHtml(taskTitle)}</div>` : ''}
            </div>
            <div class="purchase-price">${p.price > 0 ? App.formatAmount(p.price) : '—'}</div>
            <div class="purchase-actions">
                <button class="purchase-action-btn edit-purchase" data-id="${p.id}" aria-label="Редактировать">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="purchase-action-btn delete-purchase" data-id="${p.id}" aria-label="Удалить">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
            </div>
        </div>`;
    }

    function bindEvents() {
        container.querySelector('#add-purchase-btn').addEventListener('click', () => openPurchaseForm(null));
        container.querySelector('#add-purchase-btn-desktop')?.addEventListener('click', () => openPurchaseForm(null));

        container.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('[data-toggle-id]');
            const editBtn = e.target.closest('.edit-purchase');
            const delBtn = e.target.closest('.delete-purchase');

            if (toggleBtn) {
                const id = toggleBtn.dataset.toggleId;
                const p = purchases.find(p => p.id === id);
                if (p) togglePurchaseStatus(p);
            } else if (editBtn) {
                const p = purchases.find(p => p.id === editBtn.dataset.id);
                if (p) openPurchaseForm(p);
            } else if (delBtn) {
                const id = delBtn.dataset.id;
                App.showConfirmDialog('Удалить позицию?', async () => {
                    try {
                        await App.withLoading(() => Sheets.deletePurchase(id));
                        purchases = purchases.filter(p => p.id !== id);
                        render();
                        App.showToast('Удалено');
                    } catch (err) {
                        App.handleError(err, 'Удаление');
                    }
                });
            }
        });
    }

    async function togglePurchaseStatus(p) {
        const newStatus = p.status === 'pending' ? 'bought' : 'pending';
        try {
            const updated = await App.withLoading(() => Sheets.updatePurchase(p.id, { status: newStatus }));
            const idx = purchases.findIndex(x => x.id === p.id);
            if (idx >= 0) purchases[idx] = updated;
            render();
        } catch (err) {
            App.handleError(err, 'Обновление');
        }
    }

    function openPurchaseForm(existing) {
        const isEdit = !!existing;

        const taskOptions = allTasks
            .filter(t => t.status !== 'done')
            .map(t => `<option value="${t.id}"${isEdit && existing.task_id === t.id ? ' selected' : ''}>${escapeHtml(t.title)}</option>`)
            .join('');

        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">${isEdit ? 'Редактирование покупки' : 'Новая закупка'}</span>
            <div style="width:40px"></div>
        </div>

        <div class="card" style="margin-bottom:20px">
            <div class="form-group">
                <label class="form-label">Наименование</label>
                <input type="text" class="form-control" id="p-title" value="${isEdit ? escapeHtml(existing.title) : ''}" placeholder="Название товара">
            </div>

            <div class="form-group">
                <label class="form-label">Стоимость (₽)</label>
                <input type="number" class="form-control" id="p-price" value="${isEdit ? existing.price : ''}" placeholder="0" min="0">
            </div>

            <div class="form-group">
                <label class="form-label">Связанная задача</label>
                <select class="form-control" id="p-task">
                    <option value="">— Без задачи —</option>
                    ${taskOptions}
                </select>
            </div>

            <div class="form-group" style="margin-bottom:0">
                <label class="form-label">Статус</label>
                <div class="toggle-group" id="p-status-group">
                    <button class="toggle-btn${!isEdit || existing.status === 'pending' ? ' active' : ''}" data-status="pending">К покупке</button>
                    <button class="toggle-btn${isEdit && existing.status === 'bought' ? ' active' : ''}" data-status="bought">Куплено</button>
                </div>
            </div>
        </div>

        <button class="btn btn-primary" id="p-save-btn" style="margin-bottom:10px">
            ${isEdit ? 'Сохранить изменения' : 'Добавить'}
        </button>
        ${isEdit ? '<button class="btn btn-danger" id="p-delete-btn">Удалить покупку</button>' : ''}`;

        const content = App.showBottomSheet(html);

        content.querySelector('#bs-close-btn').addEventListener('click', App.hideBottomSheet);

        let selectedStatus = isEdit ? existing.status : 'pending';
        content.querySelector('#p-status-group').addEventListener('click', (e) => {
            const btn = e.target.closest('.toggle-btn[data-status]');
            if (!btn) return;
            selectedStatus = btn.dataset.status;
            content.querySelectorAll('#p-status-group .toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        });

        content.querySelector('#p-save-btn').addEventListener('click', async () => {
            const title = content.querySelector('#p-title').value.trim();
            if (!title) { App.showToast('Введите название', 'error'); return; }

            const data = {
                title,
                price: parseFloat(content.querySelector('#p-price').value) || 0,
                task_id: content.querySelector('#p-task').value || '',
                status: selectedStatus
            };

            try {
                if (isEdit) {
                    const updated = await App.withLoading(() => Sheets.updatePurchase(existing.id, data));
                    const idx = purchases.findIndex(p => p.id === existing.id);
                    if (idx >= 0) purchases[idx] = updated;
                    App.showToast('Сохранено');
                } else {
                    const newP = await App.withLoading(() => Sheets.addPurchase(data));
                    purchases.push(newP);
                    App.showToast('Добавлено');
                }
                App.hideBottomSheet();
                render();
            } catch (err) {
                App.handleError(err, 'Сохранение');
            }
        });

        if (isEdit) {
            content.querySelector('#p-delete-btn').addEventListener('click', () => {
                App.hideBottomSheet();
                setTimeout(() => {
                    App.showConfirmDialog('Удалить позицию?', async () => {
                        try {
                            await App.withLoading(() => Sheets.deletePurchase(existing.id));
                            purchases = purchases.filter(p => p.id !== existing.id);
                            render();
                            App.showToast('Удалено');
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
