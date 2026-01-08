// ===================
// 機種別統計タブ
// ===================

// フィルターのインスタンスを保持
let statsEventFilterSelect = null;
let statsMediaFilterSelect = null;
let statsPerformerFilterSelect = null;
let statsMachineFilterSelect = null;
let statsDailyMachineFilterSelect = null;

// 機械割を計算する関数
function calculateMechanicalRate(games, saMai) {
    const g = parseInt(games) || 0;
    const sa = parseInt(saMai) || 0;
    
    if (g <= 0) return null;
    
    const totalIn = g * 3;
    const totalOut = totalIn + sa;
    const rate = (totalOut / totalIn) * 100;
    
    return rate;
}

// 機械割を文字列でフォーマット
function formatMechanicalRate(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
        return '-';
    }
    return rate.toFixed(2) + '%';
}

// 機械割のCSSクラスを取得
function getMechanicalRateClass(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
        return '';
    }
    if (rate >= 100) {
        return 'plus';
    } else {
        return 'minus';
    }
}

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

// 台番号末尾ごとの統計を計算（機械割追加）
function calculateSuffixStats(data) {
    const suffixStats = {};

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

    return Object.entries(suffixStats).map(([suffix, stats]) => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            suffix: parseInt(suffix),
            count: stats.count,
            totalGames: stats.totalGames,
            avgGames: stats.count > 0 ? Math.round(stats.totalGames / stats.count) : 0,
            totalSa: stats.totalSa,
            avgSa: stats.count > 0 ? Math.round(stats.totalSa / stats.count) : 0,
            rate: rate,
            winRate: stats.count > 0 ? ((stats.plusCount / stats.count) * 100).toFixed(1) : '0.0'
        };
    });
}

