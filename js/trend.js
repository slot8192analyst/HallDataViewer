// ===================
// 差枚トレンドタブ
// ===================

var trendDataCache = null;
var trendLastParams = null;
var trendMachineFilterSelect = null;
var trendShowTotal = true;
var trendShowAvg = true;
var trendShowPrevTotal = false;
var trendShowChart = true;

// 表示モード: 'unit' = 台別, 'machine' = 機種別
var trendViewMode = 'unit';
// 値タイプ: 'total' = 総差枚, 'avg' = 平均差枚, 'winrate' = 勝率
var trendMachineValueType = 'total';

// フィルター条件の結合方式: 'and' または 'or'
var trendFilterLogic = 'or';

// アクティブなフィルター状態を管理
var activeTrendFilters = {
    dayOfWeek: [],
    suffix: [],
    special: [],
    events: [],
    dateRange: { start: null, end: null }
};

// ===================
// 位置フィルター（複数選択対応）
// ===================

function renderTrendPositionFilter() {
    var container = document.getElementById('trendFilterContent');
    if (!container) return;
    
    // 既存の位置フィルターセクションを削除
    var existingSection = container.querySelector('.trend-position-filter-section');
    if (existingSection) {
        existingSection.remove();
    }
    
    // 新しいセクションを作成
    var section = document.createElement('div');
    section.className = 'filter-section trend-position-filter-section';
    section.innerHTML = '<h5>📍 位置フィルター</h5>' + renderMultiPositionFilter('trend', function() {
        renderTrendPositionFilter();
        loadTrendData();
    });
    
    // 最初のフィルターセクションの前に挿入
    var firstSection = container.querySelector('.filter-section');
    if (firstSection) {
        firstSection.before(section);
    } else {
        container.prepend(section);
    }
    
    // イベントリスナーを設定
    setupMultiPositionFilterEvents('trend', function() {
        renderTrendPositionFilter();
        loadTrendData();
    });
}

// ===================
// 日付イベント情報
// ===================

// 日付のイベント・演者情報を取得してテキスト生成
function getTrendDateEventText(file) {
    var dateKey = file.match(/(\d{4}_\d{2}_\d{2})/);
    dateKey = dateKey ? dateKey[1] : null;
    if (!dateKey || !eventData || !eventData.events) return '';

    var events = getEventsForDate(dateKey);
    if (events.length === 0) return '';

    var displayItems = [];

    events.forEach(function(event) {
        if (isValidEvent(event)) {
            var displayInfo = getEventDisplayName(event);
            if (displayInfo.name) {
                var shortName = displayInfo.name.length > 15 ? displayInfo.name.substring(0, 15) + '...' : displayInfo.name;
                displayItems.push(displayInfo.icon + shortName);
            }
        }

        if (event.performers && event.performers.length > 0) {
            var performerText = event.performers.slice(0, 2).join(', ');
            var suffix = event.performers.length > 2 ? '...' : '';
            displayItems.push('🎤' + performerText + suffix);
        }
    });

    if (displayItems.length === 0) return '';
    
    if (displayItems.length <= 2) {
        return displayItems.join(' / ');
    } else {
        return displayItems.slice(0, 2).join(' / ') + '...';
    }
}

// ===================
// 日付フィルター関連
// ===================

