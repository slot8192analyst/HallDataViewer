// ===================
// 差枚トレンドタブ（フィルタ機能拡充版）
// ===================

let trendDataCache = null;
let trendLastParams = null;
let trendMachineFilterSelect = null;
let trendShowTotal = true;
let trendShowAvg = true;
let selectedTrendPositionFilter = '';

// selectedTrendDates は data.js で宣言済みなので、ここでは宣言しない

// アクティブなフィルター状態を管理
let activeTrendFilters = {
    dayOfWeek: [],
    suffix: [],
    special: [],
    events: [],
    dateRange: { start: '', end: '' }
};

// 日付のイベント・演者情報を取得してテキスト生成
function getTrendDateEventText(file) {
    const dateKey = file.match(/(\d{4}_\d{2}_\d{2})/)?.[1];
    if (!dateKey || !eventData || !eventData.events) return '';

    const events = getEventsForDate(dateKey);
    if (events.length === 0) return '';

    const displayItems = [];

    events.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name } = getEventDisplayName(event);
            if (name) {
                const shortName = name.length > 15 ? name.substring(0, 15) + '...' : name;
                displayItems.push(`${icon}${shortName}`);
            }
        }

        if (event.performers && event.performers.length > 0) {
            const performerText = event.performers.slice(0, 2).join(', ');
            const suffix = event.performers.length > 2 ? '...' : '';
            displayItems.push(`🎤${performerText}${suffix}`);
        }
    });

    if (displayItems.length === 0) return '';
    
    if (displayItems.length <= 2) {
        return displayItems.join(' / ');
    } else {
        return displayItems.slice(0, 2).join(' / ') + '...';
    }
}

// 日付がフィルター条件に一致するかチェック
function checkDateFilter(file, filterType, filterValue) {
    const parsed = parseDateFromFilename(file);
    if (!parsed) return false;

    const { year, month, day } = parsed;
    const dayOfWeek = getDayOfWeek(file);
    const dateKey = `${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}`;

    switch (filterType) {
        case 'suffix':
            return (day % 10) === parseInt(filterValue);
        
        case 'monthDay':
            return month === day;
        
        case 'doubleDigit':
            return day === 11 || day === 22 || day === 33;
        
        case 'dayOfWeek':
            return dayOfWeek === parseInt(filterValue);
        
        case 'hasEvent':
            const events = getEventsForDate(dateKey);
            return events.some(e => hasEventOrPerformers(e));
        
        case 'eventName':
            const eventsForName = getEventsForDate(dateKey);
            return eventsForName.some(e => {
                if (Array.isArray(e.name)) {
                    return e.name.includes(filterValue);
                }
                return e.name === filterValue;
            });
        
        case 'dateAfter':
            return getDateNumber(file) >= getDateNumber(filterValue);
        
        case 'dateBefore':
            return getDateNumber(file) <= getDateNumber(filterValue);
        
        default:
            return true;
    }
}

// フィルターに基づいて日付を選択（追加）
function applyTrendDateFilter(filterType, filterValue) {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        if (checkDateFilter(file, filterType, filterValue)) {
            cb.checked = true;
        }
    });
    
    updateTrendSelectionCount();
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

// クイック選択で日数分選択
function quickSelectDays(days) {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const targetFiles = sortedFiles.slice(0, days);
    
    checkboxes.forEach(cb => {
        cb.checked = targetFiles.includes(cb.value);
    });
    
    updateTrendSelectionCount();
}

// 日付を数値に変換（比較用）
function dateToNumber(year, month, day) {
    return year * 10000 + month * 100 + day;
}

