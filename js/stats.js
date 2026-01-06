// ===================
// 機種別統計タブ
// ===================

// 台番号から末尾数字を取得
function getUnitSuffix(unitNum) {
    const numOnly = (unitNum || '').replace(/\D/g, '');
    if (numOnly.length === 0) return -1;
    return parseInt(numOnly.slice(-1));
}

// 台番号末尾でデータをフィルタ
function filterByUnitSuffix(data, suffixFilter) {
    if (suffixFilter === '' || suffixFilter === undefined) {
        return data;
    }
    const targetSuffix = parseInt(suffixFilter);
    return data.filter(row => getUnitSuffix(row['台番号']) === targetSuffix);
}

// 台番号末尾ごとの統計を計算
function calculateSuffixStats(data) {
    const suffixStats = {};
    
    // 0-9の初期化
    for (let i = 0; i <= 9; i++) {
        suffixStats[i] = { count: 0, totalGames: 0, totalSa: 0, plusCount: 0 };
    }
    
    data.forEach(row => {
        const suffix = getUnitSuffix(row['台番号']);
        if (suffix >= 0 && suffix <= 9) {
            suffixStats[suffix].count++;
            suffixStats[suffix].totalGames += parseInt(row['G数']) || 0;
            suffixStats[suffix].totalSa += parseInt(row['差枚']) || 0;
            if ((parseInt(row['差枚']) || 0) > 0) {
                suffixStats[suffix].plusCount++;
            }
        }
    });
    
    return Object.entries(suffixStats).map(([suffix, stats]) => ({
        suffix: parseInt(suffix),
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: stats.count > 0 ? Math.round(stats.totalGames / stats.count) : 0,
        totalSa: stats.totalSa,
        avgSa: stats.count > 0 ? Math.round(stats.totalSa / stats.count) : 0,
        winRate: stats.count > 0 ? ((stats.plusCount / stats.count) * 100).toFixed(1) : '0.0'
    }));
}

// 台番号末尾統計のHTML生成
function renderSuffixStatsTable(suffixStats, title = '台番号末尾別統計') {
    let html = `
        <div class="suffix-stats-block">
            <h4 class="block-title">🔢 ${title}</h4>
            <div class="table-wrapper">
                <table class="stats-table suffix-stats-table">
                    <thead>
                        <tr>
                            <th>末尾</th>
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
    
    suffixStats.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        const rowClass = r.count === 0 ? 'no-data' : '';
        
        html += `
            <tr class="${rowClass}">
                <td><strong>${r.suffix}</strong></td>
                <td>${r.count}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td>${r.winRate}%</td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div></div>';
    return html;
}

function showStats() {
    if (statsMode === 'daily') {
        showDailyStats();
    } else {
        showPeriodStats();
    }
}

// 台番号末尾フィルターの表示/非表示を切り替え
function updateUnitSuffixFilterVisibility() {
    const dailyFilter = document.querySelector('.stats-unit-suffix-filter');
    const periodFilter = document.querySelector('.stats-period-unit-suffix-filter');
    
    if (dailyFilter) {
        dailyFilter.style.display = statsSubTab === 'unit' ? 'block' : 'none';
    }
    if (periodFilter) {
        periodFilter.style.display = statsSubTab === 'unit' ? 'block' : 'none';
    }
}

async function showDailyStats() {
    const dateFile = document.getElementById('statsDateSelect')?.value;
    const selectedMachine = document.getElementById('statsMachineSelect')?.value || '';
    const sortBy = document.getElementById('statsSortBy')?.value || 'total_desc';
    const unitSuffixFilter = document.getElementById('statsUnitSuffixFilter')?.value || '';

    if (!dateFile) return;

    const data = await loadCSV(dateFile);
    if (!data) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    if (selectedMachine) {
        showMachineDetail(data, selectedMachine, sortBy, unitSuffixFilter);
    } else {
        showAllStats(data, sortBy, 'daily', unitSuffixFilter);
    }
}