// 日付がフィルター条件に一致するかチェック
function checkDateFilter(file, filterType, filterValue) {
    var parsed = parseDateFromFilename(file);
    if (!parsed) return false;

    var year = parsed.year;
    var month = parsed.month;
    var day = parsed.day;
    var dayOfWeek = getDayOfWeek(file);
    var dateKey = year + '_' + String(month).padStart(2, '0') + '_' + String(day).padStart(2, '0');

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
            var events = getEventsForDate(dateKey);
            return events.some(function(e) { return hasEventOrPerformers(e); });
        
        case 'eventName':
            var eventsForName = getEventsForDate(dateKey);
            return eventsForName.some(function(e) {
                if (Array.isArray(e.name)) {
                    return e.name.indexOf(filterValue) !== -1;
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
    var parsed = parseDateFromFilename(file);
    if (!parsed) return 0;
    return dateToNumber(parsed.year, parsed.month, parsed.day);
}

// 期間フィルター（以降/以前）を適用
function applyDateRangeFilter() {
    var rangeType = document.getElementById('trendDateRangeType');
    rangeType = rangeType ? rangeType.value : '';
    var rangeYear = document.getElementById('trendRangeYear');
    rangeYear = rangeYear ? rangeYear.value : '';
    var rangeMonth = document.getElementById('trendRangeMonth');
    rangeMonth = rangeMonth ? rangeMonth.value : '';
    var rangeDay = document.getElementById('trendRangeDay');
    rangeDay = rangeDay ? rangeDay.value : '';
    
    if (!rangeType || (!rangeYear && !rangeMonth && !rangeDay)) {
        showCopyToast('期間タイプと日付を指定してください', true);
        return;
    }
    
    var y = rangeYear ? parseInt(rangeYear) : (rangeType === 'after' ? 1900 : 9999);
    var m = rangeMonth ? parseInt(rangeMonth) : (rangeType === 'after' ? 1 : 12);
    var d = rangeDay ? parseInt(rangeDay) : (rangeType === 'after' ? 1 : 31);
    var targetDate = dateToNumber(y, m, d);
    
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
    var filterArray;
    
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
            filterValue = filterType;
            break;
        case 'eventName':
            filterArray = activeTrendFilters.events;
            break;
        default:
            return;
    }
    
    var index = filterArray.indexOf(filterValue);
    if (index === -1) {
        filterArray.push(filterValue);
    } else {
        filterArray.splice(index, 1);
    }
    
    applyAllFilters();
}

// 全フィルターを適用して日付を選択
function applyAllFilters() {
    var checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    var logic = trendFilterLogic;
    
    var hasDateRange = activeTrendFilters.dateRange.type;
    var hasDayOfWeek = activeTrendFilters.dayOfWeek.length > 0;
    var hasSuffix = activeTrendFilters.suffix.length > 0;
    var hasSpecial = activeTrendFilters.special.length > 0;
    var hasEvents = activeTrendFilters.events.length > 0;
    
    var hasAnyFilter = hasDateRange || hasDayOfWeek || hasSuffix || hasSpecial || hasEvents;
    
    if (!hasAnyFilter) {
        updateTrendSelectionCount();
        updateActiveFilterDisplay();
        return;
    }
    
    checkboxes.forEach(function(cb) {
        var file = cb.value;
        var parsed = parseDateFromFilename(file);
        if (!parsed) return;
        
        var fileDate = getFileDateNumber(file);
        var dayOfWeek = getDayOfWeek(file);
        var daySuffix = parsed.day % 10;
        var dateKey = parsed.year + '_' + String(parsed.month).padStart(2, '0') + '_' + String(parsed.day).padStart(2, '0');
        
        var conditions = [];
        
        if (hasDateRange) {
            var range = activeTrendFilters.dateRange;
            if (range.type === 'after') {
                conditions.push(fileDate >= range.targetDate);
            } else if (range.type === 'before') {
                conditions.push(fileDate <= range.targetDate);
            }
        }
        
        if (hasDayOfWeek) {
            var dayMatch = activeTrendFilters.dayOfWeek.some(function(d) {
                return parseInt(d) === dayOfWeek;
            });
            conditions.push(dayMatch);
        }
        
        if (hasSuffix) {
            var suffixMatch = activeTrendFilters.suffix.some(function(s) {
                return parseInt(s) === daySuffix;
            });
            conditions.push(suffixMatch);
        }
        
        if (hasSpecial) {
            var specialMatch = activeTrendFilters.special.some(function(special) {
                switch (special) {
                    case 'monthDay':
                        return parsed.month === parsed.day;
                    case 'doubleDigit':
                        return parsed.day === 11 || parsed.day === 22;
                    case 'hasEvent':
                        var events = getEventsForDate(dateKey);
                        return events.some(function(e) { return hasEventOrPerformers(e); });
                    default:
                        return false;
                }
            });
            conditions.push(specialMatch);
        }
        
        if (hasEvents) {
            var eventsForDate = getEventsForDate(dateKey);
            var eventMatch = activeTrendFilters.events.some(function(eventName) {
                return eventsForDate.some(function(e) {
                    if (Array.isArray(e.name)) {
                        return e.name.indexOf(eventName) !== -1;
                    }
                    return e.name === eventName;
                });
            });
            conditions.push(eventMatch);
        }
        
        var matches;
        if (logic === 'and') {
            matches = conditions.every(function(c) { return c; });
        } else {
            matches = conditions.some(function(c) { return c; });
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
    var container = document.getElementById('activeFiltersDisplay');
    if (!container) return;
    
    var items = [];
    
    if (activeTrendFilters.dateRange.type) {
        var range = activeTrendFilters.dateRange;
        var typeLabel = range.type === 'after' ? '以降' : '以前';
        var dateStr = '';
        if (range.year) dateStr += range.year + '年';
        if (range.month) dateStr += range.month + '月';
        if (range.day) dateStr += range.day + '日';
        items.push('📅 ' + dateStr + typeLabel);
    }
    
    if (activeTrendFilters.dayOfWeek.length > 0) {
        var days = ['日', '月', '火', '水', '木', '金', '土'];
        var dayNames = activeTrendFilters.dayOfWeek.map(function(d) {
            return days[parseInt(d)];
        }).join(',');
        items.push('曜日: ' + dayNames);
    }
    
    if (activeTrendFilters.suffix.length > 0) {
        items.push('末尾: ' + activeTrendFilters.suffix.join(','));
    }
    
    if (activeTrendFilters.special.length > 0) {
        var specialLabels = {
            'monthDay': '月日ぞろ目',
            'doubleDigit': 'ぞろ目',
            'hasEvent': 'イベント有'
        };
        var labels = activeTrendFilters.special.map(function(s) {
            return specialLabels[s] || s;
        }).join(', ');
        items.push(labels);
    }
    
    if (activeTrendFilters.events.length > 0) {
        var eventText = activeTrendFilters.events.length <= 2 
            ? activeTrendFilters.events.join(', ')
            : activeTrendFilters.events.slice(0, 2).join(', ') + '...他' + (activeTrendFilters.events.length - 2) + '件';
        items.push('🎯 ' + eventText);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<span class="no-filter">フィルターなし</span>';
    } else {
        var logicLabel = trendFilterLogic === 'and' ? 'AND' : 'OR';
        container.innerHTML = '<span class="filter-logic-badge">' + logicLabel + '</span>' +
            items.map(function(item) {
                return '<span class="active-filter-tag">' + item + '</span>';
            }).join('');
    }
}

// 選択数を更新
function updateTrendSelectionCount() {
    var total = document.querySelectorAll('#trendDateList input[type="checkbox"]').length;
    var checked = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked').length;
    var countEl = document.getElementById('trendSelectionCount');
    if (countEl) {
        countEl.textContent = checked + '/' + total + '日選択中';
    }
}

// クイック選択で日数分選択
function quickSelectDays(days) {
    var checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var targetFiles = sortedFiles.slice(0, days);
    
    checkboxes.forEach(function(cb) {
        cb.checked = targetFiles.indexOf(cb.value) !== -1;
    });
    
    updateTrendSelectionCount();
}

// ===================
// フィルターパネル
// ===================

// フィルターパネルのHTML生成
function renderTrendFilterPanel() {
    var sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
    
    var availableYears = new Set();
    
    sortedFilesDesc.forEach(function(file) {
        var parsed = parseDateFromFilename(file);
        if (parsed) {
            availableYears.add(parsed.year);
        }
    });
    
    var yearsArray = Array.from(availableYears).sort(function(a, b) { return b - a; });
    var yearOptionsHtml = '<option value="">--</option>' + 
        yearsArray.map(function(year) {
            return '<option value="' + year + '">' + year + '年</option>';
        }).join('');
    
    var monthOptionsHtml = '<option value="">--</option>' + 
        [1,2,3,4,5,6,7,8,9,10,11,12].map(function(month) {
            return '<option value="' + month + '">' + month + '月</option>';
        }).join('');
    
    var dayOptionsHtml = '<option value="">--</option>' + 
        Array.from({length: 31}, function(_, i) { return i + 1; }).map(function(day) {
            return '<option value="' + day + '">' + day + '日</option>';
        }).join('');
    
    var allEvents = getAllEventNames();
    
    var eventButtonsHtml = '';
    if (allEvents.length > 0) {
        allEvents.slice(0, 20).forEach(function(eventName) {
            var isActive = activeTrendFilters.events.indexOf(eventName) !== -1 ? 'active' : '';
            eventButtonsHtml += '<button class="event-filter-btn ' + isActive + '" data-event="' + escapeHtml(eventName) + '">' + eventName + '</button>';
        });
        if (allEvents.length > 20) {
            eventButtonsHtml += '<span class="text-muted" style="padding: 4px 8px; font-size: 11px;">他' + (allEvents.length - 20) + '件...</span>';
        }
    } else {
        eventButtonsHtml = '<span class="text-muted" style="padding: 8px; font-size: 12px;">イベントデータがありません</span>';
    }
    
    return '<div class="trend-filter-panel">' +
        '<div class="trend-quick-select">' +
            '<h4>⚡ クイック選択</h4>' +
            '<div class="quick-select-row">' +
                '<label>直近</label>' +
                '<select id="trendQuickDays">' +
                    '<option value="">日数を選択</option>' +
                    '<option value="3">3日間</option>' +
                    '<option value="5">5日間</option>' +
                    '<option value="7">7日間</option>' +
                    '<option value="10">10日間</option>' +
                    '<option value="14">14日間</option>' +
                    '<option value="30">30日間</option>' +
                '</select>' +
                '<button class="quick-select-btn" id="applyQuickDays">選択</button>' +
            '</div>' +
        '</div>' +
        
        '<div class="date-range-section">' +
            '<h4>📆 期間フィルター</h4>' +
            '<div class="date-range-type-row">' +
                '<select id="trendDateRangeType">' +
                    '<option value="">タイプを選択</option>' +
                    '<option value="after">以降</option>' +
                    '<option value="before">以前</option>' +
                '</select>' +
            '</div>' +
            '<div class="date-select-row">' +
                '<div class="date-select-item">' +
                    '<select id="trendRangeYear">' + yearOptionsHtml + '</select>' +
                '</div>' +
                '<div class="date-select-item">' +
                    '<select id="trendRangeMonth">' + monthOptionsHtml + '</select>' +
                '</div>' +
                '<div class="date-select-item">' +
                    '<select id="trendRangeDay">' + dayOptionsHtml + '</select>' +
                '</div>' +
            '</div>' +
            '<div class="date-select-hint">' +
                '※ 年/月/日は部分指定可能（例: 2025年1月以降、5日以前など）' +
            '</div>' +
        '</div>' +
        
        '<div class="filter-logic-section">' +
            '<h4>🔗 条件の結合方式</h4>' +
            '<div class="filter-logic-toggle">' +
                '<button class="logic-btn ' + (trendFilterLogic === 'or' ? 'active' : '') + '" data-logic="or">' +
                    'OR（いずれか一致）' +
                '</button>' +
                '<button class="logic-btn ' + (trendFilterLogic === 'and' ? 'active' : '') + '" data-logic="and">' +
                    'AND（すべて一致）' +
                '</button>' +
            '</div>' +
            '<div class="filter-logic-hint">' +
                'OR: 期間・曜日・末尾などいずれかに一致する日付を選択<br>' +
                'AND: すべての条件に一致する日付のみ選択' +
            '</div>' +
        '</div>' +
        
        '<div class="trend-filter-section">' +
            '<h4>📅 条件フィルター</h4>' +
            
            '<div class="trend-filter-subsection">' +
                '<h5>曜日</h5>' +
                '<div class="trend-filter-buttons" id="dayOfWeekFilters">' +
                    [0,1,2,3,4,5,6].map(function(d) {
                        var days = ['日', '月', '火', '水', '木', '金', '土'];
                        var isActive = activeTrendFilters.dayOfWeek.indexOf(String(d)) !== -1 ? 'active' : '';
                        return '<button class="trend-filter-btn ' + isActive + '" data-filter="dayOfWeek" data-value="' + d + '">' + days[d] + '</button>';
                    }).join('') +
                '</div>' +
            '</div>' +
            
            '<div class="trend-filter-subsection">' +
                '<h5>日付末尾</h5>' +
                '<div class="trend-filter-buttons" id="suffixFilters">' +
                    [0,1,2,3,4,5,6,7,8,9].map(function(s) {
                        var isActive = activeTrendFilters.suffix.indexOf(String(s)) !== -1 ? 'active' : '';
                        return '<button class="trend-filter-btn ' + isActive + '" data-filter="suffix" data-value="' + s + '">' + s + '</button>';
                    }).join('') +
                '</div>' +
            '</div>' +
            
            '<div class="trend-filter-subsection">' +
                '<h5>特殊日</h5>' +
                '<div class="trend-filter-buttons" id="specialFilters">' +
                    '<button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('monthDay') !== -1 ? 'active' : '') + '" data-filter="monthDay">月日ぞろ目</button>' +
                    '<button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('doubleDigit') !== -1 ? 'active' : '') + '" data-filter="doubleDigit">日ぞろ目 (11,22)</button>' +
                    '<button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('hasEvent') !== -1 ? 'active' : '') + '" data-filter="hasEvent">イベントあり</button>' +
                '</div>' +
            '</div>' +
        '</div>' +
        
        '<div class="trend-filter-section">' +
            '<h4>🎯 イベントで選択</h4>' +
            '<div class="event-filter-list" id="eventFilters">' +
                eventButtonsHtml +
            '</div>' +
        '</div>' +
        
        '<div class="filter-apply-section">' +
            '<button class="filter-apply-btn" id="applyFiltersBtn">🔍 フィルターを適用</button>' +
        '</div>' +
        
        '<div class="active-filters-section">' +
            '<h5>適用中のフィルター</h5>' +
            '<div id="activeFiltersDisplay" class="active-filters-display">' +
                '<span class="no-filter">フィルターなし</span>' +
            '</div>' +
        '</div>' +
        
        '<div class="trend-filter-actions">' +
            '<span id="trendSelectionCount" class="trend-selection-count">0/0日選択中</span>' +
            '<div class="trend-filter-action-buttons">' +
                '<button id="trendClearFilters" class="modal-btn">全てクリア</button>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// HTMLエスケープ
function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// フィルターボタンのイベント設定
function setupTrendFilterButtons() {
    // AND/ORボタン
    document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(function(b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            trendFilterLogic = btn.dataset.logic;
        });
    });
    
    // 曜日・末尾ボタン
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="dayOfWeek"], #trendFilterContainer .trend-filter-btn[data-filter="suffix"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var filterType = btn.dataset.filter;
            var filterValue = btn.dataset.value;
            
            var filterArray = filterType === 'dayOfWeek' ? activeTrendFilters.dayOfWeek : activeTrendFilters.suffix;
            var index = filterArray.indexOf(filterValue);
            if (index === -1) {
                filterArray.push(filterValue);
            } else {
                filterArray.splice(index, 1);
            }
        });
    });
    
    // 特殊日ボタン
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="monthDay"], #trendFilterContainer .trend-filter-btn[data-filter="doubleDigit"], #trendFilterContainer .trend-filter-btn[data-filter="hasEvent"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var filterType = btn.dataset.filter;
            
            var index = activeTrendFilters.special.indexOf(filterType);
            if (index === -1) {
                activeTrendFilters.special.push(filterType);
            } else {
                activeTrendFilters.special.splice(index, 1);
            }
        });
    });

    // クイック選択
    var applyQuickDaysBtn = document.getElementById('applyQuickDays');
    if (applyQuickDaysBtn) {
        applyQuickDaysBtn.addEventListener('click', function() {
            var daysSelect = document.getElementById('trendQuickDays');
            if (daysSelect && daysSelect.value) {
                quickSelectDays(parseInt(daysSelect.value));
            }
        });
    }

    // イベントボタン
    document.querySelectorAll('#trendFilterContainer .event-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var eventName = btn.dataset.event;
            
            var index = activeTrendFilters.events.indexOf(eventName);
            if (index === -1) {
                activeTrendFilters.events.push(eventName);
            } else {
                activeTrendFilters.events.splice(index, 1);
            }
        });
    });
    
    // フィルター適用ボタン
    var applyFiltersBtn = document.getElementById('applyFiltersBtn');
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', function() {
            var rangeType = document.getElementById('trendDateRangeType');
            rangeType = rangeType ? rangeType.value : '';
            var rangeYear = document.getElementById('trendRangeYear');
            rangeYear = rangeYear ? rangeYear.value : '';
            var rangeMonth = document.getElementById('trendRangeMonth');
            rangeMonth = rangeMonth ? rangeMonth.value : '';
            var rangeDay = document.getElementById('trendRangeDay');
            rangeDay = rangeDay ? rangeDay.value : '';
            
            if (rangeType && (rangeYear || rangeMonth || rangeDay)) {
                var y = rangeYear ? parseInt(rangeYear) : (rangeType === 'after' ? 1900 : 9999);
                var m = rangeMonth ? parseInt(rangeMonth) : (rangeType === 'after' ? 1 : 12);
                var d = rangeDay ? parseInt(rangeDay) : (rangeType === 'after' ? 1 : 31);
                
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
    }

    // クリアボタン
    var clearFiltersBtn = document.getElementById('trendClearFilters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            activeTrendFilters = {
                dayOfWeek: [],
                suffix: [],
                special: [],
                events: [],
                dateRange: { type: null }
            };
            
            document.querySelectorAll('#trendFilterContainer .trend-filter-btn.active, #trendFilterContainer .event-filter-btn.active, #trendFilterContainer .logic-btn.active').forEach(function(btn) {
                btn.classList.remove('active');
            });
            
            trendFilterLogic = 'or';
            var orBtn = document.querySelector('#trendFilterContainer .logic-btn[data-logic="or"]');
            if (orBtn) orBtn.classList.add('active');
            
            document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) {
                cb.checked = false;
            });
            
            var selects = [
                'trendQuickDays',
                'trendDateRangeType', 'trendRangeYear', 'trendRangeMonth', 'trendRangeDay'
            ];
            selects.forEach(function(id) {
                var el = document.getElementById(id);
                if (el) el.value = '';
            });
            
            updateTrendSelectionCount();
            updateActiveFilterDisplay();
        });
    }
}

