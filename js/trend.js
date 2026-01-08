// ===================
// 差枚トレンドタブ（検索可能セレクト対応版）
// ===================

let trendDataCache = null;
let trendLastParams = null;
let trendMachineFilterSelect = null;

// 日付のイベント・演者情報を取得してテキスト生成
function getTrendDateEventText(file) {
    const dateKey = file.match(/(\d{4}_\d{2}_\d{2})/)?.[1];
    if (!dateKey || !eventData || !eventData.events) return '';

    const events = eventData.events.filter(e => e.date === dateKey);
    if (events.length === 0) return '';

    const displayItems = [];

    events.forEach(event => {
        // イベント名を取得
        if (event.name) {
            let eventNames = [];
            if (Array.isArray(event.name)) {
                eventNames = event.name.filter(n => n && n.trim() !== '');
            } else if (event.name.trim() !== '') {
                eventNames = [event.name];
            }
            
            eventNames.forEach(name => {
                const typeInfo = eventData.eventTypes?.find(t => t.id === event.type);
                const icon = typeInfo ? typeInfo.icon : '📌';
                displayItems.push(`${icon}${name}`);
            });
        }

        // 演者情報を取得
        if (event.performers && event.performers.length > 0) {
            const performerText = event.performers.slice(0, 2).join(', ');
            const suffix = event.performers.length > 2 ? '...' : '';
            displayItems.push(`🎤${performerText}${suffix}`);
        }
    });

    if (displayItems.length === 0) return '';
    
    // 最大3つまで表示
    if (displayItems.length <= 3) {
        return displayItems.join(' / ');
    } else {
        return displayItems.slice(0, 3).join(' / ') + '...';
    }
}

// 日付がフィルター条件に一致するかチェック
function checkDateFilter(file, filterType, filterValue) {
    const parsed = parseDateFromFilename(file);
    if (!parsed) return false;

    const { year, month, day } = parsed;
    const dayOfWeek = getDayOfWeek(file);

    switch (filterType) {
        case 'suffix': // 日付末尾フィルタ (0-9)
            return (day % 10) === parseInt(filterValue);
        
        case 'monthDay': // 月日ぞろ目フィルタ (MM=DD)
            return month === day;
        
        case 'doubleDigit': // 日付ぞろ目フィルタ (11, 22, 33)
            return day === 11 || day === 22 || day === 33;
        
        case 'dayOfWeek': // 曜日フィルタ
            return dayOfWeek === parseInt(filterValue);
        
        case 'hasEvent': // イベントありフィルタ
            const dateKey = `${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}`;
            const events = getEventsForDate(dateKey);
            return events.some(e => hasStatsEventOrPerformers ? hasStatsEventOrPerformers(e) : (e.name || e.performers?.length > 0));
        
        default:
            return true;
    }
}

// フィルターに基づいて日付を選択
function applyTrendDateFilter(filterType, filterValue) {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        if (checkDateFilter(file, filterType, filterValue)) {
            cb.checked = true;
        }
    });
}

// フィルターに基づいて日付の選択を解除
function removeTrendDateFilter(filterType, filterValue) {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        if (checkDateFilter(file, filterType, filterValue)) {
            cb.checked = false;
        }
    });
}

// 選択数を更新
function updateTrendSelectionCount() {
    const total = document.querySelectorAll('#trendDateList input[type="checkbox"]').length;
    const checked = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked').length;
    const countEl = document.getElementById('trendSelectionCount');
    if (countEl) {
        countEl.textContent = `${checked}/${total}日選択中`;
    }
}

