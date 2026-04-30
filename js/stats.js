// Statistics module with Canvas charts

const StatsModule = (() => {
    let container = null;
    let workLogs = [];
    let financeEntries = [];

    async function init(el) {
        container = el;
        await loadData();
        render();
    }

    async function loadData() {
        try {
            [workLogs, financeEntries] = await App.withLoading(() =>
                Promise.all([Sheets.getWorkLogs(), Sheets.getFinanceEntries()])
            );
        } catch (err) {
            App.handleError(err, 'Загрузка статистики');
            workLogs = []; financeEntries = [];
        }
    }

    function getCurrentMonthStats() {
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}`;
        const monthLogs = workLogs.filter(w => w.date.startsWith(prefix));
        const totalHours = monthLogs.reduce((s, w) => s + w.hours, 0);
        const daysWorked = monthLogs.length;
        const avgHours = daysWorked > 0 ? totalHours / daysWorked : 0;
        return { totalHours, avgHours, daysWorked };
    }

    function getFinanceStats() {
        const now = new Date();
        const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `${y}-${m}`;
        let income = 0, expense = 0;
        financeEntries.forEach(e => {
            if (!e.date.startsWith(prefix)) return;
            if (e.type === 'work') income += e.amount;
            else expense += e.amount;
        });
        return { income, expense };
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

    function getTopWorks() {
        // Count words/phrases in descriptions
        const wordCount = {};
        workLogs.forEach(l => {
            if (!l.description) return;
            const words = l.description.split(/[\s,;.!?]+/).filter(w => w.length > 3);
            words.forEach(w => {
                const lower = w.toLowerCase();
                wordCount[lower] = (wordCount[lower] || 0) + 1;
            });
        });
        return Object.entries(wordCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([word, count]) => ({ word, count }));
    }

    function render() {
        const monthStats = getCurrentMonthStats();
        const finStats = getFinanceStats();
        const weeks = getWeeklyHours();
        const bestWeek = getBestWeek(weeks);
        const topWorks = getTopWorks();

        container.innerHTML = `
        <div class="stats-wrap">
            <div class="stats-header">
                <div class="stats-title">Обзор статистики</div>
                <div class="stats-period">За текущий месяц</div>
            </div>

            <div class="stats-card">
                <div class="stats-card-header">
                    <div class="stats-card-title">Эффективность</div>
                    <div class="stats-card-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                </div>
                <div class="stats-sub">Среднее за день</div>
                <div>
                    <span class="stats-big-num">${monthStats.avgHours.toFixed(1)}</span>
                    <span class="stats-big-unit">ч</span>
                </div>
                <div style="margin-top:8px;display:flex;gap:16px">
                    <div>
                        <div class="stats-sub">Всего часов</div>
                        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${monthStats.totalHours.toFixed(1)}</div>
                    </div>
                    <div>
                        <div class="stats-sub">Рабочих дней</div>
                        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${monthStats.daysWorked}</div>
                    </div>
                    ${bestWeek ? `<div>
                        <div class="stats-sub">Лучшая неделя</div>
                        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${bestWeek.hours.toFixed(0)} ч</div>
                    </div>` : ''}
                </div>
            </div>

            <div class="stats-card">
                <div class="stats-card-header">
                    <div class="stats-card-title">Движение средств</div>
                    <div class="stats-card-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                    </div>
                </div>
                <div class="money-row">
                    <div class="money-icon income">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                    </div>
                    <div class="money-label">Доходы</div>
                    <div class="money-value income">+ ${App.formatAmount(finStats.income)}</div>
                </div>
                <div class="money-row">
                    <div class="money-icon expense">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                    </div>
                    <div class="money-label">Выплаты</div>
                    <div class="money-value expense">- ${App.formatAmount(finStats.expense)}</div>
                </div>
            </div>

            <div class="stats-card">
                <div class="stats-card-header">
                    <div class="stats-card-title">Часы по неделям</div>
                </div>
                <div class="chart-wrap">
                    <canvas id="chart-weekly" height="160"></canvas>
                </div>
            </div>

            <div class="stats-card">
                <div class="stats-card-header">
                    <div class="stats-card-title">Часы по дням месяца</div>
                </div>
                <div class="chart-wrap">
                    <canvas id="chart-daily" height="140"></canvas>
                </div>
            </div>

            ${topWorks.length > 0 ? `
            <div class="stats-card">
                <div class="stats-card-header">
                    <div class="stats-card-title">Топ работ</div>
                    <div class="stats-card-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg>
                    </div>
                </div>
                ${topWorks.map(w => `
                <div class="top-work-item">
                    <div class="top-work-info">
                        <div class="top-work-title">${escapeHtml(w.word)}</div>
                        <div class="top-work-sub">встречается ${w.count} раз</div>
                    </div>
                    <div class="top-work-hours">${w.count} ×</div>
                </div>`).join('')}
            </div>` : ''}
        </div>`;

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
