// Main app controller

const MODULES = {
    calendar: { title: 'Календарь', init: CalendarModule.init },
    finance:  { title: 'Финансы',   init: FinanceModule.init },
    tasks:    { title: 'Задачи',    init: TasksModule.init },
    purchases:{ title: 'Закупки',   init: PurchasesModule.init },
    stats:    { title: 'Статистика',init: StatsModule.init }
};

let currentModule = null;

// ===== Auth guard =====
function checkAuth() {
    const token = sessionStorage.getItem('access_token');
    const expiresAt = parseInt(sessionStorage.getItem('token_expires_at') || '0');
    if (!token || Date.now() > expiresAt - 60000) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

const isDesktop = () => window.innerWidth >= 768;

// ===== Module switching =====
function switchModule(name) {
    if (!MODULES[name]) return;
    if (currentModule === name) return;

    // Hide current
    if (currentModule) {
        document.getElementById('module-' + currentModule).classList.remove('active');
        document.getElementById('module-' + currentModule).classList.add('hidden');
    }

    // Show new
    currentModule = name;
    const container = document.getElementById('module-' + name);
    container.classList.remove('hidden');
    container.classList.add('active');

    // Update mobile nav
    document.querySelectorAll('#bottom-nav .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === name);
    });

    // Update sidebar nav
    document.querySelectorAll('.sidebar-nav-item[data-module]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.module === name);
    });

    // Update header title
    document.getElementById('header-title').textContent = MODULES[name].title;

    // Init module (renders into container)
    MODULES[name].init(container);
}

// ===== Global UI utilities =====

let bsCloseCallback = null;

function showBottomSheet(contentHtml, onClose) {
    const overlay = document.getElementById('bs-overlay');
    const sheet = document.getElementById('bottom-sheet');
    const content = document.getElementById('bs-content');

    content.innerHTML = contentHtml;
    bsCloseCallback = onClose || null;

    overlay.classList.remove('hidden');
    sheet.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => sheet.classList.add('open'));
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return content;
}

function hideBottomSheet() {
    const overlay = document.getElementById('bs-overlay');
    const sheet = document.getElementById('bottom-sheet');

    sheet.classList.remove('open');
    document.body.style.overflow = '';

    setTimeout(() => {
        overlay.classList.add('hidden');
        sheet.setAttribute('aria-hidden', 'true');
        document.getElementById('bs-content').innerHTML = '';
        if (bsCloseCallback) {
            bsCloseCallback();
            bsCloseCallback = null;
        }
    }, 300);
}

