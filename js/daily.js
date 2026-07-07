// ===================
// 日別データタブ
// ===================

var visibleColumns = [];
var allColumns = [];
var dailyMachineFilterSelect = null;
var dailyTagUIInitialized = false;
var dailyBadgeUIInitialized = false;

var dailyCurrentFile = null; // ★メモ機能: メモ列描画で参照する現在表示中のファイル
var dailyCurrentIsVirtual = false; // ★仮想日機能: 現在表示中が仮想翌日かどうか
var dailyCurrentMemoDateKey = ''; // ★メモ機能: 現在表示中の「メモ保存に使う」日付キー

// 列ヘッダクリックソート用状態
var dailySortColumn = null;   // 現在ソート中の列名
var dailySortDir    = null;   // 'asc' | 'desc'

// ===================
// 数値フィルター（グループAND/OR方式）
// ===================

var dailyFilterGroups = [];
var DAILY_FILTER_COLUMNS = [
    { value: '差枚', label: '差枚', unit: '枚', type: 'int' },
    { value: 'G数', label: 'G数', unit: 'G', type: 'int' },
    { value: '機械割', label: '機械割', unit: '%', type: 'float' },
    { value: 'BB', label: 'BB', unit: '回', type: 'int' },
    { value: 'RB', label: 'RB', unit: '回', type: 'int' },
    { value: 'ART', label: 'ART', unit: '回', type: 'int' },
    { value: '台番号末尾', label: '台番号末尾', unit: '', type: 'suffix' }
];

// バッジキャッシュ：一度計算したバッジをフィルター変更で再計算しないためのキャッシュ
// 構造: { [dateFile]: { [unitNo]: { tako, kubi, cumVal, windowDays, baseMode } } }
var dailyBadgeCache = {};

// バッジ存在フィルターステート：「tako」「kubi」の表示を絞ることができる
var dailyBadgeFilter = { tako: false, kubi: false };

// 現在フィルター後に表示中のデータ（一括タグ付け用）
var dailyCurrentFilteredData = [];

var DAILY_FILTER_OPERATORS = [
    { value: 'gte', label: '以上' },
    { value: 'lte', label: '以下' },
    { value: 'eq', label: '等しい' },
    { value: 'neq', label: '等しくない' }
];

var DAILY_FILTER_STORAGE_KEY = 'dailyFilterGroups';

function loadDailyFilterGroups() {
    if (typeof DailyState !== 'undefined') {
        var s = DailyState.get();
        dailyFilterGroups = s.filterGroups || [];
        return;
    }
    try {
        var raw = localStorage.getItem(DAILY_FILTER_STORAGE_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                dailyFilterGroups = parsed;
                return;
            }
        }
    } catch (e) {}
    dailyFilterGroups = [];
}

function saveDailyFilterGroups() {
    if (typeof DailyState !== 'undefined') {
        DailyState.setState({ filterGroups: dailyFilterGroups }, { silent: true });
        return;
    }
    try {
        localStorage.setItem(DAILY_FILTER_STORAGE_KEY, JSON.stringify(dailyFilterGroups));
    } catch (e) {}
}

function addDailyFilterGroup() {
    dailyFilterGroups.push({
        conditions: [{ column: '差枚', operator: 'gte', value: '' }]
    });
    renderDailyFilterGroups();
    saveDailyFilterGroups();
}

function removeDailyFilterGroup(groupIndex) {
    dailyFilterGroups.splice(groupIndex, 1);
    renderDailyFilterGroups();
    saveDailyFilterGroups();
    filterAndRender();
}

function addDailyFilterCondition(groupIndex) {
    if (!dailyFilterGroups[groupIndex]) return;
    dailyFilterGroups[groupIndex].conditions.push({ column: '差枚', operator: 'gte', value: '' });
    renderDailyFilterGroups();
    saveDailyFilterGroups();
}

function removeDailyFilterCondition(groupIndex, condIndex) {
    if (!dailyFilterGroups[groupIndex]) return;
    dailyFilterGroups[groupIndex].conditions.splice(condIndex, 1);
    if (dailyFilterGroups[groupIndex].conditions.length === 0) {
        dailyFilterGroups.splice(groupIndex, 1);
    }
    renderDailyFilterGroups();
    saveDailyFilterGroups();
    filterAndRender();
}

function updateDailyFilterCondition(groupIndex, condIndex, field, value) {
    if (!dailyFilterGroups[groupIndex] || !dailyFilterGroups[groupIndex].conditions[condIndex]) return;
    dailyFilterGroups[groupIndex].conditions[condIndex][field] = value;

    if (field === 'column' && value === '台番号末尾') {
        dailyFilterGroups[groupIndex].conditions[condIndex].operator = 'eq';
    }

    saveDailyFilterGroups();
}

function renderDailyFilterGroups() {
    var container = document.getElementById('dailyFilterGroupsList');
    if (!container) return;

    if (dailyFilterGroups.length === 0) {
        container.innerHTML = '<div class="filter-groups-empty">条件グループを追加してフィルターを設定してください</div>';
        updateNumFilterPreview();
        return;
    }

    var html = '';

    dailyFilterGroups.forEach(function(group, gi) {
        if (gi > 0) {
            html += '<div class="tag-group-or-divider">';
            html += '<span class="tag-group-or-label">OR</span>';
            html += '</div>';
        }

        html += '<div class="tag-group" data-group="' + gi + '">';

        html += '<div class="tag-group-header">';
        html += '<span class="tag-group-title"><span class="group-number">' + (gi + 1) + '</span> グループ ' + (gi + 1) + '</span>';
        html += '<button class="tag-group-remove" data-group="' + gi + '" title="グループを削除">×</button>';
        html += '</div>';

        html += '<div class="tag-group-body">';

        group.conditions.forEach(function(cond, ci) {
            if (ci > 0) {
                html += '<div class="tag-condition-and-label">AND</div>';
            }

            html += '<div class="tag-condition-row" data-group="' + gi + '" data-cond="' + ci + '">';

            html += '<select class="condition-column" data-group="' + gi + '" data-cond="' + ci + '" data-field="column">';
            DAILY_FILTER_COLUMNS.forEach(function(col) {
                var selected = cond.column === col.value ? ' selected' : '';
                html += '<option value="' + col.value + '"' + selected + '>' + col.label + '</option>';
            });
            html += '</select>';

            var isSuffix = cond.column === '台番号末尾';
            html += '<select class="condition-operator" data-group="' + gi + '" data-cond="' + ci + '" data-field="operator">';
            DAILY_FILTER_OPERATORS.forEach(function(op) {
                if (isSuffix && (op.value === 'gte' || op.value === 'lte')) return;
                var selected = cond.operator === op.value ? ' selected' : '';
                html += '<option value="' + op.value + '"' + selected + '>' + op.label + '</option>';
            });
            html += '</select>';

            if (isSuffix) {
                html += '<select class="condition-value" data-group="' + gi + '" data-cond="' + ci + '" data-field="value">';
                html += '<option value="">選択...</option>';
                for (var s = 0; s <= 9; s++) {
                    var selected = String(cond.value) === String(s) ? ' selected' : '';
                    html += '<option value="' + s + '"' + selected + '>' + s + '</option>';
                }
                html += '</select>';
            } else {
                var colInfo = DAILY_FILTER_COLUMNS.find(function(c) { return c.value === cond.column; });
                var step = colInfo && colInfo.type === 'float' ? ' step="0.1"' : '';
                html += '<input type="number" class="condition-value" data-group="' + gi + '" data-cond="' + ci + '" data-field="value" value="' + (cond.value || '') + '" placeholder="値"' + step + '>';
            }

            var colInfo2 = DAILY_FILTER_COLUMNS.find(function(c) { return c.value === cond.column; });
            if (colInfo2 && colInfo2.unit && !isSuffix) {
                html += '<span class="tag-condition-unit">' + colInfo2.unit + '</span>';
            }

            html += '<button class="tag-condition-remove" data-group="' + gi + '" data-cond="' + ci + '" title="条件を削除">×</button>';

            html += '</div>';
        });

        html += '<button class="tag-group-add-condition" data-group="' + gi + '">＋ AND条件を追加</button>';

        html += '</div>';
        html += '</div>';
    });

    container.innerHTML = html;

    container.querySelectorAll('.tag-group-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeDailyFilterGroup(parseInt(this.dataset.group));
        });
    });

    container.querySelectorAll('.tag-group-add-condition').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            addDailyFilterCondition(parseInt(this.dataset.group));
        });
    });

    container.querySelectorAll('.tag-condition-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            removeDailyFilterCondition(parseInt(this.dataset.group), parseInt(this.dataset.cond));
        });
    });

    container.querySelectorAll('.condition-column, .condition-operator').forEach(function(sel) {
        sel.addEventListener('change', function() {
            updateDailyFilterCondition(
                parseInt(this.dataset.group),
                parseInt(this.dataset.cond),
                this.dataset.field,
                this.value
            );
            if (this.dataset.field === 'column') {
                renderDailyFilterGroups();
            }
        });
    });

    container.querySelectorAll('select.condition-value').forEach(function(sel) {
        sel.addEventListener('change', function() {
            updateDailyFilterCondition(
                parseInt(this.dataset.group),
                parseInt(this.dataset.cond),
                'value',
                this.value
            );
        });
    });

    container.querySelectorAll('input.condition-value').forEach(function(inp) {
        inp.addEventListener('input', function() {
            updateDailyFilterCondition(
                parseInt(this.dataset.group),
                parseInt(this.dataset.cond),
                'value',
                this.value
            );
        });
    });

    updateNumFilterPreview();
}

function getRowValueForFilter(row, column) {
    if (column === '台番号末尾') {
        var numOnly = (row['台番号'] || '').replace(/\D/g, '');
        if (numOnly.length === 0) return null;
        return parseInt(numOnly.slice(-1));
    }
    if (column === '機械割') {
        var rate = row['機械割'];
        return (rate !== null && rate !== undefined && !isNaN(rate)) ? rate : null;
    }
    var raw = row[column];
    if (raw === undefined || raw === null || raw === '') return null;
    var str = String(raw).replace(/,/g, '');
    var num = parseFloat(str);
    return isNaN(num) ? null : num;
}