// ===================
// 日付選択モーダル
// ===================

function populateTrendDateList() {
    var container = document.getElementById('trendDateList');
    var filterContainer = document.getElementById('trendFilterContainer');
    if (!container) return;

    return loadEventData().then(function() {
        if (filterContainer) {
            filterContainer.innerHTML = renderTrendFilterPanel();
            setupTrendFilterButtons();
        }

        var sortedFiles = sortFilesByDate(CSV_FILES, true);

        var fragment = document.createDocumentFragment();

        sortedFiles.forEach(function(file) {
            var dayOfWeek = getDayOfWeek(file);
            var dayName = getDayOfWeekName(dayOfWeek);
            var dayClass = '';
            if (dayOfWeek === 0) dayClass = 'sunday';
            if (dayOfWeek === 6) dayClass = 'saturday';

            var eventText = getTrendDateEventText(file);

            var parsed = parseDateFromFilename(file);
            var dateInfo = '';
            if (parsed) {
                var isMonthDay = parsed.month === parsed.day;
                var isDoubleDigit = parsed.day === 11 || parsed.day === 22;
                if (isMonthDay) dateInfo += '<span class="date-tag month-day">月日ぞろ目</span>';
                if (isDoubleDigit) dateInfo += '<span class="date-tag double-digit">ぞろ目</span>';
            }

            var item = document.createElement('div');
            item.className = 'date-checkbox-item';
            
            var isSelected = selectedTrendDates && selectedTrendDates.indexOf(file) !== -1;
            
            var eventHtml = '';
            if (eventText) {
                eventHtml = '<span class="date-event-info">' + eventText + '</span>';
            }

            item.innerHTML = 
                '<input type="checkbox" id="trend-date-' + file + '" value="' + file + '"' + (isSelected ? ' checked' : '') + '>' +
                '<label for="trend-date-' + file + '">' + formatDate(file) + '</label>' +
                '<span class="day-of-week ' + dayClass + '">(' + dayName + ')</span>' +
                dateInfo +
                eventHtml;

            var checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', updateTrendSelectionCount);

            fragment.appendChild(item);
        });

        container.innerHTML = '';
        container.appendChild(fragment);

        updateTrendSelectionCount();
        updateActiveFilterDisplay();
    });
}

