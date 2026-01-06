// ===================
// グローバル変数
// ===================
let CSV_FILES = [];
let dataCache = {};
let headers = [];
let currentDateIndex = 0;
let allMachines = new Set();
let selectedTrendDates = [];
let statsMode = 'daily';
let calendarYear, calendarMonth;

// ===================
// ユーティリティ関数
// ===================
function formatDate(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return `${match[1]}/${match[2]}/${match[3]}`;
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function formatDateShort(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return `${match[2]}/${match[3]}`;
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function parseDateFromFilename(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3])
        };
    }
    return null;
}

function getDayOfWeek(filename) {
    const parsed = parseDateFromFilename(filename);
    if (parsed) {
        const date = new Date(parsed.year, parsed.month - 1, parsed.day);
        return date.getDay();
    }
    return -1;
}

function getDayOfWeekName(dayNum) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayNum] || '';
}

// ===================
// データ読み込み
// ===================
async function loadCSV(filename) {
    if (dataCache[filename]) {
        return dataCache[filename];
    }

    try {
        const response = await fetch(filename);
        if (!response.ok) return null;

        const text = await response.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return null;

        if (headers.length === 0) {
            headers = lines[0].split(',').map(h => h.trim());
        }

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] || '';
            });
            data.push(row);

            if (row['機種名']) {
                allMachines.add(row['機種名']);
            }
        }

        dataCache[filename] = data;
        return data;
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
        return null;
    }
}

async function loadAllCSV() {
    for (const file of CSV_FILES) {
        await loadCSV(file);
    }
}

// ===================
// UI初期化
// ===================
function populateDateSelectors() {
    const selectors = ['dateSelect', 'statsDateSelect', 'statsPeriodStart', 'statsPeriodEnd'];
    const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));

    selectors.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = sortedFiles.map(f =>
                `<option value="${f}">${formatDate(f)}</option>`
            ).join('');
        }
    });

    if (sortedFiles.length > 0) {
        currentDateIndex = 0;
        const periodEnd = document.getElementById('statsPeriodEnd');
        if (periodEnd) periodEnd.value = sortedFiles[0];

        const periodStart = document.getElementById('statsPeriodStart');
        if (periodStart) {
            const startIdx = Math.min(6, sortedFiles.length - 1);
            periodStart.value = sortedFiles[startIdx];
        }
    }
}

function populateMachineFilters() {
    const sortedMachines = [...allMachines].sort();
    const selectors = ['trendMachineFilter', 'statsMachineSelect', 'statsPeriodMachineSelect'];

    selectors.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">全機種</option>' +
                sortedMachines.map(m => `<option value="${m}">${m}</option>`).join('');
            if (currentValue) select.value = currentValue;
        }
    });
}

function updateDateNav() {
    const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
    const currentFile = sortedFiles[currentDateIndex];

    const label = document.getElementById('currentDateLabel');
    if (label && currentFile) {
        label.textContent = formatDate(currentFile);
    }

    const dateSelect = document.getElementById('dateSelect');
    if (dateSelect && currentFile) {
        dateSelect.value = currentFile;
    }

    const prevBtn = document.getElementById('prevDate');
    const nextBtn = document.getElementById('nextDate');
    if (prevBtn) prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
    if (nextBtn) nextBtn.disabled = currentDateIndex <= 0;
}

