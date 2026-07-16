// ===================
// データトレンドタブ（パフォーマンス最適化版）
// ===================

var trendMachineFilterSelect = null;
var trendShowTotal = true;
var trendShowAvg = true;
var trendShowPrevTotal = false;
var trendShowChart = true;

var trendViewMode = 'unit';
var trendDataColumn = '差枚';
var trendMachineAggType = 'total';

var trendFilterLogic = 'or';

var activeTrendFilters = {
    dayOfWeek: [],
    suffix: [],
    special: [],
    events: [],
    dateRange: { start: null, end: null }
};

// ===================
// パフォーマンス: キャッシュ管理
// ===================

var trendCache = {
    // 生データキャッシュ（日付・機種・位置フィルター適用後）
    rawData: null,
    rawParams: null,
    // 集計済みキャッシュ（データ項目・集計方法適用後）
    aggregated: null,
    aggParams: null,
    // 最終結果キャッシュ（数値フィルター・ソート適用後）
    finalResults: null,
    finalParams: null
};

function invalidateCache(level) {
    if (level <= 0) { trendCache.rawData = null; trendCache.rawParams = null; }
    if (level <= 1) { trendCache.aggregated = null; trendCache.aggParams = null; }
    if (level <= 2) { trendCache.finalResults = null; trendCache.finalParams = null; }
}

function makeCacheKey(obj) {
    return JSON.stringify(obj);
}

// ===================
// データ列の設定
// ===================

var TREND_COLUMN_CONFIG = {
    '差枚': {
        label: '差枚', unit: '枚',
        format: function(val) { return (val >= 0 ? '+' : '') + Math.round(val).toLocaleString(); },
        parseRow: function(row) { return parseInt(String(row['差枚']).replace(/,/g, '')) || 0; },
        colorClass: function(val) { return val > 0 ? 'plus' : val < 0 ? 'minus' : ''; },
        canSum: true, chartLabel: '差枚', summaryPrefix: '差枚'
    },
    'G数': {
        label: 'G数', unit: 'G',
        format: function(val) { return Math.round(val).toLocaleString(); },
        parseRow: function(row) { return parseInt(String(row['G数']).replace(/,/g, '')) || 0; },
        colorClass: function() { return ''; },
        canSum: true, chartLabel: 'G数', summaryPrefix: 'G数'
    },
    'BB': {
        label: 'BB回数', unit: '回',
        format: function(val) { return Math.round(val).toLocaleString(); },
        parseRow: function(row) { return parseInt(String(row['BB']).replace(/,/g, '')) || 0; },
        colorClass: function() { return ''; },
        canSum: true, chartLabel: 'BB回数', summaryPrefix: 'BB'
    },
    'RB': {
        label: 'RB回数', unit: '回',
        format: function(val) { return Math.round(val).toLocaleString(); },
        parseRow: function(row) { return parseInt(String(row['RB']).replace(/,/g, '')) || 0; },
        colorClass: function() { return ''; },
        canSum: true, chartLabel: 'RB回数', summaryPrefix: 'RB'
    },
    'ART': {
        label: 'ART回数', unit: '回',
        format: function(val) { return Math.round(val).toLocaleString(); },
        parseRow: function(row) { return parseInt(String(row['ART']).replace(/,/g, '')) || 0; },
        colorClass: function() { return ''; },
        canSum: true, chartLabel: 'ART回数', summaryPrefix: 'ART'
    },
    '合成確率': {
        label: '合成確率', unit: '',
        format: function(val) { return val === null ? '-' : '1/' + val.toFixed(1); },
        parseRow: function(row) { return parseProbability(row['合成確率']); },
        colorClass: function(val) { if (val === null) return ''; return val <= 150 ? 'plus' : val >= 300 ? 'minus' : ''; },
        canSum: false, isInverse: true, chartLabel: '合成確率 (1/x)', summaryPrefix: '合成確率'
    },
    'BB確率': {
        label: 'BB確率', unit: '',
        format: function(val) { return val === null ? '-' : '1/' + val.toFixed(1); },
        parseRow: function(row) { return parseProbability(row['BB確率']); },
        colorClass: function(val) { if (val === null) return ''; return val <= 250 ? 'plus' : val >= 400 ? 'minus' : ''; },
        canSum: false, isInverse: true, chartLabel: 'BB確率 (1/x)', summaryPrefix: 'BB確率'
    },
    'RB確率': {
        label: 'RB確率', unit: '',
        format: function(val) { return val === null ? '-' : '1/' + val.toFixed(1); },
        parseRow: function(row) { return parseProbability(row['RB確率']); },
        colorClass: function(val) { if (val === null) return ''; return val <= 300 ? 'plus' : val >= 500 ? 'minus' : ''; },
        canSum: false, isInverse: true, chartLabel: 'RB確率 (1/x)', summaryPrefix: 'RB確率'
    },
    '機械割': {
        label: '機械割', unit: '%',
        format: function(val) { return val === null ? '-' : val.toFixed(2) + '%'; },
        parseRow: function(row) {
            var g = parseInt(String(row['G数']).replace(/,/g, '')) || 0;
            var sa = parseInt(String(row['差枚']).replace(/,/g, '')) || 0;
            if (g <= 0) return null;
            return ((g * 3 + sa) / (g * 3)) * 100;
        },
        colorClass: function(val) { if (val === null) return ''; return val >= 100 ? 'plus' : 'minus'; },
        canSum: false, isRate: true, chartLabel: '機械割 (%)', summaryPrefix: '機械割'
    }
};

function parseProbability(probStr) {
    if (!probStr || probStr === '-' || probStr === '') return null;
    var match = String(probStr).trim().match(/1\/([\d.]+)/);
    if (match) { var val = parseFloat(match[1]); return (val > 0 && isFinite(val)) ? val : null; }
    return null;
}

function getCurrentColumnConfig() {
    return TREND_COLUMN_CONFIG[trendDataColumn] || TREND_COLUMN_CONFIG['差枚'];
}

// ===================
// 位置フィルター
// ===================

function renderTrendPositionFilter() {
    var container = document.getElementById('trendFilterContent');
    if (!container) return;
    var existing = container.querySelector('.trend-position-filter-section');
    if (existing) existing.remove();
    var section = document.createElement('div');
    section.className = 'filter-section trend-position-filter-section';
    section.innerHTML = '<h5>📍 位置フィルター</h5>' + renderMultiPositionFilter('trend', function() {
        renderTrendPositionFilter();
        invalidateCache(0);
        loadTrendData();
    });
    var firstSection = container.querySelector('.filter-section');
    if (firstSection) firstSection.before(section);
    else container.prepend(section);
    setupMultiPositionFilterEvents('trend', function() {
        renderTrendPositionFilter();
        invalidateCache(0);
        loadTrendData();
    });
}

// ===================
// 日付イベント情報
// ===================

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
            displayItems.push('🎤' + performerText + (event.performers.length > 2 ? '...' : ''));
        }
    });
    if (displayItems.length === 0) return '';
    return displayItems.length <= 2 ? displayItems.join(' / ') : displayItems.slice(0, 2).join(' / ') + '...';
}

// ===================
// 日付フィルター関連
// ===================

function dateToNumber(year, month, day) { return year * 10000 + month * 100 + day; }

function getFileDateNumber(file) {
    var parsed = parseDateFromFilename(file);
    return parsed ? dateToNumber(parsed.year, parsed.month, parsed.day) : 0;
}

function applyAllFilters() {
    var checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]');
    var logic = trendFilterLogic;
    var hasDateRange = activeTrendFilters.dateRange.type;
    var hasDayOfWeek = activeTrendFilters.dayOfWeek.length > 0;
    var hasSuffix = activeTrendFilters.suffix.length > 0;
    var hasSpecial = activeTrendFilters.special.length > 0;
    var hasEvents = activeTrendFilters.events.length > 0;
    if (!hasDateRange && !hasDayOfWeek && !hasSuffix && !hasSpecial && !hasEvents) {
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
            conditions.push(range.type === 'after' ? fileDate >= range.targetDate : fileDate <= range.targetDate);
        }
        if (hasDayOfWeek) conditions.push(activeTrendFilters.dayOfWeek.some(function(d) { return parseInt(d) === dayOfWeek; }));
        if (hasSuffix) conditions.push(activeTrendFilters.suffix.some(function(s) { return parseInt(s) === daySuffix; }));
        if (hasSpecial) {
            conditions.push(activeTrendFilters.special.some(function(special) {
                switch (special) {
                    case 'monthDay': return parsed.month === parsed.day;
                    case 'doubleDigit': return parsed.day === 11 || parsed.day === 22;
                    case 'hasEvent': return getEventsForDate(dateKey).some(function(e) { return hasEventOrPerformers(e); });
                    default: return false;
                }
            }));
        }
        if (hasEvents) {
            var eventsForDate = getEventsForDate(dateKey);
            conditions.push(activeTrendFilters.events.some(function(eventName) {
                return eventsForDate.some(function(e) {
                    return Array.isArray(e.name) ? e.name.indexOf(eventName) !== -1 : e.name === eventName;
                });
            }));
        }
        if ((logic === 'and' ? conditions.every(function(c) { return c; }) : conditions.some(function(c) { return c; }))) cb.checked = true;
    });
    updateTrendSelectionCount();
    updateActiveFilterDisplay();
}

function updateActiveFilterDisplay() {
    var container = document.getElementById('activeFiltersDisplay');
    if (!container) return;
    var items = [];
    if (activeTrendFilters.dateRange.type) {
        var r = activeTrendFilters.dateRange;
        var ds = ''; if (r.year) ds += r.year + '年'; if (r.month) ds += r.month + '月'; if (r.day) ds += r.day + '日';
        items.push('📅 ' + ds + (r.type === 'after' ? '以降' : '以前'));
    }
    if (activeTrendFilters.dayOfWeek.length > 0) { var d = ['日','月','火','水','木','金','土']; items.push('曜日: ' + activeTrendFilters.dayOfWeek.map(function(v) { return d[parseInt(v)]; }).join(',')); }
    if (activeTrendFilters.suffix.length > 0) items.push('末尾: ' + activeTrendFilters.suffix.join(','));
    if (activeTrendFilters.special.length > 0) { var sl = { 'monthDay': '月日ぞろ目', 'doubleDigit': 'ぞろ目', 'hasEvent': 'イベント有' }; items.push(activeTrendFilters.special.map(function(s) { return sl[s] || s; }).join(', ')); }
    if (activeTrendFilters.events.length > 0) items.push('🎯 ' + (activeTrendFilters.events.length <= 2 ? activeTrendFilters.events.join(', ') : activeTrendFilters.events.slice(0, 2).join(', ') + '...他' + (activeTrendFilters.events.length - 2) + '件'));
    container.innerHTML = items.length === 0 ? '<span class="no-filter">フィルターなし</span>' : '<span class="filter-logic-badge">' + (trendFilterLogic === 'and' ? 'AND' : 'OR') + '</span>' + items.map(function(i) { return '<span class="active-filter-tag">' + i + '</span>'; }).join('');
}

function updateTrendSelectionCount() {
    var total = document.querySelectorAll('#trendDateList input[type="checkbox"]').length;
    var checked = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked').length;
    var el = document.getElementById('trendSelectionCount');
    if (el) el.textContent = checked + '/' + total + '日選択中';
}

function quickSelectDays(days) {
    var sorted = sortFilesByDate(CSV_FILES, true).slice(0, days);
    document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) { cb.checked = sorted.indexOf(cb.value) !== -1; });
    updateTrendSelectionCount();
}

// ===================
// フィルターパネル
// ===================