function getSelectedTrendDates() {
    var checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(function(cb) { return cb.value; });
}

function openTrendCalendarModal() {
    var modal = document.getElementById('trendCalendarModal');
    if (modal) {
        populateTrendDateList();
        modal.classList.add('active');
    }
}

function closeTrendCalendarModal() {
    var modal = document.getElementById('trendCalendarModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function updateTrendPeriodLabel() {
    var label = document.getElementById('trendPeriodLabel');
    if (!label) return;
    
    if (!selectedTrendDates || selectedTrendDates.length === 0) {
        label.textContent = '7日間（デフォルト）';
    } else if (selectedTrendDates.length === 1) {
        label.textContent = formatDate(selectedTrendDates[0]);
    } else {
        var sorted = sortFilesByDate(selectedTrendDates, false);
        var first = formatDateShort(sorted[0]);
        var last = formatDateShort(sorted[sorted.length - 1]);
        label.textContent = selectedTrendDates.length + '日間 (' + first + '〜' + last + ')';
    }
}

// ===================
// 機種フィルター
// ===================

function initTrendMachineFilter() {
    var targetFiles = [];
    
    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = selectedTrendDates;
    } else {
        var sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
    }
    
    var machineOptions = getMachineOptionsForLatestDate(targetFiles);

    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    } else {
        trendMachineFilterSelect = initMultiSelectMachineFilter(
            'trendMachineFilterContainer',
            machineOptions,
            '全機種',
            function() { loadTrendData(); }
        );
    }
}

function updateTrendMachineFilterOptions(targetFiles) {
    var machineOptions = getMachineOptionsForLatestDate(targetFiles);
    
    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.updateOptions(machineOptions);
    }
}

// ===================
// 列表示設定
// ===================

function initTrendColumnSettings() {
    var savedTotal = localStorage.getItem('trendShowTotal');
    var savedAvg = localStorage.getItem('trendShowAvg');
    var savedPrevTotal = localStorage.getItem('trendShowPrevTotal');
    var savedShowChart = localStorage.getItem('trendShowChart');
    
    trendShowTotal = savedTotal !== 'false';
    trendShowAvg = savedAvg !== 'false';
    trendShowPrevTotal = savedPrevTotal === 'true';
    trendShowChart = savedShowChart !== 'false';
    
    var totalCheckbox = document.getElementById('trendShowTotal');
    var avgCheckbox = document.getElementById('trendShowAvg');
    var prevTotalCheckbox = document.getElementById('trendShowPrevTotal');
    var showChartCheckbox = document.getElementById('trendShowChart');
    
    if (totalCheckbox) totalCheckbox.checked = trendShowTotal;
    if (avgCheckbox) avgCheckbox.checked = trendShowAvg;
    if (prevTotalCheckbox) prevTotalCheckbox.checked = trendShowPrevTotal;
    if (showChartCheckbox) showChartCheckbox.checked = trendShowChart;
    
    updateChartVisibility();
}

function saveTrendColumnSettings() {
    localStorage.setItem('trendShowTotal', trendShowTotal);
    localStorage.setItem('trendShowAvg', trendShowAvg);
    localStorage.setItem('trendShowPrevTotal', trendShowPrevTotal);
    localStorage.setItem('trendShowChart', trendShowChart);
}

function updateChartVisibility() {
    var chartContainer = document.querySelector('.trend-chart-container');
    if (chartContainer) {
        chartContainer.style.display = trendShowChart ? 'block' : 'none';
    }
}

function toggleChartVisibility() {
    trendShowChart = !trendShowChart;
    saveTrendColumnSettings();
    updateChartVisibility();
    
    var toggleHeader = document.querySelector('.chart-toggle-header');
    if (toggleHeader) {
        toggleHeader.classList.toggle('open', trendShowChart);
    }
}

// ===================
// メインデータ読み込み
// ===================

function loadTrendData() {
    var selectedMachines = trendMachineFilterSelect ? trendMachineFilterSelect.getSelectedValues() : [];
    var sortByEl = document.getElementById('trendSortBy');
    var sortBy = sortByEl ? sortByEl.value : 'total_desc';

    var totalFilterTypeEl = document.getElementById('trendTotalFilterType');
    var totalFilterType = totalFilterTypeEl ? totalFilterTypeEl.value : '';
    var totalFilterValueEl = document.getElementById('trendTotalFilterValue');
    var totalFilterValue = totalFilterValueEl ? totalFilterValueEl.value : '';

    var prevTotalFilterTypeEl = document.getElementById('trendPrevTotalFilterType');
    var prevTotalFilterType = prevTotalFilterTypeEl ? prevTotalFilterTypeEl.value : '';
    var prevTotalFilterValueEl = document.getElementById('trendPrevTotalFilterValue');
    var prevTotalFilterValue = prevTotalFilterValueEl ? prevTotalFilterValueEl.value : '';

    var showTotalEl = document.getElementById('trendShowTotal');
    var showAvgEl = document.getElementById('trendShowAvg');
    var showPrevTotalEl = document.getElementById('trendShowPrevTotal');
    var showChartEl = document.getElementById('trendShowChart');
    
    trendShowTotal = showTotalEl ? showTotalEl.checked : true;
    trendShowAvg = showAvgEl ? showAvgEl.checked : true;
    trendShowPrevTotal = showPrevTotalEl ? showPrevTotalEl.checked : false;
    trendShowChart = showChartEl ? showChartEl.checked : true;
    saveTrendColumnSettings();
    updateChartVisibility();
    
    var viewModeEl = document.getElementById('trendViewMode');
    trendViewMode = viewModeEl ? viewModeEl.value : 'unit';
    var valueTypeEl = document.getElementById('trendMachineValueType');
    trendMachineValueType = valueTypeEl ? valueTypeEl.value : 'total';

    var summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;
    
    summaryEl.innerHTML = '<p>読み込み中...</p>';

    var targetFiles = [];

    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        var sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, 7);
        targetFiles = sortFilesByDate(targetFiles, false);
    }

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        return;
    }

    updateTrendMachineFilterOptions(targetFiles);

    if (trendViewMode === 'machine') {
        return loadTrendDataByMachine(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue);
    } else {
        return loadTrendDataByUnit(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue);
    }
}