// ===================
// 日別データ
// ===================
async function filterAndRender() {
    const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
    const currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;

    let data = await loadCSV(currentFile);
    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    // データをコピー
    data = [...data];

    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('sortBy')?.value || '';

    // 検索フィルター
    if (searchTerm) {
        data = data.filter(row =>
            (row['機種名'] || '').toLowerCase().includes(searchTerm) ||
            (row['台番号'] || '').toLowerCase().includes(searchTerm)
        );
    }

    // 列フィルター（差枚）
    const saFilterType = document.getElementById('saFilterType')?.value;
    const saFilterValue = document.getElementById('saFilterValue')?.value;
    if (saFilterType && saFilterValue) {
        const val = parseInt(saFilterValue);
        if (saFilterType === 'gte') {
            data = data.filter(row => (parseInt(row['差枚']) || 0) >= val);
        } else if (saFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['差枚']) || 0) <= val);
        }
    }

    // 列フィルター（G数）
    const gameFilterType = document.getElementById('gameFilterType')?.value;
    const gameFilterValue = document.getElementById('gameFilterValue')?.value;
    if (gameFilterType && gameFilterValue) {
        const val = parseInt(gameFilterValue);
        if (gameFilterType === 'gte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) >= val);
        } else if (gameFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) <= val);
        }
    }

    // ソート
    if (sortBy) {
        switch (sortBy) {
            case 'sa_desc':
                data.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
                break;
            case 'sa_asc':
                data.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
                break;
            case 'game_desc':
                data.sort((a, b) => (parseInt(b['G数']) || 0) - (parseInt(a['G数']) || 0));
                break;
        }
    }

    renderTable(data, 'data-table', 'summary');
    updateDateNav();
}

function renderTable(data, tableId, summaryId) {
    const totalGames = data.reduce((sum, row) => sum + (parseInt(row['G数']) || 0), 0);
    const totalSa = data.reduce((sum, row) => sum + (parseInt(row['差枚']) || 0), 0);
    const plusCount = data.filter(row => (parseInt(row['差枚']) || 0) > 0).length;
    const winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';

    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    document.getElementById(summaryId).innerHTML = `
        表示: ${data.length}台 |
        総G数: ${totalGames.toLocaleString()} |
        総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span> |
        勝率: ${winRate}% (${plusCount}/${data.length})
    `;

    const thead = document.querySelector(`#${tableId} thead`);
    const tbody = document.querySelector(`#${tableId} tbody`);

    thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';

    tbody.innerHTML = data.map(row => {
        return '<tr>' + headers.map(h => {
            let value = row[h] || '';
            let className = '';

            if (h === '差枚') {
                const num = parseInt(value) || 0;
                className = num > 0 ? 'plus' : num < 0 ? 'minus' : '';
                value = num >= 0 ? '+' + num.toLocaleString() : num.toLocaleString();
            } else if (h === '合成確率') {
                const match = value.match(/1\/(\d+\.?\d*)/);
                if (match) {
                    const prob = parseFloat(match[1]);
                    if (prob <= 150) className = 'prob-good';
                    else if (prob <= 200) className = 'prob-mid';
                    else className = 'prob-bad';
                }
            }

            return `<td class="${className}">${value}</td>`;
        }).join('') + '</tr>';
    }).join('');
}

// ===================
// 差枚トレンド
// ===================
function populateTrendDateList() {
    const container = document.getElementById('trendDateList');
    if (!container) return;

    container.innerHTML = '';
    const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));

    sortedFiles.forEach(file => {
        const dayOfWeek = getDayOfWeek(file);
        const dayName = getDayOfWeekName(dayOfWeek);
        let dayClass = '';
        if (dayOfWeek === 0) dayClass = 'sunday';
        if (dayOfWeek === 6) dayClass = 'saturday';

        const item = document.createElement('div');
        item.className = 'date-checkbox-item';
        item.innerHTML = `
            <input type="checkbox" id="trend-date-${file}" value="${file}" checked>
            <label for="trend-date-${file}">${formatDate(file)}</label>
            <span class="day-of-week ${dayClass}">(${dayName})</span>
        `;
        container.appendChild(item);
    });
}