function evaluateDailyFilterCondition(row, cond) {
    if (!cond.value && cond.value !== 0 && cond.value !== '0') return true;

    var rowVal = getRowValueForFilter(row, cond.column);
    if (rowVal === null) return false;

    var targetVal = parseFloat(cond.value);
    if (isNaN(targetVal)) return true;

    switch (cond.operator) {
        case 'gte': return rowVal >= targetVal;
        case 'lte': return rowVal <= targetVal;
        case 'eq': return rowVal === targetVal;
        case 'neq': return rowVal !== targetVal;
        default: return true;
    }
}

function applyDailyFilterGroups(data) {
    var activeGroups = dailyFilterGroups.filter(function(group) {
        return group.conditions.some(function(c) {
            return c.value !== '' && c.value !== null && c.value !== undefined;
        });
    });

    if (activeGroups.length === 0) return data;

    return data.filter(function(row) {
        return activeGroups.some(function(group) {
            return group.conditions.every(function(cond) {
                return evaluateDailyFilterCondition(row, cond);
            });
        });
    });
}

function hasActiveDailyFilters() {
    return dailyFilterGroups.some(function(group) {
        return group.conditions.some(function(c) {
            return c.value !== '' && c.value !== null && c.value !== undefined;
        });
    });
}

function getActiveDailyFilterCount() {
    var count = 0;
    dailyFilterGroups.forEach(function(group) {
        group.conditions.forEach(function(c) {
            if (c.value !== '' && c.value !== null && c.value !== undefined) {
                count++;
            }
        });
    });
    return count;
}

function resetDailyFilterGroups() {
    dailyFilterGroups = [];
    saveDailyFilterGroups();
    renderDailyFilterGroups();
}

// ===================
// プレビュー更新
// ===================

function updateNumFilterPreview() {
    var el = document.getElementById('numFilterPreview');
    if (!el) return;
    var count = getActiveDailyFilterCount();
    el.textContent = count > 0 ? '条件' + count + '件' : '';
    el.classList.toggle('active', count > 0);
}

function renderDailyTagPreview() {
    var preview = document.getElementById('dailyTagPreview');
    if (!preview) return;

    var defs = TagEngine.getAll();
    if (!defs || defs.length === 0) {
        preview.textContent = '';
        preview.classList.remove('active');
        return;
    }

    var html = defs.map(function(def) {
        var hasCond = TagEngine.hasActiveConditions(def.id);
        var refBadge = '';
        if (def.refDateMode === 'date' && def.refDateFile) {
            var m = def.refDateFile.match(/(\d{4})_(\d{2})_(\d{2})\.csv$/);
            var dateLabel = m ? (m[1] + '/' + m[2] + '/' + m[3]) : def.refDateFile;
            refBadge = '<span class="tag-ref-date-badge" title="この日のデータで判定">📅' + dateLabel + '</span>';
        }
        return '<span class="daily-tag-preview-badge" style="background: ' + def.color +
            '20; border-color: ' + def.color + '; color: ' + def.color + ';' +
            (hasCond ? '' : ' opacity:0.5;') + '"' +
            (hasCond ? '' : ' title="条件未設定"') + '>' +
            def.icon + ' ' + escapeHtmlTag(def.name) + refBadge + (def.unitNos && def.unitNos.length > 0 ? '<span class="tag-unit-badge-count">' + def.unitNos.length + '台</span>' : '') + '</span>';
    }).join('');

    preview.innerHTML = html;
    preview.classList.add('active');
}

function updateTagBulkApplyUI() {
    var sel = document.getElementById('tagBulkTargetSelect');
    var cntEl = document.getElementById('tagBulkCount');
    if (!sel) return;

    var defs = TagEngine.getAll();
    var prevVal = sel.value;
    sel.innerHTML = '<option value="">\u30bf\u30b0\u3092\u9078\u629e...</option>';
    defs.forEach(function(def) {
        var opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.icon + ' ' + def.name + (def.unitNos && def.unitNos.length > 0 ? ' (' + def.unitNos.length + '\u53f0)' : '');
        sel.appendChild(opt);
    });
    if (prevVal) sel.value = prevVal;

    if (cntEl) cntEl.textContent = dailyCurrentFilteredData.length;
}

function updateColumnPreview() {
    var el = document.getElementById('columnPreview');
    if (!el) return;
    if (allColumns.length === 0) {
        el.textContent = '';
        el.classList.remove('active');
        return;
    }
    var hidden = allColumns.length - visibleColumns.length;
    el.textContent = hidden > 0 ? hidden + '列非表示' : '全列表示';
    el.classList.toggle('active', hidden > 0);
}

function updateBadgePreview() {
    var el = document.getElementById('badgePreview');
    if (!el) return;
    if (typeof MachineBadge === 'undefined') { el.textContent = ''; return; }
    var days = MachineBadge.getBadgeDays();
    var base = MachineBadge.getBadgeBase() === 'prev' ? '前日基準' : '当日含む';
    var col = MachineBadge.getTargetColumn();
    var ex = [];
    if (MachineBadge.isExEvent && MachineBadge.isExEvent()) ex.push('ｲﾍﾞﾝﾄ除外');
    if (MachineBadge.isExTail05 && MachineBadge.isExTail05()) ex.push('末尾05除外');
    el.textContent = days + '日 / ' + base + ' / ' + col + (ex.length ? ' / ' + ex.join('・') : '');
    el.classList.add('active');
}

// ===================
// 日別タブ状態管理
// ===================

function syncDailyState() {
    HallData.state.daily.visibleColumns = visibleColumns;
    HallData.state.daily.allColumns = allColumns;
}

function loadDailyState() {
    if (HallData.state.daily.visibleColumns.length > 0) visibleColumns = HallData.state.daily.visibleColumns;
    if (HallData.state.daily.allColumns.length > 0) allColumns = HallData.state.daily.allColumns;
}

// ===================
// 機械割計算
// ===================

function calculateMechanicalRate(games, saMai) {
    var gStr = String(games).replace(/,/g, '');
    var saStr = String(saMai).replace(/,/g, '');
    var g = parseInt(gStr) || 0;
    var sa = parseInt(saStr) || 0;
    if (g <= 0) return null;
    var totalIn = g * 3;
    var totalOut = totalIn + sa;
    return (totalOut / totalIn) * 100;
}

function formatMechanicalRate(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) return '-';
    return rate.toFixed(2) + '%';
}

function getMechanicalRateClass(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) return '';
    return rate >= 100 ? 'plus' : 'minus';
}

function addMechanicalRateToData(data) {
    return data.map(function(row) {
        var rate = calculateMechanicalRate(row['G数'], row['差枚']);
        return Object.assign({}, row, { '機械割': rate });
    });
}

// ===================
// 汎用モーダル開閉
// ===================

function openAppModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.add('open');
}

function closeAppModal(modalId) {
    var modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
}

// ===================
// 機種フィルター
// ===================

function initDailyMachineFilter() {
    if (!document.getElementById('dailyMachineFilterContainer')) return;

    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var currentFile = displayFiles[currentDateIndex];
    var optionFile = (typeof isVirtualFile === 'function' && isVirtualFile(currentFile))
        ? getVirtualBaseFile() : currentFile;
    var machineOptions = getMachineOptionsForDate(optionFile);
    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    } else {
        dailyMachineFilterSelect = initMultiSelectMachineFilter(
            'dailyMachineFilterContainer', machineOptions, '全機種',
            function(selectedValues) {
                if (typeof DailyState !== 'undefined') {
                    DailyState.setState({ selectedMachines: selectedValues });
                } else {
                    filterAndRender();
                }
            }
        );

        if (dailyMachineFilterSelect && typeof DailyState !== 'undefined') {
            var savedMachines = DailyState.get().selectedMachines;
            if (savedMachines && savedMachines.length > 0) {
                dailyMachineFilterSelect.setSelectedValues(savedMachines);
            }
        }
    }
}

function updateDailyMachineFilterCounts() {
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var currentFile = displayFiles[currentDateIndex];
    var optionFile = (typeof isVirtualFile === 'function' && isVirtualFile(currentFile))
        ? getVirtualBaseFile() : currentFile;
    var machineOptions = getMachineOptionsForDate(optionFile);
    if (dailyMachineFilterSelect) dailyMachineFilterSelect.updateOptions(machineOptions);
}

// ===================
// 列選択
// ===================

function initColumnSelector() {
    if (headers.length === 0) return;

    allColumns = [].concat(headers);

    if (allColumns.indexOf('機械割') === -1) {
        var saIndex = allColumns.indexOf('差枚');
        if (saIndex !== -1) allColumns.splice(saIndex + 1, 0, '機械割');
        else allColumns.push('機械割');
    }

    if (allColumns.indexOf('位置') === -1) {
        var unitIndex = allColumns.indexOf('台番号');
        if (unitIndex !== -1) allColumns.splice(unitIndex + 1, 0, '位置');
        else allColumns.push('位置');
    }

    var oldIdx = allColumns.indexOf('高設定タグ');
    if (oldIdx !== -1) allColumns.splice(oldIdx, 1);
    if (allColumns.indexOf('タグ') === -1) {
        allColumns.push('タグ');
    }

    if (allColumns.indexOf('機種内順位') === -1) {
        allColumns.push('機種内順位');
    }

    if (allColumns.indexOf('メモ') === -1) {
        allColumns.push('メモ');
    }

    var savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
        try {
            var parsed = JSON.parse(savedColumns);
            parsed = parsed.map(function(col) { return col === '高設定タグ' ? 'タグ' : col; });
            visibleColumns = parsed.filter(function(col) { return allColumns.indexOf(col) !== -1; });
            if (visibleColumns.length > 0 && visibleColumns.indexOf('機種内順位') === -1) {
                visibleColumns.push('機種内順位');
            }
            if (visibleColumns.length > 0 && visibleColumns.indexOf('メモ') === -1) {
                visibleColumns.push('メモ');
            }
            if (visibleColumns.length === 0) visibleColumns = [].concat(allColumns);
        } catch (e) {
            visibleColumns = [].concat(allColumns);
        }
    } else {
        visibleColumns = [].concat(allColumns);
    }

    renderColumnCheckboxes();
}

