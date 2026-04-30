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
    document.getElementById('header-title').textContent =
        isDesktop() ? 'Рабочая панель' : MODULES[name].title;

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
    MONTHS_RU, MONTHS_FULL_RU
};

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    if (!checkAuth()) return;

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

    // Load default module
    switchModule('calendar');
});