// フィルターパネルのHTML生成
function renderTrendFilterPanel() {
    return `
        <div class="trend-filter-panel">
            <div class="trend-filter-section">
                <h4>📅 クイックフィルター</h4>
                <div class="trend-filter-row">
                    <div class="trend-filter-group">
                        <label>曜日:</label>
                        <div class="trend-filter-buttons">
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="0">日</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="1">月</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="2">火</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="3">水</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="4">木</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="5">金</button>
                            <button class="trend-filter-btn" data-filter="dayOfWeek" data-value="6">土</button>
                        </div>
                    </div>
                </div>
                <div class="trend-filter-row">
                    <div class="trend-filter-group">
                        <label>日付末尾:</label>
                        <div class="trend-filter-buttons">
                            <button class="trend-filter-btn" data-filter="suffix" data-value="0">0</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="1">1</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="2">2</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="3">3</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="4">4</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="5">5</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="6">6</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="7">7</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="8">8</button>
                            <button class="trend-filter-btn" data-filter="suffix" data-value="9">9</button>
                        </div>
                    </div>
                </div>
                <div class="trend-filter-row">
                    <div class="trend-filter-group">
                        <label>特殊:</label>
                        <div class="trend-filter-buttons">
                            <button class="trend-filter-btn trend-filter-special" data-filter="monthDay" data-value="true">月日ぞろ目 (MM=DD)</button>
                            <button class="trend-filter-btn trend-filter-special" data-filter="doubleDigit" data-value="true">日ぞろ目 (11,22)</button>
                            <button class="trend-filter-btn trend-filter-special" data-filter="hasEvent" data-value="true">イベントあり</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="trend-filter-actions">
                <span id="trendSelectionCount" class="trend-selection-count">0/0日選択中</span>
                <button id="trendFilterSelectOnly" class="modal-btn" title="現在のフィルター条件のみを選択">フィルターのみ選択</button>
            </div>
        </div>
    `;
}

// 現在選択されているフィルターを取得
function getActiveFilters() {
    const activeFilters = [];
    document.querySelectorAll('.trend-filter-btn.active').forEach(btn => {
        activeFilters.push({
            type: btn.dataset.filter,
            value: btn.dataset.value
        });
    });
    return activeFilters;
}

// フィルターのみを選択
function selectOnlyFilteredDates() {
    const activeFilters = getActiveFilters();
    
    if (activeFilters.length === 0) {
        showCopyToast('フィルターを選択してください', true);
        return;
    }

    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        // すべてのアクティブフィルターのいずれかに一致するかチェック
        const matches = activeFilters.some(filter => 
            checkDateFilter(file, filter.type, filter.value)
        );
        cb.checked = matches;
    });

    updateTrendSelectionCount();
}

// フィルターボタンのイベント設定
function setupTrendFilterButtons() {
    document.querySelectorAll('.trend-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.filter;
            const filterValue = btn.dataset.value;

            // ボタンのアクティブ状態をトグル
            btn.classList.toggle('active');

            if (btn.classList.contains('active')) {
                // フィルターを適用（追加選択）
                applyTrendDateFilter(filterType, filterValue);
            } else {
                // フィルターを解除（選択解除）
                removeTrendDateFilter(filterType, filterValue);
            }

            updateTrendSelectionCount();
        });
    });

    // フィルターのみ選択ボタン
    document.getElementById('trendFilterSelectOnly')?.addEventListener('click', selectOnlyFilteredDates);
}

async function populateTrendDateList() {
    const container = document.getElementById('trendDateList');
    const filterContainer = document.getElementById('trendFilterContainer');
    if (!container) return;

    // イベントデータを読み込み
    await loadEventData();

    // フィルターパネルを追加
    if (filterContainer) {
        filterContainer.innerHTML = renderTrendFilterPanel();
        setupTrendFilterButtons();
    }

    const sortedFiles = sortFilesByDate(CSV_FILES, true);

    const fragment = document.createDocumentFragment();

    sortedFiles.forEach(file => {
        const dayOfWeek = getDayOfWeek(file);
        const dayName = getDayOfWeekName(dayOfWeek);
        let dayClass = '';
        if (dayOfWeek === 0) dayClass = 'sunday';
        if (dayOfWeek === 6) dayClass = 'saturday';

        // イベント・演者情報を取得
        const eventText = getTrendDateEventText(file);

        // 日付情報を取得
        const parsed = parseDateFromFilename(file);
        let dateInfo = '';
        if (parsed) {
            const isMonthDay = parsed.month === parsed.day;
            const isDoubleDigit = parsed.day === 11 || parsed.day === 22 || parsed.day === 33;
            if (isMonthDay) dateInfo += '<span class="date-tag month-day">月日ぞろ目</span>';
            if (isDoubleDigit) dateInfo += '<span class="date-tag double-digit">ぞろ目</span>';
        }

        const item = document.createElement('div');
        item.className = 'date-checkbox-item';
        
        let eventHtml = '';
        if (eventText) {
            eventHtml = `<span class="date-event-info">${eventText}</span>`;
        }

        item.innerHTML = `
            <input type="checkbox" id="trend-date-${file}" value="${file}" checked>
            <label for="trend-date-${file}">${formatDate(file)}</label>
            <span class="day-of-week ${dayClass}">(${dayName})</span>
            ${dateInfo}
            ${eventHtml}
        `;

        // チェックボックス変更時に選択数を更新
        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', updateTrendSelectionCount);

        fragment.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    // 選択数を更新
    updateTrendSelectionCount();
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
        // フィルターボタンのアクティブ状態をリセット
        document.querySelectorAll('.trend-filter-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });
    }
}

// トレンド用機種フィルターを初期化
function initTrendMachineFilter() {
    const machineOptions = [{ value: '', label: '全機種' }];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });

    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    } else {
        trendMachineFilterSelect = initSearchableSelect(
            'trendMachineFilterContainer',
            machineOptions,
            '全機種',
            () => loadTrendData()
        );
    }
}