// ===================
// 機種内バッジ設定（モーダル内）
// ===================

/**
 * 指定日（またはカレントファイル）のバッジを計算してキャッシュに保存する。
 * filterAndRender は呼ばず、キャッシュだけを更新する。
 * 仮想日のときは最新実データ日を集計起点にして「前日基準（forcePrev）」で計算する。
 * 戻り値: 更新したキャッシュのキー（currentFile）
 */
function recalcBadgeCache(fileOverride) {
    if (typeof MachineBadge === 'undefined' || !MachineBadge.isEnabled()) return;
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var _s = (typeof DailyState !== 'undefined') ? DailyState.get() : {};
    var targetFile = fileOverride
        || (_s.dateFile && displayFiles.indexOf(_s.dateFile) !== -1 ? _s.dateFile : null)
        || displayFiles[currentDateIndex];
    if (!targetFile) return;

    var isVirtual = (typeof isVirtualFile === 'function') && isVirtualFile(targetFile);

    // 集計起点ファイルと、表示する台レコードの取得元を決める
    var baseFile;     // 集計（累積）の起点
    var sourceRows;   // バッジを付与する対象の台一覧（最新実データ日の素データ）
    if (isVirtual) {
        baseFile = getVirtualBaseFile();           // 仮想日の集計起点＝最新実データ日
        if (!baseFile || !dataCache[baseFile]) return;
        sourceRows = dataCache[baseFile];
    } else {
        baseFile = targetFile;
        if (!dataCache || !dataCache[baseFile]) return;
        sourceRows = dataCache[baseFile];
    }

    // フィルターなし・全台データでバッジを計算
    var rawData = sourceRows.map(function(r) { return Object.assign({}, r); });
    rawData = addMechanicalRateToData(rawData);

    var badged = MachineBadge.assignBadges(
        rawData,
        targetFile,
        dataCache,
        MachineBadge.getTargetColumn(),
        { baseFileOverride: baseFile, forcePrev: isVirtual } // 仮想日は前日基準を強制
    );

    // キャッシュに台番号をキーとして保存
    var cache = {};
    badged.forEach(function(row) {
        if (row['台番号'] !== undefined && row['台番号'] !== null) {
            cache[String(row['台番号'])] = row['_machineBadge'] || { tako: null, kubi: null };
        }
    });
    dailyBadgeCache[targetFile] = cache;
    return targetFile;
}

/**
 * バッジキャッシュをキャッシュされた値から row に合成する。
 */
function applyBadgeCacheToData(data, dateFile) {
    var cache = dailyBadgeCache[dateFile];
    return data.map(function(row) {
        if (!cache) return row;
        var unitKey = String(row['台番号']);
        var badgeInfo = cache[unitKey] || { tako: null, kubi: null };
        return Object.assign({}, row, { _machineBadge: badgeInfo });
    });
}

function renderBadgeSettings() {
    var container = document.getElementById('badgeSettingsContainer');
    if (!container) return;
    if (typeof MachineBadge === 'undefined') return;

    container.innerHTML = MachineBadge.renderSettingsHtml('dailyMb');

    MachineBadge.setupSettingsEvents('dailyMb', function() {
        updateBadgePreview();
        // 設定が変わったら全バッジキャッシュを破棄（再計算が必要）
        dailyBadgeCache = {};
        updateBadgeRecalcButton();
    });
}

/** 再計算ボタンの状態（ラベル）を更新する */
function updateBadgeRecalcButton() {
    var btn = document.getElementById('badgeRecalcBtn');
    if (!btn) return;
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var _s = (typeof DailyState !== 'undefined') ? DailyState.get() : {};
    var cf = (_s.dateFile && displayFiles.indexOf(_s.dateFile) !== -1 ? _s.dateFile : null)
             || displayFiles[currentDateIndex];
    var hasCached = !!(cf && dailyBadgeCache[cf]);
    btn.textContent = hasCached ? '🔄 再計算' : '▶ バッジを計算';
    btn.classList.toggle('badge-needs-calc', !hasCached);
}

/** バッジフィルター（🐙あり／💀あり）のチェックボックス状態をDOMに反映 */
function syncBadgeFilterCheckboxes() {
    var tako = document.getElementById('badgeFilterTako');
    var kubi = document.getElementById('badgeFilterKubi');
    if (tako) tako.checked = dailyBadgeFilter.tako;
    if (kubi) kubi.checked = dailyBadgeFilter.kubi;
}

// ===================
// 表示列（統合グループ対応）
// ===================

var COLUMN_GROUPS = [
    { id: '__group_atari_count', label: '当たり回数', members: ['BB', 'RB', 'ART'] },
    { id: '__group_atari_rate',  label: '当たり確率', members: ['合成確率', 'BB確率', 'RB確率', 'ART確率'] }
];

function getGroupedColumnLayout() {
    var layout = [];
    var consumedGroupIds = {};

    allColumns.forEach(function(col) {
        var group = COLUMN_GROUPS.find(function(g) { return g.members.indexOf(col) !== -1; });
        if (group) {
            if (!consumedGroupIds[group.id]) {
                consumedGroupIds[group.id] = true;
                var existingMembers = group.members.filter(function(m) {
                    return allColumns.indexOf(m) !== -1;
                });
                layout.push({ type: 'group', id: group.id, label: group.label, members: existingMembers });
            }
        } else {
            layout.push({ type: 'single', col: col });
        }
    });
    return layout;
}

function renderColumnCheckboxes() {
    var container = document.getElementById('columnCheckboxes');
    if (!container) return;

    var layout = getGroupedColumnLayout();

    container.innerHTML = layout.map(function(item) {
        if (item.type === 'group') {
            var checked = item.members.some(function(m) {
                return visibleColumns.indexOf(m) !== -1;
            }) ? 'checked' : '';
            return '<label class="column-checkbox-item"><input type="checkbox" data-group-id="' + item.id +
                '" data-members="' + item.members.join(',') + '" ' + checked + '><span>' + item.label + '</span></label>';
        } else {
            var col = item.col;
            var ckd = visibleColumns.indexOf(col) !== -1 ? 'checked' : '';
            var id = 'col-' + col.replace(/[^a-zA-Z0-9]/g, '_');
            return '<label class="column-checkbox-item"><input type="checkbox" id="' + id + '" value="' + col + '" ' + ckd + '><span>' + col + '</span></label>';
        }
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            updateVisibleColumns();
            filterAndRender();
        });
    });
}

function _persistVisibleColumns() {
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    if (typeof DailyState !== 'undefined') {
        DailyState.setState({ visibleColumns: visibleColumns }, { silent: true });
    }
}

function updateVisibleColumns() {
    var checkedCols = {};

    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]:checked').forEach(function(cb) {
        if (cb.dataset.groupId) {
            (cb.dataset.members || '').split(',').forEach(function(m) {
                if (m) checkedCols[m] = true;
            });
        } else if (cb.value) {
            checkedCols[cb.value] = true;
        }
    });

    visibleColumns = allColumns.filter(function(col) { return checkedCols[col]; });

    if (visibleColumns.length === 0 && allColumns.length > 0) {
        visibleColumns = [allColumns[0]];
        renderColumnCheckboxes();
    }

    _persistVisibleColumns();
}

function selectAllColumns() {
    visibleColumns = [].concat(allColumns);
    _persistVisibleColumns();
    renderColumnCheckboxes();
    filterAndRender();
}

function deselectAllColumns() {
    var essentialColumns = ['機種名', '台番号'].filter(function(col) { return allColumns.indexOf(col) !== -1; });
    visibleColumns = essentialColumns.length > 0 ? essentialColumns : [allColumns[0]];
    _persistVisibleColumns();
    renderColumnCheckboxes();
    filterAndRender();
}

// ===================
// 日付ナビゲーション
// ===================

async function initDateSelectWithEvents() {
    await loadEventData();
    var dateSelect = document.getElementById('dateSelect');
    if (!dateSelect) return;
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    dateSelect.innerHTML = displayFiles.map(function(file, index) {
        return createDateSelectOptionForDaily(file, index === currentDateIndex);
    }).join('');
}

function createDateSelectOptionForDaily(file, isSelected) {
    if (typeof isVirtualFile === 'function' && isVirtualFile(file)) {
        var dateKey = virtualFileToDateKey(file);
        var label = formatVirtualDateLabel(dateKey) + '（稼働中・メモ用）';
        return '<option value="' + file + '"' + (isSelected ? ' selected' : '') + '>📝 ' + label + '</option>';
    }
    return createDateSelectOption(file, isSelected);
}

function formatVirtualDateLabel(dateKey) {
    if (!dateKey) return '翌日';
    var file = 'data/' + dateKey + '.csv';
    var base = (typeof formatDate === 'function') ? formatDate(file) : dateKey.replace(/_/g, '/');
    if (typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
        try {
            var dow = getDayOfWeekName(getDayOfWeek(file));
            if (dow) base += '（' + dow + '）';
        } catch (e) {}
    }
    return base;
}