// 期間選択フィルター適用
function applyDateRangeSelectFilter() {
    const startYear = document.getElementById('trendStartYear')?.value;
    const startMonth = document.getElementById('trendStartMonth')?.value;
    const startDay = document.getElementById('trendStartDay')?.value;
    const endYear = document.getElementById('trendEndYear')?.value;
    const endMonth = document.getElementById('trendEndMonth')?.value;
    const endDay = document.getElementById('trendEndDay')?.value;
    
    // 開始日の構築
    let startDate = null;
    if (startYear || startMonth || startDay) {
        const y = startYear ? parseInt(startYear) : 1900;
        const m = startMonth ? parseInt(startMonth) : 1;
        const d = startDay ? parseInt(startDay) : 1;
        startDate = dateToNumber(y, m, d);
    }
    
    // 終了日の構築
    let endDate = null;
    if (endYear || endMonth || endDay) {
        const y = endYear ? parseInt(endYear) : 9999;
        const m = endMonth ? parseInt(endMonth) : 12;
        const d = endDay ? parseInt(endDay) : 31;
        endDate = dateToNumber(y, m, d);
    }
    
    // 何も選択されていない場合
    if (startDate === null && endDate === null) {
        showCopyToast('開始日または終了日を指定してください', true);
        return;
    }
    
    // 開始日が終了日より後の場合
    if (startDate !== null && endDate !== null && startDate > endDate) {
        showCopyToast('開始日は終了日より前にしてください', true);
        return;
    }
    
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    let addedCount = 0;
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        const parsed = parseDateFromFilename(file);
        if (!parsed) return;
        
        const fileDate = dateToNumber(parsed.year, parsed.month, parsed.day);
        let matches = true;
        
        // 開始日チェック
        if (startDate !== null && fileDate < startDate) {
            matches = false;
        }
        
        // 終了日チェック
        if (endDate !== null && fileDate > endDate) {
            matches = false;
        }
        
        if (matches && !cb.checked) {
            cb.checked = true;
            addedCount++;
        }
    });
    
    updateTrendSelectionCount();
    
    if (addedCount > 0) {
        showCopyToast(`${addedCount}日を追加しました`);
    } else {
        showCopyToast('該当する日付がないか、既に選択済みです', true);
    }
}

// イベントでフィルター
function applyEventFilter(eventName) {
    applyTrendDateFilter('eventName', eventName);
}