async function loadTrendData() {
    const daysSelect = document.getElementById('trendDays');
    const machineFilter = trendMachineFilterSelect ? trendMachineFilterSelect.getValue() : '';
    const sortBy = document.getElementById('trendSortBy')?.value || 'total_desc';

    const summaryEl = document.getElementById('trendSummary');
    summaryEl.innerHTML = '<p>読み込み中...</p>';

    let targetFiles = [];

    if (daysSelect && daysSelect.value === 'custom' && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        const days = parseInt(daysSelect?.value) || 7;
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, days);
        targetFiles = sortFilesByDate(targetFiles, false);
    }

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        return;
    }

    const machineData = {};

    for (const file of targetFiles) {
        const data = dataCache[file];
        if (!data) continue;

        for (const row of data) {
            const machine = row['機種名'];
            const num = row['台番号'];
            if (machineFilter && machine !== machineFilter) continue;

            const key = `${machine}_${num}`;
            if (!machineData[key]) {
                machineData[key] = { machine, num, dates: {} };
            }
            machineData[key].dates[file] = parseInt(row['差枚']) || 0;
        }
    }

    let results = Object.values(machineData);

    for (const item of results) {
        const values = Object.values(item.dates);
        item.total = values.reduce((a, b) => a + b, 0);
        item.avg = values.length > 0 ? Math.round(item.total / values.length) : 0;
    }

    const latestFile = targetFiles[targetFiles.length - 1];
    switch (sortBy) {
        case 'total_desc':
            results.sort((a, b) => b.total - a.total);
            break;
        case 'total_asc':
            results.sort((a, b) => a.total - b.total);
            break;
        case 'avg_desc':
            results.sort((a, b) => b.avg - a.avg);
            break;
        case 'latest_desc':
            results.sort((a, b) => (b.dates[latestFile] || 0) - (a.dates[latestFile] || 0));
            break;
    }

    const totalSa = results.reduce((sum, r) => sum + r.total, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    summaryEl.innerHTML = `
        表示: ${results.length}台 | 期間: ${targetFiles.length}日間 |
        合計差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
    `;

    renderTrendTables(results, targetFiles);
}

function renderTrendTables(results, targetFiles) {
    const fixedThead = document.querySelector('#trend-fixed-table thead');
    const fixedTbody = document.querySelector('#trend-fixed-table tbody');

    const scrollThead = document.querySelector('#trend-scroll-table thead');
    const scrollTbody = document.querySelector('#trend-scroll-table tbody');

    fixedThead.innerHTML = '<tr><th>機種名</th><th>台番号</th></tr>';

    const scrollHeaderCells = targetFiles.map(file => `<th>${formatDateShort(file)}</th>`).join('');
    scrollThead.innerHTML = `<tr>${scrollHeaderCells}<th>合計</th><th>平均</th></tr>`;

    const fixedRows = [];
    const scrollRows = [];

    for (const row of results) {
        fixedRows.push(`<tr><td>${row.machine}</td><td>${row.num}</td></tr>`);

        const dateCells = [];
        for (const file of targetFiles) {
            const val = row.dates[file];
            if (val !== undefined) {
                const cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                dateCells.push(`<td class="${cls}">${val >= 0 ? '+' : ''}${val.toLocaleString()}</td>`);
            } else {
                dateCells.push('<td>-</td>');
            }
        }

        const totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
        const avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';

        dateCells.push(`<td class="${totalCls}">${row.total >= 0 ? '+' : ''}${row.total.toLocaleString()}</td>`);
        dateCells.push(`<td class="${avgCls}">${row.avg >= 0 ? '+' : ''}${row.avg.toLocaleString()}</td>`);

        scrollRows.push(`<tr>${dateCells.join('')}</tr>`);
    }

    fixedTbody.innerHTML = fixedRows.join('');
    scrollTbody.innerHTML = scrollRows.join('');

    requestAnimationFrame(() => {
        syncRowHeights();
    });
}