async function updateDateNavWithEvents() {
    await loadEventData();
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var currentFile = displayFiles[currentDateIndex];
    if (!currentFile) return;

    var isVirtual = (typeof isVirtualFile === 'function') && isVirtualFile(currentFile);

    var dateLabel = document.getElementById('currentDateLabel');
    if (dateLabel) {
        if (isVirtual) {
            dateLabel.textContent = '📝 ' + formatVirtualDateLabel(virtualFileToDateKey(currentFile)) + ' 稼働中（メモ用）';
        } else {
            var formattedDate = formatDate(currentFile);
            var dayOfWeek = getDayOfWeekName(getDayOfWeek(currentFile));
            dateLabel.textContent = formattedDate + '（' + dayOfWeek + '）';
        }
    }

    var eventContainer = document.getElementById('dailyEventInfo');
    if (!eventContainer) {
        var dateNav = document.querySelector('#daily .date-nav');
        if (dateNav) {
            eventContainer = document.createElement('div');
            eventContainer.id = 'dailyEventInfo';
            eventContainer.className = 'daily-event-info';
            dateNav.after(eventContainer);
        }
    }
    if (eventContainer) {
        if (isVirtual) {
            eventContainer.innerHTML = '';
        } else {
            var dateKey = getDateKeyFromFilename(currentFile);
            var events = getEventsForDate(dateKey);
            eventContainer.innerHTML = renderDailyEventBadges(events);
        }
    }

    var prevBtn = document.getElementById('prevDate');
    var nextBtn = document.getElementById('nextDate');
    if (prevBtn) prevBtn.disabled = currentDateIndex >= displayFiles.length - 1;
    if (nextBtn) nextBtn.disabled = currentDateIndex <= 0;

    var dateSelect = document.getElementById('dateSelect');
    if (dateSelect && dateSelect.value !== currentFile) dateSelect.value = currentFile;
}

function renderDailyEventBadges(events) {
    if (!events || events.length === 0) return '';
    var relevantEvents = events.filter(function(event) { return hasEventOrPerformers(event); });
    if (relevantEvents.length === 0) return '';
    var html = '<div class="daily-event-badges">';
    relevantEvents.forEach(function(event) {
        if (isValidEvent(event)) {
            var display = getEventDisplayName(event);
            if (display.name) {
                var tooltip = event.note ? ' title="' + event.note + '"' : '';
                html += '<span class="daily-event-badge" style="background: ' + display.color + '20; border-color: ' + display.color + ';"' + tooltip + '>' + display.icon + ' ' + display.name + '</span>';
            }
        }
        if (event.performers && event.performers.length > 0) {
            html += '<span class="daily-event-badge performer-badge">🎤 ' + event.performers.join(', ') + '</span>';
        }
    });
    html += '</div>';
    return html;
}

// ===================
// タグカウント表示
// ===================

function updateDailyTagCountDisplay(data) {
    var el = document.getElementById('dailyTagCountDisplay');
    if (!el) return;
    if (!TagEngine.hasAnyActiveConditions()) {
        el.textContent = '';
        return;
    }
    var taggedCount = data.filter(function(r) {
        return r['_matchedTags'] && r['_matchedTags'].length > 0;
    }).length;
    el.textContent = 'タグ付き: ' + taggedCount + '/' + data.length + '台';
}

// ===================
// テーブル スケルトン / スピナー
// ===================

function showTableSkeleton(tableId, rows, cols) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    var wrapper = table.closest('.table-wrapper');
    if (wrapper) wrapper.classList.add('table-loading-overlay', 'is-loading');

    rows = rows || 12;
    cols = cols || (visibleColumns.length || 6);

    var skeletonRows = '';
    for (var r = 0; r < rows; r++) {
        var cells = '';
        for (var c = 0; c < cols; c++) {
            var w = 40 + Math.floor(Math.random() * 40);
            cells += '<td><span class="skeleton-cell" style="width:' + w + '%"></span></td>';
        }
        skeletonRows += '<tr>' + cells + '</tr>';
    }
    tbody.innerHTML = skeletonRows;
    tbody.classList.add('skeleton-tbody');
}

function hideTableSkeleton(tableId) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    var wrapper = table.closest('.table-wrapper');
    if (wrapper) wrapper.classList.remove('is-loading');
    if (tbody) tbody.classList.remove('skeleton-tbody');
}

// ===================
// メインフィルター＆描画
// ===================

