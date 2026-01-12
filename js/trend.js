// ===================
// 差枚トレンドタブ（大幅機能拡充版）
// ===================

let trendDataCache = null;
let trendLastParams = null;
let trendMachineFilterSelect = null;
let trendShowTotal = true;
let trendShowAvg = true;
let selectedTrendPositionFilter = '';

// 表示モード: 'unit' = 台別, 'machine' = 機種別
let trendViewMode = 'unit';
// 機種別表示時の値タイプ: 'total' = 総差枚, 'avg' = 平均差枚
let trendMachineValueType = 'total';

// フィルター条件の結合方式: 'and' または 'or'
let trendFilterLogic = 'or';

// アクティブなフィルター状態を管理
let activeTrendFilters = {
    dayOfWeek: [],
    suffix: [],
    special: [],
    events: [],
    dateRange: { start: null, end: null }
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
            return day === 11 || day === 22;
        
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
        
        default:
            return true;
    }
}

// 日付を数値に変換（比較用）
function dateToNumber(year, month, day) {
    return year * 10000 + month * 100 + day;
}

// ファイル名から日付数値を取得
function getFileDateNumber(file) {
    const parsed = parseDateFromFilename(file);
    if (!parsed) return 0;
    return dateToNumber(parsed.year, parsed.month, parsed.day);
}

// 期間フィルター（以降/以前）を適用
function applyDateRangeFilter() {
    const rangeType = document.getElementById('trendDateRangeType')?.value || '';
    const rangeYear = document.getElementById('trendRangeYear')?.value;
    const rangeMonth = document.getElementById('trendRangeMonth')?.value;
    const rangeDay = document.getElementById('trendRangeDay')?.value;
    
    if (!rangeType || (!rangeYear && !rangeMonth && !rangeDay)) {
        showCopyToast('期間タイプと日付を指定してください', true);
        return;
    }
    
    // 日付の構築
    const y = rangeYear ? parseInt(rangeYear) : (rangeType === 'after' ? 1900 : 9999);
    const m = rangeMonth ? parseInt(rangeMonth) : (rangeType === 'after' ? 1 : 12);
    const d = rangeDay ? parseInt(rangeDay) : (rangeType === 'after' ? 1 : 31);
    const targetDate = dateToNumber(y, m, d);
    
    // フィルター状態を更新
    activeTrendFilters.dateRange = {
        type: rangeType,
        year: rangeYear || null,
        month: rangeMonth || null,
        day: rangeDay || null,
        targetDate: targetDate
    };
    
    applyAllFilters();
}

// 条件フィルターを追加/削除
function toggleConditionFilter(filterType, filterValue) {
    let filterArray;
    
    switch (filterType) {
        case 'dayOfWeek':
            filterArray = activeTrendFilters.dayOfWeek;
            break;
        case 'suffix':
            filterArray = activeTrendFilters.suffix;
            break;
        case 'monthDay':
        case 'doubleDigit':
        case 'hasEvent':
            filterArray = activeTrendFilters.special;
            filterValue = filterType; // 特殊フィルターはタイプ名を値として使用
            break;
        case 'eventName':
            filterArray = activeTrendFilters.events;
            break;
        default:
            return;
    }
    
    const index = filterArray.indexOf(filterValue);
    if (index === -1) {
        filterArray.push(filterValue);
    } else {
        filterArray.splice(index, 1);
    }
    
    applyAllFilters();
}