function getSelectedTrendDates() {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function openTrendCalendarModal() {
    const modal = document.getElementById('trendCalendarModal');
    if (modal) {
        populateTrendDateList();
        modal.classList.add('active');
    }
}

function closeTrendCalendarModal() {
    const modal = document.getElementById('trendCalendarModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function loadTrendData() {
    const daysSelect = document.getElementById('trendDays');
    const machineFilter = document.getElementById('trendMachineFilter')?.value || '';
    const sortBy = document.getElementById('trendSortBy')?.value || 'total_desc';

    let targetFiles = [];

    if (daysSelect && daysSelect.value === 'custom' && selectedTrendDates.length > 0) {
        targetFiles = selectedTrendDates.sort((a, b) => a.localeCompare(b));
    } else {
        const days = parseInt(daysSelect?.value) || 7;
        const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
        targetFiles = days === 0 ? [...sortedFiles] : sortedFiles.slice(0, days);
        targetFiles = targetFiles.sort((a, b) => a.localeCompare(b));
    }

    if (targetFiles.length === 0) {
        document.getElementById('trendSummary').innerHTML = '<p>表示する日付を選択してください</p>';
        document.querySelector('#trend-table thead').innerHTML = '';
        document.querySelector('#trend-table tbody').innerHTML = '';
        return;
    }

    const allData = {};
    for (const file of targetFiles) {
        const data = await loadCSV(file);
        if (data) {
            allData[file] = data;
        }
    }

    const machineData = {};
    for (const [file, data] of Object.entries(allData)) {
        data.forEach(row => {
            const machine = row['機種名'];
            const num = row['台番号'];
            if (machineFilter && machine !== machineFilter) return;

            const key = `${machine}_${num}`;
            if (!machineData[key]) {
                machineData[key] = { machine, num, dates: {} };
            }
            machineData[key].dates[file] = parseInt(row['差枚']) || 0;
        });
    }

    let results = Object.values(machineData).map(item => {
        const values = Object.values(item.dates);
        const total = values.reduce((a, b) => a + b, 0);
        const avg = values.length > 0 ? Math.round(total / values.length) : 0;
        return { ...item, total, avg };
    });

    switch (sortBy) {
        case 'total_desc': results.sort((a, b) => b.total - a.total); break;
        case 'total_asc': results.sort((a, b) => a.total - b.total); break;
        case 'avg_desc': results.sort((a, b) => b.avg - a.avg); break;
        case 'latest_desc':
            const latestFile = targetFiles[targetFiles.length - 1];
            results.sort((a, b) => (b.dates[latestFile] || 0) - (a.dates[latestFile] || 0));
            break;
    }

    const totalSa = results.reduce((sum, r) => sum + r.total, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    document.getElementById('trendSummary').innerHTML = `
        表示: ${results.length}台 | 期間: ${targetFiles.length}日間 |
        合計差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
    `;

    const thead = document.querySelector('#trend-table thead');
    const tbody = document.querySelector('#trend-table tbody');

    let headerHtml = '<tr><th>機種名</th><th>台番号</th>';
    targetFiles.forEach(file => {
        headerHtml += `<th>${formatDateShort(file)}</th>`;
    });
    headerHtml += '<th>合計</th><th>平均</th><th>傾向</th></tr>';
    thead.innerHTML = headerHtml;

    tbody.innerHTML = results.map(row => {
        let html = `<tr><td>${row.machine}</td><td>${row.num}</td>`;
        targetFiles.forEach(file => {
            const val = row.dates[file];
            if (val !== undefined) {
                const cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                html += `<td class="${cls}">${val >= 0 ? '+' : ''}${val.toLocaleString()}</td>`;
            } else {
                html += '<td>-</td>';
            }
        });

        const totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
        const avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';

        const vals = targetFiles.map(f => row.dates[f] || 0);
        let trend = '→';
        if (vals.length >= 2) {
            const recent = vals.slice(-3);
            const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
            const older = vals.slice(0, -3);
            if (older.length > 0) {
                const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
                if (avgRecent > avgOlder + 500) trend = '↑';
                else if (avgRecent < avgOlder - 500) trend = '↓';
            }
        }

        html += `<td class="${totalCls}">${row.total >= 0 ? '+' : ''}${row.total.toLocaleString()}</td>`;
        html += `<td class="${avgCls}">${row.avg >= 0 ? '+' : ''}${row.avg.toLocaleString()}</td>`;
        html += `<td>${trend}</td></tr>`;
        return html;
    }).join('');
}

// ===================
// 機種別統計
// ===================
function showStats() {
    if (statsMode === 'daily') {
        showDailyStats();
    } else {
        showPeriodStats();
    }
}

async function showDailyStats() {
    const dateFile = document.getElementById('statsDateSelect')?.value;
    const selectedMachine = document.getElementById('statsMachineSelect')?.value || '';
    const sortBy = document.getElementById('statsSortBy')?.value || 'total_desc';

    if (!dateFile) return;

    const data = await loadCSV(dateFile);
    if (!data) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    if (selectedMachine) {
        showMachineDetail(data, selectedMachine, sortBy);
    } else {
        showAllMachineStats(data, sortBy);
    }
}

function showAllMachineStats(data, sortBy) {
    const machineStats = {};

    data.forEach(row => {
        const machine = row['機種名'];
        if (!machineStats[machine]) {
            machineStats[machine] = { count: 0, totalGames: 0, totalSa: 0, plusCount: 0 };
        }
        machineStats[machine].count++;
        machineStats[machine].totalGames += parseInt(row['G数']) || 0;
        machineStats[machine].totalSa += parseInt(row['差枚']) || 0;
        if ((parseInt(row['差枚']) || 0) > 0) machineStats[machine].plusCount++;
    });

    let results = Object.entries(machineStats).map(([machine, stats]) => ({
        machine,
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    switch (sortBy) {
        case 'total_desc': results.sort((a, b) => b.totalSa - a.totalSa); break;
        case 'total_asc': results.sort((a, b) => a.totalSa - b.totalSa); break;
        case 'avg_desc': results.sort((a, b) => b.avgSa - a.avgSa); break;
        case 'avg_asc': results.sort((a, b) => a.avgSa - b.avgSa); break;
        case 'count_desc': results.sort((a, b) => b.count - a.count); break;
        case 'winrate_desc': results.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate)); break;
        case 'winrate_asc': results.sort((a, b) => parseFloat(a.winRate) - parseFloat(b.winRate)); break;
    }

    const totalSa = results.reduce((sum, r) => sum + r.totalSa, 0);
    const totalCount = results.reduce((sum, r) => sum + r.count, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    let html = `
        <div class="summary">
            機種数: ${results.length} | 総台数: ${totalCount} |
            総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
        </div>
        <div class="table-wrapper">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>機種名</th>
                        <th>台数</th>
                        <th>総G数</th>
                        <th>平均G数</th>
                        <th>総差枚</th>
                        <th>平均差枚</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        html += `
            <tr>
                <td>${r.machine}</td>
                <td>${r.count}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td>${r.winRate}%</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    document.getElementById('statsContent').innerHTML = html;
}

function showMachineDetail(data, machine, sortBy) {
    const machineData = data.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    let sortedData = [...machineData];
    switch (sortBy) {
        case 'total_desc': case 'avg_desc':
            sortedData.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
            break;
        case 'total_asc': case 'avg_asc':
            sortedData.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
            break;
    }

    let html = `
        <h3 class="machine-title">${machine}</h3>
        <div class="stats-summary">
            <div class="stat-item"><span class="label">台数</span><span class="value">${machineData.length}</span></div>
            <div class="stat-item"><span class="label">総G数</span><span class="value">${totalGames.toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">平均G数</span><span class="value">${Math.round(totalGames / machineData.length).toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">総差枚</span><span class="value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">平均差枚</span><span class="value ${saClass}">${Math.round(totalSa / machineData.length) >= 0 ? '+' : ''}${Math.round(totalSa / machineData.length).toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">勝率</span><span class="value">${winRate}%</span></div>
        </div>

        <h4>台別データ</h4>
        <div class="table-wrapper">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>台番号</th>
                        <th>G数</th>
                        <th>差枚</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedData.forEach(row => {
        const sa = parseInt(row['差枚']) || 0;
        const saCls = sa > 0 ? 'plus' : sa < 0 ? 'minus' : '';
        html += `
            <tr>
                <td>${row['台番号']}</td>
                <td>${(parseInt(row['G数']) || 0).toLocaleString()}</td>
                <td class="${saCls}">${sa >= 0 ? '+' : ''}${sa.toLocaleString()}</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    document.getElementById('statsContent').innerHTML = html;
}

async function showPeriodStats() {
    const startDate = document.getElementById('statsPeriodStart')?.value;
    const endDate = document.getElementById('statsPeriodEnd')?.value;
    const dayOfWeekFilter = document.getElementById('statsDayOfWeek')?.value;
    const selectedMachine = document.getElementById('statsPeriodMachineSelect')?.value || '';
    const sortBy = document.getElementById('statsPeriodSortBy')?.value || 'total_desc';

    if (!startDate || !endDate) return;

    let targetFiles = CSV_FILES.filter(f => {
        const dateMatch = f >= startDate && f <= endDate;
        if (!dateMatch) return false;

        if (dayOfWeekFilter !== '' && dayOfWeekFilter !== undefined) {
            const dayOfWeek = getDayOfWeek(f);
            if (dayOfWeek !== parseInt(dayOfWeekFilter)) return false;
        }
        return true;
    }).sort();

    if (targetFiles.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>選択した期間・曜日にデータがありません</p>';
        return;
    }

    let allData = [];
    for (const file of targetFiles) {
        const data = await loadCSV(file);
        if (data) {
            data.forEach(row => {
                allData.push({ ...row, _file: file, _date: formatDate(file) });
            });
        }
    }

    const dayLabel = (dayOfWeekFilter !== '' && dayOfWeekFilter !== undefined)
        ? `（${getDayOfWeekName(parseInt(dayOfWeekFilter))}曜のみ）`
        : '';

    if (selectedMachine) {
        showPeriodMachineDetail(allData, selectedMachine, targetFiles, sortBy, dayLabel);
    } else {
        showPeriodAllMachineStats(allData, targetFiles, sortBy, dayLabel);
    }
}

function showPeriodAllMachineStats(allData, targetFiles, sortBy, dayLabel = '') {
    const machineStats = {};

    allData.forEach(row => {
        const machine = row['機種名'];
        if (!machineStats[machine]) {
            machineStats[machine] = { count: 0, totalGames: 0, totalSa: 0, plusCount: 0 };
        }
        machineStats[machine].count++;
        machineStats[machine].totalGames += parseInt(row['G数']) || 0;
        machineStats[machine].totalSa += parseInt(row['差枚']) || 0;
        if ((parseInt(row['差枚']) || 0) > 0) machineStats[machine].plusCount++;
    });

    let results = Object.entries(machineStats).map(([machine, stats]) => ({
        machine,
        count: stats.count,
        avgPerDay: (stats.count / targetFiles.length).toFixed(1),
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    switch (sortBy) {
        case 'total_desc': results.sort((a, b) => b.totalSa - a.totalSa); break;
        case 'total_asc': results.sort((a, b) => a.totalSa - b.totalSa); break;
        case 'avg_desc': results.sort((a, b) => b.avgSa - a.avgSa); break;
        case 'avg_asc': results.sort((a, b) => a.avgSa - b.avgSa); break;
        case 'count_desc': results.sort((a, b) => b.count - a.count); break;
        case 'winrate_desc': results.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate)); break;
        case 'winrate_asc': results.sort((a, b) => parseFloat(a.winRate) - parseFloat(b.winRate)); break;
    }

    const periodLabel = `${formatDate(targetFiles[0])} 〜 ${formatDate(targetFiles[targetFiles.length - 1])}（${targetFiles.length}日間）${dayLabel}`;

    const totalSa = results.reduce((sum, r) => sum + r.totalSa, 0);
    const totalCount = results.reduce((sum, r) => sum + r.count, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    let html = `
        <div class="period-label">${periodLabel}</div>
        <div class="summary">
            機種数: ${results.length} | 延べ台数: ${totalCount.toLocaleString()} |
            総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
        </div>
        <div class="table-wrapper">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>機種名</th>
                        <th>延べ台数</th>
                        <th>1日平均</th>
                        <th>総G数</th>
                        <th>平均G数</th>
                        <th>総差枚</th>
                        <th>平均差枚</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        html += `
            <tr>
                <td>${r.machine}</td>
                <td>${r.count}</td>
                <td>${r.avgPerDay}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td>${r.winRate}%</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    document.getElementById('statsContent').innerHTML = html;
}

function showPeriodMachineDetail(allData, machine, targetFiles, sortBy, dayLabel = '') {
    const machineData = allData.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    const unitStats = {};
    machineData.forEach(row => {
        const num = row['台番号'];
        if (!unitStats[num]) {
            unitStats[num] = { count: 0, totalGames: 0, totalSa: 0, plusCount: 0 };
        }
        unitStats[num].count++;
        unitStats[num].totalGames += parseInt(row['G数']) || 0;
        unitStats[num].totalSa += parseInt(row['差枚']) || 0;
        if ((parseInt(row['差枚']) || 0) > 0) unitStats[num].plusCount++;
    });

    let results = Object.entries(unitStats).map(([num, stats]) => ({
        num,
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    switch (sortBy) {
        case 'total_desc': results.sort((a, b) => b.totalSa - a.totalSa); break;
        case 'total_asc': results.sort((a, b) => a.totalSa - b.totalSa); break;
        case 'avg_desc': results.sort((a, b) => b.avgSa - a.avgSa); break;
        case 'avg_asc': results.sort((a, b) => a.avgSa - b.avgSa); break;
        case 'count_desc': results.sort((a, b) => b.count - a.count); break;
        case 'winrate_desc': results.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate)); break;
        case 'winrate_asc': results.sort((a, b) => parseFloat(a.winRate) - parseFloat(b.winRate)); break;
    }

    const periodLabel = `${formatDate(targetFiles[0])} 〜 ${formatDate(targetFiles[targetFiles.length - 1])}（${targetFiles.length}日間）${dayLabel}`;

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    let html = `
        <div class="period-label">${periodLabel}</div>
        <h3 class="machine-title">${machine}</h3>
        <div class="stats-summary">
            <div class="stat-item"><span class="label">延べ台数</span><span class="value">${machineData.length}</span></div>
            <div class="stat-item"><span class="label">総G数</span><span class="value">${totalGames.toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">平均G数</span><span class="value">${Math.round(totalGames / machineData.length).toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">総差枚</span><span class="value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">平均差枚</span><span class="value ${saClass}">${Math.round(totalSa / machineData.length) >= 0 ? '+' : ''}${Math.round(totalSa / machineData.length).toLocaleString()}</span></div>
            <div class="stat-item"><span class="label">勝率</span><span class="value">${winRate}%</span></div>
        </div>

        <h4>台別期間累計</h4>
        <div class="table-wrapper">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>台番号</th>
                        <th>出現回数</th>
                        <th>総G数</th>
                        <th>平均G数</th>
                        <th>総差枚</th>
                        <th>平均差枚</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        html += `
            <tr>
                <td>${r.num}</td>
                <td>${r.count}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td>${r.winRate}%</td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    document.getElementById('statsContent').innerHTML = html;
}

// ===================
// カレンダー
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

    // データを集計
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

    // 空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // 日付セル
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

            // 棒グラフの幅を計算
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

// ===================
// イベントリスナー
// ===================
function setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');

            if (btn.dataset.tab === 'calendar') {
                renderCalendar();
            } else if (btn.dataset.tab === 'trend') {
                loadTrendData();
            } else if (btn.dataset.tab === 'stats') {
                showStats();
            }
        });
    });

    // 日別データ
    document.getElementById('prevDate')?.addEventListener('click', () => {
        const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
        if (currentDateIndex < sortedFiles.length - 1) {
            currentDateIndex++;
            filterAndRender();
        }
    });

    document.getElementById('nextDate')?.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            filterAndRender();
        }
    });

    document.getElementById('dateSelect')?.addEventListener('change', (e) => {
        const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
        currentDateIndex = sortedFiles.indexOf(e.target.value);
        filterAndRender();
    });

    document.getElementById('search')?.addEventListener('input', filterAndRender);
    document.getElementById('sortBy')?.addEventListener('change', filterAndRender);
    document.getElementById('applyFilter')?.addEventListener('click', filterAndRender);
    document.getElementById('resetFilter')?.addEventListener('click', () => {
        document.getElementById('saFilterType').value = '';
        document.getElementById('saFilterValue').value = '';
        document.getElementById('gameFilterType').value = '';
        document.getElementById('gameFilterValue').value = '';
        filterAndRender();
    });

    // 差枚トレンド
    document.getElementById('trendDays')?.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            selectedTrendDates = [];
        }
        loadTrendData();
    });
    document.getElementById('trendMachineFilter')?.addEventListener('change', loadTrendData);
    document.getElementById('trendSortBy')?.addEventListener('change', loadTrendData);
    document.getElementById('loadTrend')?.addEventListener('click', loadTrendData);

    // 差枚トレンドのカレンダーモーダル
    document.getElementById('openTrendCalendar')?.addEventListener('click', openTrendCalendarModal);
    document.getElementById('closeTrendCalendar')?.addEventListener('click', closeTrendCalendarModal);

    document.getElementById('trendCalendarModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'trendCalendarModal') {
            closeTrendCalendarModal();
        }
    });

    document.getElementById('selectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    document.getElementById('deselectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    document.getElementById('applyTrendDates')?.addEventListener('click', () => {
        selectedTrendDates = getSelectedTrendDates();
        document.getElementById('trendDays').value = 'custom';
        closeTrendCalendarModal();
        loadTrendData();
    });

    // 機種別統計モード切り替え
    document.querySelectorAll('.stats-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stats-mode-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.stats-mode-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');

            statsMode = btn.dataset.mode;
            document.getElementById(`stats-${statsMode}-content`).classList.add('active');
            showStats();
        });
    });

    // 機種別統計（日別）
    document.getElementById('statsDateSelect')?.addEventListener('change', showStats);
    document.getElementById('statsMachineSelect')?.addEventListener('change', showStats);
    document.getElementById('statsSortBy')?.addEventListener('change', showStats);

    // 機種別統計（期間）
    document.getElementById('statsPeriodStart')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodEnd')?.addEventListener('change', showStats);
    document.getElementById('statsDayOfWeek')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodMachineSelect')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodSortBy')?.addEventListener('change', showStats);

    // カレンダー
    document.getElementById('prevMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('nextMonth')?.addEventListener('click', () => changeCalendarMonth(1));
}

// ===================
// 初期化
// ===================
async function init() {
    try {
        const response = await fetch('files.json');
        CSV_FILES = await response.json();
    } catch (e) {
        console.error('files.json の読み込みに失敗しました:', e);
        document.getElementById('summary').innerHTML = 'files.json の読み込みに失敗しました';
        return;
    }

    if (CSV_FILES.length === 0) {
        document.getElementById('summary').innerHTML = 'CSVファイルがありません';
        return;
    }

    // カレンダーの初期月を設定
    const sortedFiles = [...CSV_FILES].sort((a, b) => b.localeCompare(a));
    const latestParsed = parseDateFromFilename(sortedFiles[0]);
    if (latestParsed) {
        calendarYear = latestParsed.year;
        calendarMonth = latestParsed.month;
    } else {
        const now = new Date();
        calendarYear = now.getFullYear();
        calendarMonth = now.getMonth() + 1;
    }

    await loadAllCSV();
    populateDateSelectors();
    populateMachineFilters();
    setupEventListeners();
    filterAndRender();
}

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', init);