function renderTrendFilterPanel() {
    var sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
    var availableYears = new Set();
    sortedFilesDesc.forEach(function(f) { var p = parseDateFromFilename(f); if (p) availableYears.add(p.year); });
    var yearsArray = Array.from(availableYears).sort(function(a, b) { return b - a; });
    var yearOpts = '<option value="">--</option>' + yearsArray.map(function(y) { return '<option value="' + y + '">' + y + '年</option>'; }).join('');
    var monthOpts = '<option value="">--</option>' + [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) { return '<option value="' + m + '">' + m + '月</option>'; }).join('');
    var dayOpts = '<option value="">--</option>' + Array.from({length:31}, function(_,i) { return i+1; }).map(function(d) { return '<option value="' + d + '">' + d + '日</option>'; }).join('');
    var allEvents = getAllEventNames();
    var eventBtns = allEvents.length > 0 ? allEvents.slice(0, 20).map(function(n) { return '<button class="event-filter-btn ' + (activeTrendFilters.events.indexOf(n) !== -1 ? 'active' : '') + '" data-event="' + escapeHtml(n) + '">' + n + '</button>'; }).join('') + (allEvents.length > 20 ? '<span class="text-muted" style="padding:4px 8px;font-size:11px;">他' + (allEvents.length - 20) + '件</span>' : '') : '<span class="text-muted" style="padding:8px;font-size:12px;">イベントデータがありません</span>';
    
    return '<div class="trend-filter-panel">' +
        '<div class="trend-quick-select"><h4>⚡ クイック選択</h4><div class="quick-select-row"><label>直近</label><select id="trendQuickDays"><option value="">日数を選択</option><option value="3">3日間</option><option value="5">5日間</option><option value="7">7日間</option><option value="10">10日間</option><option value="14">14日間</option><option value="30">30日間</option></select><button class="quick-select-btn" id="applyQuickDays">選択</button></div></div>' +
        '<div class="date-range-section"><h4>📆 期間フィルター</h4><div class="date-range-type-row"><select id="trendDateRangeType"><option value="">タイプを選択</option><option value="after">以降</option><option value="before">以前</option></select></div><div class="date-select-row"><div class="date-select-item"><select id="trendRangeYear">' + yearOpts + '</select></div><div class="date-select-item"><select id="trendRangeMonth">' + monthOpts + '</select></div><div class="date-select-item"><select id="trendRangeDay">' + dayOpts + '</select></div></div><div class="date-select-hint">※ 年/月/日は部分指定可能</div></div>' +
        '<div class="filter-logic-section"><h4>🔗 条件の結合方式</h4><div class="filter-logic-toggle"><button class="logic-btn ' + (trendFilterLogic === 'or' ? 'active' : '') + '" data-logic="or">OR</button><button class="logic-btn ' + (trendFilterLogic === 'and' ? 'active' : '') + '" data-logic="and">AND</button></div></div>' +
        '<div class="trend-filter-section"><h4>📅 条件フィルター</h4><div class="trend-filter-subsection"><h5>曜日</h5><div class="trend-filter-buttons">' + [0,1,2,3,4,5,6].map(function(d) { var days=['日','月','火','水','木','金','土']; return '<button class="trend-filter-btn ' + (activeTrendFilters.dayOfWeek.indexOf(String(d)) !== -1 ? 'active' : '') + '" data-filter="dayOfWeek" data-value="' + d + '">' + days[d] + '</button>'; }).join('') + '</div></div><div class="trend-filter-subsection"><h5>日付末尾</h5><div class="trend-filter-buttons">' + [0,1,2,3,4,5,6,7,8,9].map(function(s) { return '<button class="trend-filter-btn ' + (activeTrendFilters.suffix.indexOf(String(s)) !== -1 ? 'active' : '') + '" data-filter="suffix" data-value="' + s + '">' + s + '</button>'; }).join('') + '</div></div><div class="trend-filter-subsection"><h5>特殊日</h5><div class="trend-filter-buttons"><button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('monthDay') !== -1 ? 'active' : '') + '" data-filter="monthDay">月日ぞろ目</button><button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('doubleDigit') !== -1 ? 'active' : '') + '" data-filter="doubleDigit">日ぞろ目</button><button class="trend-filter-btn trend-filter-special ' + (activeTrendFilters.special.indexOf('hasEvent') !== -1 ? 'active' : '') + '" data-filter="hasEvent">イベントあり</button></div></div></div>' +
        '<div class="trend-filter-section"><h4>🎯 イベント</h4><div class="event-filter-list">' + eventBtns + '</div></div>' +
        '<div class="filter-apply-section"><button class="filter-apply-btn" id="applyFiltersBtn">🔍 フィルターを適用</button></div>' +
        '<div class="active-filters-section"><h5>適用中のフィルター</h5><div id="activeFiltersDisplay" class="active-filters-display"><span class="no-filter">フィルターなし</span></div></div>' +
        '<div class="trend-filter-actions"><span id="trendSelectionCount" class="trend-selection-count">0/0日選択中</span><button id="trendClearFilters" class="modal-btn">全てクリア</button></div></div>';
}

function escapeHtml(text) { var d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

function setupTrendFilterButtons() {
    document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('#trendFilterContainer .logic-btn').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            trendFilterLogic = btn.dataset.logic;
        });
    });
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="dayOfWeek"], #trendFilterContainer .trend-filter-btn[data-filter="suffix"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var arr = btn.dataset.filter === 'dayOfWeek' ? activeTrendFilters.dayOfWeek : activeTrendFilters.suffix;
            var idx = arr.indexOf(btn.dataset.value);
            if (idx === -1) arr.push(btn.dataset.value); else arr.splice(idx, 1);
        });
    });
    document.querySelectorAll('#trendFilterContainer .trend-filter-btn[data-filter="monthDay"], #trendFilterContainer .trend-filter-btn[data-filter="doubleDigit"], #trendFilterContainer .trend-filter-btn[data-filter="hasEvent"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var idx = activeTrendFilters.special.indexOf(btn.dataset.filter);
            if (idx === -1) activeTrendFilters.special.push(btn.dataset.filter); else activeTrendFilters.special.splice(idx, 1);
        });
    });
    var aqd = document.getElementById('applyQuickDays');
    if (aqd) aqd.addEventListener('click', function() { var s = document.getElementById('trendQuickDays'); if (s && s.value) quickSelectDays(parseInt(s.value)); });
    document.querySelectorAll('#trendFilterContainer .event-filter-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            btn.classList.toggle('active');
            var idx = activeTrendFilters.events.indexOf(btn.dataset.event);
            if (idx === -1) activeTrendFilters.events.push(btn.dataset.event); else activeTrendFilters.events.splice(idx, 1);
        });
    });
    var afb = document.getElementById('applyFiltersBtn');
    if (afb) afb.addEventListener('click', function() {
        var rt = (document.getElementById('trendDateRangeType') || {}).value || '';
        var ry = (document.getElementById('trendRangeYear') || {}).value || '';
        var rm = (document.getElementById('trendRangeMonth') || {}).value || '';
        var rd = (document.getElementById('trendRangeDay') || {}).value || '';
        if (rt && (ry || rm || rd)) {
            var y = ry ? parseInt(ry) : (rt === 'after' ? 1900 : 9999);
            var m = rm ? parseInt(rm) : (rt === 'after' ? 1 : 12);
            var d = rd ? parseInt(rd) : (rt === 'after' ? 1 : 31);
            activeTrendFilters.dateRange = { type: rt, year: ry||null, month: rm||null, day: rd||null, targetDate: dateToNumber(y, m, d) };
        } else {
            activeTrendFilters.dateRange = { type: null };
        }
        applyAllFilters();
    });
    var cf = document.getElementById('trendClearFilters');
    if (cf) cf.addEventListener('click', function() {
        activeTrendFilters = { dayOfWeek: [], suffix: [], special: [], events: [], dateRange: { type: null } };
        document.querySelectorAll('#trendFilterContainer .trend-filter-btn.active, #trendFilterContainer .event-filter-btn.active, #trendFilterContainer .logic-btn.active').forEach(function(b) { b.classList.remove('active'); });
        trendFilterLogic = 'or';
        var ob = document.querySelector('#trendFilterContainer .logic-btn[data-logic="or"]');
        if (ob) ob.classList.add('active');
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
        ['trendQuickDays','trendDateRangeType','trendRangeYear','trendRangeMonth','trendRangeDay'].forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ''; });
        updateTrendSelectionCount();
        updateActiveFilterDisplay();
    });
}

// ===================
// 日付選択モーダル
// ===================