// 全フィルターを適用して日付を選択
function applyAllFilters() {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    const logic = trendFilterLogic;
    
    // アクティブなフィルターがあるかチェック
    const hasDateRange = activeTrendFilters.dateRange.type;
    const hasDayOfWeek = activeTrendFilters.dayOfWeek.length > 0;
    const hasSuffix = activeTrendFilters.suffix.length > 0;
    const hasSpecial = activeTrendFilters.special.length > 0;
    const hasEvents = activeTrendFilters.events.length > 0;
    
    const hasAnyFilter = hasDateRange || hasDayOfWeek || hasSuffix || hasSpecial || hasEvents;
    
    if (!hasAnyFilter) {
        // フィルターがない場合は何もしない
        updateTrendSelectionCount();
        updateActiveFilterDisplay();
        return;
    }
    
    checkboxes.forEach(cb => {
        const file = cb.value;
        const parsed = parseDateFromFilename(file);
        if (!parsed) return;
        
        const fileDate = getFileDateNumber(file);
        const dayOfWeek = getDayOfWeek(file);
        const daySuffix = parsed.day % 10;
        const dateKey = `${parsed.year}_${String(parsed.month).padStart(2, '0')}_${String(parsed.day).padStart(2, '0')}`;
        
        let conditions = [];
        
        // 期間フィルター
        if (hasDateRange) {
            const range = activeTrendFilters.dateRange;
            if (range.type === 'after') {
                conditions.push(fileDate >= range.targetDate);
            } else if (range.type === 'before') {
                conditions.push(fileDate <= range.targetDate);
            }
        }
        
        // 曜日フィルター
        if (hasDayOfWeek) {
            const dayMatch = activeTrendFilters.dayOfWeek.some(d => parseInt(d) === dayOfWeek);
            conditions.push(dayMatch);
        }
        
        // 日付末尾フィルター
        if (hasSuffix) {
            const suffixMatch = activeTrendFilters.suffix.some(s => parseInt(s) === daySuffix);
            conditions.push(suffixMatch);
        }
        
        // 特殊フィルター
        if (hasSpecial) {
            const specialMatch = activeTrendFilters.special.some(special => {
                switch (special) {
                    case 'monthDay':
                        return parsed.month === parsed.day;
                    case 'doubleDigit':
                        return parsed.day === 11 || parsed.day === 22;
                    case 'hasEvent':
                        const events = getEventsForDate(dateKey);
                        return events.some(e => hasEventOrPerformers(e));
                    default:
                        return false;
                }
            });
            conditions.push(specialMatch);
        }
        
        // イベントフィルター
        if (hasEvents) {
            const eventsForDate = getEventsForDate(dateKey);
            const eventMatch = activeTrendFilters.events.some(eventName => {
                return eventsForDate.some(e => {
                    if (Array.isArray(e.name)) {
                        return e.name.includes(eventName);
                    }
                    return e.name === eventName;
                });
            });
            conditions.push(eventMatch);
        }
        
        // AND/OR ロジックで判定
        let matches;
        if (logic === 'and') {
            matches = conditions.every(c => c);
        } else {
            matches = conditions.some(c => c);
        }
        
        if (matches) {
            cb.checked = true;
        }
    });
    
    updateTrendSelectionCount();
    updateActiveFilterDisplay();
}

// アクティブなフィルター表示を更新
function updateActiveFilterDisplay() {
    const container = document.getElementById('activeFiltersDisplay');
    if (!container) return;
    
    const items = [];
    
    // 期間フィルター
    if (activeTrendFilters.dateRange.type) {
        const range = activeTrendFilters.dateRange;
        const typeLabel = range.type === 'after' ? '以降' : '以前';
        let dateStr = '';
        if (range.year) dateStr += range.year + '年';
        if (range.month) dateStr += range.month + '月';
        if (range.day) dateStr += range.day + '日';
        items.push(`📅 ${dateStr}${typeLabel}`);
    }
    
    // 曜日
    if (activeTrendFilters.dayOfWeek.length > 0) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayNames = activeTrendFilters.dayOfWeek.map(d => days[parseInt(d)]).join(',');
        items.push(`曜日: ${dayNames}`);
    }
    
    // 末尾
    if (activeTrendFilters.suffix.length > 0) {
        items.push(`末尾: ${activeTrendFilters.suffix.join(',')}`);
    }
    
    // 特殊
    if (activeTrendFilters.special.length > 0) {
        const specialLabels = {
            'monthDay': '月日ぞろ目',
            'doubleDigit': 'ぞろ目',
            'hasEvent': 'イベント有'
        };
        const labels = activeTrendFilters.special.map(s => specialLabels[s] || s).join(', ');
        items.push(labels);
    }
    
    // イベント
    if (activeTrendFilters.events.length > 0) {
        const eventText = activeTrendFilters.events.length <= 2 
            ? activeTrendFilters.events.join(', ')
            : activeTrendFilters.events.slice(0, 2).join(', ') + `...他${activeTrendFilters.events.length - 2}件`;
        items.push(`🎯 ${eventText}`);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<span class="no-filter">フィルターなし</span>';
    } else {
        const logicLabel = trendFilterLogic === 'and' ? 'AND' : 'OR';
        container.innerHTML = `
            <span class="filter-logic-badge">${logicLabel}</span>
            ${items.map(item => `<span class="active-filter-tag">${item}</span>`).join('')}
        `;
    }
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