function showConfirmDialog(message, onConfirm, confirmText = 'Удалить') {
    const overlay = document.getElementById('dialog-overlay');
    document.getElementById('dialog-message').textContent = message;
    document.getElementById('dialog-confirm').textContent = confirmText;
    overlay.classList.remove('hidden');

    const confirmBtn = document.getElementById('dialog-confirm');
    const cancelBtn = document.getElementById('dialog-cancel');

    const close = () => overlay.classList.add('hidden');

    const confirmHandler = () => { close(); onConfirm(); };
    const cancelHandler = () => close();

    confirmBtn.onclick = confirmHandler;
    cancelBtn.onclick = cancelHandler;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

let toastTimer = null;
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

async function withLoading(fn) {
    showLoading();
    try {
        return await fn();
    } finally {
        hideLoading();
    }
}

function handleError(err, context = '') {
    console.error(context, err);
    const msg = err.message || 'Произошла ошибка';
    showToast((context ? context + ': ' : '') + msg, 'error');
}

// ===== Settings =====
function getHourlyRate() {
    return parseFloat(localStorage.getItem('hourly_rate') || '700') || 700;
}

function setHourlyRate(val) {
    localStorage.setItem('hourly_rate', String(parseFloat(val) || 700));
}

function getObjectCode() {
    return localStorage.getItem('object_code') || '';
}

function setObjectCode(val) {
    const clean = String(val).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    localStorage.setItem('object_code', clean);
    return clean;
}

function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function openSettings() {
    const rate = getHourlyRate();
    const lastBackup = localStorage.getItem('last_auto_backup');
    const lastBackupLabel = lastBackup || 'нет';

    const html = `
    <div class="bs-header">
        <button class="icon-btn" id="bs-close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="bs-title">Настройки</span>
        <div style="width:40px"></div>
    </div>
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Почасовая ставка по умолчанию</label>
            <div class="form-control-with-icon">
                <input type="text" inputmode="decimal" class="form-control" id="settings-rate" value="${rate}" placeholder="700.00">
                <span class="form-control-icon" style="font-size:12px;font-weight:600;color:var(--text-muted)">₽/ч</span>
            </div>
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Подставляется по умолчанию при добавлении нового рабочего дня.</div>
        </div>
        <button class="btn btn-primary" id="settings-save-btn">Сохранить ставку</button>
    </div>
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Код объекта</label>
            <input type="text" class="form-control" id="settings-objcode" value="${_escHtml(getObjectCode())}" placeholder="main, villa1, obj2…" maxlength="8" autocomplete="off">
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Только латиница и цифры, до 8 символов. Используется в ID новых записей.</div>
        </div>
        <button class="btn btn-primary" id="settings-objcode-save-btn">Сохранить код</button>
    </div>
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Исполнители</label>
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted);margin-bottom:10px">Добавление, переименование и удаление исполнителей</div>
            <button class="btn btn-outline" id="settings-workers-btn" style="width:auto;padding:8px 16px;font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Управление исполнителями
            </button>
        </div>
    </div>
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Теги задач</label>
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted);margin-bottom:10px">Создание, переименование и удаление тегов</div>
            <button class="btn btn-outline" id="settings-tags-btn" style="width:auto;padding:8px 16px;font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                Управление тегами
            </button>
        </div>
    </div>
    <div class="card" style="margin-bottom:20px">
        <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">Бэкап данных</label>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Последний авто-бэкап: <span id="settings-last-backup">${lastBackupLabel}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-outline" id="settings-backup-now-btn" style="font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                Создать бэкап сейчас
            </button>
            <button class="btn btn-outline" id="settings-backup-download-btn" style="font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Скачать JSON на компьютер
            </button>
            <button class="btn btn-outline" id="settings-backup-restore-btn" style="font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                Восстановить из бэкапа
            </button>
        </div>
    </div>`;

    const content = showBottomSheet(html);
    content.querySelector('#bs-close-btn').addEventListener('click', hideBottomSheet);

    content.querySelector('#settings-save-btn').addEventListener('click', async () => {
        const val = parseFloat(content.querySelector('#settings-rate').value.replace(',', '.'));
        if (!val || val <= 0) { showToast('Укажите ставку', 'error'); return; }
        setHourlyRate(val);
        hideBottomSheet();
        try {
            await Sheets.saveSetting('hourly_rate', val);
            showToast('Настройки сохранены');
        } catch (e) {
            console.error('saveSetting failed:', e);
            showToast('Сохранено локально. Ошибка синхронизации: ' + (e.message || e), 'error');
        }
    });

    content.querySelector('#settings-objcode-save-btn').addEventListener('click', async () => {
        const raw = content.querySelector('#settings-objcode').value.trim();
        const clean = setObjectCode(raw);
        if (!clean) { showToast('Введите код объекта', 'error'); return; }
        content.querySelector('#settings-objcode').value = clean;
        try {
            await Sheets.saveSetting('object_code', clean);
            showToast('Код объекта сохранён');
        } catch (e) {
            showToast('Сохранено локально. Ошибка синхронизации: ' + (e.message || e), 'error');
        }
    });

    content.querySelector('#settings-workers-btn').addEventListener('click', () => {
        hideBottomSheet();
        setTimeout(() => openWorkersManageSheet(), 320);
    });

    content.querySelector('#settings-tags-btn').addEventListener('click', () => {
        hideBottomSheet();
        setTimeout(() => TasksModule.openTagsManageSheet(), 320);
    });

    content.querySelector('#settings-backup-now-btn').addEventListener('click', async () => {
        const btn = content.querySelector('#settings-backup-now-btn');
        btn.disabled = true;
        btn.textContent = 'Создание бэкапа...';
        try {
            const result = await withLoading(() => Sheets.createBackup());
            localStorage.setItem('last_auto_backup', result.date);
            content.querySelector('#settings-last-backup').textContent = result.date;
            showToast(`Бэкап создан: ${result.title}`);
        } catch (e) {
            showToast('Ошибка создания бэкапа: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Создать бэкап сейчас`;
        }
    });

    content.querySelector('#settings-backup-download-btn').addEventListener('click', async () => {
        try {
            const data = await withLoading(() => Sheets.exportToJson());
            const now = new Date();
            const pad = n => String(n).padStart(2,'0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workmanager_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('Файл скачан');
        } catch (e) {
            showToast('Ошибка экспорта: ' + (e.message || e), 'error');
        }
    });

    content.querySelector('#settings-backup-restore-btn').addEventListener('click', () => {
        hideBottomSheet();
        setTimeout(() => openRestoreSheet(), 320);
    });
}

async function openWorkersManageSheet() {
    let workers = await withLoading(() => Sheets.getWorkers());

    function buildHtml() {
        const listHtml = workers.length === 0
            ? '<div style="padding:16px 0;text-align:center;color:var(--text-muted);font-size:14px">Исполнители не добавлены</div>'
            : workers.map(w => `
                <div class="worker-item" data-id="${_escHtml(w.id)}">
                    <span class="worker-name">${_escHtml(w.name)}</span>
                    <button class="icon-btn worker-edit-btn" data-id="${_escHtml(w.id)}" title="Редактировать">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                </div>`).join('');
        return `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Исполнители</span>
            <div style="width:40px"></div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px">
            <input type="text" class="form-control" id="new-worker-input" placeholder="Имя исполнителя" style="flex:1">
            <button class="btn btn-primary" id="add-worker-btn" style="flex-shrink:0;white-space:nowrap">Добавить</button>
        </div>
        <div id="workers-list">${listHtml}</div>`;
    }

    const content = showBottomSheet(buildHtml());

    function rebind() {
        content.querySelector('#bs-close-btn').addEventListener('click', hideBottomSheet);

        content.querySelector('#add-worker-btn').addEventListener('click', async () => {
            const input = content.querySelector('#new-worker-input');
            const name = input.value.trim();
            if (!name) { showToast('Введите имя', 'error'); return; }
            try {
                const w = await withLoading(() => Sheets.addWorker(name));
                workers.push(w);
                input.value = '';
                content.querySelector('#workers-list').outerHTML = `<div id="workers-list">${workers.length === 0 ? '' : workers.map(w => `
                    <div class="worker-item" data-id="${_escHtml(w.id)}">
                        <span class="worker-name">${_escHtml(w.name)}</span>
                        <button class="icon-btn worker-edit-btn" data-id="${_escHtml(w.id)}" title="Редактировать">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                    </div>`).join('')}</div>`;
                bindEditBtns();
                showToast('Исполнитель добавлен');
                if (window.TasksModule) TasksModule.reloadWorkers();
            } catch (e) { showToast('Ошибка: ' + (e.message || e), 'error'); }
        });

        bindEditBtns();
    }

    function bindEditBtns() {
        content.querySelectorAll('.worker-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const worker = workers.find(w => w.id === id);
                if (worker) openEditWorkerSheet(worker);
            });
        });
    }

    function openEditWorkerSheet(worker) {
        hideBottomSheet();
        setTimeout(() => {
            const html = `
            <div class="bs-header">
                <button class="icon-btn" id="bs-close-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <span class="bs-title">Редактировать исполнителя</span>
                <div style="width:40px"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Имя</label>
                <input type="text" class="form-control" id="edit-worker-input" value="${_escHtml(worker.name)}">
            </div>
            <button class="btn btn-primary" id="edit-worker-save" style="margin-bottom:10px">Сохранить</button>
            <button class="btn btn-danger" id="edit-worker-delete">Удалить исполнителя</button>`;

            const c = showBottomSheet(html);
            c.querySelector('#bs-close-btn').addEventListener('click', () => {
                hideBottomSheet();
                setTimeout(() => openWorkersManageSheet(), 320);
            });
            c.querySelector('#edit-worker-input').focus();

            c.querySelector('#edit-worker-save').addEventListener('click', async () => {
                const name = c.querySelector('#edit-worker-input').value.trim();
                if (!name) { showToast('Введите имя', 'error'); return; }
                try {
                    await withLoading(() => Sheets.updateWorker(worker.id, { name }));
                    const w = workers.find(w => w.id === worker.id);
                    if (w) w.name = name;
                    hideBottomSheet();
                    showToast('Исполнитель переименован');
                    if (window.TasksModule) TasksModule.reloadWorkers();
                    setTimeout(() => openWorkersManageSheet(), 320);
                } catch (e) { showToast('Ошибка: ' + (e.message || e), 'error'); }
            });

            c.querySelector('#edit-worker-delete').addEventListener('click', () => {
                hideBottomSheet();
                setTimeout(() => {
                    showConfirmDialog(`Удалить исполнителя «${worker.name}»?`, async () => {
                        try {
                            await withLoading(() => Sheets.deleteWorker(worker.id));
                            workers = workers.filter(w => w.id !== worker.id);
                            showToast('Исполнитель удалён');
                            if (window.TasksModule) TasksModule.reloadWorkers();
                            setTimeout(() => openWorkersManageSheet(), 320);
                        } catch (e) { showToast('Ошибка: ' + (e.message || e), 'error'); }
                    });
                }, 320);
            });
        }, 320);
    }

    rebind();
}

