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

        const now = new Date();
        const monthName = App.MONTHS_FULL_RU[now.getMonth()] + ' ' + now.getFullYear();
        const totalTopCount = topWorks.reduce((s, w) => s + w.count, 0) || 1;

        container.innerHTML = `
        <div class="stats-wrap">
            <div class="stats-header">
                <div>
                    <div class="stats-title">Сводка за Месяц</div>
                    <div class="stats-period">${monthName}</div>
                </div>
            </div>

            <!-- KPI row (desktop: 3 cards in a row) -->
            <div class="stats-kpi-row">
                <div class="stats-card">
                    <div class="stats-sub" style="text-transform:uppercase;font-size:11px;letter-spacing:.5px;font-weight:600">В среднем часов / день</div>
                    <div style="margin-top:4px">
                        <span class="stats-big-num">${monthStats.avgHours.toFixed(1)}</span>
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
                        <span class="stats-big-num">${monthStats.totalHours.toFixed(0)}</span>
                        <span class="stats-big-unit">ч.</span>
                    </div>
                    <div class="stats-sub" style="margin-top:4px">${monthStats.daysWorked} рабочих дней</div>
                </div>
            </div>

            <!-- Lower section: two-column on desktop -->
            <div class="stats-lower-grid">
                <div class="stats-card">
                    <div class="stats-card-title" style="margin-bottom:12px">Движение средств</div>
                    <div class="money-row">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--green-medium);margin-right:10px;flex-shrink:0"></span>
                        <div class="money-label">Доход</div>
                        <div class="money-value income">${App.formatAmount(finStats.income)}</div>
                    </div>
                    <div class="money-row">
                        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--red-medium);margin-right:10px;flex-shrink:0"></span>
                        <div class="money-label">Расходы</div>
                        <div class="money-value expense">${App.formatAmount(finStats.expense)}</div>
                    </div>
                    <div class="money-row" style="border-top:2px solid var(--border);margin-top:4px;padding-top:12px">
                        <div class="money-label" style="font-weight:700;color:var(--text-primary)">Чистая прибыль</div>
                        <div class="money-value income" style="font-size:17px">${App.formatAmount(finStats.income - finStats.expense)}</div>
                    </div>
                </div>

                ${topWorks.length > 0 ? `
                <div class="stats-card">
                    <div class="stats-card-title" style="margin-bottom:12px">Популярные виды работ</div>
                    ${topWorks.map(w => {
                        const pct = Math.round(w.count / totalTopCount * 100);
                        return `<div class="top-work-item" style="flex-direction:column;align-items:stretch;padding:8px 0">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                <span class="top-work-title">${escapeHtml(w.word)}</span>
                                <span class="top-work-pct">${pct}%</span>
                            </div>
                            <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                        </div>`;
                    }).join('')}
                </div>` : '<div class="stats-card"><div class="stats-card-title">Нет данных</div></div>'}
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