function populateTrendDateList() {
    var container = document.getElementById('trendDateList');
    var filterContainer = document.getElementById('trendFilterContainer');
    if (!container) return;
    return loadEventData().then(function() {
        if (filterContainer) { filterContainer.innerHTML = renderTrendFilterPanel(); setupTrendFilterButtons(); }
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var fragment = document.createDocumentFragment();
        sortedFiles.forEach(function(file) {
            var dow = getDayOfWeek(file), dn = getDayOfWeekName(dow), dc = dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : '';
            var et = getTrendDateEventText(file), parsed = parseDateFromFilename(file), di = '';
            if (parsed) { if (parsed.month === parsed.day) di += '<span class="date-tag month-day">月日ぞろ目</span>'; if (parsed.day === 11 || parsed.day === 22) di += '<span class="date-tag double-digit">ぞろ目</span>'; }
            var item = document.createElement('div');
            item.className = 'date-checkbox-item';
            var isSel = selectedTrendDates && selectedTrendDates.indexOf(file) !== -1;
            item.innerHTML = '<input type="checkbox" id="trend-date-' + file + '" value="' + file + '"' + (isSel ? ' checked' : '') + '><label for="trend-date-' + file + '">' + formatDate(file) + '</label><span class="day-of-week ' + dc + '">(' + dn + ')</span>' + di + (et ? '<span class="date-event-info">' + et + '</span>' : '');
            item.querySelector('input').addEventListener('change', updateTrendSelectionCount);
            fragment.appendChild(item);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
        updateTrendSelectionCount();
        updateActiveFilterDisplay();
    });
}

function getSelectedTrendDates() { return Array.from(document.querySelectorAll('#trendDateList input[type="checkbox"]:checked')).map(function(cb) { return cb.value; }); }
function openTrendCalendarModal() { var m = document.getElementById('trendCalendarModal'); if (m) { populateTrendDateList(); m.classList.add('active'); } }
function closeTrendCalendarModal() { var m = document.getElementById('trendCalendarModal'); if (m) m.classList.remove('active'); }

function updateTrendPeriodLabel() {
    var label = document.getElementById('trendPeriodLabel');
    if (!label) return;
    if (!selectedTrendDates || selectedTrendDates.length === 0) { label.textContent = '7日間（デフォルト）'; }
    else if (selectedTrendDates.length === 1) { label.textContent = formatDate(selectedTrendDates[0]); }
    else { var s = sortFilesByDate(selectedTrendDates, false); label.textContent = selectedTrendDates.length + '日間 (' + formatDateShort(s[0]) + '〜' + formatDateShort(s[s.length - 1]) + ')'; }
}

// ===================
// 機種フィルター
// ===================

function initTrendMachineFilter() {
    var tf = (selectedTrendDates && selectedTrendDates.length > 0) ? selectedTrendDates : sortFilesByDate(CSV_FILES, true).slice(0, 7);
    var opts = getMachineOptionsForLatestDate(tf);
    if (trendMachineFilterSelect) trendMachineFilterSelect.updateOptions(opts);
    else trendMachineFilterSelect = initMultiSelectMachineFilter('trendMachineFilterContainer', opts, '全機種', function() { invalidateCache(0); loadTrendData(); });
}

function updateTrendMachineFilterOptions(targetFiles) {
    var opts = getMachineOptionsForLatestDate(targetFiles);
    if (trendMachineFilterSelect) trendMachineFilterSelect.updateOptions(opts);
}

// ===================
// 列表示・グラフ設定
// ===================

function initTrendColumnSettings() {
    trendShowTotal = localStorage.getItem('trendShowTotal') !== 'false';
    trendShowAvg = localStorage.getItem('trendShowAvg') !== 'false';
    trendShowPrevTotal = localStorage.getItem('trendShowPrevTotal') === 'true';
    trendShowChart = localStorage.getItem('trendShowChart') !== 'false';
    var e;
    if ((e = document.getElementById('trendShowTotal'))) e.checked = trendShowTotal;
    if ((e = document.getElementById('trendShowAvg'))) e.checked = trendShowAvg;
    if ((e = document.getElementById('trendShowPrevTotal'))) e.checked = trendShowPrevTotal;
    if ((e = document.getElementById('trendShowChart'))) e.checked = trendShowChart;
    updateChartVisibility();
}

function saveTrendColumnSettings() {
    localStorage.setItem('trendShowTotal', trendShowTotal);
    localStorage.setItem('trendShowAvg', trendShowAvg);
    localStorage.setItem('trendShowPrevTotal', trendShowPrevTotal);
    localStorage.setItem('trendShowChart', trendShowChart);
}

function updateChartVisibility() {
    var c = document.querySelector('.trend-chart-container');
    if (c) c.style.display = trendShowChart ? 'block' : 'none';
}

function updateUIForDataColumn() {
    var config = getCurrentColumnConfig();
    var ct = document.getElementById('trendChartTitle');
    if (ct) ct.textContent = '📈 ' + config.chartLabel + '推移グラフ';
    var ag = document.getElementById('machineAggTypeGroup');
    if (ag) ag.style.display = trendViewMode === 'machine' ? 'flex' : 'none';
    if (!config.canSum) { var as = document.getElementById('trendMachineAggType'); if (as) { as.value = 'avg'; trendMachineAggType = 'avg'; } }
}

// ===================
// メインデータ読み込み（3段階キャッシュ）
// ===================

function loadTrendData() {
    var selectedMachines = trendMachineFilterSelect ? trendMachineFilterSelect.getSelectedValues() : [];
    var sortBy = (document.getElementById('trendSortBy') || {}).value || 'total_desc';
    var totalFilterType = (document.getElementById('trendTotalFilterType') || {}).value || '';
    var totalFilterValue = (document.getElementById('trendTotalFilterValue') || {}).value || '';
    var prevTotalFilterType = (document.getElementById('trendPrevTotalFilterType') || {}).value || '';
    var prevTotalFilterValue = (document.getElementById('trendPrevTotalFilterValue') || {}).value || '';

    var newShowTotal = document.getElementById('trendShowTotal') ? document.getElementById('trendShowTotal').checked : true;
    var newShowAvg = document.getElementById('trendShowAvg') ? document.getElementById('trendShowAvg').checked : true;
    var newShowPrevTotal = document.getElementById('trendShowPrevTotal') ? document.getElementById('trendShowPrevTotal').checked : false;
    var newShowChart = document.getElementById('trendShowChart') ? document.getElementById('trendShowChart').checked : true;
    
    // 表示列変更のみならレンダリングだけ
    var displayOnly = (trendShowTotal !== newShowTotal || trendShowAvg !== newShowAvg || trendShowPrevTotal !== newShowPrevTotal || trendShowChart !== newShowChart) && trendCache.finalResults;
    
    trendShowTotal = newShowTotal;
    trendShowAvg = newShowAvg;
    trendShowPrevTotal = newShowPrevTotal;
    trendShowChart = newShowChart;
    saveTrendColumnSettings();
    updateChartVisibility();

    var newViewMode = (document.getElementById('trendViewMode') || {}).value || 'unit';
    var newDataColumn = (document.getElementById('trendDataColumn') || {}).value || '差枚';
    var newAggType = (document.getElementById('trendMachineAggType') || {}).value || 'total';

    // キャッシュ無効化の判定
    if (newViewMode !== trendViewMode) invalidateCache(0);
    if (newDataColumn !== trendDataColumn) invalidateCache(1);
    if (newAggType !== trendMachineAggType) invalidateCache(1);

    trendViewMode = newViewMode;
    trendDataColumn = newDataColumn;
    trendMachineAggType = newAggType;
    updateUIForDataColumn();

    var summaryEl = document.getElementById('trendSummary');
    if (!summaryEl) return;

    var targetFiles;
    if (selectedTrendDates && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        targetFiles = sortFilesByDate(sortFilesByDate(CSV_FILES, true).slice(0, 7), false);
    }

    if (targetFiles.length === 0) { summaryEl.innerHTML = '<p>表示する日付を選択してください</p>'; return; }

    updateTrendMachineFilterOptions(targetFiles);

    var config = getCurrentColumnConfig();
    var latestFile = targetFiles[targetFiles.length - 1];
    var positionState = getPositionFilterState('trend');

    // === Stage 1: 生データ収集 ===
    var rawParams = makeCacheKey({ files: targetFiles, machines: selectedMachines, position: positionState, viewMode: trendViewMode });
    
    if (trendCache.rawParams !== rawParams) {
        trendCache.rawData = collectRawData(targetFiles, selectedMachines, positionState, latestFile);
        trendCache.rawParams = rawParams;
        invalidateCache(1);
    }

    // === Stage 2: 集計 ===
    var aggParams = makeCacheKey({ column: trendDataColumn, aggType: trendMachineAggType });
    
    if (trendCache.aggParams !== aggParams) {
        trendCache.aggregated = aggregateData(trendCache.rawData, targetFiles, latestFile, config);
        trendCache.aggParams = aggParams;
        invalidateCache(2);
    }

    // === Stage 3: フィルター＆ソート ===
    var finalParams = makeCacheKey({ sortBy: sortBy, tft: totalFilterType, tfv: totalFilterValue, ptft: prevTotalFilterType, ptfv: prevTotalFilterValue });

    if (trendCache.finalParams !== finalParams || !trendCache.finalResults) {
        var results = trendCache.aggregated.slice();
        results = applyValueFilters(results, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue);
        results = sortTrendResults(results, sortBy, latestFile);
        trendCache.finalResults = results;
        trendCache.finalParams = finalParams;
    }

    // === レンダリング ===
    var results = trendCache.finalResults;

    // 機種内バッジ付与（台別モードのみ・レンダリング時に再計算）
    if (trendViewMode === 'unit' && typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled()) {
        results = MachineBadge.assignBadgesForTrend(results, 'total');
    }
    
    renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue, trendViewMode === 'machine', config);
    
    if (trendViewMode === 'machine') {
        renderTrendTablesByMachine(results, targetFiles, config);
    } else {
        renderTrendTables(results, targetFiles, config);
    }
    
    renderTrendChartData(results, targetFiles, trendViewMode, config);
}

// ===================
// Stage 1: 生データ収集
// ===================

function collectRawData(targetFiles, selectedMachines, positionState, latestFile) {
    var collected = {};

    if (trendViewMode === 'unit') {
        targetFiles.forEach(function(file) {
            var data = dataCache[file];
            if (!data) return;
            data.forEach(function(row) {
                var machine = row['機種名'], num = row['台番号'];
                if (selectedMachines.length > 0 && selectedMachines.indexOf(machine) === -1) return;
                if (positionState.selected.length > 0) {
                    var tags = getPositionTags(num);
                    var match = positionState.logic === 'and'
                        ? positionState.selected.every(function(t) { return tags.indexOf(t) !== -1; })
                        : positionState.selected.some(function(t) { return tags.indexOf(t) !== -1; });
                    if (!match) return;
                }
                var key = machine + '_' + num;
                if (!collected[key]) collected[key] = { machine: machine, num: num, rows: {} };
                collected[key].rows[file] = row;
            });
        });
        // 最新日にデータがない台を除外
        Object.keys(collected).forEach(function(key) {
            if (!collected[key].rows[latestFile]) delete collected[key];
        });
    } else {
        targetFiles.forEach(function(file) {
            var data = dataCache[file];
            if (!data) return;
            data.forEach(function(row) {
                var machine = row['機種名'], num = row['台番号'];
                if (selectedMachines.length > 0 && selectedMachines.indexOf(machine) === -1) return;
                if (positionState.selected.length > 0) {
                    var tags = getPositionTags(num);
                    var match = positionState.logic === 'and'
                        ? positionState.selected.every(function(t) { return tags.indexOf(t) !== -1; })
                        : positionState.selected.some(function(t) { return tags.indexOf(t) !== -1; });
                    if (!match) return;
                }
                if (!collected[machine]) collected[machine] = { machine: machine, fileRows: {} };
                if (!collected[machine].fileRows[file]) collected[machine].fileRows[file] = [];
                collected[machine].fileRows[file].push(row);
            });
        });
        // 最新日にデータがない機種を除外
        Object.keys(collected).forEach(function(key) {
            if (!collected[key].fileRows[latestFile] || collected[key].fileRows[latestFile].length === 0) delete collected[key];
        });
    }

    return collected;
}

// ===================
// Stage 2: 集計
// ===================

function aggregateData(rawData, targetFiles, latestFile, config) {
    if (trendViewMode === 'unit') {
        return aggregateUnitData(rawData, targetFiles, latestFile, config);
    } else {
        return aggregateMachineData(rawData, targetFiles, latestFile, config);
    }
}

function aggregateUnitData(rawData, targetFiles, latestFile, config) {
    var results = [];
    
    Object.values(rawData).forEach(function(item) {
        var entry = { machine: item.machine, num: item.num, dates: {} };
        var validValues = [];

        targetFiles.forEach(function(file) {
            var row = item.rows[file];
            if (row) {
                var val = config.parseRow(row);
                entry.dates[file] = val;
                if (val !== null) validValues.push(val);
            }
        });

        if (config.canSum) {
            entry.total = validValues.reduce(function(a, b) { return a + b; }, 0);
            entry.avg = validValues.length > 0 ? Math.round(entry.total / validValues.length) : 0;
        } else {
            entry.avg = validValues.length > 0 ? validValues.reduce(function(a, b) { return a + b; }, 0) / validValues.length : null;
            entry.total = entry.avg;
        }

        entry.latestVal = entry.dates[latestFile] !== undefined ? entry.dates[latestFile] : null;

        if (config.canSum) {
            entry.prevTotal = entry.total - (entry.latestVal || 0);
        } else {
            var pv = [];
            targetFiles.forEach(function(f) { if (f !== latestFile && entry.dates[f] !== undefined && entry.dates[f] !== null) pv.push(entry.dates[f]); });
            entry.prevTotal = pv.length > 0 ? pv.reduce(function(a, b) { return a + b; }, 0) / pv.length : null;
        }

        results.push(entry);
    });

    return results;
}

function aggregateMachineData(rawData, targetFiles, latestFile, config) {
    var results = [];
    var useAvg = trendMachineAggType === 'avg' || !config.canSum;

    Object.values(rawData).forEach(function(item) {
        var entry = { machine: item.machine, dates: {} };
        var totalUnits = 0;

        targetFiles.forEach(function(file) {
            var rows = item.fileRows[file] || [];
            var unitCount = rows.length;
            totalUnits += unitCount;

            if (unitCount === 0) { entry.dates[file] = null; return; }

            if (config.canSum) {
                var sum = 0;
                rows.forEach(function(r) { sum += config.parseRow(r) || 0; });
                entry.dates[file] = useAvg ? Math.round(sum / unitCount) : sum;
            } else {
                var vals = [];
                rows.forEach(function(r) { var v = config.parseRow(r); if (v !== null) vals.push(v); });
                entry.dates[file] = vals.length > 0 ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : null;
            }
        });

        entry.num = totalUnits + '台';

        var allValidValues = [];
        targetFiles.forEach(function(f) { if (entry.dates[f] !== null && entry.dates[f] !== undefined) allValidValues.push(entry.dates[f]); });

        if (config.canSum && !useAvg) {
            entry.total = allValidValues.reduce(function(a, b) { return a + b; }, 0);
            entry.avg = totalUnits > 0 ? Math.round(entry.total / totalUnits) : 0;
        } else {
            entry.avg = allValidValues.length > 0 ? allValidValues.reduce(function(a, b) { return a + b; }, 0) / allValidValues.length : null;
            entry.total = entry.avg;
        }

        entry.latestVal = entry.dates[latestFile];

        if (config.canSum && !useAvg) {
            entry.prevTotal = entry.total - (entry.dates[latestFile] || 0);
        } else {
            var pv = [];
            targetFiles.forEach(function(f) { if (f !== latestFile && entry.dates[f] !== null && entry.dates[f] !== undefined) pv.push(entry.dates[f]); });
            entry.prevTotal = pv.length > 0 ? pv.reduce(function(a, b) { return a + b; }, 0) / pv.length : null;
        }

        results.push(entry);
    });

    return results;
}

// ===================
// フィルター・ソート
// ===================

function applyValueFilters(results, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue) {
    if (totalFilterType && totalFilterValue) {
        var fv = parseFloat(totalFilterValue);
        if (!isNaN(fv)) results = results.filter(function(item) { var v = item.total !== null ? item.total : 0; return totalFilterType === 'gte' ? v >= fv : v <= fv; });
    }
    if (prevTotalFilterType && prevTotalFilterValue) {
        var pfv = parseFloat(prevTotalFilterValue);
        if (!isNaN(pfv)) results = results.filter(function(item) { var v = item.prevTotal !== null ? item.prevTotal : 0; return prevTotalFilterType === 'gte' ? v >= pfv : v <= pfv; });
    }
    return results;
}

function sortTrendResults(results, sortBy, latestFile) {
    return HallData.sort.apply(results, sortBy, { latestFile: latestFile });
}

// ===================
// サマリー表示
// ===================

function renderTrendSummary(results, targetFiles, selectedMachines, totalFilterType, totalFilterValue, prevTotalFilterType, prevTotalFilterValue, isMachineMode, config) {
    var el = document.getElementById('trendSummary');
    if (!el) return;
    var ml = isMachineMode ? '機種' : '台';
    var info = '表示: ' + results.length + ml + ' | 期間: ' + targetFiles.length + '日間';
    if (selectedMachines.length > 0) info += ' | ' + selectedMachines.length + '機種選択中';
    var pt = getPositionFilterDisplayText('trend');
    if (pt) info += ' | 位置: ' + pt;
    info += ' | 項目: ' + config.label;
    if (config.canSum) {
        var tv = results.reduce(function(s, r) { return s + (r.total || 0); }, 0);
        info += ' | 合計: <span class="' + config.colorClass(tv) + '">' + config.format(tv) + '</span>';
    }
    el.innerHTML = info;

    // 機種別モード時はサマリーカードも描画
    if (isMachineMode && config.canSum) {
        renderMachineSummaryCards(results, targetFiles, config);
    } else {
        var sc = document.getElementById('trendMachineSummaryWrapper');
        if (sc) sc.style.display = 'none';
    }
}

// ===================
// 機種別サマリーカード ページネーション状態
// ===================

var machineSummaryPage = 0;
var machineSummaryPageSize = 5;
var machineSummaryResults = [];
var machineSummaryTargetFiles = [];
var machineSummaryConfig = null;

/**
 * 機種別モード用サマリーカード描画（ページネーション対応）
 */
function renderMachineSummaryCards(results, targetFiles, config) {
    var wrapper = document.getElementById('trendMachineSummaryWrapper');
    if (!wrapper) return;

    // データを保存（ページ切り替え時に再利用）
    machineSummaryResults = results;
    machineSummaryTargetFiles = targetFiles;
    machineSummaryConfig = config;
    // データが新しく来たときはページを先頭に戻す
    machineSummaryPage = 0;

    renderMachineSummaryPage();
}

/**
 * 現在のページを描画する
 */
function renderMachineSummaryPage() {
    var wrapper = document.getElementById('trendMachineSummaryWrapper');
    if (!wrapper) return;

    var results     = machineSummaryResults;
    var targetFiles = machineSummaryTargetFiles;
    var config      = machineSummaryConfig;

    if (!results || results.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    var COLORS = [
        '#4ade80','#60a5fa','#f472b6','#fbbf24','#a78bfa',
        '#fb923c','#2dd4bf','#f87171','#818cf8','#34d399',
        '#e879f9','#38bdf8','#facc15','#fb7185','#a3e635',
        '#22d3ee','#c084fc','#fca5a5','#86efac','#93c5fd',
    ];

    var pageSize   = machineSummaryPageSize;
    var totalPages = Math.ceil(results.length / pageSize);
    // ページ範囲を正規化
    if (machineSummaryPage < 0) machineSummaryPage = 0;
    if (machineSummaryPage >= totalPages) machineSummaryPage = totalPages - 1;

    var start = machineSummaryPage * pageSize;
    var pageItems = results.slice(start, start + pageSize);

    var sign = function(v) { return v >= 0 ? '+' : ''; };

    var cards = pageItems.map(function(row, localIdx) {
        var idx   = start + localIdx;            // 全体インデックス（色を全体で統一）
        var color = COLORS[idx % COLORS.length];
        var dailyValues = targetFiles
            .map(function(f) { return row.dates[f]; })
            .filter(function(v) { return v !== null && v !== undefined; });

        if (dailyValues.length === 0) {
            return '<div class="trend-mc-card" style="--mc-color:' + color + '">'
                + '<div class="trend-mc-name">' + row.machine + '</div>'
                + '<div class="trend-mc-nodata">データなし</div>'
                + '</div>';
        }

        var total      = dailyValues.reduce(function(a, b) { return a + b; }, 0);
        var avg        = total / dailyValues.length;
        var maxVal     = Math.max.apply(null, dailyValues);
        var minVal     = Math.min.apply(null, dailyValues);
        var plusDays   = dailyValues.filter(function(v) { return v > 0; }).length;
        var winRate    = ((plusDays / dailyValues.length) * 100).toFixed(1);
        var totalClass = total > 0 ? 'plus' : total < 0 ? 'minus' : '';

        return '<div class="trend-mc-card" style="--mc-color:' + color + '">'
            + '<div class="trend-mc-name">' + row.machine
            +   '<span class="trend-mc-units">（' + row.num + '）</span></div>'
            + '<div class="trend-mc-total ' + totalClass + '">'
            +   sign(total) + Math.round(total).toLocaleString() + config.unit + '</div>'
            + '<div class="trend-mc-label">期間合計</div>'
            + '<div class="trend-mc-stats">'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">日平均</span>'
            +     '<span class="trend-mc-stat-val ' + (avg > 0 ? 'plus' : avg < 0 ? 'minus' : '') + '">'
            +     sign(avg) + Math.round(avg).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">最高日</span>'
            +     '<span class="trend-mc-stat-val plus">'
            +     sign(maxVal) + Math.round(maxVal).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">最低日</span>'
            +     '<span class="trend-mc-stat-val ' + (minVal < 0 ? 'minus' : '') + '">'
            +     sign(minVal) + Math.round(minVal).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">勝率</span>'
            +     '<span class="trend-mc-stat-val">' + winRate + '%'
            +     ' (' + plusDays + '/' + dailyValues.length + '日)</span></div>'
            + '</div>'
            + '</div>';
    }).join('');

    // ページネーションボタン生成
    var pageBtns = '';
    for (var p = 0; p < totalPages; p++) {
        pageBtns += '<button class="trend-mc-page-btn' + (p === machineSummaryPage ? ' active' : '') + '" data-page="' + p + '">' + (p + 1) + '</button>';
    }

    var rangeEnd = Math.min(start + pageSize, results.length);
    var infoText = (start + 1) + '〜' + rangeEnd + ' / ' + results.length + '機種';

    wrapper.innerHTML =
        '<div class="trend-mc-pagination">'
        + '<button class="trend-mc-pager" id="mcPrevPage" ' + (machineSummaryPage === 0 ? 'disabled' : '') + '>◀</button>'
        + '<div class="trend-mc-page-btns">' + pageBtns + '</div>'
        + '<button class="trend-mc-pager" id="mcNextPage" ' + (machineSummaryPage >= totalPages - 1 ? 'disabled' : '') + '>▶</button>'
        + '<span class="trend-mc-page-info">' + infoText + '</span>'
        + '</div>'
        + '<div id="trendMachineSummaryCards" class="trend-machine-summary-cards">' + cards + '</div>';

    // ページネーションイベント
    var prevBtn = document.getElementById('mcPrevPage');
    var nextBtn = document.getElementById('mcNextPage');
    if (prevBtn) prevBtn.addEventListener('click', function() {
        if (machineSummaryPage > 0) { machineSummaryPage--; renderMachineSummaryPage(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
        if (machineSummaryPage < totalPages - 1) { machineSummaryPage++; renderMachineSummaryPage(); }
    });
    wrapper.querySelectorAll('.trend-mc-page-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            machineSummaryPage = parseInt(btn.dataset.page);
            renderMachineSummaryPage();
        });
    });

    wrapper.style.display = 'block';
}

// ===================
// テーブル描画（台別）- DocumentFragment使用
// ===================

function renderTrendTables(results, targetFiles, config) {
    var fth = document.querySelector('#trend-fixed-table thead');
    var ftb = document.querySelector('#trend-fixed-table tbody');
    var sth = document.querySelector('#trend-scroll-table thead');
    var stb = document.querySelector('#trend-scroll-table tbody');
    if (!fth || !ftb || !sth || !stb) return;

    fth.innerHTML = '<tr><th>機種名</th><th>台番号</th><th>位置</th><th>機種内順位</th></tr>';

    var sh = targetFiles.map(function(f) { return '<th>' + formatDateShort(f) + '</th>'; }).join('');
    if (trendShowTotal) sh += '<th>合計</th>';
    if (trendShowAvg) sh += '<th>平均</th>';
    if (trendShowPrevTotal) sh += '<th>最新日以前</th>';
    sth.innerHTML = '<tr>' + sh + '</tr>';

    var ff = document.createDocumentFragment();
    var sf = document.createDocumentFragment();

    results.forEach(function(row) {
        var ftr = document.createElement('tr');
        var posHtml = (typeof renderPositionTags === 'function') ? (renderPositionTags(row.num, { compact: true }) || '-') : '-';
        var badgeInner = (typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled())
            ? MachineBadge.renderBadgeInner(row._machineBadge || { tako: null, kubi: null })
            : '-';
        ftr.innerHTML = '<td>' + row.machine + '</td><td>' + row.num + '</td><td>' + posHtml + '</td><td class="mb-cell">' + badgeInner + '</td>';
        ff.appendChild(ftr);

        var str = document.createElement('tr');
        var cells = '';
        targetFiles.forEach(function(file) {
            var val = row.dates[file];
            if (val !== undefined && val !== null) { cells += '<td class="' + config.colorClass(val) + '">' + config.format(val) + '</td>'; }
            else { cells += '<td>-</td>'; }
        });
        if (trendShowTotal) { cells += renderValueCell(config.canSum ? row.total : row.avg, config); }
        if (trendShowAvg) { cells += renderValueCell(row.avg, config); }
        if (trendShowPrevTotal) { cells += renderValueCell(row.prevTotal, config); }
        str.innerHTML = cells;
        sf.appendChild(str);
    });

    ftb.innerHTML = '';
    ftb.appendChild(ff);
    stb.innerHTML = '';
    stb.appendChild(sf);
    requestAnimationFrame(syncRowHeights);
}

// ===================
// テーブル描画（機種別）
// ===================

function renderTrendTablesByMachine(results, targetFiles, config) {
    var fth = document.querySelector('#trend-fixed-table thead');
    var ftb = document.querySelector('#trend-fixed-table tbody');
    var sth = document.querySelector('#trend-scroll-table thead');
    var stb = document.querySelector('#trend-scroll-table tbody');
    if (!fth || !ftb || !sth || !stb) return;

    fth.innerHTML = '<tr><th>機種名</th><th>延べ台数</th><th>機種内順位</th></tr>';

    var al = (!config.canSum || trendMachineAggType === 'avg') ? '平均' : '合計';
    var sh = targetFiles.map(function(f) { return '<th>' + formatDateShort(f) + '</th>'; }).join('');
    if (trendShowTotal) sh += '<th>' + al + '</th>';
    if (trendShowAvg && config.canSum && trendMachineAggType !== 'avg') sh += '<th>台平均</th>';
    if (trendShowPrevTotal) sh += '<th>最新日以前</th>';
    sth.innerHTML = '<tr>' + sh + '</tr>';

    var ff = document.createDocumentFragment();
    var sf = document.createDocumentFragment();

    results.forEach(function(row) {
        var ftr = document.createElement('tr');
        var mBadgeInner = (typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled())
            ? MachineBadge.renderBadgeInner(row._machineBadge || { tako: null, kubi: null })
            : '-';
        ftr.innerHTML = '<td>' + row.machine + '</td><td>' + row.num + '</td><td class="mb-cell">' + mBadgeInner + '</td>';
        ff.appendChild(ftr);

        var str = document.createElement('tr');
        var cells = '';
        targetFiles.forEach(function(file) {
            var val = row.dates[file];
            if (val !== null && val !== undefined) { cells += '<td class="' + config.colorClass(val) + '">' + config.format(val) + '</td>'; }
            else { cells += '<td>-</td>'; }
        });
        if (trendShowTotal) { cells += renderValueCell(row.total, config); }
        if (trendShowAvg && config.canSum && trendMachineAggType !== 'avg') { cells += renderValueCell(row.avg, config); }
        if (trendShowPrevTotal) { cells += renderValueCell(row.prevTotal, config); }
        str.innerHTML = cells;
        sf.appendChild(str);
    });

    ftb.innerHTML = '';
    ftb.appendChild(ff);
    stb.innerHTML = '';
    stb.appendChild(sf);
    requestAnimationFrame(syncRowHeights);
}

function renderValueCell(val, config) {
    if (val !== null && val !== undefined) {
        return '<td class="' + config.colorClass(val) + '">' + config.format(val) + '</td>';
    }
    return '<td>-</td>';
}

// ===================
// グラフ描画
// ===================

function renderTrendChartData(results, targetFiles, mode, config) {
    window.trendDisplayData = { results: results, targetFiles: targetFiles, mode: mode, config: config };
    if (trendShowChart && typeof renderTrendChart === 'function') {
        var st  = document.getElementById('chartShowTop')    ? document.getElementById('chartShowTop').checked    : true;
        var sb  = document.getElementById('chartShowBottom') ? document.getElementById('chartShowBottom').checked : false;
        var sa  = document.getElementById('chartShowAll')    ? document.getElementById('chartShowAll').checked    : false;
        var dc  = parseInt((document.getElementById('chartDisplayCount') || {}).value || '5');
        renderTrendChart(results, targetFiles, { showTop: st, showBottom: sb, showAll: sa, displayCount: dc, mode: mode, config: config });
    }
}

// ===================
// 行の高さ同期（最適化版）
// ===================

function syncRowHeights() {
    var fr = document.querySelectorAll('#trend-fixed-table tbody tr');
    var sr = document.querySelectorAll('#trend-scroll-table tbody tr');
    if (fr.length === 0 || sr.length === 0) return;

    // バッチ読み取り
    var heights = [];
    for (var i = 0; i < fr.length; i++) {
        if (sr[i]) heights.push(Math.max(fr[i].offsetHeight, sr[i].offsetHeight));
    }
    // バッチ書き込み
    for (var j = 0; j < heights.length; j++) {
        fr[j].style.height = heights[j] + 'px';
        sr[j].style.height = heights[j] + 'px';
    }

    var fh = document.querySelector('#trend-fixed-table thead tr');
    var sh = document.querySelector('#trend-scroll-table thead tr');
    if (fh && sh) { var mh = Math.max(fh.offsetHeight, sh.offsetHeight); fh.style.height = mh + 'px'; sh.style.height = mh + 'px'; }
}

var resizeTimeout = null;
function handleResize() { if (resizeTimeout) clearTimeout(resizeTimeout); resizeTimeout = setTimeout(syncRowHeights, 150); }

// ===================
// コピー・ダウンロード
// ===================

function getTrendTableData() { return getMergedTableData(document.getElementById('trend-fixed-table'), document.getElementById('trend-scroll-table')); }
function copyTrendTable() { copyToClipboard(getTrendTableData(), document.getElementById('copyTrendTableBtn')); }
function downloadTrendCSV() {
    var data = getTrendTableData();
    if (data.rows.length === 0) { showCopyToast('ダウンロードするデータがありません', true); return; }
    var days = (selectedTrendDates && selectedTrendDates.length) ? selectedTrendDates.length : 7;
    var today = new Date().toISOString().split('T')[0].replace(/-/g, '_');
    downloadAsCSV(data, 'trend_' + trendDataColumn + '_' + trendViewMode + '_' + days + 'days_' + today + '.csv');
}

// ===================
// フィルターリセット
// ===================

function resetTrendFilters() {
    ['trendTotalFilterType','trendTotalFilterValue','trendPrevTotalFilterType','trendPrevTotalFilterValue'].forEach(function(id) { var e = document.getElementById(id); if (e) e.value = ''; });
    if (trendMachineFilterSelect) trendMachineFilterSelect.reset();
    trendShowTotal = true; trendShowAvg = true; trendShowPrevTotal = false; trendShowChart = true;
    saveTrendColumnSettings();
    var ids = { trendShowTotal: true, trendShowAvg: true, trendShowPrevTotal: false, trendShowChart: true };
    Object.keys(ids).forEach(function(id) { var e = document.getElementById(id); if (e) e.checked = ids[id]; });
    updateChartVisibility();
    resetPositionFilter('trend');
    renderTrendPositionFilter();
    invalidateCache(0);
    loadTrendData();
}

// ===================
// デバウンス
// ===================

function debounce(func, wait) {
    var timeout;
    return function() { var ctx = this, args = arguments; clearTimeout(timeout); timeout = setTimeout(function() { func.apply(ctx, args); }, wait); };
}

// ===================
// イベントリスナー設定
// ===================

function setupTrendEventListeners() {
    // データに影響する変更 → キャッシュ無効化
    var el;
    
    el = document.getElementById('trendViewMode');
    if (el) el.addEventListener('change', function() {
        var ag = document.getElementById('machineAggTypeGroup');
        if (ag) ag.style.display = this.value === 'machine' ? 'flex' : 'none';
        invalidateCache(0);
        loadTrendData();
    });
    
    el = document.getElementById('trendDataColumn');
    if (el) el.addEventListener('change', function() { invalidateCache(1); loadTrendData(); });
    
    el = document.getElementById('trendMachineAggType');
    if (el) el.addEventListener('change', function() { invalidateCache(1); loadTrendData(); });

    // ソート・フィルター変更 → Stage3のみ再実行
    el = document.getElementById('trendSortBy');
    if (el) el.addEventListener('change', function() { invalidateCache(2); loadTrendData(); });
    
    el = document.getElementById('trendTotalFilterType');
    if (el) el.addEventListener('change', function() { invalidateCache(2); loadTrendData(); });
    
    el = document.getElementById('trendTotalFilterValue');
    if (el) el.addEventListener('input', debounce(function() { invalidateCache(2); loadTrendData(); }, 500));
    
    el = document.getElementById('trendPrevTotalFilterType');
    if (el) el.addEventListener('change', function() { invalidateCache(2); loadTrendData(); });
    
    el = document.getElementById('trendPrevTotalFilterValue');
    if (el) el.addEventListener('input', debounce(function() { invalidateCache(2); loadTrendData(); }, 500));

    // 表示列変更 → レンダリングのみ
    ['trendShowTotal', 'trendShowAvg', 'trendShowPrevTotal', 'trendShowChart'].forEach(function(id) {
        var e = document.getElementById(id);
        if (e) e.addEventListener('change', loadTrendData);
    });

    document.getElementById('loadTrend')?.addEventListener('click', function() { invalidateCache(0); loadTrendData(); });
    document.getElementById('openTrendCalendar')?.addEventListener('click', openTrendCalendarModal);
    document.getElementById('closeTrendCalendar')?.addEventListener('click', closeTrendCalendarModal);

    var cm = document.getElementById('trendCalendarModal');
    if (cm) cm.addEventListener('click', function(e) { if (e.target.id === 'trendCalendarModal') closeTrendCalendarModal(); });

    document.getElementById('selectAllDates')?.addEventListener('click', function() {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) { cb.checked = true; });
        updateTrendSelectionCount();
    });
    document.getElementById('deselectAllDates')?.addEventListener('click', function() {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(function(cb) { cb.checked = false; });
        updateTrendSelectionCount();
    });
    document.getElementById('applyTrendDates')?.addEventListener('click', function() {
        selectedTrendDates = getSelectedTrendDates();
        updateTrendPeriodLabel();
        closeTrendCalendarModal();
        invalidateCache(0);
        loadTrendData();
    });

    window.addEventListener('resize', handleResize);
    initTrendMachineFilter();
    initTrendColumnSettings();
    renderTrendPositionFilter();

    document.getElementById('resetTrendFilter')?.addEventListener('click', resetTrendFilters);
    document.getElementById('copyTrendTableBtn')?.addEventListener('click', copyTrendTable);
    document.getElementById('downloadTrendCsvBtn')?.addEventListener('click', downloadTrendCSV);

    ['chartShowTop','chartShowBottom','chartShowAll','chartDisplayCount','chartDisplayType'].forEach(function(id) {
        var e = document.getElementById(id);
        if (e) e.addEventListener('change', function() {
            if (trendShowChart) {
                var d = getTrendDisplayData();
                renderTrendChartData(d.results, d.targetFiles, d.mode, d.config);
            }
        });
    });

    updateTrendPeriodLabel();
}

