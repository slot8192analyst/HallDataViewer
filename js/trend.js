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
        var sc = document.getElementById('trendMachineSummaryCards');
        if (sc) sc.style.display = 'none';
    }
}

/**
 * 機種別モード用サマリーカード描画
 */
function renderMachineSummaryCards(results, targetFiles, config) {
    var container = document.getElementById('trendMachineSummaryCards');
    if (!container) return;

    var COLORS = [
        '#4ade80','#60a5fa','#f472b6','#fbbf24','#a78bfa',
        '#fb923c','#2dd4bf','#f87171','#818cf8','#34d399',
        '#e879f9','#38bdf8','#facc15','#fb7185','#a3e635',
        '#22d3ee','#c084fc','#fca5a5','#86efac','#93c5fd',
    ];

    var cards = results.map(function(row, idx) {
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

        var total    = dailyValues.reduce(function(a, b) { return a + b; }, 0);
        var avg      = total / dailyValues.length;
        var maxVal   = Math.max.apply(null, dailyValues);
        var minVal   = Math.min.apply(null, dailyValues);
        var plusDays = dailyValues.filter(function(v) { return v > 0; }).length;
        var winRate  = ((plusDays / dailyValues.length) * 100).toFixed(1);
        var totalClass = total > 0 ? 'plus' : total < 0 ? 'minus' : '';
        var sign = function(v) { return v >= 0 ? '+' : ''; };

        return '<div class="trend-mc-card" style="--mc-color:' + color + '">'
            + '<div class="trend-mc-name">' + row.machine + '<span class="trend-mc-units">（' + row.num + '）</span></div>'
            + '<div class="trend-mc-total ' + totalClass + '">' + sign(total) + Math.round(total).toLocaleString() + config.unit + '</div>'
            + '<div class="trend-mc-label">期間合計</div>'
            + '<div class="trend-mc-stats">'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">日平均</span>'
            +     '<span class="trend-mc-stat-val ' + (avg > 0 ? 'plus' : avg < 0 ? 'minus' : '') + '">'
            +     sign(avg) + Math.round(avg).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">最高日</span>'
            +     '<span class="trend-mc-stat-val plus">' + sign(maxVal) + Math.round(maxVal).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">最低日</span>'
            +     '<span class="trend-mc-stat-val ' + (minVal < 0 ? 'minus' : '') + '">'
            +     sign(minVal) + Math.round(minVal).toLocaleString() + '</span></div>'
            +   '<div class="trend-mc-stat"><span class="trend-mc-stat-label">勝率</span>'
            +     '<span class="trend-mc-stat-val">' + winRate + '% (' + plusDays + '/' + dailyValues.length + '日)</span></div>'
            + '</div>'
            + '</div>';
    }).join('');

    container.innerHTML = cards;
    container.style.display = results.length > 0 ? 'flex' : 'none';
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

    fth.innerHTML = '<tr><th>機種名</th><th>台番号</th><th>位置</th></tr>';

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
        ftr.innerHTML = '<td>' + row.machine + '</td><td>' + row.num + '</td><td>' + posHtml + '</td>';
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

    fth.innerHTML = '<tr><th>機種名</th><th>延べ台数</th></tr>';

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
        ftr.innerHTML = '<td>' + row.machine + '</td><td>' + row.num + '</td>';
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