// フィルターパネルのHTML生成
function renderTrendFilterPanel() {
    const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
    
    // 利用可能な年・月・日を収集
    const availableYears = new Set();
    const availableMonths = new Set();
    const availableDays = new Set();
    
    sortedFilesDesc.forEach(file => {
        const parsed = parseDateFromFilename(file);
        if (parsed) {
            availableYears.add(parsed.year);
            availableMonths.add(parsed.month);
            availableDays.add(parsed.day);
        }
    });
    
    // 年セレクトオプション生成（降順）
    const yearsArray = [...availableYears].sort((a, b) => b - a);
    const yearOptionsHtml = '<option value="">--</option>' + 
        yearsArray.map(year => `<option value="${year}">${year}年</option>`).join('');
    
    // 月セレクトオプション生成
    const monthOptionsHtml = '<option value="">--</option>' + 
        Array.from({length: 12}, (_, i) => i + 1).map(month => 
            `<option value="${month}">${month}月</option>`
        ).join('');
    
    // 日セレクトオプション生成
    const dayOptionsHtml = '<option value="">--</option>' + 
        Array.from({length: 31}, (_, i) => i + 1).map(day => 
            `<option value="${day}">${day}日</option>`
        ).join('');
    
    // 全イベント名を取得
    const allEvents = getAllEventNames();
    
    // イベントボタンHTML生成
    let eventButtonsHtml = '';
    if (allEvents.length > 0) {
        allEvents.slice(0, 20).forEach(eventName => {
            eventButtonsHtml += `<button class="event-filter-btn" data-event="${escapeHtml(eventName)}">${eventName}</button>`;
        });
        if (allEvents.length > 20) {
            eventButtonsHtml += `<span class="text-muted" style="padding: 4px 8px; font-size: 11px;">他${allEvents.length - 20}件...</span>`;
        }
    } else {
        eventButtonsHtml = '<span class="text-muted" style="padding: 8px; font-size: 12px;">イベントデータがありません</span>';
    }
    
    return `
        <div class="trend-filter-panel">
            <!-- クイック選択 -->
            <div class="trend-quick-select">
                <h4>⚡ クイック選択</h4>
                <div class="quick-select-row">
                    <label>直近</label>
                    <select id="trendQuickDays">
                        <option value="">日数を選択</option>
                        <option value="3">3日間</option>
                        <option value="5">5日間</option>
                        <option value="7">7日間</option>
                        <option value="10">10日間</option>
                        <option value="14">14日間</option>
                        <option value="30">30日間</option>
                    </select>
                    <button class="quick-select-btn" id="applyQuickDays">選択</button>
                </div>
            </div>
            
            <!-- 期間選択 -->
            <div class="date-range-section">
                <h4>📆 期間で選択</h4>
                
                <!-- 開始日 -->
                <div class="date-range-group">
                    <span class="date-range-label">開始日</span>
                    <div class="date-select-row">
                        <div class="date-select-item">
                            <select id="trendStartYear">${yearOptionsHtml}</select>
                        </div>
                        <div class="date-select-item">
                            <select id="trendStartMonth">${monthOptionsHtml}</select>
                        </div>
                        <div class="date-select-item">
                            <select id="trendStartDay">${dayOptionsHtml}</select>
                        </div>
                    </div>
                </div>
                
                <div class="date-range-separator">〜</div>
                
                <!-- 終了日 -->
                <div class="date-range-group">
                    <span class="date-range-label">終了日</span>
                    <div class="date-select-row">
                        <div class="date-select-item">
                            <select id="trendEndYear">${yearOptionsHtml}</select>
                        </div>
                        <div class="date-select-item">
                            <select id="trendEndMonth">${monthOptionsHtml}</select>
                        </div>
                        <div class="date-select-item">
                            <select id="trendEndDay">${dayOptionsHtml}</select>
                        </div>
                    </div>
                </div>
                
                <div class="date-range-actions">
                    <button class="date-range-apply-btn" id="applyDateRange">期間を選択</button>
                </div>
                
                <div class="date-select-hint">
                    ※ 開始日のみ指定で「以降」、終了日のみ指定で「以前」の日付を選択
                </div>
            </div>
            
            <!-- クイックフィルター -->
            <div class="trend-filter-section">
                <h4>📅 条件フィルター</h4>
                
                <!-- 曜日フィルター -->
                <div class="trend-filter-subsection">
                    <h5>曜日</h5>
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
                
                <!-- 日付末尾フィルター -->
                <div class="trend-filter-subsection">
                    <h5>日付末尾</h5>
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
                
                <!-- 特殊フィルター -->
                <div class="trend-filter-subsection">
                    <h5>特殊日</h5>
                    <div class="trend-filter-buttons">
                        <button class="trend-filter-btn trend-filter-special" data-filter="monthDay" data-value="true">月日ぞろ目</button>
                        <button class="trend-filter-btn trend-filter-special" data-filter="doubleDigit" data-value="true">日ぞろ目 (11,22)</button>
                        <button class="trend-filter-btn trend-filter-special" data-filter="hasEvent" data-value="true">イベントあり</button>
                    </div>
                </div>
            </div>
            
            <!-- イベントフィルター -->
            <div class="trend-filter-section">
                <h4>🎯 イベントで選択</h4>
                <div class="event-filter-list">
                    ${eventButtonsHtml}
                </div>
            </div>
            
            <!-- アクション -->
            <div class="trend-filter-actions">
                <span id="trendSelectionCount" class="trend-selection-count">0/0日選択中</span>
                <div class="trend-filter-action-buttons">
                    <button id="trendClearFilters" class="modal-btn">全てクリア</button>
                </div>
            </div>
        </div>
    `;
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// フィルターボタンのイベント設定
function setupTrendFilterButtons() {
    // 期間選択適用ボタン
    document.getElementById('applyDateRange')?.addEventListener('click', applyDateRangeSelectFilter);
    
    // 曜日・日付末尾・特殊フィルターボタン
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filterType = btn.dataset.filter;
            const filterValue = btn.dataset.value;

            btn.classList.toggle('active');

            if (btn.classList.contains('active')) {
                applyTrendDateFilter(filterType, filterValue);
            }
        });
    });

    // クイック選択ボタン
    document.getElementById('applyQuickDays')?.addEventListener('click', () => {
        const daysSelect = document.getElementById('trendQuickDays');
        if (daysSelect && daysSelect.value) {
            quickSelectDays(parseInt(daysSelect.value));
        }
    });

    // イベントフィルターボタン
    document.querySelectorAll('#trendFilterContainer .event-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const eventName = btn.dataset.event;
            btn.classList.toggle('active');
            
            if (btn.classList.contains('active')) {
                applyEventFilter(eventName);
            }
        });
    });

    // フィルタークリアボタン
    document.getElementById('trendClearFilters')?.addEventListener('click', () => {
        // 全てのフィルターボタンのactiveを解除
        document.querySelectorAll('#trendFilterContainer .trend-filter-btn.active, #trendFilterContainer .event-filter-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 全チェックを外す
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        // セレクトボックスをリセット
        const selects = [
            'trendQuickDays',
            'trendStartYear', 'trendStartMonth', 'trendStartDay',
            'trendEndYear', 'trendEndMonth', 'trendEndDay'
        ];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        updateTrendSelectionCount();
    });
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
            <input type="checkbox" id="trend-date-${file}" value="${file}">
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
    }
}