async function filterAndRender() {
    var _s = (typeof DailyState !== 'undefined') ? DailyState.get() : {};

    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);

    var currentFile;
    if (_s.dateFile && displayFiles.indexOf(_s.dateFile) !== -1) {
        currentFile = _s.dateFile;
        currentDateIndex = displayFiles.indexOf(currentFile);
    } else {
        currentFile = displayFiles[currentDateIndex];
        if (typeof DailyState !== 'undefined' && currentFile) {
            DailyState.setState({ dateFile: currentFile }, { silent: true });
        }
    }

    if (!currentFile) return;

    var isVirtual = (typeof isVirtualFile === 'function') && isVirtualFile(currentFile);

    dailyCurrentFile = currentFile;
    dailyCurrentIsVirtual = isVirtual;

    if (isVirtual) {
        dailyCurrentMemoDateKey = virtualFileToDateKey(currentFile);
    } else {
        dailyCurrentMemoDateKey = (typeof getDateKeyFromFilename === 'function')
            ? (getDateKeyFromFilename(currentFile) || '') : '';
    }

    var isCached = isVirtual || !!(dataCache && dataCache[currentFile]);
    if (!isCached) {
        showTableSkeleton('data-table', 14, visibleColumns.length || 6);
        var dateKey = getDateKeyFromFilename(currentFile);
        if (dateKey) {
            var ym = dateKey.substring(0, 7).replace('_', '_');
            var monthFile = 'data/' + ym + '.json';
            try {
                await loadMonthlyJSON(monthFile);
            } catch(e) {}
        }
    }

    if (typeof TagEngine !== 'undefined') {
        var tagDefs0 = TagEngine.getAll();
        for (var ti = 0; ti < tagDefs0.length; ti++) {
            var td = tagDefs0[ti];
            if (td.refDateMode === 'date' && td.refDateFile && !(dataCache && dataCache[td.refDateFile])) {
                var refDateKey = getDateKeyFromFilename(td.refDateFile);
                if (refDateKey) {
                    var refYm = refDateKey.substring(0, 7);
                    try { await loadMonthlyJSON('data/' + refYm + '.json'); } catch(e) {}
                }
                try { await loadCSV(td.refDateFile); } catch(e) {}
            }
        }
    }

    var data = await loadCSV(currentFile);

    if (!isCached) hideTableSkeleton('data-table');

    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    data = addMechanicalRateToData(data);

    if (allColumns.length === 0 && headers.length > 0) initColumnSelector();

    if (!dailyTagUIInitialized) {
        initDailyTagUI();
        dailyTagUIInitialized = true;
    }

    if (!dailyBadgeUIInitialized) {
        renderBadgeSettings();
        dailyBadgeUIInitialized = true;
    }

    if (!dailyMachineFilterSelect) initDailyMachineFilter();
    else updateDailyMachineFilterCounts();

    if (typeof DailyState !== 'undefined') {
        DailyState.syncDom();
    }

    data = [].concat(data);

    var tagDefs = TagEngine.getAll();
    data = data.map(function(row) {
        var newRow = Object.assign({}, row);
        newRow['_matchedTags'] = TagEngine.evaluateAll(row, dataCache);
        return newRow;
    });

    var selectedMachines = _s.selectedMachines && _s.selectedMachines.length > 0
        ? _s.selectedMachines
        : (dailyMachineFilterSelect ? dailyMachineFilterSelect.getSelectedValues() : []);
    if (selectedMachines.length > 0) {
        data = data.filter(function(row) { return selectedMachines.indexOf(row['機種名']) !== -1; });
    }

    var sortBy = (_s.sortBy !== undefined ? _s.sortBy
        : (document.getElementById('sortBy') ? document.getElementById('sortBy').value : ''));

    data = applyDailyFilterGroups(data);

    var showTaggedOnlyVal = (_s.showTaggedOnly !== undefined ? _s.showTaggedOnly
        : (document.getElementById('dailyShowTaggedOnly') ? document.getElementById('dailyShowTaggedOnly').checked : false));
    if (showTaggedOnlyVal) {
        data = data.filter(function(row) { return row['_matchedTags'] && row['_matchedTags'].length > 0; });
    }

    if (sortBy) {
        switch (sortBy) {
            case 'mb_tako_asc': data.sort(function(a, b) {
                var ta = (a._machineBadge && a._machineBadge.tako) ? a._machineBadge.tako : 999;
                var tb = (b._machineBadge && b._machineBadge.tako) ? b._machineBadge.tako : 999;
                return ta - tb;
            }); break;
            case 'mb_kubi_asc': data.sort(function(a, b) {
                var ka = (a._machineBadge && a._machineBadge.kubi) ? a._machineBadge.kubi : 999;
                var kb = (b._machineBadge && b._machineBadge.kubi) ? b._machineBadge.kubi : 999;
                return ka - kb;
            }); break;
            case 'sa_desc': data.sort(function(a, b) { return (parseInt(String(b['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(a['差枚']).replace(/,/g, '')) || 0); }); break;
            case 'sa_asc':  data.sort(function(a, b) { return (parseInt(String(a['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(b['差枚']).replace(/,/g, '')) || 0); }); break;
            case 'game_desc': data.sort(function(a, b) { return (parseInt(String(b['G数']).replace(/,/g, '')) || 0) - (parseInt(String(a['G数']).replace(/,/g, '')) || 0); }); break;
            case 'game_asc':  data.sort(function(a, b) { return (parseInt(String(a['G数']).replace(/,/g, '')) || 0) - (parseInt(String(b['G数']).replace(/,/g, '')) || 0); }); break;
            case 'rate_desc': data.sort(function(a, b) { return (b['機械割'] || -Infinity) - (a['機械割'] || -Infinity); }); break;
            case 'rate_asc':  data.sort(function(a, b) { return (a['機械割'] || Infinity)  - (b['機械割'] || Infinity); }); break;
            case 'machine_asc':  data = sortByMachineThenUnit(data, '機種名', '台番号', true, true);  break;
            case 'machine_desc': data = sortByMachineThenUnit(data, '機種名', '台番号', false, true); break;
            case 'unit_asc':  data = sortByUnitNumber(data, '台番号', true);  break;
            case 'unit_desc': data = sortByUnitNumber(data, '台番号', false); break;
            case 'bb_desc': data.sort(function(a, b) { return (parseInt(String(b['BB']).replace(/,/g, '')) || 0) - (parseInt(String(a['BB']).replace(/,/g, '')) || 0); }); break;
            case 'bb_asc':  data.sort(function(a, b) { return (parseInt(String(a['BB']).replace(/,/g, '')) || 0) - (parseInt(String(b['BB']).replace(/,/g, '')) || 0); }); break;
            case 'rb_desc': data.sort(function(a, b) { return (parseInt(String(b['RB']).replace(/,/g, '')) || 0) - (parseInt(String(a['RB']).replace(/,/g, '')) || 0); }); break;
            case 'rb_asc':  data.sort(function(a, b) { return (parseInt(String(a['RB']).replace(/,/g, '')) || 0) - (parseInt(String(b['RB']).replace(/,/g, '')) || 0); }); break;
            case 'art_desc': data.sort(function(a, b) { return (parseInt(String(b['ART']).replace(/,/g, '')) || 0) - (parseInt(String(a['ART']).replace(/,/g, '')) || 0); }); break;
            case 'art_asc':  data.sort(function(a, b) { return (parseInt(String(a['ART']).replace(/,/g, '')) || 0) - (parseInt(String(b['ART']).replace(/,/g, '')) || 0); }); break;
        }
    }

    // ── バッジ合成（仮想日も含めて計算する。仮想日は前日基準で集計される）──
    if (typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled()) {
        if (!dailyBadgeCache[currentFile]) {
            recalcBadgeCache(currentFile);
        }
        data = applyBadgeCacheToData(data, currentFile);
    }

    // バッジ存在フィルター（仮想日でもバッジがあるので適用可）
    if (dailyBadgeFilter.tako || dailyBadgeFilter.kubi) {
        var takoRanksSet = (typeof MachineBadge !== 'undefined') ? MachineBadge.getTakoRanks() : [1,2,3];
        var kubiRanksSet = (typeof MachineBadge !== 'undefined') ? MachineBadge.getKubiRanks() : [1,2,3];
        data = data.filter(function(row) {
            var mb = row._machineBadge;
            if (!mb) return false;
            var hasTako = dailyBadgeFilter.tako && mb.tako !== null && takoRanksSet.indexOf(mb.tako) !== -1;
            var hasKubi = dailyBadgeFilter.kubi && mb.kubi !== null && kubiRanksSet.indexOf(mb.kubi) !== -1;
            return hasTako || hasKubi;
        });
    }

    updateBadgeRecalcButton();

    dailyCurrentFilteredData = data;

    renderTableWithColumns(data, 'data-table', 'summary', visibleColumns);
    await updateDateNavWithEvents();
    updateDailyTagCountDisplay(data);

    // 末尾統計は仮想日では非表示（数値が無いため）
    renderSuffixStatsTable(isVirtual ? [] : data);

    updateNumFilterPreview();
    renderDailyTagPreview();
    updateColumnPreview();
    updateBadgePreview();

    renderActiveFilterChips();
}

// ===================
// アクティブフィルター チップバー
// ===================

function renderActiveFilterChips() {
    var bar = document.getElementById('activeFilterBar');
    if (!bar) return;

    var _s = (typeof DailyState !== 'undefined') ? DailyState.get() : {};
    var chips = [];

    var machines = _s.selectedMachines || [];
    if (machines.length > 0) {
        var machineLabel = machines.length <= 2
            ? machines.join('・')
            : machines[0] + ' 他' + (machines.length - 1) + '機種';
        chips.push({
            type: 'chip-machine',
            label: '機種: ' + machineLabel,
            remove: function() {
                if (dailyMachineFilterSelect) dailyMachineFilterSelect.reset();
                DailyState.setState({ selectedMachines: [] });
            }
        });
    }

    var filterCount = getActiveDailyFilterCount();
    if (filterCount > 0) {
        var numLabels = [];
        dailyFilterGroups.forEach(function(group) {
            group.conditions.forEach(function(c) {
                if (c.value === '' || c.value === null || c.value === undefined) return;
                var colInfo = DAILY_FILTER_COLUMNS.find(function(col) { return col.value === c.column; });
                var opInfo  = DAILY_FILTER_OPERATORS.find(function(op) { return op.value === c.operator; });
                var colLabel = colInfo ? colInfo.label : c.column;
                var opLabel  = opInfo  ? opInfo.label  : c.operator;
                var unit     = (colInfo && colInfo.unit && c.column !== '台番号末尾') ? colInfo.unit : '';
                numLabels.push(colLabel + ' ' + opLabel + ' ' + c.value + unit);
            });
        });
        chips.push({
            type: 'chip-numfilter',
            label: '🔢 ' + numLabels.slice(0, 2).join(' / ') + (numLabels.length > 2 ? ' …' : ''),
            remove: function() {
                resetDailyFilterGroups();
                filterAndRender();
            }
        });
    }

    if (typeof TagEngine !== 'undefined') {
        var tagDefs = TagEngine.getAll ? TagEngine.getAll() : [];
        tagDefs.forEach(function(def) {
            if (!TagEngine.hasActiveConditions(def.id)) return;
            chips.push({
                type: 'chip-tag',
                label: def.icon + ' ' + def.name,
                color: def.color,
                remove: function() {
                    TagEngine.clearConditions(def.id);
                    renderDailyTagPreview();
                    filterAndRender();
                }
            });
        });
    }

    if (_s.showTaggedOnly) {
        chips.push({
            type: 'chip-taggedonly',
            label: 'タグ付きのみ',
            remove: function() {
                var el = document.getElementById('dailyShowTaggedOnly');
                if (el) el.checked = false;
                DailyState.setState({ showTaggedOnly: false });
            }
        });
    }

    var sortVal = _s.sortBy || '';
    if (sortVal) {
        var sortLabels = {
            'sa_desc': '差枚 ↓', 'sa_asc': '差枚 ↑',
            'game_desc': 'G数 ↓', 'game_asc': 'G数 ↑',
            'rate_desc': '機械割 ↓', 'rate_asc': '機械割 ↑',
            'machine_asc': '機種名 あ→わ', 'machine_desc': '機種名 わ→あ',
            'unit_asc': '台番号 ↑', 'unit_desc': '台番号 ↓',
            'bb_desc': 'BB ↓', 'bb_asc': 'BB ↑',
            'rb_desc': 'RB ↓',  'rb_asc': 'RB ↑',
            'art_desc': 'ART ↓', 'art_asc': 'ART ↑'
        };
        var sortLabel = sortLabels[sortVal] || sortVal;
        chips.push({
            type: 'chip-sort',
            label: '並替: ' + sortLabel,
            remove: function() {
                var el = document.getElementById('sortBy');
                if (el) el.value = '';
                DailyState.setState({ sortBy: '' });
                dailySortColumn = null;
                dailySortDir    = null;
            }
        });
    }

    if (dailyBadgeFilter.tako || dailyBadgeFilter.kubi) {
        var badgeChipLabel = (dailyBadgeFilter.tako && dailyBadgeFilter.kubi)
            ? '🐙💀 バッジあり のみ'
            : (dailyBadgeFilter.tako ? '🐙 タコだしあり のみ' : '💀 死に台あり のみ');
        chips.push({
            type: 'chip-badge-filter',
            label: badgeChipLabel,
            remove: function() {
                dailyBadgeFilter.tako = false;
                dailyBadgeFilter.kubi = false;
                syncBadgeFilterCheckboxes();
                filterAndRender();
            }
        });
    }

    if (chips.length === 0) {
        bar.innerHTML = '';
        bar.classList.remove('has-chips');
        return;
    }

    var html = chips.map(function(chip, i) {
        var inlineStyle = chip.color
            ? ' style="background:' + chip.color + '20; border-color:' + chip.color + '; color:' + chip.color + ';"'
            : '';
        return '<span class="filter-chip ' + chip.type + '"' + inlineStyle + ' data-chip-index="' + i + '">'
            + '<span class="filter-chip-label">' + escapeHtmlTag(chip.label) + '</span>'
            + '<button class="filter-chip-remove" data-chip-index="' + i + '" title="解除">×</button>'
            + '</span>';
    }).join('') + '<button class="filter-chip-clear-all" id="clearAllChips">✕ すべて解除</button>';

    bar.innerHTML = html;
    bar.classList.add('has-chips');

    bar.querySelectorAll('.filter-chip-remove').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var idx = parseInt(this.dataset.chipIndex);
            if (chips[idx] && chips[idx].remove) chips[idx].remove();
        });
    });

    var clearAll = document.getElementById('clearAllChips');
    if (clearAll) {
        clearAll.addEventListener('click', function() {
            var el = document.getElementById('search');
            if (el) el.value = '';
            if (dailyMachineFilterSelect) dailyMachineFilterSelect.reset();
            resetDailyFilterGroups();
            if (typeof TagEngine !== 'undefined' && TagEngine.clearAll) {
                TagEngine.clearAll();
            }
            var tagEl = document.getElementById('dailyShowTaggedOnly');
            if (tagEl) tagEl.checked = false;
            var sortEl = document.getElementById('sortBy');
            if (sortEl) sortEl.value = '';
            dailySortColumn = null;
            dailySortDir    = null;
            DailyState.setState({
                search: '',
                selectedMachines: [],
                filterGroups: [],
                showTaggedOnly: false,
                sortBy: ''
            });
            renderDailyTagPreview();
        });
    }
}

// ===================
// テーブル描画
// ===================

var SORTABLE_COLUMNS = {
    '差枚':   { asc: 'sa_asc',      desc: 'sa_desc' },
    'G数':    { asc: 'game_asc',    desc: 'game_desc' },
    '機械割': { asc: 'rate_asc',    desc: 'rate_desc' },
    'BB':     { asc: 'bb_asc',      desc: 'bb_desc' },
    'RB':     { asc: 'rb_asc',      desc: 'rb_desc' },
    'ART':    { asc: 'art_asc',     desc: 'art_desc' },
    '機種名': { asc: 'machine_asc', desc: 'machine_desc' },
    '台番号': { asc: 'unit_asc',    desc: 'unit_desc' }
};

function renderTableWithColumns(data, tableId, summaryId, columns) {
    var table = document.getElementById(tableId);
    if (!table) return;

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var displayColumns = columns.length > 0 ? columns : allColumns;

    thead.innerHTML = '<tr>' + displayColumns.map(function(h) {
        if (h === '機種内順位') {
            var isFiltering = (dailyBadgeFilter.tako || dailyBadgeFilter.kubi);
            var filterClass = isFiltering ? ' badge-filter-active' : '';
            var icon = isFiltering ? '🔽' : '⇅';
            return '<th class="sortable badge-col-header' + filterClass + '" data-col="' + h + '">'
                + h
                + '<span class="sort-icon">' + icon + '</span>'
                + '</th>';
        }
        var sortKeys = SORTABLE_COLUMNS[h];
        if (!sortKeys) return '<th>' + h + '</th>';
        var isSorting = (dailySortColumn === h);
        var dirClass = isSorting ? (dailySortDir === 'asc' ? ' sort-asc' : ' sort-desc') : '';
        var icon = isSorting ? (dailySortDir === 'asc' ? '▲' : '▼') : '⇅';
        return '<th class="sortable' + dirClass + '" data-col="' + h + '">'
            + h
            + '<span class="sort-icon">' + icon + '</span>'
            + '</th>';
    }).join('') + '</tr>';

    thead.querySelectorAll('th.sortable').forEach(function(th) {
        th.addEventListener('click', function() {
            var col = this.dataset.col;

            if (col === '機種内順位') {
                var isFiltering = (dailyBadgeFilter.tako || dailyBadgeFilter.kubi);
                if (isFiltering) {
                    dailyBadgeFilter.tako = false;
                    dailyBadgeFilter.kubi = false;
                } else {
                    dailyBadgeFilter.tako = true;
                    dailyBadgeFilter.kubi = true;
                }
                syncBadgeFilterCheckboxes();
                filterAndRender();
                return;
            }

            var keys = SORTABLE_COLUMNS[col];
            if (!keys) return;

            var newDir;
            if (dailySortColumn === col) {
                if (dailySortDir === 'asc')       newDir = 'desc';
                else if (dailySortDir === 'desc') newDir = null;
                else                              newDir = 'asc';
            } else {
                newDir = 'desc';
            }

            dailySortColumn = newDir ? col : null;
            dailySortDir    = newDir;

            var sortByVal = newDir ? keys[newDir] : '';

            var sortEl = document.getElementById('sortBy');
            if (sortEl) sortEl.value = sortByVal;

            DailyState.setState({ sortBy: sortByVal });
        });
    });

    var tagDefs = TagEngine.getAll();

    var memoDateKey = dailyCurrentMemoDateKey || '';
    var memoForDate = {};
    if (typeof SeatMemo !== 'undefined' && memoDateKey) {
        memoForDate = SeatMemo.getForDate(memoDateKey);
    }

    tbody.innerHTML = data.map(function(row) {
        return '<tr>' + displayColumns.map(function(h) {
            var val = row[h];

            if (h === 'メモ') {
                var memoBadges = '';
                if (typeof SeatMemo !== 'undefined') {
                    var memo = memoForDate[String(row['台番号'])];
                    memoBadges = SeatMemo.badgeHtml(memo);
                }
                var inner = memoBadges || '<span class="memo-add-hint">＋メモ</span>';
                return '<td class="memo-col-cell memo-col-clickable" data-daiban="'
                    + escapeHtmlTag(String(row['台番号'] || ''))
                    + '" data-machine="' + escapeHtmlTag(String(row['機種名'] || '')) + '">'
                    + inner + '</td>';
            }

            if (h === '機種内順位') {
                if (typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled()) {
                    var badgeInfo = row['_machineBadge'] || { tako: null, kubi: null };
                    return MachineBadge.renderBadgeHtml(badgeInfo);
                }
                return '<td class="mb-cell">-</td>';
            }

            if (h === 'タグ') {
                var matchedTags = row['_matchedTags'] || [];
                if (matchedTags.length === 0) {
                    return '<td class="text-center"><span class="text-muted">-</span></td>';
                }
                var tagsHtml = matchedTags.map(function(tagId) {
                    var def = TagEngine.get(tagId);
                    if (!def) return '';
                    return '<span class="custom-tag-badge" style="background: ' + def.color + '20; border-color: ' + def.color + '; color: ' + def.color + ';">' + def.icon + ' ' + escapeHtmlTag(def.name) + '</span>';
                }).join(' ');
                return '<td class="text-center">' + tagsHtml + '</td>';
            }

            if (h === '位置') {
                var tagsHtml2 = renderPositionTags(row['台番号'], { compact: true });
                return '<td>' + (tagsHtml2 || '-') + '</td>';
            }

            if (h === '機械割') {
                var rate = val;
                if (rate === null || rate === undefined || isNaN(rate)) {
                    return '<td>-</td>';
                }
                var rateClass = getMechanicalRateClass(rate);
                var rateText = formatMechanicalRate(rate);
                return '<td class="' + rateClass + '">' + rateText + '</td>';
            }

            if (h === '差枚') {
                if (val === '' || val === null || val === undefined) return '<td>-</td>';
                var numVal = parseInt(String(val).replace(/,/g, '')) || 0;
                var cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return '<td class="' + cls + '">' + (numVal >= 0 ? '+' : '') + numVal.toLocaleString() + '</td>';
            }

            if (h === 'G数') {
                if (val === '' || val === null || val === undefined) return '<td>-</td>';
                var gVal = parseInt(String(val).replace(/,/g, '')) || 0;
                return '<td>' + gVal.toLocaleString() + '</td>';
            }

            var strVal = (val === null || val === undefined) ? '' : val;
            if (strVal === '') return '<td>-</td>';
            if (/^-?\d+$/.test(strVal)) return '<td>' + parseInt(strVal).toLocaleString() + '</td>';
            return '<td>' + strVal + '</td>';
        }).join('') + '</tr>';
    }).join('');

    if (typeof SeatMemo !== 'undefined' && SeatMemo.openEditor) {
        tbody.querySelectorAll('.memo-col-clickable').forEach(function(cell) {
            cell.addEventListener('click', function() {
                var daiban = this.dataset.daiban;
                var machine = this.dataset.machine || '';
                if (!daiban) return;
                if (!dailyCurrentMemoDateKey) return;
                SeatMemo.openEditor(dailyCurrentMemoDateKey, daiban, machine);
            });
        });
    }

    if (summaryId) {
        var summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            if (dailyCurrentIsVirtual) {
                summaryEl.innerHTML =
                    '<span class="virtual-day-note">📝 稼働中の日です。差枚などのデータはまだありません。'
                    + 'メモ列をタップしてその場でメモを記録できます。機種内順位バッジは前日基準で計算しています（' + data.length + '台）。</span>';
            } else {
                var totalSa = data.reduce(function(sum, r) { return sum + (parseInt(String(r['差枚']).replace(/,/g, '')) || 0); }, 0);
                var totalGames = data.reduce(function(sum, r) { return sum + (parseInt(String(r['G数']).replace(/,/g, '')) || 0); }, 0);
                var plusCount = data.filter(function(r) { return (parseInt(String(r['差枚']).replace(/,/g, '')) || 0) > 0; }).length;
                var winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
                var saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
                var avgRate = calculateMechanicalRate(totalGames, totalSa);
                var avgRateText = formatMechanicalRate(avgRate);
                var avgRateClass = getMechanicalRateClass(avgRate);

                var noteParts = [];
                if (TagEngine.hasAnyActiveConditions()) {
                    var taggedCount = data.filter(function(r) { return r['_matchedTags'] && r['_matchedTags'].length > 0; }).length;
                    noteParts.push('タグ付き: ' + taggedCount + '台');
                }
                if (hasActiveDailyFilters()) {
                    noteParts.push('フィルター適用中');
                }
                var noteHtml = noteParts.length > 0
                    ? '<div class="summary-note">' + noteParts.join('　/　') + '</div>'
                    : '';

                summaryEl.innerHTML =
                    '<div class="summary-cards">' +
                        '<div class="stat-card">' +
                            '<span class="stat-label">総差枚</span>' +
                            '<span class="stat-value ' + saClass + '">' + (totalSa >= 0 ? '+' : '') + totalSa.toLocaleString() + '</span>' +
                        '</div>' +
                        '<div class="stat-card">' +
                            '<span class="stat-label">機械割</span>' +
                            '<span class="stat-value ' + avgRateClass + '">' + avgRateText + '</span>' +
                        '</div>' +
                        '<div class="stat-card">' +
                            '<span class="stat-label">勝率</span>' +
                            '<span class="stat-value">' + winRate + '%</span>' +
                        '</div>' +
                        '<div class="stat-card">' +
                            '<span class="stat-label">表示台数</span>' +
                            '<span class="stat-value">' + data.length + '<span class="stat-unit">台</span></span>' +
                        '</div>' +
                        '<div class="stat-card">' +
                            '<span class="stat-label">総G数</span>' +
                            '<span class="stat-value">' + totalGames.toLocaleString() + '</span>' +
                        '</div>' +
                    '</div>' +
                    noteHtml;
            }
        }
    }
}

function escapeHtmlTag(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===================
// コピー・ダウンロード
// ===================

function getDisplayedTableData() {
    var table = document.getElementById('data-table');
    if (!table) return { headers: [], rows: [] };
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var hdrs = [];
    thead.querySelectorAll('th').forEach(function(cell) { hdrs.push(cell.textContent.trim()); });
    var rows = [];
    tbody.querySelectorAll('tr').forEach(function(row) {
        var rowData = [];
        row.querySelectorAll('td').forEach(function(cell, index) {
            var value = cell.textContent.trim();
            var headerName = hdrs[index];
            if (headerName === '位置') {
                value = value.replace(/[🔲🔳⬜⭕🔷🔶]/g, '').trim();
                rowData.push(value);
                return;
            }
            if (headerName === 'タグ') {
                var badges = cell.querySelectorAll('.custom-tag-badge');
                if (badges.length > 0) {
                    var tagNames = [];
                    badges.forEach(function(b) { tagNames.push(b.textContent.trim()); });
                    rowData.push(tagNames.join(', '));
                } else {
                    rowData.push('-');
                }
                return;
            }
            if (value.indexOf('/') !== -1) { rowData.push(value); return; }
            if (headerName && headerName.indexOf('機械割') !== -1 && value.indexOf('%') !== -1) {
                var numStr = value.replace('%', '');
                var num = parseFloat(numStr);
                if (!isNaN(num)) value = num.toString();
                rowData.push(value);
                return;
            }
            if (['G数', '差枚', 'BB', 'RB', 'ART'].some(function(h) { return headerName && headerName.indexOf(h) !== -1; })) {
                var cleaned = value.replace(/[+,]/g, '');
                var parsed = parseFloat(cleaned);
                if (!isNaN(parsed)) value = parsed.toString();
            }
            rowData.push(value);
        });
        rows.push(rowData);
    });
    return { headers: hdrs, rows: rows };
}

async function copyTableToClipboard() {
    var data = getDisplayedTableData();
    var btn = document.getElementById('copyTableBtn');
    await copyToClipboard(data, btn);
}

function downloadTableAsCSV() {
    var data = getDisplayedTableData();
    if (data.rows.length === 0) { showCopyToast('ダウンロードするデータがありません', true); return; }
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var currentFile = displayFiles[currentDateIndex];
    var dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/__virtual__', 'next_').replace('data/', '') : 'data';
    downloadAsCSV(data, dateStr + '_export.csv');
}

// ===================
// モーダルイベント
// ===================

function setupDailyModalEvents() {
    bindModalOpen('openNumFilterModal', 'numFilterModal');
    bindModalClose('closeNumFilterModal', 'numFilterModal');
    var applyFilterBtn = document.getElementById('applyFilter');
    if (applyFilterBtn) applyFilterBtn.addEventListener('click', function() {
        filterAndRender();
        closeAppModal('numFilterModal');
    });
    var resetFilterBtn = document.getElementById('resetFilter');
    if (resetFilterBtn) resetFilterBtn.addEventListener('click', function() {
        resetDailyFilterGroups();
        filterAndRender();
    });

    bindModalOpen('openDailyTagModal', 'dailyTagModal');
    bindModalClose('closeDailyTagModal', 'dailyTagModal');
    var applyTagBtn = document.getElementById('applyDailyTagModal');
    if (applyTagBtn) applyTagBtn.addEventListener('click', function() {
        renderDailyTagPreview();
        closeAppModal('dailyTagModal');
    });

    var openTagModalBtn = document.getElementById('openDailyTagModal');
    if (openTagModalBtn) {
        openTagModalBtn.addEventListener('click', function() {
            updateTagBulkApplyUI();
        });
    }

    var tagBulkApplyBtn = document.getElementById('tagBulkApplyBtn');
    if (tagBulkApplyBtn) {
        tagBulkApplyBtn.addEventListener('click', function() {
            var sel = document.getElementById('tagBulkTargetSelect');
            if (!sel || !sel.value) {
                alert('タグを選択してください');
                return;
            }
            var defId = sel.value;
            var unitNos = dailyCurrentFilteredData.map(function(row) {
                return String(row['台番号'] || '');
            }).filter(Boolean);
            if (unitNos.length === 0) {
                alert('表示中の台がありません');
                return;
            }
            var def = TagEngine.get(defId);
            if (!def) return;
            var existing = def.unitNos || [];
            var merged = existing.slice();
            unitNos.forEach(function(u) {
                if (merged.indexOf(u) === -1) merged.push(u);
            });
            TagEngine.setUnitNos(defId, merged);
            alert('✅ ' + unitNos.length + '台に「' + def.name + '」タグを付けました（合計 ' + merged.length + '台）');
            updateTagBulkApplyUI();
        });
    }

    bindModalOpen('openColumnModal', 'columnModal');
    bindModalClose('closeColumnModal', 'columnModal');
    var applyColumnBtn = document.getElementById('applyColumnModal');
    if (applyColumnBtn) applyColumnBtn.addEventListener('click', function() {
        closeAppModal('columnModal');
    });

    bindModalOpen('openBadgeModal', 'badgeModal');
    bindModalClose('closeBadgeModal', 'badgeModal');
    var applyBadgeBtn = document.getElementById('applyBadgeModal');
    if (applyBadgeBtn) applyBadgeBtn.addEventListener('click', function() {
        closeAppModal('badgeModal');
    });

    document.querySelectorAll('.app-modal').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.remove('open');
        });
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.app-modal.open').forEach(function(m) {
                m.classList.remove('open');
            });
        }
    });
}