// フィルターパネルのHTML生成
function renderTrendFilterPanel() {
    const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
    
    // 利用可能な年・月・日を収集
    const availableYears = new Set();
    
    sortedFilesDesc.forEach(file => {
        const parsed = parseDateFromFilename(file);
        if (parsed) {
            availableYears.add(parsed.year);
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
            const isActive = activeTrendFilters.events.includes(eventName) ? 'active' : '';
            eventButtonsHtml += `<button class="event-filter-btn ${isActive}" data-event="${escapeHtml(eventName)}">${eventName}</button>`;
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
            
            <!-- 期間フィルター（以降/以前） -->
            <div class="date-range-section">
                <h4>📆 期間フィルター</h4>
                <div class="date-range-type-row">
                    <select id="trendDateRangeType">
                        <option value="">タイプを選択</option>
                        <option value="after">以降</option>
                        <option value="before">以前</option>
                    </select>
                </div>
                <div class="date-select-row">
                    <div class="date-select-item">
                        <select id="trendRangeYear">${yearOptionsHtml}</select>
                    </div>
                    <div class="date-select-item">
                        <select id="trendRangeMonth">${monthOptionsHtml}</select>
                    </div>
                    <div class="date-select-item">
                        <select id="trendRangeDay">${dayOptionsHtml}</select>
                    </div>
                </div>
                <div class="date-select-hint">
                    ※ 年/月/日は部分指定可能（例: 2025年1月以降、5日以前など）
                </div>
            </div>
            
            <!-- AND/OR 切り替え -->
            <div class="filter-logic-section">
                <h4>🔗 条件の結合方式</h4>
                <div class="filter-logic-toggle">
                    <button class="logic-btn ${trendFilterLogic === 'or' ? 'active' : ''}" data-logic="or">
                        OR（いずれか一致）
                    </button>
                    <button class="logic-btn ${trendFilterLogic === 'and' ? 'active' : ''}" data-logic="and">
                        AND（すべて一致）
                    </button>
                </div>
                <div class="filter-logic-hint">
                    OR: 期間・曜日・末尾などいずれかに一致する日付を選択<br>
                    AND: すべての条件に一致する日付のみ選択
                </div>
            </div>
            
            <!-- 条件フィルター -->
            <div class="trend-filter-section">
                <h4>📅 条件フィルター</h4>
                
                <!-- 曜日フィルター -->
                <div class="trend-filter-subsection">
                    <h5>曜日</h5>
                    <div class="trend-filter-buttons" id="dayOfWeekFilters">
                        ${[0,1,2,3,4,5,6].map(d => {
                            const days = ['日', '月', '火', '水', '木', '金', '土'];
                            const isActive = activeTrendFilters.dayOfWeek.includes(String(d)) ? 'active' : '';
                            return `<button class="trend-filter-btn ${isActive}" data-filter="dayOfWeek" data-value="${d}">${days[d]}</button>`;
                        }).join('')}
                    </div>
                </div>
                
                <!-- 日付末尾フィルター -->
                <div class="trend-filter-subsection">
                    <h5>日付末尾</h5>
                    <div class="trend-filter-buttons" id="suffixFilters">
                        ${[0,1,2,3,4,5,6,7,8,9].map(s => {
                            const isActive = activeTrendFilters.suffix.includes(String(s)) ? 'active' : '';
                            return `<button class="trend-filter-btn ${isActive}" data-filter="suffix" data-value="${s}">${s}</button>`;
                        }).join('')}
                    </div>
                </div>
                
                <!-- 特殊フィルター -->
                <div class="trend-filter-subsection">
                    <h5>特殊日</h5>
                    <div class="trend-filter-buttons" id="specialFilters">
                        <button class="trend-filter-btn trend-filter-special ${activeTrendFilters.special.includes('monthDay') ? 'active' : ''}" data-filter="monthDay">月日ぞろ目</button>
                        <button class="trend-filter-btn trend-filter-special ${activeTrendFilters.special.includes('doubleDigit') ? 'active' : ''}" data-filter="doubleDigit">日ぞろ目 (11,22)</button>
                        <button class="trend-filter-btn trend-filter-special ${activeTrendFilters.special.includes('hasEvent') ? 'active' : ''}" data-filter="hasEvent">イベントあり</button>
                    </div>
                </div>
            </div>
            
            <!-- イベントフィルター -->
            <div class="trend-filter-section">
                <h4>🎯 イベントで選択</h4>
                <div class="event-filter-list" id="eventFilters">
                    ${eventButtonsHtml}
                </div>
            </div>
            
            <!-- フィルター適用ボタン -->
            <div class="filter-apply-section">
                <button class="filter-apply-btn" id="applyFiltersBtn">🔍 フィルターを適用</button>
            </div>
            
            <!-- アクティブフィルター表示 -->
            <div class="active-filters-section">
                <h5>適用中のフィルター</h5>
                <div id="activeFiltersDisplay" class="active-filters-display">
                    <span class="no-filter">フィルターなし</span>
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
    // 期間フィルター適用（セレクト変更時に自動適用せず、適用ボタンで）
    
    // AND/OR切り替え
    document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            trendFilterLogic = btn.dataset.logic;
        });
    });
    
    // 曜日・日付末尾フィルターボタン
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="dayOfWeek"], #trendFilterContainer .trend-filter-btn[data-filter="suffix"]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const filterType = btn.dataset.filter;
            const filterValue = btn.dataset.value;
            
            let filterArray = filterType === 'dayOfWeek' ? activeTrendFilters.dayOfWeek : activeTrendFilters.suffix;
            const index = filterArray.indexOf(filterValue);
            if (index === -1) {
                filterArray.push(filterValue);
            } else {
                filterArray.splice(index, 1);
            }
        });
    });
    
    // 特殊フィルターボタン
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="monthDay"], #trendFilterContainer .trend-filter-btn[data-filter="doubleDigit"], #trendFilterContainer .trend-filter-btn[data-filter="hasEvent"]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            const filterType = btn.dataset.filter;
            
            const index = activeTrendFilters.special.indexOf(filterType);
            if (index === -1) {
                activeTrendFilters.special.push(filterType);
            } else {
                activeTrendFilters.special.splice(index, 1);
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
            btn.classList.toggle('active');
            const eventName = btn.dataset.event;
            
            const index = activeTrendFilters.events.indexOf(eventName);
            if (index === -1) {
                activeTrendFilters.events.push(eventName);
            } else {
                activeTrendFilters.events.splice(index, 1);
            }
        });
    });
    
    // フィルター適用ボタン
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        // 期間フィルターの値を取得
        const rangeType = document.getElementById('trendDateRangeType')?.value || '';
        const rangeYear = document.getElementById('trendRangeYear')?.value;
        const rangeMonth = document.getElementById('trendRangeMonth')?.value;
        const rangeDay = document.getElementById('trendRangeDay')?.value;
        
        if (rangeType && (rangeYear || rangeMonth || rangeDay)) {
            const y = rangeYear ? parseInt(rangeYear) : (rangeType === 'after' ? 1900 : 9999);
            const m = rangeMonth ? parseInt(rangeMonth) : (rangeType === 'after' ? 1 : 12);
            const d = rangeDay ? parseInt(rangeDay) : (rangeType === 'after' ? 1 : 31);
            
            activeTrendFilters.dateRange = {
                type: rangeType,
                year: rangeYear || null,
                month: rangeMonth || null,
                day: rangeDay || null,
                targetDate: dateToNumber(y, m, d)
            };
        } else {
            activeTrendFilters.dateRange = { type: null };
        }
        
        applyAllFilters();
    });

    // フィルタークリアボタン
    document.getElementById('trendClearFilters')?.addEventListener('click', () => {
        // フィルター状態をリセット
        activeTrendFilters = {
            dayOfWeek: [],
            suffix: [],
            special: [],
            events: [],
            dateRange: { type: null }
        };
        
        // ボタンのactiveを解除
        document.querySelectorAll('#trendFilterContainer .trend-filter-btn.active, #trendFilterContainer .event-filter-btn.active, #trendFilterContainer .logic-btn.active').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // OR をデフォルトに
        trendFilterLogic = 'or';
        document.querySelector('#trendFilterContainer .logic-btn[data-logic="or"]')?.classList.add('active');
        
        // 全チェックを外す
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        // セレクトボックスをリセット
        const selects = [
            'trendQuickDays',
            'trendDateRangeType', 'trendRangeYear', 'trendRangeMonth', 'trendRangeDay'
        ];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        updateTrendSelectionCount();
        updateActiveFilterDisplay();
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
            const isDoubleDigit = parsed.day === 11 || parsed.day === 22;
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
    updateActiveFilterDisplay();
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

// トレンド用機種フィルターを初期化（複数選択対応）
function initTrendMachineFilter() {
    let targetFiles = [];
    
    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = selectedTrendDates;
    } else {
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
    }
    
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
    
    // 表示モード
    trendViewMode = document.getElementById('trendViewMode')?.value || 'unit';
    trendMachineValueType = document.getElementById('trendMachineValueType')?.value || 'total';

    const summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;
    
    summaryEl.innerHTML = '<p>読み込み中...</p>';

    let targetFiles = [];

    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
        targetFiles = sortFilesByDate(targetFiles, false);
    }

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        return;
    }

    updateTrendMachineFilterOptions(targetFiles);

    // 表示モードに応じてデータを処理
    if (trendViewMode === 'machine') {
        await loadTrendDataByMachine(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue);
    } else {
        await loadTrendDataByUnit(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue);
    }
}