function getTrendDisplayData() {
    return window.trendDisplayData || { results: [], targetFiles: [], mode: 'unit', config: getCurrentColumnConfig() };
}
// ===================
// 凹み推移タブ
// ===================

var kubiMachineFilterSelect = null;
var kubiChartInstances = []; // 動的生成した全Chartインスタンス

// 系列の定義（key と表示ラベル・色）
var KUBI_SERIES_DEFS = [
    { key: 'all', label: '全体',   color: '#a78bfa' },
    { key: '1',   label: '💀1位', color: '#f87171' },
    { key: '2',   label: '💀2位', color: '#fb923c' },
    { key: '3',   label: '💀3位', color: '#fbbf24' }
];

function getSelectedKubiSeries() {
    var checked = Array.prototype.slice.call(
        document.querySelectorAll('.kubiSeriesChk:checked')
    ).map(function(c) { return c.value; });
    if (checked.length === 0) checked = ['all']; // 何も選んでなければ全体
    return checked;
}

function initKubiMachineFilter() {
    var tf = (selectedTrendDates && selectedTrendDates.length > 0)
        ? selectedTrendDates
        : sortFilesByDate(CSV_FILES, true).slice(0, 7);
    var opts = getMachineOptionsForLatestDate(tf);
    if (kubiMachineFilterSelect) kubiMachineFilterSelect.updateOptions(opts);
    else kubiMachineFilterSelect = initMultiSelectMachineFilter(
        'kubiMachineFilterContainer', opts, '全機種', loadKubiData);
}