// 台番号末尾統計のHTML生成（トグル式・機械割追加・コピーダウンロード追加）
function renderSuffixStatsTable(suffixStats, title = '台番号末尾別統計') {
    const uniqueId = 'suffixStats_' + Math.random().toString(36).substr(2, 9);
    
    let tableRows = '';
    suffixStats.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        const rateCls = getMechanicalRateClass(r.rate);
        const rateText = formatMechanicalRate(r.rate);
        const rowClass = r.count === 0 ? 'no-data' : '';

        tableRows += `
            <tr class="${rowClass}">
                <td><strong>${r.suffix}</strong></td>
                <td>${r.count}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td class="${rateCls}">${rateText}</td>
                <td>${r.winRate}%</td>
            </tr>
        `;
    });

    const html = `
        <div class="suffix-stats-block collapsible">
            <div class="suffix-stats-header" data-toggle-id="${uniqueId}">
                <h4 class="block-title">🔢 ${title}</h4>
                <span class="toggle-icon">▼</span>
            </div>
            <div class="suffix-stats-content" id="${uniqueId}">
                <div class="table-actions suffix-table-actions">
                    <button class="btn-copy btn-small" data-table-id="suffix-table-${uniqueId}" title="テーブルをクリップボードにコピー">
                        📋 コピー
                    </button>
                    <button class="btn-download btn-small" data-table-id="suffix-table-${uniqueId}" title="CSVファイルをダウンロード">
                        💾 CSV
                    </button>
                </div>
                <div class="table-wrapper">
                    <table class="stats-table suffix-stats-table" id="suffix-table-${uniqueId}">
                        <thead>
                            <tr>
                                <th>末尾</th>
                                <th>台数</th>
                                <th>総G数</th>
                                <th>平均G数</th>
                                <th>総差枚</th>
                                <th>平均差枚</th>
                                <th>機械割</th>
                                <th>勝率</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        setupSuffixStatsToggle(uniqueId);
        setupSuffixTableActions(uniqueId);
    }, 0);

    return html;
}

// 台番号末尾テーブルのコピー・ダウンロードボタンをセットアップ
function setupSuffixTableActions(uniqueId) {
    const container = document.getElementById(uniqueId);
    if (!container) return;

    const copyBtn = container.querySelector('.btn-copy');
    const downloadBtn = container.querySelector('.btn-download');
    const tableId = `suffix-table-${uniqueId}`;

    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const table = document.getElementById(tableId);
            if (table) {
                const data = getTableData(table);
                copyToClipboard(data, copyBtn);
            }
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const table = document.getElementById(tableId);
            if (table) {
                const data = getTableData(table);
                const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
                const filename = `suffix_stats_${today}.csv`;
                downloadAsCSV(data, filename);
            }
        });
    }
}


// トグル動作のセットアップ
function setupSuffixStatsToggle(uniqueId) {
    const header = document.querySelector(`[data-toggle-id="${uniqueId}"]`);
    const content = document.getElementById(uniqueId);
    
    if (header && content) {
        header.addEventListener('click', () => {
            header.classList.toggle('open');
            content.classList.toggle('open');
        });
    }
}

// ファイル名から日付キーを取得
function getDateKeyFromFile(file) {
    const match = file.match(/(\d{4}_\d{2}_\d{2})/);
    return match ? match[1] : null;
}

// イベントが有効かどうかをチェック
function isStatsValidEvent(event) {
    if (!event) return false;
    
    const hasValidType = event.type && event.type.trim() !== '';
    const hasValidMedia = event.media && event.media.trim() !== '';
    
    let hasValidName = false;
    if (Array.isArray(event.name)) {
        hasValidName = event.name.some(n => n && n.trim() !== '');
    } else if (event.name) {
        hasValidName = event.name.trim() !== '';
    }
    
    return hasValidType || hasValidMedia || hasValidName;
}

// イベントまたは演者が存在するかチェック
function hasStatsEventOrPerformers(event) {
    if (!event) return false;
    
    const hasEvent = isStatsValidEvent(event);
    const hasPerformers = event.performers && event.performers.length > 0;
    
    return hasEvent || hasPerformers;
}

// イベントの表示名を取得
function getStatsEventDisplayName(event) {
    if (!event) return { icon: '', name: '', typeInfo: null };
    
    const typeInfo = getEventTypeInfo(event.type);
    const icon = typeInfo ? typeInfo.icon : '';
    
    let eventName = '';
    if (Array.isArray(event.name)) {
        eventName = event.name.filter(n => n && n.trim() !== '').join(', ');
    } else if (event.name && event.name.trim() !== '') {
        eventName = event.name;
    }
    
    if (!eventName && event.media) {
        eventName = event.media;
    }
    
    if (!eventName && typeInfo) {
        eventName = typeInfo.name;
    }
    
    return { icon, name: eventName, typeInfo, event };
}

// 統計用のイベントバッジ表示
function renderStatsEventBadges(events) {
    if (!events || events.length === 0) return '';

    const relevantEvents = events.filter(event => hasStatsEventOrPerformers(event));
    
    if (relevantEvents.length === 0) return '';

    let html = '<div class="stats-event-badges">';
    
    relevantEvents.forEach(event => {
        if (isStatsValidEvent(event)) {
            const { icon, name, typeInfo } = getStatsEventDisplayName(event);
            const color = typeInfo ? typeInfo.color : '#888';
            
            if (name) {
                html += `
                    <span class="stats-event-badge" style="background: ${color}20; border-color: ${color};">
                        ${icon} ${name}
                    </span>
                `;
            }
        }

        if (event.performers && event.performers.length > 0) {
            html += `
                <span class="stats-event-badge performer-badge">
                    🎤 ${event.performers.join(', ')}
                </span>
            `;
        }
    });
    
    html += '</div>';
    return html;
}

// ファイルがフィルターに一致するかチェック
function fileMatchesEventFilter(file, eventFilterValue, mediaFilterValue, performerFilterValue) {
    const dateKey = getDateKeyFromFile(file);
    const events = getEventsForDate(dateKey);

    if (eventFilterValue === 'has_event') {
        if (!events.some(e => hasStatsEventOrPerformers(e))) {
            return false;
        }
    } else if (eventFilterValue === 'no_event') {
        if (events.some(e => hasStatsEventOrPerformers(e))) {
            return false;
        }
    } else if (eventFilterValue && eventFilterValue.startsWith('type:')) {
        const typeId = eventFilterValue.replace('type:', '');
        if (!events.some(e => e.type === typeId)) {
            return false;
        }
    } else if (eventFilterValue && eventFilterValue.startsWith('name:')) {
        const eventName = eventFilterValue.replace('name:', '');
        if (!events.some(e => {
            if (Array.isArray(e.name)) {
                return e.name.some(n => n === eventName);
            }
            return e.name === eventName;
        })) {
            return false;
        }
    }

    if (mediaFilterValue) {
        if (!events.some(e => e.media === mediaFilterValue)) {
            return false;
        }
    }

    if (performerFilterValue) {
        if (!events.some(e => e.performers && e.performers.includes(performerFilterValue))) {
            return false;
        }
    }

    return true;
}

// 期間内の全イベント名を取得
function getAllEventNamesFromFiles(files) {
    const eventNames = new Set();
    
    files.forEach(file => {
        const dateKey = getDateKeyFromFile(file);
        const events = getEventsForDate(dateKey);
        
        events.forEach(event => {
            if (Array.isArray(event.name)) {
                event.name.forEach(n => {
                    if (n && n.trim() !== '') {
                        eventNames.add(n.trim());
                    }
                });
            } else if (event.name && event.name.trim() !== '') {
                eventNames.add(event.name.trim());
            }
        });
    });
    
    return [...eventNames].sort();
}

// 期間内のイベント詳細サマリーを生成
function getDetailedEventSummaryForFiles(files) {
    if (!eventData || !eventData.events) return null;

    const eventDetails = [];
    const performerCounts = {};

    files.forEach(file => {
        const dateKey = getDateKeyFromFile(file);
        const events = getEventsForDate(dateKey);
        const formattedDate = formatDate(file);

        events.forEach(event => {
            if (hasStatsEventOrPerformers(event)) {
                const { icon, name, typeInfo } = getStatsEventDisplayName(event);
                
                if (isStatsValidEvent(event) && name) {
                    eventDetails.push({
                        date: formattedDate,
                        icon: icon,
                        name: name,
                        color: typeInfo ? typeInfo.color : '#888',
                        performers: event.performers || []
                    });
                }
                
                if (event.performers && event.performers.length > 0) {
                    event.performers.forEach(performer => {
                        if (!performerCounts[performer]) {
                            performerCounts[performer] = 0;
                        }
                        performerCounts[performer]++;
                    });
                }
            }
        });
    });

    return { eventDetails, performerCounts };
}

// イベント詳細サマリーのHTML生成
function renderDetailedEventSummary(files) {
    const summary = getDetailedEventSummaryForFiles(files);
    
    if (!summary) return '';
    
    const { eventDetails, performerCounts } = summary;
    
    if (eventDetails.length === 0 && Object.keys(performerCounts).length === 0) {
        return '';
    }

    let html = '<div class="event-summary">';

    if (eventDetails.length > 0) {
        html += '<div class="event-summary-section">';
        html += '<span class="event-summary-label">📅 イベント:</span>';
        
        const eventGroups = {};
        eventDetails.forEach(detail => {
            const key = `${detail.icon}${detail.name}`;
            if (!eventGroups[key]) {
                eventGroups[key] = {
                    icon: detail.icon,
                    name: detail.name,
                    color: detail.color,
                    count: 0,
                    dates: []
                };
            }
            eventGroups[key].count++;
            eventGroups[key].dates.push(detail.date);
        });
        
        Object.values(eventGroups).forEach(group => {
            html += `<span class="event-summary-item" style="background: ${group.color}20; border-color: ${group.color};">`;
            html += `${group.icon} ${group.name}: ${group.count}日`;
            html += '</span>';
        });
        
        html += '</div>';
    }

    if (Object.keys(performerCounts).length > 0) {
        html += '<div class="event-summary-section">';
        html += '<span class="event-summary-label">🎤 演者:</span>';
        Object.entries(performerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([performer, count]) => {
                html += `<span class="event-summary-item performer-item">`;
                html += `${performer}: ${count}日`;
                html += '</span>';
            });
        if (Object.keys(performerCounts).length > 5) {
            html += `<span class="event-summary-more">他${Object.keys(performerCounts).length - 5}人</span>`;
        }
        html += '</div>';
    }

    html += '</div>';
    return html;
}

// 検索可能フィルターを初期化
async function initStatsFilters() {
    await loadEventData();

    const eventOptions = [
        { value: '', label: 'すべて' },
        { value: 'has_event', label: 'イベント/演者あり' },
        { value: 'no_event', label: 'イベント/演者なし' }
    ];
    
    if (eventData && eventData.eventTypes) {
        eventData.eventTypes.forEach(type => {
            eventOptions.push({ value: `type:${type.id}`, label: `${type.icon} ${type.name}` });
        });
    }
    
    const allEventNames = getAllEventNamesFromFiles(CSV_FILES);
    if (allEventNames.length > 0) {
        eventOptions.push({ value: '', label: '──────────', disabled: true });
        allEventNames.forEach(name => {
            eventOptions.push({ value: `name:${name}`, label: `📌 ${name}` });
        });
    }
    
    statsEventFilterSelect = initSearchableSelect('statsEventFilterContainer', eventOptions, 'すべて', () => showStats());

    const mediaOptions = [{ value: '', label: '全メディア' }];
    if (eventData && eventData.mediaTypes) {
        eventData.mediaTypes.forEach(media => {
            mediaOptions.push({ value: media, label: media });
        });
    }
    statsMediaFilterSelect = initSearchableSelect('statsMediaFilterContainer', mediaOptions, '全メディア', () => showStats());

    const performerOptions = [{ value: '', label: '全演者' }];
    if (eventData && eventData.performers) {
        eventData.performers.forEach(performer => {
            performerOptions.push({ value: performer, label: `🎤 ${performer}` });
        });
    }
    statsPerformerFilterSelect = initSearchableSelect('statsPerformerFilterContainer', performerOptions, '全演者', () => showStats());

    updateStatsMachineFilter();
    updateStatsDailyMachineFilter();
}

// 期間集計用機種フィルターを更新
function updateStatsMachineFilter() {
    const machineOptions = [{ value: '', label: '全機種' }];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });

    if (statsMachineFilterSelect) {
        statsMachineFilterSelect.updateOptions(machineOptions);
    } else {
        statsMachineFilterSelect = initSearchableSelect('statsMachineFilterContainer', machineOptions, '全機種', () => showStats());
    }
}

// 日別用機種フィルターを更新
function updateStatsDailyMachineFilter() {
    const machineOptions = [{ value: '', label: '全機種' }];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });

    if (statsDailyMachineFilterSelect) {
        statsDailyMachineFilterSelect.updateOptions(machineOptions);
    } else {
        statsDailyMachineFilterSelect = initSearchableSelect('statsDailyMachineFilterContainer', machineOptions, '全機種', () => showStats());
    }
}

function showStats() {
    if (statsMode === 'daily') {
        showDailyStats();
    } else {
        showPeriodStats();
    }
}

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

// 日付ナビゲーションのラベルを更新
function updateStatsDateLabel() {
    const dateSelect = document.getElementById('statsDateSelect');
    const dateLabel = document.getElementById('statsCurrentDateLabel');
    
    if (!dateSelect || !dateLabel) return;
    
    const selectedFile = dateSelect.value;
    if (selectedFile) {
        const formattedDate = formatDate(selectedFile);
        const dayOfWeek = getDayOfWeekName(getDayOfWeek(selectedFile));
        dateLabel.textContent = `${formattedDate}（${dayOfWeek}）`;
    } else {
        dateLabel.textContent = '-';
    }
}

// 前日に移動
function goToPrevStatsDate() {
    const dateSelect = document.getElementById('statsDateSelect');
    if (!dateSelect) return;
    
    const currentIndex = dateSelect.selectedIndex;
    if (currentIndex < dateSelect.options.length - 1) {
        dateSelect.selectedIndex = currentIndex + 1;
        updateStatsDateLabel();
        updateStatsDateNavButtons();
        showStats();
    }
}

// 翌日に移動
function goToNextStatsDate() {
    const dateSelect = document.getElementById('statsDateSelect');
    if (!dateSelect) return;
    
    const currentIndex = dateSelect.selectedIndex;
    if (currentIndex > 0) {
        dateSelect.selectedIndex = currentIndex - 1;
        updateStatsDateLabel();
        updateStatsDateNavButtons();
        showStats();
    }
}

// ナビゲーションボタンの有効/無効を更新
function updateStatsDateNavButtons() {
    const dateSelect = document.getElementById('statsDateSelect');
    const prevBtn = document.getElementById('statsPrevDate');
    const nextBtn = document.getElementById('statsNextDate');
    
    if (!dateSelect || !prevBtn || !nextBtn) return;
    
    const currentIndex = dateSelect.selectedIndex;
    const totalOptions = dateSelect.options.length;
    
    prevBtn.disabled = currentIndex >= totalOptions - 1;
    nextBtn.disabled = currentIndex <= 0;
}

async function showDailyStats() {
    const dateFile = document.getElementById('statsDateSelect')?.value;
    const selectedMachine = statsDailyMachineFilterSelect ? statsDailyMachineFilterSelect.getValue() : '';
    const sortBy = document.getElementById('statsSortBy')?.value || 'total_desc';
    const unitSuffixFilter = document.getElementById('statsUnitSuffixFilter')?.value || '';

    if (!dateFile) return;

    updateStatsDateLabel();
    updateStatsDateNavButtons();

    const data = await loadCSV(dateFile);
    if (!data) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    await loadEventData();
    const dateKey = getDateKeyFromFile(dateFile);
    const events = getEventsForDate(dateKey);
    
    const eventHtml = renderStatsEventBadges(events);

    if (selectedMachine) {
        showMachineDetail(data, selectedMachine, sortBy, unitSuffixFilter, eventHtml);
    } else {
        showAllStats(data, sortBy, 'daily', unitSuffixFilter, eventHtml);
    }
}

function showAllStats(data, sortBy, mode, unitSuffixFilter = '', eventHtml = '') {
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

    let machineResults = Object.entries(machineStats).map(([machine, stats]) => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            machine,
            count: stats.count,
            totalGames: stats.totalGames,
            avgGames: Math.round(stats.totalGames / stats.count),
            totalSa: stats.totalSa,
            avgSa: Math.round(stats.totalSa / stats.count),
            rate: rate,
            winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
        };
    });

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

    let unitResults = Object.values(unitStats).map(stats => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            machine: stats.machine,
            num: stats.num,
            count: stats.count,
            totalGames: stats.totalGames,
            avgGames: Math.round(stats.totalGames / stats.count),
            totalSa: stats.totalSa,
            avgSa: Math.round(stats.totalSa / stats.count),
            rate: rate,
            winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
        };
    });

    const sortFunc = getSortFunction(sortBy);
    machineResults.sort(sortFunc);
    unitResults.sort(sortFunc);

    const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / data.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    // 全体の機械割
    const totalRate = calculateMechanicalRate(totalGames, totalSa);
    const totalRateText = formatMechanicalRate(totalRate);
    const totalRateClass = getMechanicalRateClass(totalRate);

    const suffixStats = calculateSuffixStats(data);

    let html = `
        ${eventHtml}
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
                    <span class="stat-label">機械割</span>
                    <span class="stat-value ${totalRateClass}">${totalRateText}</span>
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
                            <th>機械割</th>
                            <th>勝率</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        machineResults.forEach(r => {
            const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
            const rateCls = getMechanicalRateClass(r.rate);
            const rateText = formatMechanicalRate(r.rate);
            html += `
                <tr>
                    <td>${r.machine}</td>
                    <td>${r.count}</td>
                    <td>${r.totalGames.toLocaleString()}</td>
                    <td>${r.avgGames.toLocaleString()}</td>
                    <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                    <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                    <td class="${rateCls}">${rateText}</td>
                    <td>${r.winRate}%</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
        html += renderSuffixStatsTable(suffixStats);

    } else {
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
                            <th>機械割</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        unitResults.forEach(r => {
            const saCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            const rateCls = getMechanicalRateClass(r.rate);
            const rateText = formatMechanicalRate(r.rate);
            html += `
                <tr>
                    <td>${r.machine}</td>
                    <td>${r.num}</td>
                    <td>${r.totalGames.toLocaleString()}</td>
                    <td class="${saCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                    <td class="${rateCls}">${rateText}</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
    }

    document.getElementById('statsContent').innerHTML = html;

    document.querySelectorAll('.stats-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            statsSubTab = btn.dataset.subtab;
            updateUnitSuffixFilterVisibility();
            showStats();
        });
    });

    updateUnitSuffixFilterVisibility();
}