// 期間ラベルを更新
function updateTrendPeriodLabel() {
    const label = document.getElementById('trendPeriodLabel');
    if (!label) return;
    
    if (!selectedTrendDates || selectedTrendDates.length === 0) {
        label.textContent = '7日間（デフォルト）';
    } else if (selectedTrendDates.length === 1) {
        label.textContent = formatDate(selectedTrendDates[0]);
    } else {
        const sorted = sortFilesByDate(selectedTrendDates, false);
        const first = formatDateShort(sorted[0]);
        const last = formatDateShort(sorted[sorted.length - 1]);
        label.textContent = `${selectedTrendDates.length}日間 (${first}〜${last})`;
    }
}

// トレンド用機種フィルターを初期化（複数選択対応）- 修正版
function initTrendMachineFilter() {
    // 選択されている日付、またはデフォルトの直近7日間を取得
    let targetFiles = [];
    
    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = selectedTrendDates;
    } else {
        // デフォルトで直近7日間
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
    }
    
    // 最新日のデータから機種オプションを取得（台数順→50音順）
    const machineOptions = getMachineOptionsForLatestDate(targetFiles);

    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    } else {
        trendMachineFilterSelect = initMultiSelectMachineFilter(
            'trendMachineFilterContainer',
            machineOptions,
            '全機種',
            () => loadTrendData()
        );
    }
}

// 列表示設定の初期化
function initTrendColumnSettings() {
    const savedTotal = localStorage.getItem('trendShowTotal');
    const savedAvg = localStorage.getItem('trendShowAvg');
    
    trendShowTotal = savedTotal !== 'false';
    trendShowAvg = savedAvg !== 'false';
    
    const totalCheckbox = document.getElementById('trendShowTotal');
    const avgCheckbox = document.getElementById('trendShowAvg');
    
    if (totalCheckbox) totalCheckbox.checked = trendShowTotal;
    if (avgCheckbox) avgCheckbox.checked = trendShowAvg;
}

// 列表示設定の保存
function saveTrendColumnSettings() {
    localStorage.setItem('trendShowTotal', trendShowTotal);
    localStorage.setItem('trendShowAvg', trendShowAvg);
}