function showAllStats(data, sortBy, mode, unitSuffixFilter = '') {
    // 機種別統計
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

    let machineResults = Object.entries(machineStats).map(([machine, stats]) => ({
        machine,
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    // 台別統計（フィルタ適用）
    const filteredData = filterByUnitSuffix(data, unitSuffixFilter);
    
    const unitStats = {};
    filteredData.forEach(row => {
        const key = `${row['機種名']}_${row['台番号']}`;
        if (!unitStats[key]) {
            unitStats[key] = {
                machine: row['機種名'],
                num: row['台番号'],
                count: 0,
                totalGames: 0,
                totalSa: 0,
                plusCount: 0
            };
        }
        unitStats[key].count++;
        unitStats[key].totalGames += parseInt(row['G数']) || 0;
        unitStats[key].totalSa += parseInt(row['差枚']) || 0;
        if ((parseInt(row['差枚']) || 0) > 0) unitStats[key].plusCount++;
    });

    let unitResults = Object.values(unitStats).map(stats => ({
        machine: stats.machine,
        num: stats.num,
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    const sortFunc = getSortFunction(sortBy);
    machineResults.sort(sortFunc);
    unitResults.sort(sortFunc);

    // 全体サマリー（フィルタなしのデータで計算）
    const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / data.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    // 台番号末尾統計
    const suffixStats = calculateSuffixStats(data);

    let html = `
        <div class="stats-summary-block">
            <h4 class="block-title">📊 全体サマリー</h4>
            <div class="stats-summary-grid">
                <div class="stat-box">
                    <span class="stat-label">機種数</span>
                    <span class="stat-value">${machineResults.length}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">${mode === 'daily' ? '総台数' : '延べ台数'}</span>
                    <span class="stat-value">${data.length}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総G数</span>
                    <span class="stat-value">${totalGames.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総差枚</span>
                    <span class="stat-value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">勝率</span>
                    <span class="stat-value">${winRate}%</span>
                </div>
            </div>
        </div>

        <div class="stats-sub-tabs">
            <button class="stats-sub-tab ${statsSubTab === 'machine' ? 'active' : ''}" data-subtab="machine">機種別</button>
            <button class="stats-sub-tab ${statsSubTab === 'unit' ? 'active' : ''}" data-subtab="unit">台別</button>
        </div>
    `;

    if (statsSubTab === 'machine') {
        html += `
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
        machineResults.forEach(r => {
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

        // 機種別タブのときに末尾統計を表示
        html += renderSuffixStatsTable(suffixStats);
        
    } else {
        // 台別タブ
        const filterLabel = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ）` : '';
        html += `
            <div class="filter-info">${filterLabel ? `<span class="active-filter">${filterLabel}</span>` : ''}</div>
            <div class="table-wrapper">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>機種名</th>
                            <th>台番号</th>
                            <th>G数</th>
                            <th>差枚</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        unitResults.forEach(r => {
            const saCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            html += `
                <tr>
                    <td>${r.machine}</td>
                    <td>${r.num}</td>
                    <td>${r.totalGames.toLocaleString()}</td>
                    <td class="${saCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
    }

    document.getElementById('statsContent').innerHTML = html;

    // サブタブのイベントリスナー
    document.querySelectorAll('.stats-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            statsSubTab = btn.dataset.subtab;
            updateUnitSuffixFilterVisibility();
            showStats();
        });
    });

    updateUnitSuffixFilterVisibility();
}

function showMachineDetail(data, machine, sortBy, unitSuffixFilter = '') {
    let machineData = data.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    // 台番号末尾統計（フィルタ前のデータで計算）
    const suffixStats = calculateSuffixStats(machineData);

    // フィルタ適用
    const filteredData = filterByUnitSuffix(machineData, unitSuffixFilter);

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    let sortedData = [...filteredData];
    if (sortBy.includes('desc')) {
        sortedData.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
    } else if (sortBy.includes('asc')) {
        sortedData.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
    }

    const filterLabel = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ表示）` : '';

    let html = `
        <h3 class="machine-title">${machine}</h3>
        <div class="stats-summary-block">
            <h4 class="block-title">📊 機種サマリー</h4>
            <div class="stats-summary-grid">
                <div class="stat-box">
                    <span class="stat-label">台数</span>
                    <span class="stat-value">${machineData.length}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総G数</span>
                    <span class="stat-value">${totalGames.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">平均G数</span>
                    <span class="stat-value">${Math.round(totalGames / machineData.length).toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総差枚</span>
                    <span class="stat-value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">平均差枚</span>
                    <span class="stat-value ${saClass}">${Math.round(totalSa / machineData.length) >= 0 ? '+' : ''}${Math.round(totalSa / machineData.length).toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">勝率</span>
                    <span class="stat-value">${winRate}%</span>
                </div>
            </div>
        </div>

        ${renderSuffixStatsTable(suffixStats, '台番号末尾別統計')}

        <h4>台別データ${filterLabel}</h4>
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
    const dateSuffixFilter = document.getElementById('statsDateSuffix')?.value;
    const selectedMachine = document.getElementById('statsPeriodMachineSelect')?.value || '';
    const sortBy = document.getElementById('statsPeriodSortBy')?.value || 'total_desc';
    const unitSuffixFilter = document.getElementById('statsPeriodUnitSuffixFilter')?.value || '';

    if (!startDate || !endDate) return;

    const startNum = getDateNumber(startDate);
    const endNum = getDateNumber(endDate);

    let targetFiles = CSV_FILES.filter(f => {
        const fileNum = getDateNumber(f);
        const dateMatch = fileNum >= startNum && fileNum <= endNum;
        if (!dateMatch) return false;

        if (dayOfWeekFilter !== '' && dayOfWeekFilter !== undefined) {
            const dayOfWeek = getDayOfWeek(f);
            if (dayOfWeek !== parseInt(dayOfWeekFilter)) return false;
        }

        if (dateSuffixFilter !== '' && dateSuffixFilter !== undefined) {
            const suffix = getDateSuffix(f);
            if (suffix !== parseInt(dateSuffixFilter)) return false;
        }

        return true;
    });

    targetFiles = sortFilesByDate(targetFiles, false);

    if (targetFiles.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>選択した条件にデータがありません</p>';
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

    let filterLabels = [];
    if (dayOfWeekFilter !== '' && dayOfWeekFilter !== undefined) {
        filterLabels.push(`${getDayOfWeekName(parseInt(dayOfWeekFilter))}曜`);
    }
    if (dateSuffixFilter !== '' && dateSuffixFilter !== undefined) {
        filterLabels.push(`末尾${dateSuffixFilter}の日`);
    }
    const filterLabel = filterLabels.length > 0 ? `（${filterLabels.join('・')}）` : '';

    const periodLabel = `${formatDate(targetFiles[0])} 〜 ${formatDate(targetFiles[targetFiles.length - 1])}（${targetFiles.length}日間）${filterLabel}`;

    if (selectedMachine) {
        showPeriodMachineDetail(allData, selectedMachine, targetFiles, sortBy, periodLabel, unitSuffixFilter);
    } else {
        showPeriodAllStats(allData, targetFiles, sortBy, periodLabel, unitSuffixFilter);
    }
}

function showPeriodAllStats(allData, targetFiles, sortBy, periodLabel, unitSuffixFilter = '') {
    // 機種別統計
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

    let machineResults = Object.entries(machineStats).map(([machine, stats]) => ({
        machine,
        count: stats.count,
        avgPerDay: (stats.count / targetFiles.length).toFixed(1),
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    // 台別統計（フィルタ適用）
    const filteredData = filterByUnitSuffix(allData, unitSuffixFilter);

    const unitStats = {};
    filteredData.forEach(row => {
        const key = `${row['機種名']}_${row['台番号']}`;
        if (!unitStats[key]) {
            unitStats[key] = {
                machine: row['機種名'],
                num: row['台番号'],
                count: 0,
                totalGames: 0,
                totalSa: 0,
                plusCount: 0
            };
        }
        unitStats[key].count++;
        unitStats[key].totalGames += parseInt(row['G数']) || 0;
        unitStats[key].totalSa += parseInt(row['差枚']) || 0;
        if ((parseInt(row['差枚']) || 0) > 0) unitStats[key].plusCount++;
    });

    let unitResults = Object.values(unitStats).map(stats => ({
        machine: stats.machine,
        num: stats.num,
        count: stats.count,
        totalGames: stats.totalGames,
        avgGames: Math.round(stats.totalGames / stats.count),
        totalSa: stats.totalSa,
        avgSa: Math.round(stats.totalSa / stats.count),
        winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
    }));

    const sortFunc = getSortFunction(sortBy);
    machineResults.sort(sortFunc);
    unitResults.sort(sortFunc);

    // 全体サマリー
    const totalSa = allData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const totalGames = allData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const plusCount = allData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / allData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    // 台番号末尾統計
    const suffixStats = calculateSuffixStats(allData);

    let html = `
        <div class="period-label">${periodLabel}</div>
        <div class="stats-summary-block">
            <h4 class="block-title">📊 期間サマリー</h4>
            <div class="stats-summary-grid">
                <div class="stat-box">
                    <span class="stat-label">機種数</span>
                    <span class="stat-value">${machineResults.length}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">延べ台数</span>
                    <span class="stat-value">${allData.length.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">1日平均</span>
                    <span class="stat-value">${(allData.length / targetFiles.length).toFixed(1)}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総G数</span>
                    <span class="stat-value">${totalGames.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総差枚</span>
                    <span class="stat-value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">勝率</span>
                    <span class="stat-value">${winRate}%</span>
                </div>
            </div>
        </div>

        <div class="stats-sub-tabs">
            <button class="stats-sub-tab ${statsSubTab === 'machine' ? 'active' : ''}" data-subtab="machine">機種別</button>
            <button class="stats-sub-tab ${statsSubTab === 'unit' ? 'active' : ''}" data-subtab="unit">台別</button>
        </div>
    `;

    if (statsSubTab === 'machine') {
        html += `
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
        machineResults.forEach(r => {
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

        // 機種別タブのときに末尾統計を表示
        html += renderSuffixStatsTable(suffixStats);

    } else {
        // 台別タブ
        const filterLabelUnit = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ）` : '';
        html += `
            <div class="filter-info">${filterLabelUnit ? `<span class="active-filter">${filterLabelUnit}</span>` : ''}</div>
            <div class="table-wrapper">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>機種名</th>
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
        unitResults.forEach(r => {
            const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
            html += `
                <tr>
                    <td>${r.machine}</td>
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
    }

    document.getElementById('statsContent').innerHTML = html;

    // サブタブのイベントリスナー
    document.querySelectorAll('.stats-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            statsSubTab = btn.dataset.subtab;
            updateUnitSuffixFilterVisibility();
            showStats();
        });
    });

    updateUnitSuffixFilterVisibility();
}

function showPeriodMachineDetail(allData, machine, targetFiles, sortBy, periodLabel, unitSuffixFilter = '') {
    let machineData = allData.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    // 台番号末尾統計（フィルタ前）
    const suffixStats = calculateSuffixStats(machineData);

    // フィルタ適用後の台別集計
    const filteredData = filterByUnitSuffix(machineData, unitSuffixFilter);

    const unitStats = {};
    filteredData.forEach(row => {
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

    results.sort(getSortFunction(sortBy));

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

    const filterLabelUnit = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ表示）` : '';

    let html = `
        <div class="period-label">${periodLabel}</div>
        <h3 class="machine-title">${machine}</h3>
        <div class="stats-summary-block">
            <h4 class="block-title">📊 機種サマリー</h4>
            <div class="stats-summary-grid">
                <div class="stat-box">
                    <span class="stat-label">延べ台数</span>
                    <span class="stat-value">${machineData.length}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総G数</span>
                    <span class="stat-value">${totalGames.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">平均G数</span>
                    <span class="stat-value">${Math.round(totalGames / machineData.length).toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">総差枚</span>
                    <span class="stat-value ${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">平均差枚</span>
                    <span class="stat-value ${saClass}">${Math.round(totalSa / machineData.length) >= 0 ? '+' : ''}${Math.round(totalSa / machineData.length).toLocaleString()}</span>
                </div>
                <div class="stat-box">
                    <span class="stat-label">勝率</span>
                    <span class="stat-value">${winRate}%</span>
                </div>
            </div>
        </div>

        ${renderSuffixStatsTable(suffixStats, '台番号末尾別統計')}

        <h4>台別期間累計${filterLabelUnit}</h4>
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

function setupStatsEventListeners() {
    // モード切り替え
    document.querySelectorAll('.stats-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stats-mode-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.stats-mode-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');

            statsMode = btn.dataset.mode;
            document.getElementById(`stats-${statsMode}-content`).classList.add('active');
            updateUnitSuffixFilterVisibility();
            showStats();
        });
    });

    // 日別モード
    document.getElementById('statsDateSelect')?.addEventListener('change', showStats);
    document.getElementById('statsMachineSelect')?.addEventListener('change', showStats);
    document.getElementById('statsSortBy')?.addEventListener('change', showStats);
    document.getElementById('statsUnitSuffixFilter')?.addEventListener('change', showStats);

    // 期間集計モード
    document.getElementById('statsPeriodStart')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodEnd')?.addEventListener('change', showStats);
    document.getElementById('statsDayOfWeek')?.addEventListener('change', showStats);
    document.getElementById('statsDateSuffix')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodMachineSelect')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodSortBy')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodUnitSuffixFilter')?.addEventListener('change', showStats);
}
