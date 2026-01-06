// ===================
// カレンダータブ
// ===================
async function renderCalendar() {
    const container = document.getElementById('calendarDays');
    if (!container) return;

    const year = calendarYear;
    const month = calendarMonth;

    document.getElementById('calendarMonth').textContent = `${year}年${month}月`;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const dateStats = {};
    for (const file of CSV_FILES) {
        const parsed = parseDateFromFilename(file);
        if (parsed && parsed.year === year && parsed.month === month) {
            const data = await loadCSV(file);
            if (data) {
                const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
                const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
                const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;

                dateStats[parsed.day] = {
                    count: data.length,
                    avgSa: Math.round(totalSa / data.length),
                    avgGame: Math.round(totalGames / data.length),
                    winRate: ((plusCount / data.length) * 100).toFixed(1),
                    totalSa: totalSa
                };
            }
        }
    }

    let html = '';

    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const stats = dateStats[day];
        const dayOfWeek = (startDayOfWeek + day - 1) % 7;
        let dayClass = 'calendar-day';
        if (dayOfWeek === 0) dayClass += ' sunday';
        if (dayOfWeek === 6) dayClass += ' saturday';
        if (stats) dayClass += ' has-data';

        html += `<div class="${dayClass}">`;
        html += `<div class="day-number">${day}</div>`;

        if (stats) {
            const avgSaClass = stats.avgSa > 0 ? 'plus' : stats.avgSa < 0 ? 'minus' : '';
            const totalSaClass = stats.totalSa > 0 ? 'plus' : stats.totalSa < 0 ? 'minus' : '';

            const avgSaWidth = Math.min(Math.abs(stats.avgSa) / 1000 * 100, 100);
            const avgGameWidth = Math.min(stats.avgGame / 8000 * 100, 100);
            const winRateWidth = Math.min(parseFloat(stats.winRate) / 75 * 100, 100);
            const totalSaWidth = Math.min(Math.abs(stats.totalSa) / 250000 * 100, 100);

            html += `
                <div class="histogram">
                    <div class="bar-row">
                        <span class="bar-label">差枚</span>
                        <div class="bar-track">
                            <div class="bar bar-avg-sa ${avgSaClass}" style="width: ${avgSaWidth}%"></div>
                        </div>
                        <span class="bar-value ${avgSaClass}">${stats.avgSa >= 0 ? '+' : ''}${stats.avgSa.toLocaleString()}</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">G数</span>
                        <div class="bar-track">
                            <div class="bar bar-avg-game" style="width: ${avgGameWidth}%"></div>
                        </div>
                        <span class="bar-value">${stats.avgGame.toLocaleString()}</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">勝率</span>
                        <div class="bar-track">
                            <div class="bar bar-win-rate" style="width: ${winRateWidth}%"></div>
                        </div>
                        <span class="bar-value">${stats.winRate}%</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">総差</span>
                        <div class="bar-track">
                            <div class="bar bar-total-sa ${totalSaClass}" style="width: ${totalSaWidth}%"></div>
                        </div>
                        <span class="bar-value ${totalSaClass}">${stats.totalSa >= 0 ? '+' : ''}${(stats.totalSa / 1000).toFixed(0)}k</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
    }

    container.innerHTML = html;
}

function changeCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth > 12) {
        calendarMonth = 1;
        calendarYear++;
    } else if (calendarMonth < 1) {
        calendarMonth = 12;
        calendarYear--;
    }
    renderCalendar();
}

function setupCalendarEventListeners() {
    document.getElementById('prevMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('nextMonth')?.addEventListener('click', () => changeCalendarMonth(1));
}