// ===================
// 台別トレンドデータ
// ===================

function loadTrendDataByUnit(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue) {
    var machineData = {};
    var latestFile = targetFiles[targetFiles.length - 1];
    var positionState = getPositionFilterState('trend');

    targetFiles.forEach(function(file) {
        var data = dataCache[file];
        if (!data) return;

        data.forEach(function(row) {
            var machine = row['機種名'];
            var num = row['台番号'];
            var sa = parseInt(row['差枚']) || 0;
            
            if (selectedMachines.length > 0 && selectedMachines.indexOf(machine) === -1) return;
            
            // 位置フィルター（複数選択対応）
            if (positionState.selected.length > 0) {
                var tags = getPositionTags(num);
                var matchesPosition = false;
                
                if (positionState.logic === 'and') {
                    matchesPosition = positionState.selected.every(function(selectedTag) {
                        return tags.indexOf(selectedTag) !== -1;
                    });
                } else {
                    matchesPosition = positionState.selected.some(function(selectedTag) {
                        return tags.indexOf(selectedTag) !== -1;
                    });
                }
                
                if (!matchesPosition) return;
            }

            var key = machine + '_' + num;
            if (!machineData[key]) {
                machineData[key] = { 
                    machine: machine, 
                    num: num, 
                    dates: {},
                    dailyWin: {}
                };
            }
            machineData[key].dates[file] = sa;
            machineData[key].dailyWin[file] = sa > 0 ? 1 : 0;
        });
    });

    var results = Object.values(machineData);

    results.forEach(function(item) {
        var values = Object.values(item.dates);
        item.total = values.reduce(function(a, b) { return a + b; }, 0);
        item.avg = values.length > 0 ? Math.round(item.total / values.length) : 0;
        
        // 最新日の差枚
        item.latestSa = item.dates[latestFile] || 0;
        // 最新日以前の合計 = 総差枚 - 最新日差枚
        item.prevTotal = item.total - item.latestSa;
        
        var winDays = Object.values(item.dailyWin).reduce(function(a, b) { return a + b; }, 0);
        var totalDays = Object.keys(item.dailyWin).length;
        item.winRate = totalDays > 0 ? (winDays / totalDays * 100).toFixed(1) : '0.0';
        
        item.dailyWinRate = {};
        targetFiles.forEach(function(file) {
            if (item.dailyWin[file] !== undefined) {
                item.dailyWinRate[file] = item.dailyWin[file] === 1 ? 100 : 0;
            } else {
                item.dailyWinRate[file] = null;
            }
        });
        
        item.dailyAvg = item.dates;
    });

    // 合計差枚フィルター
    if (totalFilterType && totalFilterValue) {
        var filterVal = parseInt(totalFilterValue);
        if (!isNaN(filterVal)) {
            if (totalFilterType === 'gte') {
                results = results.filter(function(item) { return item.total >= filterVal; });
            } else if (totalFilterType === 'lte') {
                results = results.filter(function(item) { return item.total <= filterVal; });
            }
        }
    }

    // 最新日以前フィルター
    if (prevTotalFilterType && prevTotalFilterValue) {
        var prevFilterVal = parseInt(prevTotalFilterValue);
        if (!isNaN(prevFilterVal)) {
            if (prevTotalFilterType === 'gte') {
                results = results.filter(function(item) { return item.prevTotal >= prevFilterVal; });
            } else if (prevTotalFilterType === 'lte') {
                results = results.filter(function(item) { return item.prevTotal <= prevFilterVal; });
            }
        }
    }

    results = sortTrendResults(results, sortBy, latestFile);

    renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue, false);
    renderTrendTables(results, targetFiles);
    renderTrendChartData(results, targetFiles, 'unit');
}

// ===================
// 機種別トレンドデータ
// ===================

function loadTrendDataByMachine(targetFiles, selectedMachines, sortBy, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue) {
    var machineData = {};
    var latestFile = targetFiles[targetFiles.length - 1];
    var positionState = getPositionFilterState('trend');

    targetFiles.forEach(function(file) {
        var data = dataCache[file];
        if (!data) return;

        data.forEach(function(row) {
            var machine = row['機種名'];
            var num = row['台番号'];
            var sa = parseInt(row['差枚']) || 0;
            
            if (selectedMachines.length > 0 && selectedMachines.indexOf(machine) === -1) return;
            
            // 位置フィルター（複数選択対応）
            if (positionState.selected.length > 0) {
                var tags = getPositionTags(num);
                var matchesPosition = false;
                
                if (positionState.logic === 'and') {
                    matchesPosition = positionState.selected.every(function(selectedTag) {
                        return tags.indexOf(selectedTag) !== -1;
                    });
                } else {
                    matchesPosition = positionState.selected.some(function(selectedTag) {
                        return tags.indexOf(selectedTag) !== -1;
                    });
                }
                
                if (!matchesPosition) return;
            }

            if (!machineData[machine]) {
                machineData[machine] = { 
                    machine: machine, 
                    dates: {},
                    unitCounts: {},
                    winCounts: {}
                };
            }
            
            if (!machineData[machine].dates[file]) {
                machineData[machine].dates[file] = 0;
                machineData[machine].unitCounts[file] = 0;
                machineData[machine].winCounts[file] = 0;
            }
            
            machineData[machine].dates[file] += sa;
            machineData[machine].unitCounts[file]++;
            
            if (sa > 0) {
                machineData[machine].winCounts[file]++;
            }
        });
    });

    var results = Object.values(machineData);

    results.forEach(function(item) {
        var values = Object.values(item.dates);
        item.total = values.reduce(function(a, b) { return a + b; }, 0);
        
        var totalUnits = Object.values(item.unitCounts).reduce(function(a, b) { return a + b; }, 0);
        item.avg = totalUnits > 0 ? Math.round(item.total / totalUnits) : 0;
        
        // 最新日の差枚
        item.latestSa = item.dates[latestFile] || 0;
        // 最新日以前の合計 = 総差枚 - 最新日差枚
        item.prevTotal = item.total - item.latestSa;
        
        var totalWins = Object.values(item.winCounts).reduce(function(a, b) { return a + b; }, 0);
        item.winRate = totalUnits > 0 ? (totalWins / totalUnits * 100).toFixed(1) : '0.0';
        
        item.dailyAvg = {};
        item.dailyWinRate = {};
        
        targetFiles.forEach(function(file) {
            var unitCount = item.unitCounts[file] || 0;
            var dayTotal = item.dates[file] || 0;
            var dayWins = item.winCounts[file] || 0;
            
            item.dailyAvg[file] = unitCount > 0 ? Math.round(dayTotal / unitCount) : null;
            item.dailyWinRate[file] = unitCount > 0 ? (dayWins / unitCount * 100) : null;
        });
        
        item.num = totalUnits + '台';
    });

    // 合計差枚フィルター
    if (totalFilterType && totalFilterValue) {
        var filterVal = parseInt(totalFilterValue);
        if (!isNaN(filterVal)) {
            if (totalFilterType === 'gte') {
                results = results.filter(function(item) { return item.total >= filterVal; });
            } else if (totalFilterType === 'lte') {
                results = results.filter(function(item) { return item.total <= filterVal; });
            }
        }
    }

    // 最新日以前フィルター
    if (prevTotalFilterType && prevTotalFilterValue) {
        var prevFilterVal = parseInt(prevTotalFilterValue);
        if (!isNaN(prevFilterVal)) {
            if (prevTotalFilterType === 'gte') {
                results = results.filter(function(item) { return item.prevTotal >= prevFilterVal; });
            } else if (prevTotalFilterType === 'lte') {
                results = results.filter(function(item) { return item.prevTotal <= prevFilterVal; });
            }
        }
    }

    results = sortTrendResults(results, sortBy, latestFile);

    renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue, true);
    renderTrendTablesByMachine(results, targetFiles);
    renderTrendChartData(results, targetFiles, 'machine');
}