function bindModalOpen(btnId, modalId) {
    var btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', function() { openAppModal(modalId); });
}

function bindModalClose(btnId, modalId) {
    var btn = document.getElementById(btnId);
    if (btn) btn.addEventListener('click', function() { closeAppModal(modalId); });
}

// ===================
// イベントリスナー
// ===================

function setupDailyEventListeners() {
    document.getElementById('prevDate') && document.getElementById('prevDate').addEventListener('click', function() {
        var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex < displayFiles.length - 1) {
            var newFile = displayFiles[currentDateIndex + 1];
            delete dailyBadgeCache[newFile];
            if (typeof DailyState !== 'undefined') {
                DailyState.setState({ dateFile: newFile });
            } else {
                currentDateIndex++;
                initDateSelectWithEvents();
                filterAndRender();
            }
        }
    });

    document.getElementById('nextDate') && document.getElementById('nextDate').addEventListener('click', function() {
        var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex > 0) {
            var newFile = displayFiles[currentDateIndex - 1];
            delete dailyBadgeCache[newFile];
            if (typeof DailyState !== 'undefined') {
                DailyState.setState({ dateFile: newFile });
            } else {
                currentDateIndex--;
                initDateSelectWithEvents();
                filterAndRender();
            }
        }
    });

    document.getElementById('latestDate') && document.getElementById('latestDate').addEventListener('click', function() {
        var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
        var latestFile = displayFiles[0];
        if (!latestFile) return;
        delete dailyBadgeCache[latestFile];
        if (typeof DailyState !== 'undefined') {
            DailyState.setState({ dateFile: latestFile });
        } else {
            currentDateIndex = 0;
            initDateSelectWithEvents();
            filterAndRender();
        }
    });

    document.getElementById('dateSelect') && document.getElementById('dateSelect').addEventListener('change', function(e) {
        delete dailyBadgeCache[e.target.value];
        if (typeof DailyState !== 'undefined') {
            DailyState.setState({ dateFile: e.target.value });
        } else {
            var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
            currentDateIndex = displayFiles.indexOf(e.target.value);
            filterAndRender();
        }
    });

    document.getElementById('sortBy') && document.getElementById('sortBy').addEventListener('change', function(e) {
        if (typeof DailyState !== 'undefined') {
            DailyState.setState({ sortBy: e.target.value });
        } else {
            filterAndRender();
        }
    });

    var addGroupBtn = document.getElementById('dailyAddFilterGroup');
    if (addGroupBtn) {
        addGroupBtn.addEventListener('click', function() {
            addDailyFilterGroup();
        });
    }

    document.getElementById('selectAllColumns') && document.getElementById('selectAllColumns').addEventListener('click', selectAllColumns);
    document.getElementById('deselectAllColumns') && document.getElementById('deselectAllColumns').addEventListener('click', deselectAllColumns);
    document.getElementById('copyTableBtn') && document.getElementById('copyTableBtn').addEventListener('click', copyTableToClipboard);
    document.getElementById('downloadCsvBtn') && document.getElementById('downloadCsvBtn').addEventListener('click', downloadTableAsCSV);

    var showTaggedOnlyEl = document.getElementById('dailyShowTaggedOnly');
    if (showTaggedOnlyEl) {
        showTaggedOnlyEl.addEventListener('change', function(e) {
            if (typeof DailyState !== 'undefined') {
                DailyState.setState({ showTaggedOnly: e.target.checked });
            } else {
                filterAndRender();
            }
        });
    }

    var badgeRecalcBtn = document.getElementById('badgeRecalcBtn');
    if (badgeRecalcBtn) {
        badgeRecalcBtn.addEventListener('click', function() {
            recalcBadgeCache();
            updateBadgeRecalcButton();
            filterAndRender();
        });
    }

    var badgeFilterTakoEl = document.getElementById('badgeFilterTako');
    if (badgeFilterTakoEl) {
        badgeFilterTakoEl.addEventListener('change', function(e) {
            dailyBadgeFilter.tako = e.target.checked;
            filterAndRender();
        });
    }

    var badgeFilterKubiEl = document.getElementById('badgeFilterKubi');
    if (badgeFilterKubiEl) {
        badgeFilterKubiEl.addEventListener('change', function(e) {
            dailyBadgeFilter.kubi = e.target.checked;
            filterAndRender();
        });
    }

    loadDailyFilterGroups();
    renderDailyFilterGroups();

    setupDailyModalEvents();

    initDateSelectWithEvents();
    setupSuffixStatsEventListeners();

    if (typeof SeatMemo !== 'undefined' && SeatMemo.init) {
        SeatMemo.init();
    }

    if (typeof AimSheet !== 'undefined') {
        AimSheet.setupEvents();
    }
}