function showMachineDetail(data, machine, sortBy, unitSuffixFilter = '', eventHtml = '') {
    let machineData = data.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    const suffixStats = calculateSuffixStats(machineData);
    const filteredData = filterByUnitSuffix(machineData, unitSuffixFilter);

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    // 機種の機械割
    const machineRate = calculateMechanicalRate(totalGames, totalSa);
    const machineRateText = formatMechanicalRate(machineRate);
    const machineRateClass = getMechanicalRateClass(machineRate);

    let sortedData = [...filteredData];
    if (sortBy.includes('desc')) {
        sortedData.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
    } else if (sortBy.includes('asc')) {
        sortedData.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
    }

    const filterLabel = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ表示）` : '';

    let html = `
        ${eventHtml}
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
                    <span class="stat-label">機械割</span>
                    <span class="stat-value ${machineRateClass}">${machineRateText}</span>
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
                        <th>機械割</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedData.forEach(row => {
        const sa = parseInt(row['差枚']) || 0;
        const games = parseInt(row['G数']) || 0;
        const rate = calculateMechanicalRate(games, sa);
        const saCls = sa > 0 ? 'plus' : sa < 0 ? 'minus' : '';
        const rateCls = getMechanicalRateClass(rate);
        const rateText = formatMechanicalRate(rate);
        html += `
            <tr>
                <td>${row['台番号']}</td>
                <td>${games.toLocaleString()}</td>
                <td class="${saCls}">${sa >= 0 ? '+' : ''}${sa.toLocaleString()}</td>
                <td class="${rateCls}">${rateText}</td>
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

    const eventFilterValue = statsEventFilterSelect ? statsEventFilterSelect.getValue() : '';
    const mediaFilterValue = statsMediaFilterSelect ? statsMediaFilterSelect.getValue() : '';
    const performerFilterValue = statsPerformerFilterSelect ? statsPerformerFilterSelect.getValue() : '';
    const selectedMachine = statsMachineFilterSelect ? statsMachineFilterSelect.getValue() : '';

    const sortBy = document.getElementById('statsPeriodSortBy')?.value || 'total_desc';
    const unitSuffixFilter = document.getElementById('statsPeriodUnitSuffixFilter')?.value || '';

    if (!startDate || !endDate) return;

    await loadEventData();

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

        if (!fileMatchesEventFilter(f, eventFilterValue, mediaFilterValue, performerFilterValue)) {
            return false;
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
    if (eventFilterValue === 'has_event') {
        filterLabels.push('イベント/演者あり');
    } else if (eventFilterValue === 'no_event') {
        filterLabels.push('イベント/演者なし');
    } else if (eventFilterValue && eventFilterValue.startsWith('type:')) {
        const typeId = eventFilterValue.replace('type:', '');
        const typeInfo = getEventTypeInfo(typeId);
        if (typeInfo) {
            filterLabels.push(`${typeInfo.icon} ${typeInfo.name}`);
        }
    } else if (eventFilterValue && eventFilterValue.startsWith('name:')) {
        const eventName = eventFilterValue.replace('name:', '');
        filterLabels.push(`📌 ${eventName}`);
    }
    if (mediaFilterValue) {
        filterLabels.push(mediaFilterValue);
    }
    if (performerFilterValue) {
        filterLabels.push(`🎤 ${performerFilterValue}`);
    }
    const filterLabel = filterLabels.length > 0 ? `（${filterLabels.join('・')}）` : '';

    const periodLabel = `${formatDate(targetFiles[0])} 〜 ${formatDate(targetFiles[targetFiles.length - 1])}（${targetFiles.length}日間）${filterLabel}`;

    const eventSummaryHtml = renderDetailedEventSummary(targetFiles);

    if (selectedMachine) {
        showPeriodMachineDetail(allData, selectedMachine, targetFiles, sortBy, periodLabel, unitSuffixFilter, eventSummaryHtml);
    } else {
        showPeriodAllStats(allData, targetFiles, sortBy, periodLabel, unitSuffixFilter, eventSummaryHtml);
    }
}

function showPeriodAllStats(allData, targetFiles, sortBy, periodLabel, unitSuffixFilter = '', eventSummaryHtml = '') {
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

    let machineResults = Object.entries(machineStats).map(([machine, stats]) => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            machine,
            count: stats.count,
            avgPerDay: (stats.count / targetFiles.length).toFixed(1),
            totalGames: stats.totalGames,
            avgGames: Math.round(stats.totalGames / stats.count),
            totalSa: stats.totalSa,
            avgSa: Math.round(stats.totalSa / stats.count),
            rate: rate,
            winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
        };
    });

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

    let unitResults = Object.values(unitStats).map(stats => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            machine: stats.machine,
            num: stats.num,
            count: stats.count,
            totalGames: stats.totalGames,
            avgGames: Math.round(stats.totalGames / stats.count),
            totalSa: stats.totalSa,
            avgSa: Math.round(stats.totalSa / stats.count),
            rate: rate,
            winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
        };
    });

    const sortFunc = getSortFunction(sortBy);
    machineResults.sort(sortFunc);
    unitResults.sort(sortFunc);

    const totalSa = allData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const totalGames = allData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const plusCount = allData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / allData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    // 全体の機械割
    const totalRate = calculateMechanicalRate(totalGames, totalSa);
    const totalRateText = formatMechanicalRate(totalRate);
    const totalRateClass = getMechanicalRateClass(totalRate);

    const suffixStats = calculateSuffixStats(allData);

    let html = `
        <div class="period-label">${periodLabel}</div>
        ${eventSummaryHtml}
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
                    <span class="stat-label">機械割</span>
                    <span class="stat-value ${totalRateClass}">${totalRateText}</span>
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
                            <th>機械割</th>
                            <th>勝率</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        machineResults.forEach(r => {
            const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
            const rateCls = getMechanicalRateClass(r.rate);
            const rateText = formatMechanicalRate(r.rate);
            html += `
                <tr>
                    <td>${r.machine}</td>
                    <td>${r.count}</td>
                    <td>${r.avgPerDay}</td>
                    <td>${r.totalGames.toLocaleString()}</td>
                    <td>${r.avgGames.toLocaleString()}</td>
                    <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                    <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                    <td class="${rateCls}">${rateText}</td>
                    <td>${r.winRate}%</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
        html += renderSuffixStatsTable(suffixStats);

    } else {
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
                            <th>機械割</th>
                            <th>勝率</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        unitResults.forEach(r => {
            const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
            const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
            const rateCls = getMechanicalRateClass(r.rate);
            const rateText = formatMechanicalRate(r.rate);
            html += `
                <tr>
                    <td>${r.machine}</td>
                    <td>${r.num}</td>
                    <td>${r.count}</td>
                    <td>${r.totalGames.toLocaleString()}</td>
                    <td>${r.avgGames.toLocaleString()}</td>
                    <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                    <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                    <td class="${rateCls}">${rateText}</td>
                    <td>${r.winRate}%</td>
                </tr>
            `;
        });
        html += '</tbody></table></div>';
    }

    document.getElementById('statsContent').innerHTML = html;

    document.querySelectorAll('.stats-sub-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            statsSubTab = btn.dataset.subtab;
            updateUnitSuffixFilterVisibility();
            showStats();
        });
    });

    updateUnitSuffixFilterVisibility();
}

function showPeriodMachineDetail(allData, machine, targetFiles, sortBy, periodLabel, unitSuffixFilter = '', eventSummaryHtml = '') {
    let machineData = allData.filter(row => row['機種名'] === machine);

    if (machineData.length === 0) {
        document.getElementById('statsContent').innerHTML = '<p>データがありません</p>';
        return;
    }

    const suffixStats = calculateSuffixStats(machineData);
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

    let results = Object.entries(unitStats).map(([num, stats]) => {
        const rate = calculateMechanicalRate(stats.totalGames, stats.totalSa);
        return {
            num,
            count: stats.count,
            totalGames: stats.totalGames,
            avgGames: Math.round(stats.totalGames / stats.count),
            totalSa: stats.totalSa,
            avgSa: Math.round(stats.totalSa / stats.count),
            rate: rate,
            winRate: ((stats.plusCount / stats.count) * 100).toFixed(1)
        };
    });

    results.sort(getSortFunction(sortBy));

    const totalGames = machineData.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
    const totalSa = machineData.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
    const plusCount = machineData.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
    const winRate = ((plusCount / machineData.length) * 100).toFixed(1);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    // 機種の機械割
    const machineRate = calculateMechanicalRate(totalGames, totalSa);
    const machineRateText = formatMechanicalRate(machineRate);
    const machineRateClass = getMechanicalRateClass(machineRate);

    const filterLabelUnit = unitSuffixFilter !== '' ? `（末尾${unitSuffixFilter}のみ表示）` : '';

    let html = `
        <div class="period-label">${periodLabel}</div>
        ${eventSummaryHtml}
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
                    <span class="stat-label">機械割</span>
                    <span class="stat-value ${machineRateClass}">${machineRateText}</span>
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
                        <th>機械割</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.forEach(r => {
        const totalCls = r.totalSa > 0 ? 'plus' : r.totalSa < 0 ? 'minus' : '';
        const avgCls = r.avgSa > 0 ? 'plus' : r.avgSa < 0 ? 'minus' : '';
        const rateCls = getMechanicalRateClass(r.rate);
        const rateText = formatMechanicalRate(r.rate);
        html += `
            <tr>
                <td>${r.num}</td>
                <td>${r.count}</td>
                <td>${r.totalGames.toLocaleString()}</td>
                <td>${r.avgGames.toLocaleString()}</td>
                <td class="${totalCls}">${r.totalSa >= 0 ? '+' : ''}${r.totalSa.toLocaleString()}</td>
                <td class="${avgCls}">${r.avgSa >= 0 ? '+' : ''}${r.avgSa.toLocaleString()}</td>
                <td class="${rateCls}">${rateText}</td>
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

    // 日別モード - 日付セレクト
    document.getElementById('statsDateSelect')?.addEventListener('change', () => {
        updateStatsDateLabel();
        updateStatsDateNavButtons();
        showStats();
    });
    
    // 日別モード - 前日/翌日ボタン
    document.getElementById('statsPrevDate')?.addEventListener('click', goToPrevStatsDate);
    document.getElementById('statsNextDate')?.addEventListener('click', goToNextStatsDate);
    
    // 日別モード - その他
    document.getElementById('statsSortBy')?.addEventListener('change', showStats);
    document.getElementById('statsUnitSuffixFilter')?.addEventListener('change', showStats);

    // 期間集計モード
    document.getElementById('statsPeriodStart')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodEnd')?.addEventListener('change', showStats);
    document.getElementById('statsDayOfWeek')?.addEventListener('change', showStats);
    document.getElementById('statsDateSuffix')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodSortBy')?.addEventListener('change', showStats);
    document.getElementById('statsPeriodUnitSuffixFilter')?.addEventListener('change', showStats);

    // 検索可能フィルターを初期化
    initStatsFilters();
    
    // 初期表示時に日付ラベルとボタン状態を更新
    setTimeout(() => {
        updateStatsDateLabel();
        updateStatsDateNavButtons();
    }, 100);

    // コピー・ダウンロードボタンのイベントリスナーを追加
    document.getElementById('copyStatsTableBtn')?.addEventListener('click', copyStatsTable);
    document.getElementById('downloadStatsCsvBtn')?.addEventListener('click', downloadStatsCSV);
}

// 統計テーブルのコピー
function copyStatsTable() {
    // statsContent内の最初のstats-tableを取得
    const table = document.querySelector('#statsContent .stats-table');
    if (!table) {
        showCopyToast('コピーするテーブルがありません', true);
        return;
    }
    const data = getTableData(table);
    const btn = document.getElementById('copyStatsTableBtn');
    copyToClipboard(data, btn);
}

// 統計テーブルのCSVダウンロード
function downloadStatsCSV() {
    const table = document.querySelector('#statsContent .stats-table');
    if (!table) {
        showCopyToast('ダウンロードするテーブルがありません', true);
        return;
    }
    const data = getTableData(table);
    
    // ファイル名を生成
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    let filename = '';
    
    if (statsMode === 'daily') {
        const dateSelect = document.getElementById('statsDateSelect');
        const selectedDate = dateSelect?.value?.replace('data/', '').replace('.csv', '') || today;
        const machine = statsDailyMachineFilterSelect ? statsDailyMachineFilterSelect.getValue() : '';
        filename = machine 
            ? `stats_daily_${selectedDate}_${machine}.csv`
            : `stats_daily_${selectedDate}.csv`;
    } else {
        const startDate = document.getElementById('statsPeriodStart')?.value?.replace('data/', '').replace('.csv', '') || '';
        const endDate = document.getElementById('statsPeriodEnd')?.value?.replace('data/', '').replace('.csv', '') || '';
        const machine = statsMachineFilterSelect ? statsMachineFilterSelect.getValue() : '';
        filename = machine
            ? `stats_period_${startDate}_${endDate}_${machine}.csv`
            : `stats_period_${startDate}_${endDate}.csv`;
    }
    
    downloadAsCSV(data, filename);
}