// ===================
// ソート
// ===================

function sortTrendResults(results, sortBy, latestFile) {
    return HallData.sort.apply(results, sortBy, { latestFile: latestFile });
}

// ===================
// サマリー表示
// ===================

function renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue, isMachineMode) {
    var summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;
    
    var totalSa = results.reduce(function(sum, r) { return sum + r.total; }, 0);
    var saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    
    var machineInfo = '';
    if (selectedMachines.length > 0) {
        machineInfo = ' | 機種: ' + selectedMachines.length + '機種選択中';
    }

    var positionInfo = '';
    var positionDisplayText = getPositionFilterDisplayText('trend');
    if (positionDisplayText) {
        positionInfo = ' | 位置: ' + positionDisplayText;
    }

    var filterInfo = '';
    if (totalFilterType && totalFilterValue) {
        var filterLabel = totalFilterType === 'gte' ? '以上' : '以下';
        filterInfo = ' | フィルター: 合計' + parseInt(totalFilterValue).toLocaleString() + '枚' + filterLabel;
    }
    if (prevTotalFilterType && prevTotalFilterValue) {
        var prevFilterLabel = prevTotalFilterType === 'gte' ? '以上' : '以下';
        filterInfo += (filterInfo ? ', ' : ' | フィルター: ') + '最新日以前差枚' + parseInt(prevTotalFilterValue).toLocaleString() + '枚' + prevFilterLabel;
    }
    
    var valueTypeInfo = '';
    if (trendMachineValueType === 'avg') {
        valueTypeInfo = ' | 表示: 平均差枚';
    } else if (trendMachineValueType === 'winrate') {
        valueTypeInfo = ' | 表示: 勝率';
    }
    
    var modeLabel = isMachineMode ? '機種' : '台';
    
    summaryEl.innerHTML = 
        '表示: ' + results.length + modeLabel + ' | 期間: ' + targetFiles.length + '日間' + machineInfo + positionInfo + filterInfo + valueTypeInfo + ' | ' +
        '合計差枚: <span class="' + saClass + '">' + (totalSa >= 0 ? '+' : '') + totalSa.toLocaleString() + '</span>';
}

// ===================
// テーブル描画（台別）
// ===================

function renderTrendTables(results, targetFiles) {
    var fixedThead = document.querySelector('#trend-fixed-table thead');
    var fixedTbody = document.querySelector('#trend-fixed-table tbody');
    var scrollThead = document.querySelector('#trend-scroll-table thead');
    var scrollTbody = document.querySelector('#trend-scroll-table tbody');

    if (!fixedThead || !fixedTbody || !scrollThead || !scrollTbody) return;

    fixedThead.innerHTML = '<tr><th>機種名</th><th>台番号</th><th>位置</th></tr>';

    var scrollHeaderCells = targetFiles.map(function(file) {
        return '<th>' + formatDateShort(file) + '</th>';
    }).join('');
    
    if (trendShowTotal) {
        if (trendMachineValueType === 'winrate') {
            scrollHeaderCells += '<th>勝率</th>';
        } else {
            scrollHeaderCells += '<th>合計</th>';
        }
    }
    if (trendShowAvg && trendMachineValueType !== 'winrate') {
        scrollHeaderCells += '<th>平均</th>';
    }
    if (trendShowPrevTotal && trendMachineValueType !== 'winrate') {
        scrollHeaderCells += '<th>最新日以前差枚</th>';
    }
    scrollThead.innerHTML = '<tr>' + scrollHeaderCells + '</tr>';

    var fixedRows = [];
    var scrollRows = [];

    results.forEach(function(row) {
        var positionHtml = (typeof renderPositionTags === 'function') 
            ? (renderPositionTags(row.num, { compact: true }) || '-')
            : '-';
        
        fixedRows.push('<tr><td>' + row.machine + '</td><td>' + row.num + '</td><td>' + positionHtml + '</td></tr>');

        var dateCells = [];
        targetFiles.forEach(function(file) {
            var val;
            var displayVal;
            var cls = '';
            
            switch (trendMachineValueType) {
                case 'winrate':
                    val = row.dailyWinRate ? row.dailyWinRate[file] : null;
                    if (val !== null && val !== undefined) {
                        cls = val >= 50 ? 'plus' : 'minus';
                        displayVal = val.toFixed(0) + '%';
                    } else {
                        displayVal = '-';
                    }
                    break;
                    
                case 'avg':
                    val = row.dailyAvg ? row.dailyAvg[file] : null;
                    if (val !== null && val !== undefined) {
                        cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                        displayVal = (val >= 0 ? '+' : '') + val.toLocaleString();
                    } else {
                        displayVal = '-';
                    }
                    break;
                    
                default:
                    val = row.dates[file];
                    if (val !== undefined) {
                        cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                        displayVal = (val >= 0 ? '+' : '') + val.toLocaleString();
                    } else {
                        displayVal = '-';
                    }
            }
            
            dateCells.push('<td class="' + cls + '">' + displayVal + '</td>');
        });

        if (trendShowTotal) {
            if (trendMachineValueType === 'winrate') {
                var wr = parseFloat(row.winRate);
                var wrCls = wr >= 50 ? 'plus' : 'minus';
                dateCells.push('<td class="' + wrCls + '">' + row.winRate + '%</td>');
            } else {
                var totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
                dateCells.push('<td class="' + totalCls + '">' + (row.total >= 0 ? '+' : '') + row.total.toLocaleString() + '</td>');
            }
        }
        
        if (trendShowAvg && trendMachineValueType !== 'winrate') {
            var avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';
            dateCells.push('<td class="' + avgCls + '">' + (row.avg >= 0 ? '+' : '') + row.avg.toLocaleString() + '</td>');
        }
        
        if (trendShowPrevTotal && trendMachineValueType !== 'winrate') {
            var prevTotalCls = row.prevTotal > 0 ? 'plus' : row.prevTotal < 0 ? 'minus' : '';
            dateCells.push('<td class="' + prevTotalCls + '">' + (row.prevTotal >= 0 ? '+' : '') + row.prevTotal.toLocaleString() + '</td>');
        }

        scrollRows.push('<tr>' + dateCells.join('') + '</tr>');
    });

    fixedTbody.innerHTML = fixedRows.join('');
    scrollTbody.innerHTML = scrollRows.join('');

    requestAnimationFrame(function() {
        syncRowHeights();
    });
}