// ===================
// 台番号末尾別統計
// ===================

var suffixStatsPanelOpen = false;

function toggleSuffixStatsPanel() {
    var content = document.getElementById('suffixStatsContent');
    var toggle = document.getElementById('suffixStatsToggle');
    if (!content || !toggle) return;

    suffixStatsPanelOpen = !suffixStatsPanelOpen;

    if (suffixStatsPanelOpen) {
        content.classList.add('open');
        toggle.classList.add('open');
        toggle.querySelector('.toggle-icon').textContent = '▲';
    } else {
        content.classList.remove('open');
        toggle.classList.remove('open');
        toggle.querySelector('.toggle-icon').textContent = '▼';
    }

    if (typeof DailyState !== 'undefined') {
        DailyState.setState({ suffixPanelOpen: suffixStatsPanelOpen }, { silent: true });
    } else {
        localStorage.setItem('suffixStatsPanelOpen', suffixStatsPanelOpen);
    }
}

function restoreSuffixStatsPanelState() {
    var shouldOpen = false;
    if (typeof DailyState !== 'undefined') {
        shouldOpen = DailyState.get().suffixPanelOpen === true;
    } else {
        shouldOpen = localStorage.getItem('suffixStatsPanelOpen') === 'true';
    }
    if (shouldOpen) {
        suffixStatsPanelOpen = false;
        toggleSuffixStatsPanel();
    }
}