function updateKubiPeriodLabel() {
    var label = document.getElementById('kubiPeriodLabel');
    if (!label) return;
    if (!selectedTrendDates || selectedTrendDates.length === 0) { label.textContent = '7日間（デフォルト）'; return; }
    if (selectedTrendDates.length === 1) { label.textContent = formatDate(selectedTrendDates[0]); return; }
    var s = sortFilesByDate(selectedTrendDates, false);
    label.textContent = selectedTrendDates.length + '日間 (' + formatDateShort(s[0]) + '〜' + formatDateShort(s[s.length - 1]) + ')';
}

// ----- バッジ設定ボトムシート（凹み推移タブ）-----

var _kubiBadgeSheet = null;

function ensureKubiBadgeSheet() {
    if (_kubiBadgeSheet) return _kubiBadgeSheet;
    if (typeof BottomSheet === 'undefined') return null;

    _kubiBadgeSheet = BottomSheet.create('kubiBadgeSheet', { title: '🏅 凹み集計のバッジ設定' });

    var html =
        MachineBadge.renderSettingsHtml('kubiMb')
        + '<div class="mb-sheet-actions">'
        +   '<button type="button" id="kubiMbApplyBtn" class="mb-action-btn mb-action-primary">この設定で再集計</button>'
        + '</div>';

    _kubiBadgeSheet.setContent(html);

    MachineBadge.setupSettingsEvents('kubiMb', function() {
        updateKubiBadgeSummaryLabel();
        loadKubiData();
        MachineBadge.renderWindowInfo('kubiMb');
    });

    var applyBtn = document.getElementById('kubiMbApplyBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            loadKubiData();
            MachineBadge.renderWindowInfo('kubiMb');
            _kubiBadgeSheet.close();
        });
    }

    _kubiBadgeSheet.onOpen(function() {
        updateKubiBadgeSummaryLabel();
        MachineBadge.renderWindowInfo('kubiMb');
    });

    return _kubiBadgeSheet;
}