// ===================
// テーブル描画（機種別）
// ===================

function renderTrendTablesByMachine(results, targetFiles) {
    var fixedThead = document.querySelector('#trend-fixed-table thead');
    var fixedTbody = document.querySelector('#trend-fixed-table tbody');
    var scrollThead = document.querySelector('#trend-scroll-table thead');
    var scrollTbody = document.querySelector('#trend-scroll-table tbody');

    if (!fixedThead || !fixedTbody || !scrollThead || !scrollTbody) return;

    fixedThead.innerHTML = '<tr><th>機種名</th><th>延べ台数</th></tr>';

    var scrollHeaderCells = targetFiles.map(function(file) {
        return '<th>' + formatDateShort(file) + '</th>';
    }).join('');
    
    if (trendShowTotal) {
        if (trendMachineValueType === 'winrate') {
            scrollHeaderCells += '<th>総合勝率</th>';
        } else if (trendMachineValueType === 'avg') {
            scrollHeaderCells += '<th>全体平均</th>';
        } else {
            scrollHeaderCells += '<th>総合計</th>';
        }
    }
    if (trendShowAvg && trendMachineValueType === 'total') {
        scrollHeaderCells += '<th>台平均</th>';
    }
    if (trendShowPrevTotal && trendMachineValueType !== 'winrate') {
        scrollHeaderCells += '<th>最新日以前差枚</th>';
    }
    
    scrollThead.innerHTML = '<tr>' + scrollHeaderCells + '</tr>';

    var fixedRows = [];
    var scrollRows = [];

    results.forEach(function(row) {
        fixedRows.push('<tr><td>' + row.machine + '</td><td>' + row.num + '</td></tr>');

        var dateCells = [];
        targetFiles.forEach(function(file) {
            var val;
            var displayVal;
            var cls = '';
            
            switch (trendMachineValueType) {
                case 'avg':
                    val = row.dailyAvg[file];
                    if (val !== null && val !== undefined) {
                        cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                        displayVal = (val >= 0 ? '+' : '') + val.toLocaleString();
                    } else {
                        displayVal = '-';
                    }
                    break;
                    
                case 'winrate':
                    val = row.dailyWinRate[file];
                    if (val !== null && val !== undefined) {
                        cls = val >= 50 ? 'plus' : val < 50 ? 'minus' : '';
                        displayVal = val.toFixed(1) + '%';
                    } else {
                        displayVal = '-';
                    }
                    break;
                    
                default:
                    val = row.dates[file];
                    if (val !== null && val !== undefined) {
                        cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                        displayVal = (val >= 0 ? '+' : '') + val.toLocaleString();
                    } else {
                        displayVal = '-';
                    }
            }
            
            dateCells.push('<td class="' + cls + '">' + displayVal + '</td>');
        });

        if (trendShowTotal) {
            if (trendMachineValueType === 'winrate') {
                var wr = parseFloat(row.winRate);
                var wrCls = wr >= 50 ? 'plus' : 'minus';
                dateCells.push('<td class="' + wrCls + '">' + row.winRate + '%</td>');
            } else if (trendMachineValueType === 'avg') {
                var avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';
                dateCells.push('<td class="' + avgCls + '">' + (row.avg >= 0 ? '+' : '') + row.avg.toLocaleString() + '</td>');
            } else {
                var totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
                dateCells.push('<td class="' + totalCls + '">' + (row.total >= 0 ? '+' : '') + row.total.toLocaleString() + '</td>');
            }
        }
        
        if (trendShowAvg && trendMachineValueType === 'total') {
            var avgCls2 = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';
            dateCells.push('<td class="' + avgCls2 + '">' + (row.avg >= 0 ? '+' : '') + row.avg.toLocaleString() + '</td>');
        }
        
        if (trendShowPrevTotal && trendMachineValueType !== 'winrate') {
            var prevTotalCls = row.prevTotal > 0 ? 'plus' : row.prevTotal < 0 ? 'minus' : '';
            dateCells.push('<td class="' + prevTotalCls + '">' + (row.prevTotal >= 0 ? '+' : '') + row.prevTotal.toLocaleString() + '</td>');
        }

        scrollRows.push('<tr>' + dateCells.join('') + '</tr>');
    });

    fixedTbody.innerHTML = fixedRows.join('');
    scrollTbody.innerHTML = scrollRows.join('');

    requestAnimationFrame(function() {
        syncRowHeights();
    });
}

// ===================
// グラフ描画
// ===================

function renderTrendChartData(results, targetFiles, mode) {
    window.trendDisplayData = { results: results, targetFiles: targetFiles, mode: mode };
    
    if (trendShowChart && typeof renderTrendChart === 'function') {
        var showTopEl = document.getElementById('chartShowTop');
        var showBottomEl = document.getElementById('chartShowBottom');
        var displayCountEl = document.getElementById('chartDisplayCount');
        
        var showTop = showTopEl ? showTopEl.checked : true;
        var showBottom = showBottomEl ? showBottomEl.checked : false;
        var displayCount = displayCountEl ? parseInt(displayCountEl.value) : 5;
        
        renderTrendChart(results, targetFiles, {
            showTop: showTop,
            showBottom: showBottom,
            displayCount: displayCount,
            mode: mode,
            valueType: trendMachineValueType
        });
    }
}

// ===================
// 行の高さ同期
// ===================

function syncRowHeights() {
    var fixedRows = document.querySelectorAll('#trend-fixed-table tbody tr');
    var scrollRows = document.querySelectorAll('#trend-scroll-table tbody tr');

    if (fixedRows.length === 0 || scrollRows.length === 0) return;

    var heights = [];

    for (var i = 0; i < fixedRows.length; i++) {
        if (scrollRows[i]) {
            heights.push(Math.max(fixedRows[i].offsetHeight, scrollRows[i].offsetHeight));
        }
    }

    for (var j = 0; j < heights.length; j++) {
        fixedRows[j].style.height = heights[j] + 'px';
        scrollRows[j].style.height = heights[j] + 'px';
    }

    var fixedHeader = document.querySelector('#trend-fixed-table thead tr');
    var scrollHeader = document.querySelector('#trend-scroll-table thead tr');
    if (fixedHeader && scrollHeader) {
        var maxHeight = Math.max(fixedHeader.offsetHeight, scrollHeader.offsetHeight);
        fixedHeader.style.height = maxHeight + 'px';
        scrollHeader.style.height = maxHeight + 'px';
    }
}

var resizeTimeout = null;
function handleResize() {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(function() {
        syncRowHeights();
    }, 100);
}

// ===================
// コピー・ダウンロード
// ===================

function getTrendTableData() {
    var fixedTable = document.getElementById('trend-fixed-table');
    var scrollTable = document.getElementById('trend-scroll-table');
    return getMergedTableData(fixedTable, scrollTable);
}

function copyTrendTable() {
    var data = getTrendTableData();
    var btn = document.getElementById('copyTrendTableBtn');
    copyToClipboard(data, btn);
}