function calculateSuffixStats(data) {
    var stats = {};
    for (var i = 0; i <= 9; i++) {
        stats[i] = {
            suffix: i,
            count: 0,
            totalSa: 0,
            totalGames: 0,
            totalBB: 0,
            totalRB: 0,
            totalART: 0,
            winCount: 0
        };
    }

    data.forEach(function(row) {
        var unitNum = (row['台番号'] || '').replace(/\D/g, '');
        if (unitNum.length === 0) return;

        var suffix = parseInt(unitNum.slice(-1));
        if (isNaN(suffix)) return;

        var sa = parseInt(String(row['差枚']).replace(/,/g, '')) || 0;
        var games = parseInt(String(row['G数']).replace(/,/g, '')) || 0;
        var bb = parseInt(String(row['BB']).replace(/,/g, '')) || 0;
        var rb = parseInt(String(row['RB']).replace(/,/g, '')) || 0;
        var art = parseInt(String(row['ART']).replace(/,/g, '')) || 0;

        stats[suffix].count++;
        stats[suffix].totalSa += sa;
        stats[suffix].totalGames += games;
        stats[suffix].totalBB += bb;
        stats[suffix].totalRB += rb;
        stats[suffix].totalART += art;
        if (sa > 0) stats[suffix].winCount++;
    });

    return stats;
}

function renderSuffixStatsTable(data) {
    var table = document.getElementById('suffix-stats-table');
    if (!table) return;

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');

    var stats = calculateSuffixStats(data);

    var grandTotal = {
        count: 0,
        totalSa: 0,
        totalGames: 0,
        totalBB: 0,
        totalRB: 0,
        totalART: 0,
        winCount: 0
    };

    for (var i = 0; i <= 9; i++) {
        grandTotal.count += stats[i].count;
        grandTotal.totalSa += stats[i].totalSa;
        grandTotal.totalGames += stats[i].totalGames;
        grandTotal.totalBB += stats[i].totalBB;
        grandTotal.totalRB += stats[i].totalRB;
        grandTotal.totalART += stats[i].totalART;
        grandTotal.winCount += stats[i].winCount;
    }

    thead.innerHTML =
        '<tr>' +
        '<th>末尾</th>' +
        '<th>台数</th>' +
        '<th>合計差枚</th>' +
        '<th>平均差枚</th>' +
        '<th>合計G数</th>' +
        '<th>平均G数</th>' +
        '<th>機械割</th>' +
        '<th>勝率</th>' +
        '<th>BB</th>' +
        '<th>RB</th>' +
        '<th>ART</th>' +
        '</tr>';

    var rows = '';

    for (var s = 0; s <= 9; s++) {
        var st = stats[s];
        var hasData = st.count > 0;
        var noDataClass = hasData ? '' : ' class="no-data"';

        var avgSa = hasData ? Math.round(st.totalSa / st.count) : 0;
        var avgGames = hasData ? Math.round(st.totalGames / st.count) : 0;
        var winRate = hasData ? ((st.winCount / st.count) * 100).toFixed(1) : '0.0';
        var mechRate = calculateMechanicalRate(st.totalGames, st.totalSa);

        var saClass = st.totalSa > 0 ? 'plus' : st.totalSa < 0 ? 'minus' : 'zero';
        var avgSaClass = avgSa > 0 ? 'plus' : avgSa < 0 ? 'minus' : 'zero';
        var mechRateClass = getMechanicalRateClass(mechRate);

        rows += '<tr' + noDataClass + '>';
        rows += '<td style="text-align:center; font-weight:bold;">' + s + '</td>';
        rows += '<td style="text-align:center;">' + st.count + '</td>';
        rows += '<td class="' + saClass + '">' + (hasData ? (st.totalSa >= 0 ? '+' : '') + st.totalSa.toLocaleString() : '-') + '</td>';
        rows += '<td class="' + avgSaClass + '">' + (hasData ? (avgSa >= 0 ? '+' : '') + avgSa.toLocaleString() : '-') + '</td>';
        rows += '<td>' + (hasData ? st.totalGames.toLocaleString() : '-') + '</td>';
        rows += '<td>' + (hasData ? avgGames.toLocaleString() : '-') + '</td>';
        rows += '<td class="' + mechRateClass + '">' + formatMechanicalRate(mechRate) + '</td>';
        rows += '<td>' + (hasData ? winRate + '%' : '-') + '</td>';
        rows += '<td>' + (hasData ? st.totalBB.toLocaleString() : '-') + '</td>';
        rows += '<td>' + (hasData ? st.totalRB.toLocaleString() : '-') + '</td>';
        rows += '<td>' + (hasData ? st.totalART.toLocaleString() : '-') + '</td>';
        rows += '</tr>';
    }

    var grandAvgSa = grandTotal.count > 0 ? Math.round(grandTotal.totalSa / grandTotal.count) : 0;
    var grandAvgGames = grandTotal.count > 0 ? Math.round(grandTotal.totalGames / grandTotal.count) : 0;
    var grandWinRate = grandTotal.count > 0 ? ((grandTotal.winCount / grandTotal.count) * 100).toFixed(1) : '0.0';
    var grandMechRate = calculateMechanicalRate(grandTotal.totalGames, grandTotal.totalSa);

    var grandSaClass = grandTotal.totalSa > 0 ? 'plus' : grandTotal.totalSa < 0 ? 'minus' : 'zero';
    var grandAvgSaClass = grandAvgSa > 0 ? 'plus' : grandAvgSa < 0 ? 'minus' : 'zero';
    var grandMechRateClass = getMechanicalRateClass(grandMechRate);

    rows += '<tr style="font-weight:bold; border-top: 2px solid var(--border-light);">';
    rows += '<td style="text-align:center;">合計</td>';
    rows += '<td style="text-align:center;">' + grandTotal.count + '</td>';
    rows += '<td class="' + grandSaClass + '">' + (grandTotal.totalSa >= 0 ? '+' : '') + grandTotal.totalSa.toLocaleString() + '</td>';
    rows += '<td class="' + grandAvgSaClass + '">' + (grandAvgSa >= 0 ? '+' : '') + grandAvgSa.toLocaleString() + '</td>';
    rows += '<td>' + grandTotal.totalGames.toLocaleString() + '</td>';
    rows += '<td>' + grandAvgGames.toLocaleString() + '</td>';
    rows += '<td class="' + grandMechRateClass + '">' + formatMechanicalRate(grandMechRate) + '</td>';
    rows += '<td>' + grandWinRate + '%</td>';
    rows += '<td>' + grandTotal.totalBB.toLocaleString() + '</td>';
    rows += '<td>' + grandTotal.totalRB.toLocaleString() + '</td>';
    rows += '<td>' + grandTotal.totalART.toLocaleString() + '</td>';
    rows += '</tr>';

    tbody.innerHTML = rows;
}

function getSuffixStatsTableData() {
    var table = document.getElementById('suffix-stats-table');
    if (!table) return { headers: [], rows: [] };

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');

    var hdrs = [];
    thead.querySelectorAll('th').forEach(function(cell) {
        hdrs.push(cell.textContent.trim());
    });

    var rows = [];
    tbody.querySelectorAll('tr').forEach(function(row) {
        var rowData = [];
        row.querySelectorAll('td').forEach(function(cell) {
            var value = cell.textContent.trim();
            var cleaned = value.replace(/[+,]/g, '').replace('%', '');
            var num = parseFloat(cleaned);
            if (!isNaN(num) && value !== '-') {
                rowData.push(cleaned);
            } else {
                rowData.push(value);
            }
        });
        if (rowData.length > 0) rows.push(rowData);
    });

    return { headers: hdrs, rows: rows };
}

function copySuffixStatsTable() {
    var data = getSuffixStatsTableData();
    var btn = document.getElementById('copySuffixTableBtn');
    copyToClipboard(data, btn);
}

function downloadSuffixStatsCSV() {
    var data = getSuffixStatsTableData();
    if (data.rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    var displayFiles = (typeof getDisplayFiles === 'function') ? getDisplayFiles() : sortFilesByDate(CSV_FILES, true);
    var currentFile = displayFiles[currentDateIndex];
    var dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/__virtual__', 'next_').replace('data/', '') : 'data';
    downloadAsCSV(data, dateStr + '_suffix_stats.csv');
}

function setupSuffixStatsEventListeners() {
    var toggle = document.getElementById('suffixStatsToggle');
    if (toggle) {
        toggle.addEventListener('click', toggleSuffixStatsPanel);
    }

    var copyBtn = document.getElementById('copySuffixTableBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copySuffixStatsTable);
    }

    var downloadBtn = document.getElementById('downloadSuffixCsvBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadSuffixStatsCSV);
    }

    restoreSuffixStatsPanelState();
}