function openKubiBadgeModal() {
    var sheet = ensureKubiBadgeSheet();
    if (sheet) sheet.open();
}

function closeKubiBadgeModal() {
    if (_kubiBadgeSheet) _kubiBadgeSheet.close();
}

function updateKubiBadgeSummaryLabel() {
    var label = document.getElementById('kubiBadgeSummaryLabel');
    if (!label) return;
    var base = MachineBadge.getBadgeBase() === 'prev' ? '前日基準' : '当日基準';
    var ex = [];
    if (MachineBadge.isExEvent()) ex.push('ｲﾍﾞﾝﾄ除外');
    if (MachineBadge.isExTail05()) ex.push('末尾0･5除外');
    label.textContent = MachineBadge.getBadgeDays() + '日累積 / '
        + base + ' / ' + MachineBadge.getTargetColumn()
        + (ex.length ? ' / ' + ex.join('・') : '');
}

// 行配列 → { count, plus, winRate, avgDiff }
function summarizeKubiRows(rows) {
    if (!rows || rows.length === 0) return { count: 0, plus: 0, winRate: null, avgDiff: null };
    var plus = 0, sumDiff = 0;
    rows.forEach(function(row) {
        var d = parseInt(String(row['差枚']).replace(/,/g, '')) || 0;
        if (d > 0) plus++;
        sumDiff += d;
    });
    return { count: rows.length, plus: plus, winRate: (plus / rows.length) * 100, avgDiff: sumDiff / rows.length };
}

// 各選択日について assignBadges を走らせ、💀台を抽出して返す
// 戻り値: { file: [💀行...] }（機種フィルター未適用の全💀台）
function collectKubiRowsByFile(targetFiles) {
    var col = MachineBadge.getTargetColumn();
    var map = {};
    targetFiles.forEach(function(file) {
        var data = dataCache[file];
        if (!data || data.length === 0) { map[file] = []; return; }
        var badged = MachineBadge.assignBadges(data, file, dataCache, col, {});
        map[file] = badged.filter(function(row) {
            return row._machineBadge && row._machineBadge.kubi !== null;
        });
    });
    return map;
}

// 指定機種（machine===null なら全機種）について、日別の全体/順位別サマリーを作る
// 戻り値: 各日 { file, all:{...}, '1':{...}, '2':{...}, '3':{...} }
function buildKubiSeriesFor(rowsByFile, targetFiles, machine) {
    return targetFiles.map(function(file) {
        var rows = rowsByFile[file] || [];
        if (machine) rows = rows.filter(function(r) { return r['機種名'] === machine; });
        var rec = { file: file };
        rec.all = summarizeKubiRows(rows);
        ['1', '2', '3'].forEach(function(rank) {
            rec[rank] = summarizeKubiRows(rows.filter(function(r) {
                return String(r._machineBadge.kubi) === rank;
            }));
        });
        return rec;
    });
}

// 系列の期間平均（日ごとの値の単純平均。データのある日のみ対象）
function periodAvg(series, key, prop) {
    var vals = series.map(function(s) { return s[key][prop]; })
                     .filter(function(v) { return v !== null && v !== undefined; });
    if (vals.length === 0) return null;
    return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
}

function loadKubiData() {
    var summaryEl = document.getElementById('kubiSummary');
    var sectionsEl = document.getElementById('kubiSections');
    if (!summaryEl || !sectionsEl) return;

    // 既存チャートを破棄
    kubiChartInstances.forEach(function(c) { try { c.destroy(); } catch (e) {} });
    kubiChartInstances = [];

    var targetFiles = (selectedTrendDates && selectedTrendDates.length > 0)
        ? sortFilesByDate(selectedTrendDates, false)
        : sortFilesByDate(sortFilesByDate(CSV_FILES, true).slice(0, 7), false);

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        sectionsEl.innerHTML = '';
        return;
    }

    var selectedMachines = kubiMachineFilterSelect ? kubiMachineFilterSelect.getSelectedValues() : [];
    var activeKeys = getSelectedKubiSeries();
    var rowsByFile = collectKubiRowsByFile(targetFiles);

    // 上部サマリー（全機種・全体ベース）
    var allSeries = buildKubiSeriesFor(rowsByFile, targetFiles, null);
    var totalKubi = allSeries.reduce(function(a, s) { return a + s.all.count; }, 0);
    var avgWin = periodAvg(allSeries, 'all', 'winRate');
    var info = '期間: ' + targetFiles.length + '日間'
        + ' | 💀延べ台数: ' + totalKubi.toLocaleString() + '台'
        + ' | 全体平均勝率: ' + (avgWin === null ? '-' : avgWin.toFixed(1) + '%')
        + ' | 集計設定: ' + MachineBadge.getBadgeDays() + '日累積/'
        + (MachineBadge.getBadgeBase() === 'prev' ? '前日基準/' : '当日基準/')
        + MachineBadge.getTargetColumn();
    if (selectedMachines.length > 0) info += ' | ' + selectedMachines.length + '機種選択中';
    summaryEl.innerHTML = info;

    // セクション対象: 機種未選択なら「全機種(全体)」1つ、選択時は機種ごと
    var sectionDefs;
    if (selectedMachines.length === 0) {
        sectionDefs = [{ machine: null, title: '全機種' }];
    } else {
        sectionDefs = selectedMachines.map(function(m) { return { machine: m, title: m }; });
    }

    sectionsEl.innerHTML = '';
    sectionDefs.forEach(function(def, idx) {
        var series = def.machine === null ? allSeries : buildKubiSeriesFor(rowsByFile, targetFiles, def.machine);
        var section = renderKubiSection(def.title, series, targetFiles, activeKeys, idx);
        sectionsEl.appendChild(section);
    });
}

// 1機種ぶんのセクションDOMを生成して返す（チャートも描画）
function renderKubiSection(title, series, targetFiles, activeKeys, idx) {
    var labels = targetFiles.map(function(f) { return formatDateShort(f); });
    var defs = KUBI_SERIES_DEFS.filter(function(d) { return activeKeys.indexOf(d.key) !== -1; });

    var section = document.createElement('div');
    section.className = 'kubi-section';

    // 期間平均サマリー（選択系列ぶん）
    var avgCards = defs.map(function(d) {
        var aw = periodAvg(series, d.key, 'winRate');
        var ad = periodAvg(series, d.key, 'avgDiff');
        var adClass = (ad !== null && ad > 0) ? 'plus' : (ad !== null && ad < 0) ? 'minus' : '';
        return '<div class="kubi-avg-card" style="--k-color:' + d.color + '">'
            + '<div class="kubi-avg-name">' + d.label + '</div>'
            + '<div class="kubi-avg-row"><span>平均勝率</span><b>' + (aw === null ? '-' : aw.toFixed(1) + '%') + '</b></div>'
            + '<div class="kubi-avg-row"><span>平均差枚</span><b class="' + adClass + '">'
            + (ad === null ? '-' : (ad >= 0 ? '+' : '') + Math.round(ad).toLocaleString()) + '</b></div>'
            + '</div>';
    }).join('');

    var winId = 'kubiWin_' + idx;
    var avgId = 'kubiAvg_' + idx;

    section.innerHTML =
        '<h3 class="kubi-section-title">' + title + '</h3>'
        + '<div class="kubi-avg-cards">' + avgCards + '</div>'
        + '<div class="kubi-charts-row">'
        +   '<div class="trend-chart-container"><div class="chart-header"><h4>📊 勝率推移</h4></div>'
        +     '<div class="chart-wrapper"><canvas id="' + winId + '"></canvas></div></div>'
        +   '<div class="trend-chart-container"><div class="chart-header"><h4>📉 平均差枚推移</h4></div>'
        +     '<div class="chart-wrapper"><canvas id="' + avgId + '"></canvas></div></div>'
        + '</div>'
        + buildKubiTableHtml(series, targetFiles, defs);

    // チャートはDOM挿入後に生成する必要があるため、次フレームで描画
    requestAnimationFrame(function() {
        var winCanvas = document.getElementById(winId);
        if (winCanvas && typeof Chart !== 'undefined') {
            kubiChartInstances.push(new Chart(winCanvas.getContext('2d'), {
                type: 'line',
                data: { labels: labels, datasets: buildKubiDatasets(series, defs, 'winRate') },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: { y: { suggestedMin: 0, suggestedMax: 100,
                        ticks: { callback: function(v) { return v + '%'; } } } }
                }
            }));
        }
        var avgCanvas = document.getElementById(avgId);
        if (avgCanvas && typeof Chart !== 'undefined') {
            kubiChartInstances.push(new Chart(avgCanvas.getContext('2d'), {
                type: 'line',
                data: { labels: labels, datasets: buildKubiDatasets(series, defs, 'avgDiff') },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: { y: { ticks: { callback: function(v) { return Math.round(v).toLocaleString(); } } } }
                }
            }));
        }
    });

    return section;
}

function buildKubiDatasets(series, defs, prop) {
    return defs.map(function(def) {
        return {
            label: def.label,
            data: series.map(function(s) { return s[def.key][prop]; }),
            borderColor: def.color,
            backgroundColor: def.color + '22',
            tension: 0.2,
            spanGaps: true,
            fill: false
        };
    });
}

function buildKubiTableHtml(series, targetFiles, defs) {
    var headCells = '<th rowspan="2">日付</th>';
    defs.forEach(function(d) { headCells += '<th colspan="3" class="kubi-grp-head">' + d.label + '</th>'; });
    var subCells = '';
    defs.forEach(function() { subCells += '<th>台数</th><th>勝率</th><th>平均差枚</th>'; });

    var bodyRows = series.map(function(s) {
        var cells = '<td>' + formatDateShort(s.file) + '</td>';
        defs.forEach(function(d) {
            var v = s[d.key];
            if (!v || v.count === 0) {
                cells += '<td class="text-muted">-</td><td class="text-muted">-</td><td class="text-muted">-</td>';
            } else {
                var avgClass = v.avgDiff > 0 ? 'plus' : v.avgDiff < 0 ? 'minus' : '';
                cells += '<td>' + v.count + '</td>'
                    + '<td>' + v.winRate.toFixed(1) + '%</td>'
                    + '<td class="' + avgClass + '">' + (v.avgDiff >= 0 ? '+' : '') + Math.round(v.avgDiff).toLocaleString() + '</td>';
            }
        });
        return '<tr>' + cells + '</tr>';
    }).join('');

    return '<div class="table-wrapper has-scrollbar"><table class="kubi-table">'
        + '<thead><tr>' + headCells + '</tr><tr>' + subCells + '</tr></thead>'
        + '<tbody>' + bodyRows + '</tbody></table></div>';
}