function syncRowHeights() {
    const fixedRows = document.querySelectorAll('#trend-fixed-table tbody tr');
    const scrollRows = document.querySelectorAll('#trend-scroll-table tbody tr');

    if (fixedRows.length === 0 || scrollRows.length === 0) return;

    const heights = [];

    for (let i = 0; i < fixedRows.length; i++) {
        if (scrollRows[i]) {
            heights.push(Math.max(fixedRows[i].offsetHeight, scrollRows[i].offsetHeight));
        }
    }

    for (let i = 0; i < heights.length; i++) {
        fixedRows[i].style.height = heights[i] + 'px';
        scrollRows[i].style.height = heights[i] + 'px';
    }

    const fixedHeader = document.querySelector('#trend-fixed-table thead tr');
    const scrollHeader = document.querySelector('#trend-scroll-table thead tr');
    if (fixedHeader && scrollHeader) {
        const maxHeight = Math.max(fixedHeader.offsetHeight, scrollHeader.offsetHeight);
        fixedHeader.style.height = maxHeight + 'px';
        scrollHeader.style.height = maxHeight + 'px';
    }
}

let resizeTimeout = null;
function handleResize() {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
        syncRowHeights();
    }, 100);
}

// トレンドテーブルのコピー
function copyTrendTable() {
    const fixedTable = document.getElementById('trend-fixed-table');
    const scrollTable = document.getElementById('trend-scroll-table');
    const data = getMergedTableData(fixedTable, scrollTable);
    const btn = document.getElementById('copyTrendTableBtn');
    copyToClipboard(data, btn);
}

// トレンドテーブルのCSVダウンロード
function downloadTrendCSV() {
    const fixedTable = document.getElementById('trend-fixed-table');
    const scrollTable = document.getElementById('trend-scroll-table');
    const data = getMergedTableData(fixedTable, scrollTable);
    
    // ファイル名を生成
    const daysSelect = document.getElementById('trendDays');
    const days = daysSelect?.value || '7';
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const filename = `trend_${days}days_${today}.csv`;
    
    downloadAsCSV(data, filename);
}

function setupTrendEventListeners() {
    document.getElementById('trendDays')?.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            selectedTrendDates = [];
        }
        loadTrendData();
    });

    document.getElementById('trendSortBy')?.addEventListener('change', loadTrendData);
    document.getElementById('loadTrend')?.addEventListener('click', loadTrendData);

    document.getElementById('openTrendCalendar')?.addEventListener('click', openTrendCalendarModal);
    document.getElementById('closeTrendCalendar')?.addEventListener('click', closeTrendCalendarModal);

    document.getElementById('trendCalendarModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'trendCalendarModal') {
            closeTrendCalendarModal();
        }
    });

    document.getElementById('selectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateTrendSelectionCount();
    });

    document.getElementById('deselectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateTrendSelectionCount();
    });

    document.getElementById('applyTrendDates')?.addEventListener('click', () => {
        selectedTrendDates = getSelectedTrendDates();
        document.getElementById('trendDays').value = 'custom';
        closeTrendCalendarModal();
        loadTrendData();
    });

    window.addEventListener('resize', handleResize);

    // 機種フィルターの初期化
    initTrendMachineFilter();

    // コピー・ダウンロードボタンのイベントリスナーを追加
    document.getElementById('copyTrendTableBtn')?.addEventListener('click', copyTrendTable);
    document.getElementById('downloadTrendCsvBtn')?.addEventListener('click', downloadTrendCSV);
}