// loadTrendData 関数
async function loadTrendData() {
    const selectedMachines = trendMachineFilterSelect ? trendMachineFilterSelect.getSelectedValues() : [];
    const sortBy = document.getElementById('trendSortBy')?.value || 'total_desc';

    // 合計差枚フィルター
    const totalFilterType = document.getElementById('trendTotalFilterType')?.value || '';
    const totalFilterValue = document.getElementById('trendTotalFilterValue')?.value || '';

    // 列表示設定
    trendShowTotal = document.getElementById('trendShowTotal')?.checked ?? true;
    trendShowAvg = document.getElementById('trendShowAvg')?.checked ?? true;
    saveTrendColumnSettings();

    const summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;
    
    summaryEl.innerHTML = '<p>読み込み中...</p>';

    let targetFiles = [];

    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        // デフォルトで直近7日間
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
        targetFiles = sortFilesByDate(targetFiles, false);
    }

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        return;
    }

    // ★追加: 機種フィルターのオプションを更新（最新日の機種のみ、台数順）
    updateTrendMachineFilterOptions(targetFiles);

    const machineData = {};

    for (const file of targetFiles) {
        const data = dataCache[file];
        if (!data) continue;

        for (const row of data) {
            const machine = row['機種名'];
            const num = row['台番号'];
            
            // 機種フィルター
            if (selectedMachines.length > 0 && !selectedMachines.includes(machine)) continue;
            
            // 位置フィルター
            if (selectedTrendPositionFilter) {
                const tags = typeof getPositionTags === 'function' ? getPositionTags(num) : [];
                if (!tags.includes(selectedTrendPositionFilter)) continue;
            }

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

    // 合計差枚フィルターを適用
    if (totalFilterType && totalFilterValue) {
        const filterVal = parseInt(totalFilterValue);
        if (!isNaN(filterVal)) {
            if (totalFilterType === 'gte') {
                results = results.filter(item => item.total >= filterVal);
            } else if (totalFilterType === 'lte') {
                results = results.filter(item => item.total <= filterVal);
            }
        }
    }

    // ソート
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
        case 'machine_asc':
            results.sort((a, b) => {
                const nameCompare = compareJapanese(a.machine, b.machine);
                if (nameCompare !== 0) return nameCompare;
                return extractUnitNumber(a.num) - extractUnitNumber(b.num);
            });
            break;
        case 'machine_desc':
            results.sort((a, b) => {
                const nameCompare = compareJapanese(b.machine, a.machine);
                if (nameCompare !== 0) return nameCompare;
                return extractUnitNumber(a.num) - extractUnitNumber(b.num);
            });
            break;
        case 'unit_asc':
            results.sort((a, b) => {
                const numA = extractUnitNumber(a.num);
                const numB = extractUnitNumber(b.num);
                if (numA !== numB) return numA - numB;
                return compareJapanese(a.machine, b.machine);
            });
            break;
        case 'unit_desc':
            results.sort((a, b) => {
                const numA = extractUnitNumber(a.num);
                const numB = extractUnitNumber(b.num);
                if (numA !== numB) return numB - numA;
                return compareJapanese(a.machine, b.machine);
            });
            break;
    }

    const totalSa = results.reduce((sum, r) => sum + r.total, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    // 選択機種の表示
    let machineInfo = '';
    if (selectedMachines.length > 0) {
        machineInfo = ` | 機種: ${selectedMachines.length}機種選択中`;
    }

    // 位置フィルター情報
    let positionInfo = '';
    if (selectedTrendPositionFilter && typeof POSITION_TAGS !== 'undefined') {
        const tagInfo = POSITION_TAGS[selectedTrendPositionFilter];
        if (tagInfo) {
            positionInfo = ` | 位置: <span style="color: ${tagInfo.color}">${tagInfo.icon} ${tagInfo.label}</span>`;
        }
    }

    // フィルター情報の表示
    let filterInfo = '';
    if (totalFilterType && totalFilterValue) {
        const filterLabel = totalFilterType === 'gte' ? '以上' : '以下';
        filterInfo = ` | フィルター: 合計${parseInt(totalFilterValue).toLocaleString()}枚${filterLabel}`;
    }
    
    summaryEl.innerHTML = `
        表示: ${results.length}台 | 期間: ${targetFiles.length}日間${machineInfo}${positionInfo}${filterInfo} |
        合計差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
    `;

    renderTrendTables(results, targetFiles);

    // グラフ用にデータを保存
    window.trendDisplayData = { results, targetFiles };
    
    // グラフを描画
    if (typeof renderTrendChart === 'function') {
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
        renderTrendChart(results, targetFiles, {
            showTop,
            showBottom,
            displayCount
        });
    }
}

// トレンドフィルターパネルに位置フィルターを追加
function renderTrendPositionFilter() {
    const container = document.getElementById('trendFilterContent');
    if (!container) return;
    
    // getAllPositionTags が存在するか確認
    if (typeof getAllPositionTags !== 'function') return;
    
    let positionSection = container.querySelector('.trend-position-filter-section');
    
    if (!positionSection) {
        positionSection = document.createElement('div');
        positionSection.className = 'filter-section trend-position-filter-section';
        
        const firstSection = container.querySelector('.filter-section');
        if (firstSection) {
            firstSection.before(positionSection);
        } else {
            container.prepend(positionSection);
        }
    }
    
    const positionTags = getAllPositionTags();
    
    let html = '<h5>📍 位置フィルター</h5>';
    html += '<div class="position-filter">';
    html += `<button class="position-filter-btn ${selectedTrendPositionFilter === '' ? 'active' : ''}" data-position="" style="background: ${selectedTrendPositionFilter === '' ? 'var(--primary-color)' : ''}">全て</button>`;
    
    positionTags.forEach(tag => {
        const isActive = selectedTrendPositionFilter === tag.value;
        html += `<button class="position-filter-btn ${isActive ? 'active' : ''}" data-position="${tag.value}" style="${isActive ? `background: ${tag.color}; border-color: ${tag.color};` : `border-color: ${tag.color}40;`}">${tag.icon} ${tag.label}</button>`;
    });
    
    html += '</div>';
    positionSection.innerHTML = html;
    
    positionSection.querySelectorAll('.position-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedTrendPositionFilter = btn.dataset.position;
            renderTrendPositionFilter();
            loadTrendData();
        });
    });
}