// タブ切り替え＋イベント設定
function setupAnalysisSubtabs() {
    document.querySelectorAll('.analysis-subtab').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var target = btn.dataset.atab;
            document.querySelectorAll('.analysis-subtab').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            var agg = document.getElementById('analysisTabAggregate');
            var kubi = document.getElementById('analysisTabKubi');
            if (agg) agg.classList.toggle('active', target === 'aggregate');
            if (kubi) kubi.classList.toggle('active', target === 'kubi');
            if (target === 'kubi') {
                initKubiMachineFilter();
                updateKubiPeriodLabel();
                updateKubiBadgeSummaryLabel();
                loadKubiData();
            }
        });
    });
}

function isKubiTabActive() {
    var kubi = document.getElementById('analysisTabKubi');
    return !!(kubi && kubi.classList.contains('active'));
}

function setupKubiEventListeners() {
    setupAnalysisSubtabs();

    var openBtn = document.getElementById('openKubiCalendar');
    if (openBtn) openBtn.addEventListener('click', openTrendCalendarModal);

    var loadBtn = document.getElementById('loadKubi');
    if (loadBtn) loadBtn.addEventListener('click', loadKubiData);

    document.querySelectorAll('.kubiSeriesChk').forEach(function(chk) {
        chk.addEventListener('change', loadKubiData);
    });

    // バッジ設定ボトムシート
    var bsOpen = document.getElementById('openKubiBadgeSettings');
    if (bsOpen) bsOpen.addEventListener('click', openKubiBadgeModal);

    // 日付モーダルの「適用」: 凹みタブが開いていれば追従
    var applyBtn = document.getElementById('applyTrendDates');
    if (applyBtn) applyBtn.addEventListener('click', function() {
        if (isKubiTabActive()) {
            setTimeout(function() { updateKubiPeriodLabel(); loadKubiData(); }, 0);
        }
    });
}

// ===================
// 散布分析タブ
// ===================

var scatterMachineFilterSelect = null;
var scLookback = 7;
var scThresh = -5000;
var scSuffixSel = [];           // 選択された末尾（'0'〜'9'）
var scScatterChart = null, scBucketChart = null, scTrendChart = null;

// ---- 統計（プロトタイプ流用） ----
function scLogFact(n){ var s=0; for(var i=2;i<=n;i++) s+=Math.log(i); return s; }
function scLogComb(n,k){ if(k<0||k>n) return -Infinity; return scLogFact(n)-scLogFact(k)-scLogFact(n-k); }

function scFisher(below, above){
    var nb=below.length, na=above.length;
    if(nb<2||na<2) return null;
    var kb=below.filter(function(r){return r.win;}).length;
    var ka=above.filter(function(r){return r.win;}).length;
    var N=nb+na, K=kb+ka, n=nb, maxK=Math.min(n,K), denom=scLogComb(N,K), pval=0;
    for(var x=kb;x<=maxK;x++){ pval += Math.exp(scLogComb(n,x)+scLogComb(N-n,K-x)-denom); }
    return Math.min(pval,1);
}
function scBinom(k,n){
    if(n<1) return null;
    var p=0;
    for(var x=k;x<=n;x++){ p += Math.exp(scLogComb(n,x) - n*Math.log(2)); }
    return Math.min(p,1);
}

// ---- 差枚パース ----
function scParseDiff(row){ return parseInt(String(row['差枚']).replace(/,/g,'')) || 0; }

// ---- 累積差枚: 基準日を含まず、遡って lookback カレンダー日ぶんの窓内で
//      「同一台番号 かつ 基準日と同じ機種」の日だけ合計する ----
// allSortedFiles: 全ファイルを日付昇順にしたもの（キャッシュ用に外から渡す）
function scComputeCumulative(unitNo, machine, baseFile, allSortedAsc, fileIndexMap){
    var baseIdx = fileIndexMap[baseFile];
    if(baseIdx === undefined || baseIdx <= 0) return null;
    // 基準日のカレンダー日
    var baseParsed = parseDateFromFilename(baseFile);
    if(!baseParsed) return null;
    var baseDayNum = baseParsed.year*10000 + baseParsed.month*100 + baseParsed.day;
    // 窓の下限カレンダー日（基準日の lookback 日前まで。基準日は含めない）
    var d = new Date(baseParsed.year, baseParsed.month-1, baseParsed.day);
    d.setDate(d.getDate() - scLookback);
    var lowDayNum = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();

    var cum = 0, used = 0;
    // baseIdx より前を遡る
    for(var i=baseIdx-1; i>=0; i--){
        var f = allSortedAsc[i];
        var p = parseDateFromFilename(f);
        if(!p) continue;
        var dn = p.year*10000 + p.month*100 + p.day;
        if(dn < lowDayNum) break;      // 窓を外れたら終了
        if(dn >= baseDayNum) continue; // 念のため基準日以降は無視
        var data = dataCache[f];
        if(!data) continue;            // 欠損日はスキップ（窓は消費済み）
        for(var j=0;j<data.length;j++){
            var r = data[j];
            if(r['台番号'] === unitNo && r['機種名'] === machine){
                cum += scParseDiff(r);
                used++;
                break;
            }
        }
    }
    return { cum: cum, days: used };
}

// ランク付けの基準（'today' or 'cum'）。UIセレクタと同期。
var scRankBasis = 'today';

function scBuildRecords(){
    var targetFiles = (selectedTrendDates && selectedTrendDates.length > 0)
        ? sortFilesByDate(selectedTrendDates, false)
        : sortFilesByDate(sortFilesByDate(CSV_FILES, true).slice(0, 7), false);

    var allAsc = sortFilesByDate(CSV_FILES, false);
    var idxMap = {};
    allAsc.forEach(function(f, i){ idxMap[f] = i; });

    var selectedMachines = scatterMachineFilterSelect ? scatterMachineFilterSelect.getSelectedValues() : [];
    var posState = (typeof getPositionFilterState === 'function') ? getPositionFilterState('scatter') : { selected: [], logic: 'or' };
    var cMin = parseInt((document.getElementById('sc-count-min')||{}).value) || null;
    var cMax = parseInt((document.getElementById('sc-count-max')||{}).value) || null;

    var records = [];

    targetFiles.forEach(function(baseFile){
        var data = dataCache[baseFile];
        if(!data) return;

        // 基準日の機種別設置台数
        var countByMachine = {};
        data.forEach(function(r){ var m=r['機種名']; countByMachine[m]=(countByMachine[m]||0)+1; });

        // 基準日×機種ごとに、レコード候補をいったん溜める
        // machineBuckets[machine] = [ {row, ban, machine, cum, cumDays, today, win} ]
        var machineBuckets = {};

        data.forEach(function(row){
            var machine = row['機種名'], ban = row['台番号'];
            if(selectedMachines.length>0 && selectedMachines.indexOf(machine)===-1) return;

            // 末尾フィルター
            if(scSuffixSel.length>0){
                var suf = String(parseInt(ban)%10);
                if(scSuffixSel.indexOf(suf)===-1) return;
            }
            // 位置フィルター
            if(posState.selected.length>0 && typeof getPositionTags==='function'){
                var tags = getPositionTags(ban);
                var match = posState.logic==='and'
                    ? posState.selected.every(function(t){return tags.indexOf(t)!==-1;})
                    : posState.selected.some(function(t){return tags.indexOf(t)!==-1;});
                if(!match) return;
            }
            // 設置台数レンジ
            var mc = countByMachine[machine] || 0;
            if(cMin!==null && mc<cMin) return;
            if(cMax!==null && mc>cMax) return;

            // 累積差枚
            var cumInfo = scComputeCumulative(ban, machine, baseFile, allAsc, idxMap);
            if(!cumInfo || cumInfo.days===0) return;

            var today = scParseDiff(row);
            if(!machineBuckets[machine]) machineBuckets[machine] = [];
            machineBuckets[machine].push({
                ban: ban, machine: machine,
                cum: cumInfo.cum, cumDays: cumInfo.days,
                today: today, win: today > 0 ? 1 : 0,
                machineUnitCount: mc
            });
        });

        // ── 機種ごとに機種内ランク（下位=0）を付与 ──
        // 注意: ランクは「フィルター後に残った台」ではなく、その機種の全台で振るべきか、
        //       残った台だけで振るべきか。ここでは「フィルター後に残った台の中で」振る。
        //       （末尾フィルター等をかけた場合は残った母集団内での相対順位になる）
        Object.keys(machineBuckets).forEach(function(machine){
            var bucket = machineBuckets[machine];
            var sortKey = scRankBasis === 'cum' ? 'cum' : 'today';
            // 昇順（低い＝下位＝rank 0）で並べて順位付け。同値は同順位にせず出現順で連番。
            bucket.slice().sort(function(a,b){ return a[sortKey] - b[sortKey]; })
                  .forEach(function(item, i){ item.rankFromBottom = i; });

            bucket.forEach(function(item){
                records.push({
                    date: formatDateShort(baseFile),
                    file: baseFile,
                    ban: item.ban,
                    machine: item.machine,
                    cum: item.cum,
                    cumDays: item.cumDays,
                    today: item.today,
                    win: item.win,
                    rankFromBottom: item.rankFromBottom,
                    machineUnitCount: item.machineUnitCount
                });
            });
        });
    });

    return { records: records, targetFiles: targetFiles };
}

var scRankSel = [];   // 選択中のランク（0始まりの数値配列）。空なら全ランク対象。

// loadScatterData の冒頭、built を作った直後に挿入
function loadScatterData(){
    var kn = document.getElementById('sc-k-n');
    if(!kn) return;

    var built = scBuildRecords();
    var all = built.records;

    // ランクフィルター
    if(scRankSel.length > 0){
        all = all.filter(function(r){ return scRankSel.indexOf(r.rankFromBottom) !== -1; });
    }

    var t = scThresh;
    var below = all.filter(function(r){ return r.cum <= t; });
    var above = all.filter(function(r){ return r.cum > t; });
    var n = below.length;
    var wins = below.filter(function(r){ return r.win; }).length;
    var wr = n>0 ? (wins/n*100) : null;
    var avg = n>0 ? Math.round(below.reduce(function(s,r){return s+r.today;},0)/n) : null;

    // KPI
    kn.textContent = n + '件';
    document.getElementById('sc-k-n-sub').textContent = '全' + all.length + '件中';
    var wrEl = document.getElementById('sc-k-wr');
    wrEl.textContent = wr===null ? '—' : wr.toFixed(1)+'%';
    wrEl.style.color = wr===null ? '' : (wr>=60 ? 'var(--color-info)' : wr>=50 ? 'var(--text-muted)' : 'var(--color-danger)');
    document.getElementById('sc-k-wr-sub').textContent = wins+'勝/'+n+'件';
    var avgEl = document.getElementById('sc-k-avg');
    avgEl.textContent = avg===null ? '—' : (avg>=0?'+':'')+avg.toLocaleString()+'枚';
    avgEl.style.color = avg===null ? '' : (avg>=0 ? 'var(--color-info)' : 'var(--color-danger)');
    document.getElementById('sc-k-avg-sub').textContent = '閾値以下の平均';

    var pf=null, pb=null;
    if(n>=3 && above.length>=2){ pf=scFisher(below, above); pb=scBinom(wins, n); }
    scRenderP(pf, 'sc-k-pf', 'sc-k-pf-sub');
    scRenderP(pb, 'sc-k-pb', 'sc-k-pb-sub');

    // タイトル
    document.getElementById('sc-scatter-title').textContent =
        '散布図（以下'+n+'件・超'+above.length+'件 / ルックバック'+scLookback+'日）';
    document.getElementById('sc-tbl-title').textContent =
        '累積≤'+t.toLocaleString()+' の一覧（'+n+'件）';

    scRenderScatter(below, above);
    scRenderRankChart(built.records, t);
    scRenderTrend(below, built.targetFiles);
    scRenderTable(below);
}

