// Statistics module with Canvas charts

const StatsModule = (() => {
    let container = null;
    let workLogs = [];
    let filterMode = 'all'; // 'all' | 'year' | 'month' | 'custom'
    let filterFrom = '';
    let filterTo = '';

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            workLogs = await App.withLoading(() => Sheets.getWorkLogs());
        } catch (err) {
            App.handleError(err, 'Загрузка статистики');
            workLogs = [];
        }
    }

    function getFilteredLogs() {
        if (filterMode === 'all') return workLogs;
        const now = new Date();
        let from = '', to = '';
        if (filterMode === 'month') {
            const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
            from = `${y}-${m}-01`; to = `${y}-${m}-31`;
        } else if (filterMode === 'year') {
            from = `${now.getFullYear()}-01-01`; to = `${now.getFullYear()}-12-31`;
        } else if (filterMode === 'custom') {
            from = filterFrom; to = filterTo;
        }
        return workLogs.filter(l => {
            if (from && l.date < from) return false;
            if (to && l.date > to) return false;
            return true;
        });
    }

    function getStats(logs) {
        const activeLogs = logs.filter(l => l.hours > 0);
        const totalHours = activeLogs.reduce((s, w) => s + w.hours, 0);
        const daysWorked = activeLogs.length;
        const avgHours = daysWorked > 0 ? totalHours / daysWorked : 0;
        return { totalHours, avgHours, daysWorked };
    }

    function getWeeklyHours() {
        // Last 8 weeks
        const weeks = [];
        const now = new Date();
        // Find Monday of current week
        const startOfWeek = new Date(now);
        const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon
        startOfWeek.setDate(now.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        for (let w = 7; w >= 0; w--) {
            const weekStart = new Date(startOfWeek);
            weekStart.setDate(startOfWeek.getDate() - w * 7);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);

            const weekStartStr = weekStart.toISOString().slice(0, 10);
            const weekEndStr = weekEnd.toISOString().slice(0, 10);

            const hours = workLogs
                .filter(l => l.date >= weekStartStr && l.date < weekEndStr)
                .reduce((s, l) => s + l.hours, 0);

            const labelDate = new Date(weekStart);
            const label = `${labelDate.getDate()}.${String(labelDate.getMonth() + 1).padStart(2, '0')}`;
            weeks.push({ label, hours });
        }
        return weeks;
    }

    function getDailyHoursThisMonth() {
        const now = new Date();
        const y = now.getFullYear(), mo = now.getMonth();
        const daysInMonth = new Date(y, mo + 1, 0).getDate();
        const result = [];
        for (let d = 1; d <= daysInMonth; d++) {
            const ds = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const log = workLogs.find(l => l.date === ds);
            result.push({ day: d, hours: log ? log.hours : 0 });
        }
        return result;
    }

    function getBestWeek(weeks) {
        if (weeks.length === 0) return null;
        return weeks.reduce((best, w) => w.hours > best.hours ? w : best, weeks[0]);
    }

    function render() {
        const filteredLogs = getFilteredLogs();
        const stats = getStats(filteredLogs);
        const weeks = getWeeklyHours();
        const bestWeek = getBestWeek(weeks);

        const isCustomDatesVisible = filterMode === 'custom';

        container.innerHTML = `
        <div class="stats-wrap">
            <div class="stats-header">
                <div>
                    <div class="stats-title">Статистика</div>
                </div>
            </div>

            <div class="finance-filter-bar" id="stats-filter-bar">
                <button class="fin-filter-btn${filterMode === 'all' ? ' active' : ''}" data-filter="all">Всё время</button>
                <button class="fin-filter-btn${filterMode === 'year' ? ' active' : ''}" data-filter="year">Год</button>
                <button class="fin-filter-btn${filterMode === 'month' ? ' active' : ''}" data-filter="month">Месяц</button>
                <button class="fin-filter-btn${filterMode === 'custom' ? ' active' : ''}" data-filter="custom">Период</button>
                <div class="finance-filter-dates${isCustomDatesVisible ? '' : ' hidden'}" id="stats-custom-dates">
                    <span class="fin-filter-sep">с</span>
                    <input type="date" class="fin-date-input" id="stats-date-from" value="${filterFrom}">
                    <span class="fin-filter-sep">по</span>
                    <input type="date" class="fin-date-input" id="stats-date-to" value="${filterTo}">
                </div>
            </div>

            <!-- KPI row (desktop: 3 cards in a row) -->
            <div class="stats-kpi-row">
                <div class="stats-card">
                    <div class="stats-sub" style="text-transform:uppercase;font-size:11px;letter-spacing:.5px;font-weight:600">В среднем часов / день</div>
                    <div style="margin-top:4px">
                        <span class="stats-big-num">${stats.avgHours.toFixed(1)}</span>
                        <span class="stats-big-unit">ч.</span>
                    </div>
                </div>
                <div class="stats-card">
                    <div class="stats-sub" style="text-transform:uppercase;font-size:11px;letter-spacing:.5px;font-weight:600">Лучшая неделя</div>
                    <div style="margin-top:4px">
                        <span class="stats-big-num">${bestWeek ? bestWeek.hours.toFixed(0) : 0}</span>
                        <span class="stats-big-unit">ч.</span>
                    </div>
                    ${bestWeek ? `<div class="stats-sub" style="margin-top:4px">${bestWeek.label}</div>` : ''}
                </div>
                <div class="stats-card">
                    <div class="stats-sub" style="text-transform:uppercase;font-size:11px;letter-spacing:.5px;font-weight:600">Итого часов</div>
                    <div style="margin-top:4px">
                        <span class="stats-big-num">${stats.totalHours.toFixed(0)}</span>
                        <span class="stats-big-unit">ч.</span>
                    </div>
                    <div class="stats-sub" style="margin-top:4px">${stats.daysWorked} рабочих дней</div>
                </div>
            </div>

            <!-- Charts -->
            <div class="stats-card" style="margin-top:16px">
                <div class="stats-card-header">
                    <div class="stats-card-title">Часы по неделям</div>
                </div>
                <div class="chart-wrap">
                    <canvas id="chart-weekly" height="160"></canvas>
                </div>
            </div>

            <div class="stats-card" style="margin-top:16px">
                <div class="stats-card-header">
                    <div class="stats-card-title">Часы по дням месяца</div>
                </div>
                <div class="chart-wrap">
                    <canvas id="chart-daily" height="140"></canvas>
                </div>
            </div>
        </div>`;

        // Filter bar events
        container.querySelector('#stats-filter-bar').addEventListener('click', (e) => {
            const btn = e.target.closest('.fin-filter-btn[data-filter]');
            if (!btn) return;
            filterMode = btn.dataset.filter;
            render();
        });
        const datesEl = container.querySelector('#stats-custom-dates');
        if (datesEl) {
            container.querySelector('#stats-date-from').addEventListener('change', (e) => { filterFrom = e.target.value; render(); });
            container.querySelector('#stats-date-to').addEventListener('change', (e) => { filterTo = e.target.value; render(); });
        }

        // Draw charts after DOM is ready
        requestAnimationFrame(() => {
            drawBarChart('chart-weekly', weeks);
            drawLineChart('chart-daily', getDailyHoursThisMonth());
        });
    }

    function drawBarChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.offsetWidth;
        const height = 160;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.height = height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const padding = { top: 20, right: 10, bottom: 28, left: 36 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const maxHours = Math.max(...data.map(d => d.hours), 1);
        const barGap = 4;
        const barWidth = (chartW - barGap * (data.length - 1)) / data.length;

        // Grid lines
        ctx.strokeStyle = '#D5CFC0';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + chartH - (i / 4) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartW, y);
            ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = '#9A8E7A';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= 4; i++) {
            const val = (maxHours * i / 4).toFixed(0);
            const y = padding.top + chartH - (i / 4) * chartH + 4;
            ctx.fillText(val, padding.left - 4, y);
        }

        // Bars
        data.forEach((d, i) => {
            const x = padding.left + i * (barWidth + barGap);
            const barH = d.hours > 0 ? (d.hours / maxHours) * chartH : 1;
            const y = padding.top + chartH - barH;

            ctx.fillStyle = d.hours > 0 ? '#2B4A1A' : '#D5CFC0';
            const r = Math.min(3, barWidth / 2);
            roundedRect(ctx, x, y, barWidth, barH, r);
            ctx.fill();

            // Label
            ctx.fillStyle = '#9A8E7A';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.label, x + barWidth / 2, height - 6);
        });
    }

    function drawLineChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.offsetWidth;
        const height = 140;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.height = height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const padding = { top: 16, right: 10, bottom: 24, left: 36 };
        const chartW = width - padding.left - padding.right;
        const chartH = height - padding.top - padding.bottom;

        const maxHours = Math.max(...data.map(d => d.hours), 1);
        const n = data.length;

        // Grid
        ctx.strokeStyle = '#D5CFC0';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 3; i++) {
            const y = padding.top + chartH - (i / 3) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartW, y);
            ctx.stroke();

            ctx.fillStyle = '#9A8E7A';
            ctx.font = '10px system-ui, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText((maxHours * i / 3).toFixed(0), padding.left - 4, y + 4);
        }

        // Filled area
        const getX = (i) => padding.left + (i / (n - 1)) * chartW;
        const getY = (h) => padding.top + chartH - (h / maxHours) * chartH;

        if (n > 1) {
            ctx.beginPath();
            ctx.moveTo(getX(0), getY(data[0].hours));
            data.forEach((d, i) => {
                if (i === 0) return;
                ctx.lineTo(getX(i), getY(d.hours));
            });
            ctx.lineTo(getX(n - 1), padding.top + chartH);
            ctx.lineTo(getX(0), padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(43,74,26,0.12)';
            ctx.fill();

            // Line
            ctx.beginPath();
            ctx.moveTo(getX(0), getY(data[0].hours));
            data.forEach((d, i) => {
                if (i === 0) return;
                ctx.lineTo(getX(i), getY(d.hours));
            });
            ctx.strokeStyle = '#2B4A1A';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Dots for non-zero
            data.forEach((d, i) => {
                if (d.hours === 0) return;
                ctx.beginPath();
                ctx.arc(getX(i), getY(d.hours), 3, 0, Math.PI * 2);
                ctx.fillStyle = '#2B4A1A';
                ctx.fill();
            });
        }

        // X axis labels (every 5 days)
        ctx.fillStyle = '#9A8E7A';
        ctx.font = '9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        data.forEach((d, i) => {
            if (d.day % 5 === 1 || d.day === data.length) {
                ctx.fillText(d.day, getX(i), height - 4);
            }
        });
    }

    function roundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    return { init };
})();