function renderTrendTables(results, targetFiles) {
    const fixedThead = document.querySelector('#trend-fixed-table thead');
    const fixedTbody = document.querySelector('#trend-fixed-table tbody');
    const scrollThead = document.querySelector('#trend-scroll-table thead');
    const scrollTbody = document.querySelector('#trend-scroll-table tbody');

    if (!fixedThead || !fixedTbody || !scrollThead || !scrollTbody) return;

    fixedThead.innerHTML = '<tr><th>機種名</th><th>台番号</th><th>位置</th></tr>';

    let scrollHeaderCells = targetFiles.map(file => `<th>${formatDateShort(file)}</th>`).join('');
    if (trendShowTotal) scrollHeaderCells += '<th>合計</th>';
    if (trendShowAvg) scrollHeaderCells += '<th>平均</th>';
    scrollThead.innerHTML = `<tr>${scrollHeaderCells}</tr>`;

    const fixedRows = [];
    const scrollRows = [];

    for (const row of results) {
        const positionHtml = (typeof renderPositionTags === 'function') 
            ? (renderPositionTags(row.num, { compact: true }) || '-')
            : '-';
        
        fixedRows.push(`<tr><td>${row.machine}</td><td>${row.num}</td><td>${positionHtml}</td></tr>`);

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

        if (trendShowTotal) {
            const totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
            dateCells.push(`<td class="${totalCls}">${row.total >= 0 ? '+' : ''}${row.total.toLocaleString()}</td>`);
        }
        if (trendShowAvg) {
            const avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';
            dateCells.push(`<td class="${avgCls}">${row.avg >= 0 ? '+' : ''}${row.avg.toLocaleString()}</td>`);
        }

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

// トレンドテーブルのデータを取得
function getTrendTableData() {
    const fixedTable = document.getElementById('trend-fixed-table');
    const scrollTable = document.getElementById('trend-scroll-table');
    return getMergedTableData(fixedTable, scrollTable);
}

// トレンドテーブルのコピー
function copyTrendTable() {
    const data = getTrendTableData();
    const btn = document.getElementById('copyTrendTableBtn');
    copyToClipboard(data, btn);
}

// トレンドテーブルのCSVダウンロード
function downloadTrendCSV() {
    const data = getTrendTableData();
    
    if (data.rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    const days = (selectedTrendDates && selectedTrendDates.length) ? selectedTrendDates.length : 7;
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const filename = `trend_${days}days_${today}.csv`;
    
    downloadAsCSV(data, filename);
}

// フィルターリセット
function resetTrendFilters() {
    const totalFilterType = document.getElementById('trendTotalFilterType');
    const totalFilterValue = document.getElementById('trendTotalFilterValue');
    if (totalFilterType) totalFilterType.value = '';
    if (totalFilterValue) totalFilterValue.value = '';
    
    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.reset();
    }
    
    const totalCheckbox = document.getElementById('trendShowTotal');
    const avgCheckbox = document.getElementById('trendShowAvg');
    if (totalCheckbox) totalCheckbox.checked = true;
    if (avgCheckbox) avgCheckbox.checked = true;
    trendShowTotal = true;
    trendShowAvg = true;
    saveTrendColumnSettings();
    
    loadTrendData();
}

// デバウンス関数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// トレンドタブのイベントリスナー設定
function setupTrendEventListeners() {
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
        updateTrendPeriodLabel();
        closeTrendCalendarModal();
        loadTrendData();
    });

    window.addEventListener('resize', handleResize);

    // 機種フィルターの初期化
    initTrendMachineFilter();

    // 列表示設定の初期化
    initTrendColumnSettings();
    
    // 位置フィルターの描画
    renderTrendPositionFilter();

    // 列表示チェックボックスのイベント
    document.getElementById('trendShowTotal')?.addEventListener('change', loadTrendData);
    document.getElementById('trendShowAvg')?.addEventListener('change', loadTrendData);

    // 合計差枚フィルターのイベント
    document.getElementById('trendTotalFilterType')?.addEventListener('change', loadTrendData);
    document.getElementById('trendTotalFilterValue')?.addEventListener('input', debounce(loadTrendData, 500));

    // フィルターリセットボタン
    document.getElementById('resetTrendFilter')?.addEventListener('click', () => {
        resetTrendFilters();
        selectedTrendPositionFilter = '';
        renderTrendPositionFilter();
    });

    // コピー・ダウンロードボタン
    document.getElementById('copyTrendTableBtn')?.addEventListener('click', copyTrendTable);
    document.getElementById('downloadTrendCsvBtn')?.addEventListener('click', downloadTrendCSV);
    
    // 初期表示で期間ラベルを更新
    updateTrendPeriodLabel();
}

/**
 * 現在のトレンド表示データを取得
 */
function getTrendDisplayData() {
    return window.trendDisplayData || { results: [], targetFiles: [] };
}

function updateTrendMachineFilterOptions(targetFiles) {
    const machineOptions = getMachineOptionsForLatestDate(targetFiles);
    
    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    }
}