function openRestoreSheet() {
    const html = `
    <div class="bs-header">
        <button class="icon-btn" id="bs-close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="bs-title">Восстановить из бэкапа</span>
        <div style="width:40px"></div>
    </div>
    <div id="restore-list-content">
        <div style="color:var(--text-muted);font-size:14px;padding:12px 0">Загрузка списка бэкапов...</div>
    </div>`;

    const content = showBottomSheet(html);
    content.querySelector('#bs-close-btn').addEventListener('click', hideBottomSheet);

    Sheets.listBackups().then(backups => {
        const listEl = content.querySelector('#restore-list-content');
        if (!backups.length) {
            listEl.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:12px 0">Бэкапы не найдены. Создайте первый бэкап в настройках.</div>';
            return;
        }
        listEl.innerHTML = backups.map(b => `
            <div class="backup-list-item" data-id="${b.id}" data-title="${b.title}">
                <div class="backup-list-date">${b.date}${b.time ? ' ' + b.time : ''}</div>
                <div class="backup-list-name">${b.title}</div>
                <button class="btn btn-outline backup-restore-btn" data-id="${b.id}" data-title="${b.title}"
                    style="margin-top:8px;font-size:13px;padding:7px 14px">
                    Восстановить
                </button>
            </div>`).join('');

        listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.backup-restore-btn');
            if (!btn) return;
            const backupId = btn.dataset.id;
            const backupTitle = btn.dataset.title;
            hideBottomSheet();
            setTimeout(() => {
                showConfirmDialog(
                    `Восстановить из бэкапа «${backupTitle}»?\n\nВсе текущие данные (работы, финансы, задачи, закупки) будут заменены. Это действие необратимо.`,
                    async () => {
                        try {
                            await withLoading(() => Sheets.restoreBackup(backupId));
                            showToast('Данные восстановлены. Перезагрузка...');
                            setTimeout(() => window.location.reload(), 1500);
                        } catch (e) {
                            showToast('Ошибка восстановления: ' + (e.message || e), 'error');
                        }
                    },
                    'Восстановить'
                );
            }, 320);
        });
    }).catch(() => {
        content.querySelector('#restore-list-content').innerHTML =
            '<div style="color:var(--red-medium);font-size:14px;padding:12px 0">Ошибка загрузки списка бэкапов</div>';
    });
}