function scRenderP(p, id, subId){
    var el=document.getElementById(id), sub=document.getElementById(subId);
    if(p===null){ el.textContent='—'; sub.textContent='データ不足'; el.style.color=''; return; }
    el.textContent = p.toFixed(4);
    el.style.color = p<0.05 ? 'var(--color-info)' : p<0.10 ? 'var(--color-warning, #eda100)' : 'var(--text-muted)';
    sub.textContent = p<0.05 ? '★有意(p<0.05)' : p<0.10 ? '準有意(p<0.10)' : '非有意';
}

function scRenderScatter(below, above){
    var ctx = document.getElementById('sc-scatter-chart');
    if(!ctx || typeof Chart==='undefined') return;
    if(scScatterChart) scScatterChart.destroy();
    scScatterChart = new Chart(ctx.getContext('2d'), {
        type:'scatter',
        data:{ datasets:[
            { label:'閾値以下',
              data: below.map(function(r){return {x:r.cum,y:r.today,_r:r};}),
              backgroundColor: below.map(function(r){return r.win?'rgba(38,101,253,0.8)':'rgba(136,135,128,0.5)';}),
              pointRadius:5, pointHoverRadius:7 },
            { label:'閾値超',
              data: above.map(function(r){return {x:r.cum,y:r.today,_r:r};}),
              backgroundColor:'rgba(136,135,128,0.2)', pointRadius:3, pointHoverRadius:5 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:true, position:'top', labels:{boxWidth:10}},
                tooltip:{callbacks:{label:function(c){var r=c.dataset.data[c.dataIndex]._r;
                    return r.date+' 台'+r.ban+' 累積'+c.parsed.x.toLocaleString()+' 当日'+(c.parsed.y>=0?'+':'')+c.parsed.y.toLocaleString();}}}},
            scales:{
                x:{title:{display:true,text:'累積差枚（ルックバック'+scLookback+'日）'},ticks:{callback:function(v){return v.toLocaleString();}}},
                y:{title:{display:true,text:'当日差枚'},ticks:{callback:function(v){return (v>=0?'+':'')+v.toLocaleString();}}}
            }
        }
    });
}

function scRenderTrend(below, targetFiles){
    var ctx = document.getElementById('sc-trend-chart');
    if(!ctx || typeof Chart==='undefined') return;
    var labels = targetFiles.map(function(f){return formatDateShort(f);});
    var wrSeries=[], avgSeries=[];
    targetFiles.forEach(function(f){
        var day = below.filter(function(r){ return r.file===f; });
        wrSeries.push(day.length ? parseFloat((day.filter(function(r){return r.win;}).length/day.length*100).toFixed(1)) : null);
        avgSeries.push(day.length ? Math.round(day.reduce(function(s,r){return s+r.today;},0)/day.length) : null);
    });
    if(scTrendChart) scTrendChart.destroy();
    scTrendChart = new Chart(ctx.getContext('2d'),{
        type:'line',
        data:{ labels:labels, datasets:[
            { label:'勝率(%)', data:wrSeries, borderColor:'#2665fd', backgroundColor:'#2665fd22', yAxisID:'y', spanGaps:true, tension:0.2 },
            { label:'平均差枚', data:avgSeries, borderColor:'#f472b6', backgroundColor:'#f472b622', yAxisID:'y1', spanGaps:true, tension:0.2 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false,
            interaction:{mode:'index',intersect:false},
            scales:{
                y:{position:'left',min:0,max:100,ticks:{callback:function(v){return v+'%';}},title:{display:true,text:'勝率'}},
                y1:{position:'right',grid:{drawOnChartArea:false},ticks:{callback:function(v){return Math.round(v).toLocaleString();}},title:{display:true,text:'平均差枚'}}
            }
        }
    });
}

function scRenderTable(below){
    var sorted = below.slice().sort(function(a,b){return a.cum-b.cum;});
    var html = '<div class="table-wrapper has-scrollbar"><table><thead><tr>'
        + '<th class="l">基準日</th><th>機種</th><th>台番号</th><th>累積差枚</th><th>日数</th><th>当日差枚</th><th>勝敗</th>'
        + '</tr></thead><tbody>';
    sorted.forEach(function(r){
        var dc = r.today>0?'pos':r.today<0?'neg':'';
        html += '<tr><td class="l">'+r.date+'</td><td class="l">'+r.machine+'</td><td>台'+r.ban+'</td>'
            + '<td class="neg">'+r.cum.toLocaleString()+'</td><td>'+r.cumDays+'</td>'
            + '<td class="'+dc+'">'+(r.today>=0?'+':'')+r.today.toLocaleString()+'</td>'
            + '<td>'+(r.win?'✅':'❌')+'</td></tr>';
    });
    html += '</tbody></table></div>';
    document.getElementById('sc-data-table').innerHTML = html;
}

// ---- スライダー ----
function onScatterLookback(v){
    scLookback = parseInt(v);
    document.getElementById('sc-lookback-val').textContent = scLookback + '日';
    loadScatterData();
}
function onScatterThresh(v){
    scThresh = parseInt(v);
    document.getElementById('sc-thresh-val').textContent = (scThresh>=0?'+':'−')+Math.abs(scThresh).toLocaleString()+'枚';
    loadScatterData();
}

// ---- 初期化 ----
function initScatterMachineFilter(){
    var tf = (selectedTrendDates && selectedTrendDates.length>0)
        ? selectedTrendDates : sortFilesByDate(CSV_FILES, true).slice(0,7);
    var opts = getMachineOptionsForLatestDate(tf);
    if(scatterMachineFilterSelect) scatterMachineFilterSelect.updateOptions(opts);
    else scatterMachineFilterSelect = initMultiSelectMachineFilter(
        'scatterMachineFilterContainer', opts, '全機種', loadScatterData);
}

function updateScatterPeriodLabel(){
    var label = document.getElementById('scatterPeriodLabel');
    if(!label) return;
    if(!selectedTrendDates || selectedTrendDates.length===0){ label.textContent='7日間（デフォルト）'; return; }
    if(selectedTrendDates.length===1){ label.textContent=formatDate(selectedTrendDates[0]); return; }
    var s = sortFilesByDate(selectedTrendDates, false);
    label.textContent = selectedTrendDates.length+'日間 ('+formatDateShort(s[0])+'〜'+formatDateShort(s[s.length-1])+')';
}

function initScatterSuffixButtons(){
    var box = document.getElementById('sc-suffix-btns');
    if(!box || box.childElementCount>0) return;
    for(var i=0;i<10;i++){
        (function(d){
            var b = document.createElement('button');
            b.className = 'sc-suffix-btn';
            b.textContent = d;
            b.onclick = function(){
                var idx = scSuffixSel.indexOf(String(d));
                if(idx===-1){ scSuffixSel.push(String(d)); b.classList.add('on'); }
                else { scSuffixSel.splice(idx,1); b.classList.remove('on'); }
                loadScatterData();
            };
            box.appendChild(b);
        })(i);
    }
}

function isScatterTabActive(){
    var el = document.getElementById('analysisTabScatter');
    return !!(el && el.classList.contains('active'));
}

// 既存の setupAnalysisSubtabs はサブタブ切替を担うので、
// scatter への切替時にも初期化が走るよう、別途フックを足す。
function setupScatterEventListeners(){
    // サブタブボタン（scatter）クリック時の初期化
    document.querySelectorAll('.analysis-subtab').forEach(function(btn){
        if(btn.dataset.atab !== 'scatter') return;
        btn.addEventListener('click', function(){
            // パネル表示は setupAnalysisSubtabs 側で行われないため、ここで担保
            document.querySelectorAll('.analysis-subtab').forEach(function(b){b.classList.remove('active');});
            btn.classList.add('active');
            ['analysisTabAggregate','analysisTabKubi','analysisTabScatter'].forEach(function(id){
                var p=document.getElementById(id); if(p) p.classList.toggle('active', id==='analysisTabScatter');
            });
            initScatterMachineFilter();
            initScatterSuffixButtons();
            initScatterRankButtons(); 
            var rankBasisEl = document.getElementById('sc-rank-basis');
            if(rankBasisEl && !rankBasisEl._bound){
                rankBasisEl._bound = true;
                rankBasisEl.addEventListener('change', function(){
                    scRankBasis = this.value;
                    loadScatterData();
                });
            }
            if(typeof renderMultiPositionFilter==='function'){
                var pf=document.getElementById('scatterPositionFilter');
                if(pf && pf.childElementCount===0){
                    pf.innerHTML = '<h3>位置フィルター</h3>' + renderMultiPositionFilter('scatter', loadScatterData);
                    if(typeof setupMultiPositionFilterEvents==='function')
                        setupMultiPositionFilterEvents('scatter', loadScatterData);
                }
            }
            updateScatterPeriodLabel();
            loadScatterData();
        });
    });

    var openBtn = document.getElementById('openScatterCalendar');
    if(openBtn) openBtn.addEventListener('click', openTrendCalendarModal);

    var loadBtn = document.getElementById('loadScatter');
    if(loadBtn) loadBtn.addEventListener('click', loadScatterData);

    ['sc-count-min','sc-count-max'].forEach(function(id){
        var e=document.getElementById(id);
        if(e) e.addEventListener('input', debounce(loadScatterData, 400));
    });

    // 日付モーダルの「適用」に追従
    var applyBtn = document.getElementById('applyTrendDates');
    if(applyBtn) applyBtn.addEventListener('click', function(){
        if(isScatterTabActive()){
            setTimeout(function(){ updateScatterPeriodLabel(); loadScatterData(); }, 0);
        }
    });
}

function scRenderRankChart(allBeforeRankFilter, thresh){
    var ctx = document.getElementById('sc-bucket-chart');  // 既存canvasを流用
    if(!ctx || typeof Chart==='undefined') return;

    // 閾値以下に絞ったうえで、ランク別に集計（ランクフィルターは無視して全ランク並べる）
    var below = allBeforeRankFilter.filter(function(r){ return r.cum <= thresh; });

    var maxRank = 4; // 下位0〜4番目まで表示（プロトタイプ準拠）
    var labels = ['最下位','2番目','3番目','4番目','5番目'];
    var wrs = [], ns = [];
    for(var rk=0; rk<=maxRank; rk++){
        var f = below.filter(function(r){ return r.rankFromBottom === rk; });
        ns.push(f.length);
        wrs.push(f.length ? parseFloat((f.filter(function(r){return r.win;}).length/f.length*100).toFixed(1)) : null);
    }

    // 選択中ランクを濃い色でハイライト
    var colors = labels.map(function(_, i){
        return (scRankSel.length===0 || scRankSel.indexOf(i)!==-1) ? 'rgba(38,101,253,0.9)' : 'rgba(38,101,253,0.35)';
    });

    if(scBucketChart) scBucketChart.destroy();
    scBucketChart = new Chart(ctx.getContext('2d'),{
        type:'bar',
        data:{ labels: labels, datasets:[{ data:wrs, backgroundColor:colors, borderRadius:4 }] },
        options:{ responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false},
                tooltip:{callbacks:{label:function(c){return '勝率:'+c.raw+'% (n='+ns[c.dataIndex]+')';}}}},
            scales:{ y:{min:0,max:100,ticks:{callback:function(v){return v+'%';}},title:{display:true,text:'勝率'}},
                x:{grid:{display:false}} }
        }
    });
}

var SC_RANK_LABELS = ['最下位','2番目','3番目','4番目','5番目'];

function initScatterRankButtons(){
    var box = document.getElementById('sc-rank-btns');
    if(!box || box.childElementCount>0) return;
    SC_RANK_LABELS.forEach(function(label, i){
        var b = document.createElement('button');
        b.className = 'sc-rank-btn';
        b.textContent = label;
        b.onclick = function(){
            var idx = scRankSel.indexOf(i);
            if(idx===-1){ scRankSel.push(i); b.classList.add('on'); }
            else { scRankSel.splice(idx,1); b.classList.remove('on'); }
            loadScatterData();
        };
        box.appendChild(b);
    });
}