function downloadTrendCSV() {
    var data = getTrendTableData();
    
    if (data.rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    var days = (selectedTrendDates && selectedTrendDates.length) ? selectedTrendDates.length : 7;
    var today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    var modeLabel = trendViewMode === 'machine' ? 'machine' : 'unit';
    var filename = 'trend_' + modeLabel + '_' + days + 'days_' + today + '.csv';
    
    downloadAsCSV(data, filename);
}

// ===================
// フィルターリセット
// ===================

function resetTrendFilters() {
    var totalFilterType = document.getElementById('trendTotalFilterType');
    var totalFilterValue = document.getElementById('trendTotalFilterValue');
    var prevTotalFilterType = document.getElementById('trendPrevTotalFilterType');
    var prevTotalFilterValue = document.getElementById('trendPrevTotalFilterValue');
    
    if (totalFilterType) totalFilterType.value = '';
    if (totalFilterValue) totalFilterValue.value = '';
    if (prevTotalFilterType) prevTotalFilterType.value = '';
    if (prevTotalFilterValue) prevTotalFilterValue.value = '';
    
    if (trendMachineFilterSelect) {
        trendMachineFilterSelect.reset();
    }
    
    var totalCheckbox = document.getElementById('trendShowTotal');
    var avgCheckbox = document.getElementById('trendShowAvg');
    var prevTotalCheckbox = document.getElementById('trendShowPrevTotal');
    var showChartCheckbox = document.getElementById('trendShowChart');
    
    if (totalCheckbox) totalCheckbox.checked = true;
    if (avgCheckbox) avgCheckbox.checked = true;
    if (prevTotalCheckbox) prevTotalCheckbox.checked = false;
    if (showChartCheckbox) showChartCheckbox.checked = true;
    
    trendShowTotal = true;
    trendShowAvg = true;
    trendShowPrevTotal = false;
    trendShowChart = true;
    saveTrendColumnSettings();
    updateChartVisibility();
    
    var valueTypeSelect = document.getElementById('trendMachineValueType');
    if (valueTypeSelect) valueTypeSelect.value = 'total';
    trendMachineValueType = 'total';
    
    // 位置フィルターリセット
    resetPositionFilter('trend');
    renderTrendPositionFilter();
    
    loadTrendData();
}

// ===================
// デバウンス
// ===================

function debounce(func, wait) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        var later = function() {
            clearTimeout(timeout);
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===================
// イベントリスナー設定
// ===================

function setupTrendEventListeners() {
    var sortByEl = document.getElementById('trendSortBy');
    if (sortByEl) sortByEl.addEventListener('change', loadTrendData);
    
    var loadTrendBtn = document.getElementById('loadTrend');
    if (loadTrendBtn) loadTrendBtn.addEventListener('click', loadTrendData);

    var openCalendarBtn = document.getElementById('openTrendCalendar');
    if (openCalendarBtn) openCalendarBtn.addEventListener('click', openTrendCalendarModal);
    
    var closeCalendarBtn = document.getElementById('closeTrendCalendar');
    if (closeCalendarBtn) closeCalendarBtn.addEventListener('click', closeTrendCalendarModal);

    var calendarModal = document.getElementById('trendCalendarModal');
    if (calendarModal) {
        calendarModal.addEventListener('click', function(e) {
            if (e.target.id === 'trendCalendarModal') {
                closeTrendCalendarModal();
            }
        });
    }

    var selectAllBtn = document.getElementById('selectAllDates');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', function() {
            document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) {
                cb.checked = true;
            });
            updateTrendSelectionCount();
        });
    }

    var deselectAllBtn = document.getElementById('deselectAllDates');
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', function() {
            document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) {
                cb.checked = false;
            });
            updateTrendSelectionCount();
        });
    }

    var applyDatesBtn = document.getElementById('applyTrendDates');
    if (applyDatesBtn) {
        applyDatesBtn.addEventListener('click', function() {
            selectedTrendDates = getSelectedTrendDates();
            updateTrendPeriodLabel();
            closeTrendCalendarModal();
            loadTrendData();
        });
    }

    window.addEventListener('resize', handleResize);

    initTrendMachineFilter();
    initTrendColumnSettings();
    renderTrendPositionFilter();

    var showTotalEl = document.getElementById('trendShowTotal');
    if (showTotalEl) showTotalEl.addEventListener('change', loadTrendData);
    
    var showAvgEl = document.getElementById('trendShowAvg');
    if (showAvgEl) showAvgEl.addEventListener('change', loadTrendData);
    
    var showPrevTotalEl = document.getElementById('trendShowPrevTotal');
    if (showPrevTotalEl) showPrevTotalEl.addEventListener('change', loadTrendData);
    
    var showChartEl = document.getElementById('trendShowChart');
    if (showChartEl) showChartEl.addEventListener('change', loadTrendData);
    
    var viewModeEl = document.getElementById('trendViewMode');
    if (viewModeEl) viewModeEl.addEventListener('change', loadTrendData);
    
    var valueTypeEl = document.getElementById('trendMachineValueType');
    if (valueTypeEl) valueTypeEl.addEventListener('change', loadTrendData);

    var totalFilterTypeEl = document.getElementById('trendTotalFilterType');
    if (totalFilterTypeEl) totalFilterTypeEl.addEventListener('change', loadTrendData);
    
    var totalFilterValueEl = document.getElementById('trendTotalFilterValue');
    if (totalFilterValueEl) totalFilterValueEl.addEventListener('input', debounce(loadTrendData, 500));

    var prevTotalFilterTypeEl = document.getElementById('trendPrevTotalFilterType');
    if (prevTotalFilterTypeEl) prevTotalFilterTypeEl.addEventListener('change', loadTrendData);
    
    var prevTotalFilterValueEl = document.getElementById('trendPrevTotalFilterValue');
    if (prevTotalFilterValueEl) prevTotalFilterValueEl.addEventListener('input', debounce(loadTrendData, 500));

    var resetFilterBtn = document.getElementById('resetTrendFilter');
    if (resetFilterBtn) resetFilterBtn.addEventListener('click', function() {
        resetTrendFilters();
    });

    var copyBtn = document.getElementById('copyTrendTableBtn');
    if (copyBtn) copyBtn.addEventListener('click', copyTrendTable);
    
    var downloadBtn = document.getElementById('downloadTrendCsvBtn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadTrendCSV);
    
    // グラフ設定変更イベント
    var chartShowTopEl = document.getElementById('chartShowTop');
    if (chartShowTopEl) {
        chartShowTopEl.addEventListener('change', function() {
            if (trendShowChart) {
                var displayData = getTrendDisplayData();
                renderTrendChartData(displayData.results, displayData.targetFiles, displayData.mode);
            }
        });
    }
    
    var chartShowBottomEl = document.getElementById('chartShowBottom');
    if (chartShowBottomEl) {
        chartShowBottomEl.addEventListener('change', function() {
            if (trendShowChart) {
                var displayData = getTrendDisplayData();
                renderTrendChartData(displayData.results, displayData.targetFiles, displayData.mode);
            }
        });
    }
    
    var chartDisplayCountEl = document.getElementById('chartDisplayCount');
    if (chartDisplayCountEl) {
        chartDisplayCountEl.addEventListener('change', function() {
            if (trendShowChart) {
                var displayData = getTrendDisplayData();
                renderTrendChartData(displayData.results, displayData.targetFiles, displayData.mode);
            }
        });
    }
    
    updateTrendPeriodLabel();
}

function getTrendDisplayData() {
    return window.trendDisplayData || { results: [], targetFiles: [], mode: 'unit' };
}