// Tag color utility
function tagColorClass(tagId) {
    let hash = 0;
    for (let i = 0; i < tagId.length; i++) hash = (hash * 31 + tagId.charCodeAt(i)) | 0;
    return 'tag-color-' + (Math.abs(hash) % 8);
}

// Format date for display (YYYY-MM-DD → "17 октября" etc.)
const MONTHS_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_FULL_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${d} ${MONTHS_RU[m - 1]}`;
}

function formatMonthYear(year, month) {
    return `${MONTHS_FULL_RU[month]} ${year}`;
}

function formatAmount(amount) {
    return Math.abs(amount).toLocaleString('ru-RU') + ' ₽';
}

// Expose globals
window.App = {
    switchModule,
    showBottomSheet, hideBottomSheet,
    showConfirmDialog,
    showToast, showLoading, hideLoading, withLoading,
    handleError, tagColorClass,
    formatDate, formatMonthYear, formatAmount,
    getHourlyRate, setHourlyRate,
    MONTHS_RU, MONTHS_FULL_RU
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkAuth()) return;

    // Sync settings from Sheets → localStorage
    try {
        const settings = await Sheets.getSettings();
        if (settings.hourly_rate != null) setHourlyRate(parseFloat(settings.hourly_rate));
        if (settings.object_code != null) setObjectCode(String(settings.object_code));
    } catch (e) {
        console.error('Settings sync failed:', e);
    }

    // Auto daily backup (silent, background)
    const _today = new Date().toISOString().split('T')[0];
    if (localStorage.getItem('last_auto_backup') !== _today) {
        Sheets.createBackup()
            .then(r => localStorage.setItem('last_auto_backup', r.date))
            .catch(e => console.warn('Auto backup failed:', e));
    }

    // Bottom nav click (mobile)
    document.getElementById('bottom-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.nav-item[data-module]');
        if (btn) switchModule(btn.dataset.module);
    });

    // Sidebar nav click (desktop)
    document.getElementById('sidebar-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('.sidebar-nav-item[data-module]');
        if (btn) switchModule(btn.dataset.module);
    });

    // Close bottom sheet on overlay click
    document.getElementById('bs-overlay').addEventListener('click', hideBottomSheet);

    // Swipe down to close bottom sheet
    let bsTouchStartY = 0;
    const sheet = document.getElementById('bottom-sheet');
    sheet.addEventListener('touchstart', (e) => {
        bsTouchStartY = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchend', (e) => {
        const dy = e.changedTouches[0].clientY - bsTouchStartY;
        if (dy > 80) hideBottomSheet();
    }, { passive: true });

    // Settings button (sidebar)
    document.querySelector('.sidebar-settings').addEventListener('click', openSettings);

    // Burger menu (mobile)
    document.getElementById('menu-btn').addEventListener('click', () => {
        const NAV_ITEMS = [
            { id: 'calendar',  label: 'Календарь',  svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
            { id: 'finance',   label: 'Финансы',    svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="16" r="2"/></svg>' },
            { id: 'tasks',     label: 'Задачи',     svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' },
            { id: 'purchases', label: 'Закупки',    svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' },
            { id: 'stats',     label: 'Статистика', svg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
        ];
        const html = `
        <div class="bs-header">
            <button class="icon-btn" id="bs-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <span class="bs-title">Меню</span>
            <div style="width:40px"></div>
        </div>
        <nav class="nav-sheet">
            ${NAV_ITEMS.map(m => `<button class="nav-sheet-item${currentModule === m.id ? ' active' : ''}" data-module="${m.id}">${m.svg} ${m.label}</button>`).join('')}
        </nav>
        <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
            <button class="nav-sheet-item" id="burger-settings-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Настройки
            </button>
        </div>`;
        const content = showBottomSheet(html);
        content.querySelector('#bs-close-btn').addEventListener('click', hideBottomSheet);
        content.querySelector('.nav-sheet').addEventListener('click', (e) => {
            const btn = e.target.closest('.nav-sheet-item[data-module]');
            if (!btn) return;
            hideBottomSheet();
            setTimeout(() => switchModule(btn.dataset.module), 50);
        });
        content.querySelector('#burger-settings-btn').addEventListener('click', () => {
            hideBottomSheet();
            setTimeout(() => openSettings(), 320);
        });
    });

    // Load default module
    switchModule('calendar');
});
