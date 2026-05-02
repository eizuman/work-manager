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

function openSettings() {
    const rate = getHourlyRate();
    const html = `
    <div class="bs-header">
        <button class="icon-btn" id="bs-close-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <span class="bs-title">Настройки</span>
        <div style="width:40px"></div>
    </div>
    <div class="card" style="margin-bottom:16px">
        <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Почасовая ставка по умолчанию</label>
            <div class="form-control-with-icon">
                <input type="text" inputmode="decimal" class="form-control" id="settings-rate" value="${rate}" placeholder="700.00">
                <span class="form-control-icon" style="font-size:12px;font-weight:600;color:var(--text-muted)">₽/ч</span>
            </div>
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Подставляется по умолчанию при добавлении нового рабочего дня.</div>
        </div>
    </div>
    <div class="card" style="margin-bottom:20px">
        <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Теги задач</label>
            <div style="margin-top:6px;font-size:12px;color:var(--text-muted);margin-bottom:10px">Создание, переименование и удаление тегов</div>
            <button class="btn btn-outline" id="settings-tags-btn" style="width:auto;padding:8px 16px;font-size:14px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                Управление тегами
            </button>
        </div>
    </div>
    <button class="btn btn-primary" id="settings-save-btn">Сохранить</button>`;

    const content = showBottomSheet(html);
    content.querySelector('#bs-close-btn').addEventListener('click', hideBottomSheet);
    content.querySelector('#settings-save-btn').addEventListener('click', async () => {
        const val = parseFloat(content.querySelector('#settings-rate').value.replace(',', '.'));
        if (!val || val <= 0) { showToast('Укажите ставку', 'error'); return; }
        setHourlyRate(val);
        hideBottomSheet();
        showToast('Настройки сохранены');
        try { await Sheets.saveSetting('hourly_rate', val); } catch (_) { /* non-critical */ }
    });
    content.querySelector('#settings-tags-btn').addEventListener('click', () => {
        hideBottomSheet();
        setTimeout(() => TasksModule.openTagsManageSheet(), 320);
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

    // Sync hourly_rate from Sheets → localStorage (single source of truth)
    try {
        const settings = await Sheets.getSettings();
        if (settings.hourly_rate != null) {
            setHourlyRate(parseFloat(settings.hourly_rate));
        }
    } catch (_) { /* use existing localStorage value */ }

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