// 台別トレンドデータ読み込み（従来の処理）
async function loadTrendDataByUnit(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue) {
    const machineData = {};

    for (const file of targetFiles) {
        const data = dataCache[file];
        if (!data) continue;

        for (const row of data) {
            const machine = row['機種名'];
            const num = row['台番号'];
            
            if (selectedMachines.length > 0 && !selectedMachines.includes(machine)) continue;
            
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
    results = sortTrendResults(results, sortBy, latestFile);

    renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue);
    renderTrendTables(results, targetFiles);
    renderTrendChartData(results, targetFiles, 'unit');
}

// 機種別トレンドデータ読み込み
async function loadTrendDataByMachine(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue) {
    const machineData = {};

    for (const file of targetFiles) {
        const data = dataCache[file];
        if (!data) continue;

        for (const row of data) {
            const machine = row['機種名'];
            const num = row['台番号'];
            
            if (selectedMachines.length > 0 && !selectedMachines.includes(machine)) continue;
            
            if (selectedTrendPositionFilter) {
                const tags = typeof getPositionTags === 'function' ? getPositionTags(num) : [];
                if (!tags.includes(selectedTrendPositionFilter)) continue;
            }

            if (!machineData[machine]) {
                machineData[machine] = { 
                    machine, 
                    dates: {},
                    unitCounts: {} // 各日の台数
                };
            }
            
            if (!machineData[machine].dates[file]) {
                machineData[machine].dates[file] = 0;
                machineData[machine].unitCounts[file] = 0;
            }
            
            machineData[machine].dates[file] += parseInt(row['差枚']) || 0;
            machineData[machine].unitCounts[file]++;
        }
    }

    let results = Object.values(machineData);

    for (const item of results) {
        const values = Object.values(item.dates);
        item.total = values.reduce((a, b) => a + b, 0);
        
        // 平均差枚を計算（延べ台数で割る）
        const totalUnits = Object.values(item.unitCounts).reduce((a, b) => a + b, 0);
        item.avg = totalUnits > 0 ? Math.round(item.total / totalUnits) : 0;
        
        // 各日の平均差枚も計算
        item.dailyAvg = {};
        for (const file of targetFiles) {
            const unitCount = item.unitCounts[file] || 0;
            const dayTotal = item.dates[file] || 0;
            item.dailyAvg[file] = unitCount > 0 ? Math.round(dayTotal / unitCount) : null;
        }
        
        item.num = `${totalUnits}台`; // 表示用
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
    results = sortTrendResults(results, sortBy, latestFile);

    renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, true);
    renderTrendTablesByMachine(results, targetFiles);
    renderTrendChartData(results, targetFiles, 'machine');
}

// トレンド結果のソート
function sortTrendResults(results, sortBy, latestFile) {
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
    return results;
}

// サマリー表示
function renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, isMachineMode = false) {
    const summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;
    
    const totalSa = results.reduce((sum, r) => sum + r.total, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    let machineInfo = '';
    if (selectedMachines.length > 0) {
        machineInfo = ` | 機種: ${selectedMachines.length}機種選択中`;
    }

    let positionInfo = '';
    if (selectedTrendPositionFilter && typeof POSITION_TAGS !== 'undefined') {
        const tagInfo = POSITION_TAGS[selectedTrendPositionFilter];
        if (tagInfo) {
            positionInfo = ` | 位置: <span style="color: ${tagInfo.color}">${tagInfo.icon} ${tagInfo.label}</span>`;
        }
    }

    let filterInfo = '';
    if (totalFilterType && totalFilterValue) {
        const filterLabel = totalFilterType === 'gte' ? '以上' : '以下';
        filterInfo = ` | フィルター: 合計${parseInt(totalFilterValue).toLocaleString()}枚${filterLabel}`;
    }
    
    const modeLabel = isMachineMode ? '機種' : '台';
    
    summaryEl.innerHTML = `
        表示: ${results.length}${modeLabel} | 期間: ${targetFiles.length}日間${machineInfo}${positionInfo}${filterInfo} |
        合計差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
    `;
}

// トレンドテーブル描画（台別）
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

// トレンドテーブル描画（機種別）
function renderTrendTablesByMachine(results, targetFiles) {
    const fixedThead = document.querySelector('#trend-fixed-table thead');
    const fixedTbody = document.querySelector('#trend-fixed-table tbody');
    const scrollThead = document.querySelector('#trend-scroll-table thead');
    const scrollTbody = document.querySelector('#trend-scroll-table tbody');

    if (!fixedThead || !fixedTbody || !scrollThead || !scrollTbody) return;

    // 機種別の場合は位置列なし
    fixedThead.innerHTML = '<tr><th>機種名</th><th>延べ台数</th></tr>';

    // 値タイプに応じたラベル
    const valueLabel = trendMachineValueType === 'avg' ? '平均' : '合計';
    
    let scrollHeaderCells = targetFiles.map(file => `<th>${formatDateShort(file)}</th>`).join('');
    if (trendShowTotal) scrollHeaderCells += `<th>${valueLabel === '平均' ? '全体平均' : '総合計'}</th>`;
    if (trendShowAvg && trendMachineValueType === 'total') scrollHeaderCells += '<th>台平均</th>';
    scrollThead.innerHTML = `<tr>${scrollHeaderCells}</tr>`;

    const fixedRows = [];
    const scrollRows = [];

    for (const row of results) {
        fixedRows.push(`<tr><td>${row.machine}</td><td>${row.num}</td></tr>`);

        const dateCells = [];
        for (const file of targetFiles) {
            let val;
            if (trendMachineValueType === 'avg') {
                val = row.dailyAvg[file];
            } else {
                val = row.dates[file];
            }
            
            if (val !== undefined && val !== null) {
                const cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                dateCells.push(`<td class="${cls}">${val >= 0 ? '+' : ''}${val.toLocaleString()}</td>`);
            } else {
                dateCells.push('<td>-</td>');
            }
        }

        if (trendShowTotal) {
            const displayVal = trendMachineValueType === 'avg' ? row.avg : row.total;
            const totalCls = displayVal > 0 ? 'plus' : displayVal < 0 ? 'minus' : '';
            dateCells.push(`<td class="${totalCls}">${displayVal >= 0 ? '+' : ''}${displayVal.toLocaleString()}</td>`);
        }
        if (trendShowAvg && trendMachineValueType === 'total') {
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

// グラフ用データを準備して描画
function renderTrendChartData(results, targetFiles, mode) {
    window.trendDisplayData = { results, targetFiles, mode };
    
    if (typeof renderTrendChart === 'function') {
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
        renderTrendChart(results, targetFiles, {
            showTop,
            showBottom,
            displayCount,
            mode,
            valueType: mode === 'machine' ? trendMachineValueType : 'total'
        });
    }
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

// トレンドフィルターパネルに位置フィルターを追加
function renderTrendPositionFilter() {
    const container = document.getElementById('trendFilterContent');
    if (!container) return;
    
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

// テーブルデータ取得
function getTrendTableData() {
    const fixedTable = document.getElementById('trend-fixed-table');
    const scrollTable = document.getElementById('trend-scroll-table');
    return getMergedTableData(fixedTable, scrollTable);
}

// コピー
function copyTrendTable() {
    const data = getTrendTableData();
    const btn = document.getElementById('copyTrendTableBtn');
    copyToClipboard(data, btn);
}

// CSVダウンロード
function downloadTrendCSV() {
    const data = getTrendTableData();
    
    if (data.rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    const days = (selectedTrendDates && selectedTrendDates.length) ? selectedTrendDates.length : 7;
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    const modeLabel = trendViewMode === 'machine' ? 'machine' : 'unit';
    const filename = `trend_${modeLabel}_${days}days_${today}.csv`;
    
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

// イベントリスナー設定
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

    initTrendMachineFilter();
    initTrendColumnSettings();
    renderTrendPositionFilter();

    document.getElementById('trendShowTotal')?.addEventListener('change', loadTrendData);
    document.getElementById('trendShowAvg')?.addEventListener('change', loadTrendData);
    
    // 表示モード切り替え
    document.getElementById('trendViewMode')?.addEventListener('change', loadTrendData);
    document.getElementById('trendMachineValueType')?.addEventListener('change', () => {
    loadTrendData(); // これでグラフも更新される
});

    document.getElementById('trendTotalFilterType')?.addEventListener('change', loadTrendData);
    document.getElementById('trendTotalFilterValue')?.addEventListener('input', debounce(loadTrendData, 500));

    document.getElementById('resetTrendFilter')?.addEventListener('click', () => {
        resetTrendFilters();
        selectedTrendPositionFilter = '';
        renderTrendPositionFilter();
    });

    document.getElementById('copyTrendTableBtn')?.addEventListener('click', copyTrendTable);
    document.getElementById('downloadTrendCsvBtn')?.addEventListener('click', downloadTrendCSV);
    
    updateTrendPeriodLabel();
}

function getTrendDisplayData() {
    return window.trendDisplayData || { results: [], targetFiles: [], mode: 'unit' };
}

function updateTrendMachineFilterOptions(targetFiles) {
    const machineOptions = getMachineOptionsForLatestDate(targetFiles);
    
    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    }
}
