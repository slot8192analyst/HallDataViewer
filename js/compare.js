// ===================
// 日別比較タブ（複数比較日対応）
// ===================

var compareMachineFilterSelect = null;
var compareDataCache = { base: null, targets: [] };
var compareTargetDates = [];
var selectedAnalysisTagId = '';
var compareMaxTargets = 5;
var compareVisibleColumns = {};

// ========== 初期化 ==========

function initCompareTab() {
    populateCompareDateSelects();
    updateCompareDateInfo();
    addCompareTargetDate();

    initTagUI();

    onTagConditionsChanged = function() {
        saveTagState();
        if (hasCompareData()) renderCompare();
    };

    var showHighOnly = document.getElementById('showHighSettingOnly');
    if (showHighOnly) {
        showHighOnly.addEventListener('change', function() {
            if (hasCompareData()) renderCompare();
        });
    }
    var showBothDays = document.getElementById('showTagBothDays');
    if (showBothDays) {
        showBothDays.addEventListener('change', function() {
            if (hasCompareData()) renderCompare();
        });
    }
}

function populateCompareDateSelects() {
    var selectBase = document.getElementById('compareDateBase');
    if (!selectBase) return;

    var sortedFiles = sortFilesByDate(CSV_FILES, true);

    var optionsHtml = sortedFiles.map(function(file) {
        return createDateSelectOption(file, false);
    }).join('');

    selectBase.innerHTML = optionsHtml;

    if (sortedFiles.length >= 1) {
        selectBase.selectedIndex = 0;
    }
}

function getCompareDateOptionsHtml() {
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    return sortedFiles.map(function(file) {
        return createDateSelectOption(file, false);
    }).join('');
}

function updateCompareDateInfo() {
    var selectBase = document.getElementById('compareDateBase');
    var infoBase = document.getElementById('compareDateBaseInfo');

    if (selectBase && selectBase.value && infoBase) {
        infoBase.textContent = getDayOfWeekName(getDayOfWeek(selectBase.value));
    }

    compareTargetDates.forEach(function(entry) {
        var sel = document.getElementById('compareTargetSelect_' + entry.id);
        var info = document.getElementById('compareTargetInfo_' + entry.id);
        if (sel && sel.value && info) {
            info.textContent = getDayOfWeekName(getDayOfWeek(sel.value));
        } else if (info) {
            info.textContent = '';
        }
    });
}

// ========== 比較日の追加・削除 ==========

var compareTargetIdCounter = 0;

function addCompareTargetDate(preselectedIndex) {
    if (compareTargetDates.length >= compareMaxTargets) {
        showCopyToast('比較日は最大' + compareMaxTargets + '日までです', true);
        return;
    }

    var id = ++compareTargetIdCounter;
    compareTargetDates.push({ id: id });

    renderCompareDateList();

    var sel = document.getElementById('compareTargetSelect_' + id);
    if (sel) {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var targetIndex = preselectedIndex !== undefined ? preselectedIndex : compareTargetDates.length;
        if (targetIndex < sortedFiles.length) {
            sel.selectedIndex = targetIndex;
        }
    }

    updateCompareDateInfo();
    updateAddButtonState();
}

function removeCompareTargetDate(id) {
    if (compareTargetDates.length <= 1) {
        showCopyToast('比較日は最低1つ必要です', true);
        return;
    }

    compareTargetDates = compareTargetDates.filter(function(e) { return e.id !== id; });
    renderCompareDateList();
    updateCompareDateInfo();
    updateAddButtonState();
}

function renderCompareDateList() {
    var container = document.getElementById('compareDateList');
    if (!container) return;

    var optionsHtml = getCompareDateOptionsHtml();

    container.innerHTML = compareTargetDates.map(function(entry, index) {
        var num = index + 1;
        var removeDisabled = compareTargetDates.length <= 1 ? ' disabled' : '';
        return '<div class="compare-target-row" id="compareTargetRow_' + entry.id + '">' +
            '<span class="compare-target-label">比較日' + num + '</span>' +
            '<select id="compareTargetSelect_' + entry.id + '" class="compare-target-select">' +
            optionsHtml +
            '</select>' +
            '<span class="compare-date-info" id="compareTargetInfo_' + entry.id + '"></span>' +
            '<button class="compare-target-remove" onclick="removeCompareTargetDate(' + entry.id + ')"' + removeDisabled + ' title="削除">×</button>' +
            '</div>';
    }).join('');

    compareTargetDates.forEach(function(entry) {
        var sel = document.getElementById('compareTargetSelect_' + entry.id);
        if (sel && entry.selectedValue) {
            sel.value = entry.selectedValue;
        }
        if (sel) {
            sel.addEventListener('change', function() {
                entry.selectedValue = this.value;
                updateCompareDateInfo();
            });
        }
    });

    updateCompareDateInfo();
}

function updateAddButtonState() {
    var btn = document.getElementById('addCompareDate');
    if (btn) {
        btn.disabled = compareTargetDates.length >= compareMaxTargets;
    }
}

function getSelectedTargetFiles() {
    var files = [];
    compareTargetDates.forEach(function(entry) {
        var sel = document.getElementById('compareTargetSelect_' + entry.id);
        if (sel && sel.value) {
            files.push({ id: entry.id, file: sel.value });
        }
    });
    return files;
}

// ========== 日付フォーマット ==========

function formatDateShort(fileOrDate) {
    var str = String(fileOrDate).replace('data/', '').replace(/\.(json|csv)/, '').replace(/_/g, '/');
    var parts = str.split('/');
    if (parts.length >= 3) {
        return parts[1] + '/' + parts[2];
    }
    if (parts.length === 2) {
        return parts[0] + '/' + parts[1];
    }
    return str;
}

// ========== データ読み込み ==========

async function loadCompareData() {
    var selectBase = document.getElementById('compareDateBase');
    if (!selectBase) return;

    var baseFile = selectBase.value;
    if (!baseFile) {
        showCopyToast('基準日を選択してください', true);
        return;
    }

    var targetFiles = getSelectedTargetFiles();
    if (targetFiles.length === 0) {
        showCopyToast('比較日を1つ以上選択してください', true);
        return;
    }

    var allFiles = [baseFile];
    var hasDuplicate = false;
    targetFiles.forEach(function(t) {
        if (allFiles.indexOf(t.file) !== -1) {
            hasDuplicate = true;
        }
        allFiles.push(t.file);
    });

    if (hasDuplicate) {
        showCopyToast('同じ日付が含まれています', true);
        return;
    }

    var baseData = await loadCSV(baseFile);
    if (!baseData) {
        showCopyToast('基準日のデータ読み込みに失敗しました', true);
        return;
    }
    baseData = addMechanicalRateToData(baseData);

    var targets = [];
    for (var i = 0; i < targetFiles.length; i++) {
        var tData = await loadCSV(targetFiles[i].file);
        if (!tData) {
            showCopyToast('比較日のデータ読み込みに失敗しました', true);
            return;
        }
        tData = addMechanicalRateToData(tData);
        targets.push({
            id: targetFiles[i].id,
            file: targetFiles[i].file,
            data: tData,
            label: formatDate(targetFiles[i].file),
            shortLabel: formatDateShort(targetFiles[i].file)
        });
    }

    compareDataCache.base = baseData;
    compareDataCache.baseFile = baseFile;
    compareDataCache.baseLabel = formatDate(baseFile);
    compareDataCache.baseShortLabel = formatDateShort(baseFile);
    compareDataCache.targets = targets;

    initCompareMachineFilter(baseData, targets);
    buildCompareColumnCheckboxes();
    renderCompare();
}

function initCompareMachineFilter(baseData, targets) {
    var machineUnitsMap = {};

    var allDataSets = [baseData];
    targets.forEach(function(t) { allDataSets.push(t.data); });

    allDataSets.forEach(function(data) {
        data.forEach(function(row) {
            var name = row['機種名'] || '';
            var unit = row['台番号'] || '';
            if (name) {
                if (!machineUnitsMap[name]) machineUnitsMap[name] = {};
                if (unit) machineUnitsMap[name][unit] = true;
            }
        });
    });

    var options = Object.keys(machineUnitsMap)
        .sort(function(a, b) {
            var countDiff = Object.keys(machineUnitsMap[b]).length - Object.keys(machineUnitsMap[a]).length;
            if (countDiff !== 0) return countDiff;
            return a.localeCompare(b, 'ja');
        })
        .map(function(name) {
            return { value: name, label: name, count: Object.keys(machineUnitsMap[name]).length };
        });

    if (compareMachineFilterSelect) {
        compareMachineFilterSelect.updateOptions(options);
    } else {
        compareMachineFilterSelect = initMultiSelectMachineFilter(
            'compareMachineFilterContainer', options, '全機種',
            function() { if (hasCompareData()) renderCompare(); }
        );
    }
}

// ========== 列表示制御 ==========

function getCompareColumnDefs() {
    var targets = compareDataCache.targets || [];
    var showTags = TagEngine.hasAnyActiveConditions();
    var baseShort = compareDataCache.baseShortLabel || '基準';

    var cols = [];
    cols.push({ key: 'machine', label: '機種名', alwaysOn: true });
    cols.push({ key: 'unit', label: '台番号', alwaysOn: true });
    cols.push({ key: 'base_val', label: baseShort + ' 値' });
    if (showTags) {
        cols.push({ key: 'base_tag', label: baseShort + ' タグ' });
    }

    targets.forEach(function(t, i) {
        var short = t.shortLabel || ('比較' + (i + 1));
        cols.push({ key: 'target_val_' + t.id, label: short + ' 値' });
        cols.push({ key: 'target_diff_' + t.id, label: short + ' 差分' });
        if (showTags) {
            cols.push({ key: 'target_tag_' + t.id, label: short + ' タグ' });
        }
    });

    return cols;
}

function buildCompareColumnCheckboxes() {
    var cols = getCompareColumnDefs();

    compareVisibleColumns = {};
    cols.forEach(function(col) {
        compareVisibleColumns[col.key] = true;
    });

    renderCompareColumnCheckboxes();
}

function renderCompareColumnCheckboxes() {
    var container = document.getElementById('compareColumnCheckboxes');
    if (!container) return;

    var cols = getCompareColumnDefs();

    container.innerHTML = cols.filter(function(col) {
        return !col.alwaysOn;
    }).map(function(col) {
        var checked = compareVisibleColumns[col.key] !== false ? ' checked' : '';
        return '<label class="column-checkbox-item">' +
            '<input type="checkbox" data-col-key="' + col.key + '"' + checked + '>' +
            '<span>' + escapeHtml(col.label) + '</span>' +
            '</label>';
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            compareVisibleColumns[this.getAttribute('data-col-key')] = this.checked;
            updateColSelectBtnLabel();
            if (hasCompareData()) renderCompareTable(buildCompareRows());
        });
    });

    updateColSelectBtnLabel();
}

function updateColSelectBtnLabel() {
    var btn = document.getElementById('compareColSelectBtn');
    if (!btn) return;

    var cols = getCompareColumnDefs().filter(function(c) { return !c.alwaysOn; });
    var visibleCount = cols.filter(function(c) { return compareVisibleColumns[c.key] !== false; }).length;
    var totalCount = cols.length;

    if (visibleCount < totalCount) {
        btn.textContent = '📋 表示列 (' + visibleCount + '/' + totalCount + ')';
    } else {
        btn.textContent = '📋 表示列';
    }
}

function isCompareColumnVisible(key) {
    if (compareVisibleColumns[key] === undefined) return true;
    return compareVisibleColumns[key];
}

// ========== 比較ロジック ==========

function hasCompareData() {
    return compareDataCache.base && compareDataCache.targets.length > 0;
}

function getNumericValue(row, column) {
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

function buildCompareRows() {
    if (!hasCompareData()) return [];

    var baseData = compareDataCache.base;
    var targets = compareDataCache.targets;
    var column = document.getElementById('compareDataColumn').value;

    var selectedMachines = compareMachineFilterSelect ? compareMachineFilterSelect.getSelectedValues() : [];

    var filteredBase = selectedMachines.length > 0
        ? baseData.filter(function(r) { return selectedMachines.includes(r['機種名']); })
        : baseData.slice();

    var filteredTargets = targets.map(function(t) {
        var fd = selectedMachines.length > 0
            ? t.data.filter(function(r) { return selectedMachines.includes(r['機種名']); })
            : t.data.slice();
        return { id: t.id, file: t.file, data: fd, label: t.label, shortLabel: t.shortLabel };
    });

    var suffixFilter = document.getElementById('compareUnitSuffixFilter').value;
    if (suffixFilter !== '') {
        var suffixFn = function(r) {
            var num = (r['台番号'] || '').replace(/\D/g, '');
            return num.length > 0 && num.slice(-1) === suffixFilter;
        };
        filteredBase = filteredBase.filter(suffixFn);
        filteredTargets = filteredTargets.map(function(t) {
            return { id: t.id, file: t.file, data: t.data.filter(suffixFn), label: t.label, shortLabel: t.shortLabel };
        });
    }

    var rows = buildUnitCompareRows(filteredBase, filteredTargets, column);

    // タグ判定
    if (TagEngine.hasAnyActiveConditions()) {
        rows.forEach(function(row) {
            row.tagsBase = row.rowBase ? TagEngine.evaluateAll(row.rowBase) : [];
            row.targetTags = {};
            filteredTargets.forEach(function(t) {
                var tRow = row.targetRows[t.id];
                row.targetTags[t.id] = tRow ? TagEngine.evaluateAll(tRow) : [];
            });
        });
    } else {
        rows.forEach(function(row) {
            row.tagsBase = [];
            row.targetTags = {};
            filteredTargets.forEach(function(t) {
                row.targetTags[t.id] = [];
            });
        });
    }

    // 差分フィルター（比較日1基準）
    var diffFilterType = document.getElementById('compareDiffFilterType').value;
    var diffFilterValue = document.getElementById('compareDiffFilterValue').value;
    if (diffFilterType && diffFilterValue !== '') {
        var val = parseFloat(diffFilterValue);
        rows = rows.filter(function(r) {
            var firstDiff = r.diffs[filteredTargets[0].id];
            if (firstDiff === null || firstDiff === undefined) return false;
            if (diffFilterType === 'gte') return firstDiff >= val;
            if (diffFilterType === 'lte') return firstDiff <= val;
            return true;
        });
    }

    var showFilter = document.getElementById('compareShowFilter').value;
    if (showFilter === 'improved') {
        rows = rows.filter(function(r) {
            var firstDiff = r.diffs[filteredTargets[0].id];
            return firstDiff !== null && firstDiff !== undefined && firstDiff > 0;
        });
    } else if (showFilter === 'declined') {
        rows = rows.filter(function(r) {
            var firstDiff = r.diffs[filteredTargets[0].id];
            return firstDiff !== null && firstDiff !== undefined && firstDiff < 0;
        });
    } else if (showFilter === 'both') {
        rows = rows.filter(function(r) {
            if (r.valBase === null) return false;
            return filteredTargets.every(function(t) {
                return r.targetVals[t.id] !== null && r.targetVals[t.id] !== undefined;
            });
        });
    }

    var showTaggedOnly = document.getElementById('showTaggedOnly');
    if (showTaggedOnly && showTaggedOnly.checked) {
        rows = rows.filter(function(r) {
            if (r.tagsBase.length > 0) return true;
            return Object.keys(r.targetTags).some(function(tid) {
                return r.targetTags[tid].length > 0;
            });
        });
    }
    var showBothDays = document.getElementById('showTagBothDays');
    if (showBothDays && showBothDays.checked) {
        rows = rows.filter(function(r) {
            if (r.tagsBase.length === 0) return false;
            return Object.keys(r.targetTags).every(function(tid) {
                return r.targetTags[tid].length > 0;
            });
        });
    }

    var sortBy = document.getElementById('compareSortBy').value;
    var firstTargetId = filteredTargets.length > 0 ? filteredTargets[0].id : null;
    rows = sortCompareRows(rows, sortBy, firstTargetId);

    return rows;
}

function buildUnitCompareRows(baseData, targets, column) {
    var baseMap = {};
    baseData.forEach(function(r) { if (r['台番号']) baseMap[r['台番号']] = r; });

    var targetMaps = {};
    targets.forEach(function(t) {
        var map = {};
        t.data.forEach(function(r) { if (r['台番号']) map[r['台番号']] = r; });
        targetMaps[t.id] = map;
    });

    var allUnits = {};
    Object.keys(baseMap).forEach(function(u) { allUnits[u] = true; });
    targets.forEach(function(t) {
        Object.keys(targetMaps[t.id]).forEach(function(u) { allUnits[u] = true; });
    });

    var rows = [];
    Object.keys(allUnits).forEach(function(unit) {
        var rowBase = baseMap[unit] || null;
        var valBase = rowBase ? getNumericValue(rowBase, column) : null;

        var targetRows = {};
        var targetVals = {};
        var diffs = {};

        targets.forEach(function(t) {
            var tRow = targetMaps[t.id][unit] || null;
            var tVal = tRow ? getNumericValue(tRow, column) : null;
            targetRows[t.id] = tRow;
            targetVals[t.id] = tVal;
            diffs[t.id] = (valBase !== null && tVal !== null) ? valBase - tVal : null;
        });

        var machineName = '';
        if (rowBase && rowBase['機種名']) {
            machineName = rowBase['機種名'];
        } else {
            for (var i = 0; i < targets.length; i++) {
                var tr = targetRows[targets[i].id];
                if (tr && tr['機種名']) { machineName = tr['機種名']; break; }
            }
        }

        rows.push({
            key: unit,
            machineName: machineName,
            unit: unit,
            valBase: valBase,
            rowBase: rowBase,
            targetRows: targetRows,
            targetVals: targetVals,
            diffs: diffs,
            tagsBase: [],
            targetTags: {}
        });
    });
    return rows;
}

function sortCompareRows(rows, sortBy, firstTargetId) {
    var sortFn;
    switch (sortBy) {
        case 'diff_desc':
            sortFn = function(a, b) {
                var da = firstTargetId && a.diffs[firstTargetId] !== null ? a.diffs[firstTargetId] : -Infinity;
                var db = firstTargetId && b.diffs[firstTargetId] !== null ? b.diffs[firstTargetId] : -Infinity;
                return db - da;
            }; break;
        case 'diff_asc':
            sortFn = function(a, b) {
                var da = firstTargetId && a.diffs[firstTargetId] !== null ? a.diffs[firstTargetId] : Infinity;
                var db = firstTargetId && b.diffs[firstTargetId] !== null ? b.diffs[firstTargetId] : Infinity;
                return da - db;
            }; break;
        case 'base_desc':
            sortFn = function(a, b) { return (b.valBase !== null ? b.valBase : -Infinity) - (a.valBase !== null ? a.valBase : -Infinity); }; break;
        case 'base_asc':
            sortFn = function(a, b) { return (a.valBase !== null ? a.valBase : Infinity) - (b.valBase !== null ? b.valBase : Infinity); }; break;
        case 'unit_asc':
            sortFn = function(a, b) { return (parseInt((a.unit || '').replace(/\D/g, '')) || 0) - (parseInt((b.unit || '').replace(/\D/g, '')) || 0); }; break;
        case 'unit_desc':
            sortFn = function(a, b) { return (parseInt((b.unit || '').replace(/\D/g, '')) || 0) - (parseInt((a.unit || '').replace(/\D/g, '')) || 0); }; break;
        case 'machine_asc':
            sortFn = function(a, b) { return (a.machineName || '').localeCompare(b.machineName || '', 'ja'); }; break;
        default:
            sortFn = function(a, b) {
                var da = firstTargetId && a.diffs[firstTargetId] !== null ? a.diffs[firstTargetId] : -Infinity;
                var db = firstTargetId && b.diffs[firstTargetId] !== null ? b.diffs[firstTargetId] : -Infinity;
                return db - da;
            };
    }
    return rows.sort(sortFn);
}

// ========== タグヘルパー ==========

function rowHasTag(tagIds, targetTagId) {
    return tagIds && tagIds.indexOf(targetTagId) !== -1;
}

function rowHasAnyTag(tagIds) {
    return tagIds && tagIds.length > 0;
}

function getActiveTagDefs() {
    return TagEngine.getAll().filter(function(def) {
        return TagEngine.hasActiveConditions(def.id);
    });
}

// ========== メイン描画 ==========

function renderCompare() {
    if (!hasCompareData()) return;

    // タグ状態が変わった可能性があるのでチェックボックスを再構築
    renderCompareColumnCheckboxes();

    var rows = buildCompareRows();
    renderCompareSummary(rows);
    renderCompareTable(rows);
    updateAnalysisTagSelect();
    renderCompareAnalysis(rows);
}

// ========== 比較サマリー ==========

function renderCompareSummary(rows) {
    var container = document.getElementById('compareSummary');
    if (!container) return;

    var column = document.getElementById('compareDataColumn').value;
    var baseLabel = compareDataCache.baseLabel || '基準日';
    var targets = compareDataCache.targets;

    var cntBase = rows.filter(function(r) { return r.valBase !== null; });
    var avgBase = cntBase.length > 0 ? cntBase.reduce(function(s, r) { return s + r.valBase; }, 0) / cntBase.length : 0;

    var html = '';
    html += '<div class="compare-summary-card card-b">' +
        '<div class="compare-card-label">' + baseLabel + '（平均）</div>' +
        '<div class="compare-card-value">' + formatCompareValue(avgBase, column) + '</div>' +
        '<div class="compare-card-sub">' + cntBase.length + '台</div>' +
        '</div>';

    targets.forEach(function(t) {
        var cntT = rows.filter(function(r) { return r.targetVals[t.id] !== null && r.targetVals[t.id] !== undefined; });
        var avgT = cntT.length > 0 ? cntT.reduce(function(s, r) { return s + r.targetVals[t.id]; }, 0) / cntT.length : 0;

        var bothRows = rows.filter(function(r) { return r.valBase !== null && r.targetVals[t.id] !== null && r.targetVals[t.id] !== undefined; });
        var avgDiff = bothRows.length > 0 ? bothRows.reduce(function(s, r) { return s + r.diffs[t.id]; }, 0) / bothRows.length : 0;
        var improvedCount = bothRows.filter(function(r) { return r.diffs[t.id] > 0; }).length;
        var declinedCount = bothRows.filter(function(r) { return r.diffs[t.id] < 0; }).length;

        html += '<div class="compare-summary-card card-a">' +
            '<div class="compare-card-label">' + t.label + '（平均）</div>' +
            '<div class="compare-card-value">' + formatCompareValue(avgT, column) + '</div>' +
            '<div class="compare-card-sub">' + cntT.length + '台</div>' +
            '</div>';

        html += '<div class="compare-summary-card card-diff">' +
            '<div class="compare-card-label">vs ' + t.label + ' 平均差分</div>' +
            '<div class="compare-card-value ' + getDiffClass(avgDiff) + '">' + formatCompareValue(avgDiff, column, true) + '</div>' +
            '<div class="compare-card-sub">比較可能: ' + bothRows.length + '件 (↑' + improvedCount + ' ↓' + declinedCount + ')</div>' +
            '</div>';
    });

    container.innerHTML = html;
}

// ========== 比較テーブル ==========

function renderCompareTable(rows) {
    var table = document.getElementById('compare-table');
    if (!table) return;

    var column = document.getElementById('compareDataColumn').value;
    var baseShort = compareDataCache.baseShortLabel || '基準';
    var targets = compareDataCache.targets;
    var showTags = TagEngine.hasAnyActiveConditions();

    table.className = 'mode-unit';
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');

    // ヘッダー構築（表示/非表示対応）
    var colDefs = [];

    colDefs.push({ key: 'machine', html: '<th>機種名</th>' });
    colDefs.push({ key: 'unit', html: '<th>台番号</th>' });
    colDefs.push({ key: 'base_val', html: '<th class="header-b">' + baseShort + '</th>' });
    if (showTags) {
        colDefs.push({ key: 'base_tag', html: '<th class="header-b">' + baseShort + ' タグ</th>' });
    }

    targets.forEach(function(t) {
        var short = t.shortLabel || '比較';
        colDefs.push({ key: 'target_val_' + t.id, html: '<th class="header-a">' + short + '</th>' });
        colDefs.push({ key: 'target_diff_' + t.id, html: '<th class="header-diff">' + short + ' 差分</th>' });
        if (showTags) {
            colDefs.push({ key: 'target_tag_' + t.id, html: '<th class="header-a">' + short + ' タグ</th>' });
        }
    });

    var visibleColDefs = colDefs.filter(function(c) { return isCompareColumnVisible(c.key); });

    thead.innerHTML = '<tr>' + visibleColDefs.map(function(c) { return c.html; }).join('') + '</tr>';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="' + visibleColDefs.length + '" class="text-center text-muted">データがありません。「比較実行」を押してください。</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(row) {
        var allCells = {};

        allCells['machine'] = '<td>' + escapeHtml(row.machineName) + '</td>';
        allCells['unit'] = '<td>' + escapeHtml(row.unit || '') + '</td>';
        allCells['base_val'] = '<td class="compare-cell-b">' + formatCompareCell(row.valBase, column) + '</td>';
        if (showTags) {
            allCells['base_tag'] = '<td class="text-center">' + renderHighSettingTagHtml(row.tagsBase) + '</td>';
        }

        targets.forEach(function(t) {
            var tVal = row.targetVals[t.id];
            var diff = row.diffs[t.id];
            allCells['target_val_' + t.id] = '<td class="compare-cell-a">' + formatCompareCell(tVal, column) + '</td>';
            if (diff !== null && diff !== undefined) {
                allCells['target_diff_' + t.id] = '<td class="compare-cell-diff ' + getDiffClass(diff) + '">' + formatCompareValue(diff, column, true) + '</td>';
            } else {
                allCells['target_diff_' + t.id] = '<td class="compare-cell-diff compare-no-data">-</td>';
            }
            if (showTags) {
                allCells['target_tag_' + t.id] = '<td class="text-center">' + renderHighSettingTagHtml(row.targetTags[t.id] || []) + '</td>';
            }
        });

        var visibleCells = visibleColDefs.map(function(c) { return allCells[c.key] || ''; });
        return '<tr>' + visibleCells.join('') + '</tr>';
    }).join('');

    updateTagCountDisplay(rows, showTags);
}

// ========== タグ選択セレクター ==========

function updateAnalysisTagSelect() {
    var select = document.getElementById('analysisTagSelect');
    if (!select) return;

    var tagDefs = getActiveTagDefs();
    var currentVal = selectedAnalysisTagId;

    var html = '';
    if (tagDefs.length === 0) {
        html = '<option value="">タグなし</option>';
    } else {
        html = tagDefs.map(function(def) {
            var sel = def.id === currentVal ? ' selected' : '';
            return '<option value="' + def.id + '"' + sel + '>' + def.icon + ' ' + escapeHtml(def.name) + '</option>';
        }).join('');
    }

    select.innerHTML = html;

    if (tagDefs.length > 0) {
        var validIds = tagDefs.map(function(d) { return d.id; });
        if (validIds.indexOf(currentVal) === -1) {
            selectedAnalysisTagId = tagDefs[0].id;
            select.value = selectedAnalysisTagId;
        }
    } else {
        selectedAnalysisTagId = '';
    }
}

// ========== タグ分析パネル ==========

function renderCompareAnalysis(rows) {
    var container = document.getElementById('compareAnalysisContainer');
    if (!container) return;

    var summaryEl = document.getElementById('analysisSummary');
    var tablesEl = document.getElementById('analysisTables');

    if (!hasActiveTagConditions()) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (tablesEl) tablesEl.innerHTML = '<div class="analysis-empty">タグの条件を設定すると分析が表示されます</div>';
        return;
    }

    var tagDefs = getActiveTagDefs();
    var selectedDef = tagDefs.find(function(d) { return d.id === selectedAnalysisTagId; });

    if (!selectedDef && tagDefs.length > 0) {
        selectedDef = tagDefs[0];
        selectedAnalysisTagId = selectedDef.id;
    }

    if (!selectedDef) {
        if (summaryEl) summaryEl.innerHTML = '';
        if (tablesEl) tablesEl.innerHTML = '<div class="analysis-empty">タグを選択してください</div>';
        return;
    }

    renderAnalysisSummary(rows, selectedDef, tagDefs);

    var viewMode = document.getElementById('analysisViewMode').value;
    if (viewMode === 'overall') {
        renderOverallAnalysis(rows, selectedDef, tagDefs);
    } else {
        renderMachineAnalysis(rows, selectedDef, tagDefs);
    }
}

// ========== 分析サマリーカード ==========

function renderAnalysisSummary(rows, selectedDef, allTagDefs) {
    var container = document.getElementById('analysisSummary');
    if (!container) return;

    var targets = compareDataCache.targets;
    var totalUnits = rows.length;
    var html = '';

    html += '<div class="analysis-card card-total">';
    html += '  <div class="analysis-card-label">設置台数</div>';
    html += '  <div class="analysis-card-value">' + totalUnits + '</div>';
    html += '</div>';

    var tagBaseCount = rows.filter(function(r) { return rowHasTag(r.tagsBase, selectedDef.id); }).length;
    var tagBaseRate = totalUnits > 0 ? (tagBaseCount / totalUnits * 100) : 0;

    html += '<div class="analysis-card" style="border-top: 3px solid ' + selectedDef.color + ';">';
    html += '  <div class="analysis-card-label">' + selectedDef.icon + ' ' + escapeHtml(selectedDef.name) + ' 基準日率</div>';
    html += '  <div class="analysis-card-value" style="color: ' + selectedDef.color + ';">' + tagBaseRate.toFixed(1) + '%</div>';
    html += '  <div class="analysis-card-sub">' + tagBaseCount + ' / ' + totalUnits + '台</div>';
    html += '</div>';

    targets.forEach(function(t) {
        var cnt = rows.filter(function(r) { return rowHasTag(r.targetTags[t.id] || [], selectedDef.id); }).length;
        var rate = totalUnits > 0 ? (cnt / totalUnits * 100) : 0;
        html += '<div class="analysis-card" style="border-top: 3px solid ' + selectedDef.color + '40;">';
        html += '  <div class="analysis-card-label">' + selectedDef.icon + ' ' + t.label + '</div>';
        html += '  <div class="analysis-card-value" style="color: ' + selectedDef.color + ';">' + rate.toFixed(1) + '%</div>';
        html += '  <div class="analysis-card-sub">' + cnt + ' / ' + totalUnits + '台</div>';
        html += '</div>';
    });

    if (targets.length > 0) {
        var firstTarget = targets[0];
        var prevMinusRows = rows.filter(function(r) {
            var tRow = r.targetRows[firstTarget.id];
            if (!tRow) return false;
            return (parseInt(String(tRow['差枚']).replace(/,/g, '')) || 0) < 0;
        });
        var recoveryCount = prevMinusRows.filter(function(r) { return rowHasTag(r.tagsBase, selectedDef.id); }).length;
        var recoveryRate = prevMinusRows.length > 0 ? (recoveryCount / prevMinusRows.length * 100) : 0;

        html += '<div class="analysis-card card-recovery">';
        html += '  <div class="analysis-card-label">' + firstTarget.label + 'ﾏｲﾅｽ→基準日タグ</div>';
        html += '  <div class="analysis-card-value">' + recoveryRate.toFixed(1) + '%</div>';
        html += '  <div class="analysis-card-sub">' + prevMinusRows.length + '台中 ' + recoveryCount + '台</div>';
        html += '</div>';
    }

    allTagDefs.forEach(function(def) {
        if (def.id === selectedDef.id) return;
        var bCount = rows.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
        var bRate = totalUnits > 0 ? (bCount / totalUnits * 100) : 0;
        html += '<div class="analysis-card" style="border-top: 3px solid ' + def.color + '40;">';
        html += '  <div class="analysis-card-label">' + def.icon + ' ' + escapeHtml(def.name) + ' 基準日</div>';
        html += '  <div class="analysis-card-value" style="color: ' + def.color + ';">' + bRate.toFixed(1) + '%</div>';
        html += '  <div class="analysis-card-sub">' + bCount + '台</div>';
        html += '</div>';
    });

    container.innerHTML = html;
}

// ========== 全体分析テーブル ==========

function renderOverallAnalysis(rows, selectedDef, allTagDefs) {
    var container = document.getElementById('analysisTables');
    if (!container) return;

    var html = '';
    html += buildPositionAnalysisTableForTag(rows, selectedDef);
    html += buildSuffixAnalysisTableForTag(rows, selectedDef);
    html += buildPrevStateAnalysisTableForTag(rows, selectedDef, allTagDefs);
    html += buildPrevGameRangeAnalysisTableForTag(rows, selectedDef, allTagDefs);
    html += buildPrevSaRangeAnalysisTableForTag(rows, selectedDef, allTagDefs);
    container.innerHTML = html;
}

function buildPositionAnalysisTableForTag(rows, def) {
    var positionTags = (typeof getAllPositionTags === 'function') ? getAllPositionTags() : [];
    if (positionTags.length === 0) return '';
    var targets = compareDataCache.targets;

    var tableRows = positionTags.map(function(tag) {
        var matching = rows.filter(function(r) {
            if (!r.unit) return false;
            var tags = (typeof getPositionTags === 'function') ? getPositionTags(r.unit) : [];
            return tags.indexOf(tag.value) !== -1;
        });
        var total = matching.length;

        var baseCount = matching.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
        var targetCounts = targets.map(function(t) {
            return matching.filter(function(r) { return rowHasTag(r.targetTags[t.id] || [], def.id); }).length;
        });

        return {
            label: tag.icon + ' ' + tag.label, total: total,
            baseCount: baseCount, baseRate: total > 0 ? (baseCount / total * 100) : 0,
            targetCounts: targetCounts,
            targetRates: targetCounts.map(function(c) { return total > 0 ? (c / total * 100) : 0; })
        };
    }).filter(function(r) { return r.total > 0; });

    if (tableRows.length === 0) return '';

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">📍</span>位置別タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>位置</th><th>台数</th>';
    html += '<th class="header-b">' + (compareDataCache.baseShortLabel || '基準') + '</th><th class="header-b">率</th>';
    targets.forEach(function(t) {
        html += '<th class="header-a">' + (t.shortLabel || '比較') + '</th><th class="header-a">率</th>';
    });
    html += '</tr></thead><tbody>';

    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td>';
        html += '<td>' + r.baseCount + '</td><td>' + buildPctBarCell(r.baseRate) + '</td>';
        r.targetCounts.forEach(function(c, i) {
            html += '<td>' + c + '</td><td>' + buildPctBarCell(r.targetRates[i]) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

function buildSuffixAnalysisTableForTag(rows, def) {
    var targets = compareDataCache.targets;
    var suffixes = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var tableRows = suffixes.map(function(s) {
        var matching = rows.filter(function(r) {
            var num = (r.unit || '').replace(/\D/g, '');
            return num.length > 0 && num.slice(-1) === s;
        });
        var total = matching.length;
        var baseCount = matching.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
        var targetCounts = targets.map(function(t) {
            return matching.filter(function(r) { return rowHasTag(r.targetTags[t.id] || [], def.id); }).length;
        });
        return {
            label: '末尾 ' + s, total: total,
            baseCount: baseCount, baseRate: total > 0 ? (baseCount / total * 100) : 0,
            targetCounts: targetCounts,
            targetRates: targetCounts.map(function(c) { return total > 0 ? (c / total * 100) : 0; })
        };
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">🔢</span>台番号末尾別タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>末尾</th><th>台数</th>';
    html += '<th class="header-b">' + (compareDataCache.baseShortLabel || '基準') + '</th><th class="header-b">率</th>';
    targets.forEach(function(t) {
        html += '<th class="header-a">' + (t.shortLabel || '比較') + '</th><th class="header-a">率</th>';
    });
    html += '</tr></thead><tbody>';

    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td>';
        html += '<td>' + r.baseCount + '</td><td>' + buildPctBarCell(r.baseRate) + '</td>';
        r.targetCounts.forEach(function(c, i) {
            html += '<td>' + c + '</td><td>' + buildPctBarCell(r.targetRates[i]) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

function buildPrevStateAnalysisTableForTag(rows, selectedDef, allTagDefs) {
    var targets = compareDataCache.targets;

    var categories = [];

    targets.forEach(function(t, tIdx) {
        allTagDefs.forEach(function(def) {
            categories.push({
                label: t.shortLabel + ' ' + def.icon + ' ' + def.name,
                color: def.color,
                filter: function(r) { return rowHasTag(r.targetTags[t.id] || [], def.id); }
            });
        });

        categories.push({
            label: t.shortLabel + ' タグなし＆プラス',
            color: null,
            filter: function(r) {
                if (rowHasAnyTag(r.targetTags[t.id] || [])) return false;
                var tRow = r.targetRows[t.id];
                if (!tRow) return false;
                return (parseInt(String(tRow['差枚']).replace(/,/g, '')) || 0) > 0;
            }
        });

        categories.push({
            label: t.shortLabel + ' マイナス',
            color: null,
            filter: function(r) {
                var tRow = r.targetRows[t.id];
                if (!tRow) return false;
                return (parseInt(String(tRow['差枚']).replace(/,/g, '')) || 0) < 0;
            }
        });

        categories.push({
            label: t.shortLabel + ' ±0',
            color: null,
            filter: function(r) {
                var tRow = r.targetRows[t.id];
                if (!tRow) return false;
                return (parseInt(String(tRow['差枚']).replace(/,/g, '')) || 0) === 0;
            }
        });

        categories.push({
            label: t.shortLabel + ' データなし',
            color: null,
            filter: function(r) { return !r.targetRows[t.id]; }
        });

        if (tIdx < targets.length - 1) {
            categories.push({ separator: true });
        }
    });

    var colCount = 2 + allTagDefs.length * 2;

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">📊</span>比較日状態別 → 基準日タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';

    html += '<thead><tr><th>比較日の状態</th><th>該当台数</th>';
    allTagDefs.forEach(function(def) {
        html += '<th style="color:' + def.color + ';">' + def.icon + ' ' + escapeHtml(def.name) + '</th>';
        html += '<th style="color:' + def.color + ';">率</th>';
    });
    html += '</tr></thead><tbody>';

    categories.forEach(function(cat) {
        if (cat.separator) {
            html += '<tr><td colspan="' + colCount + '" style="background:var(--bg-card);height:4px;padding:0;"></td></tr>';
            return;
        }

        var matching = rows.filter(cat.filter);
        var total = matching.length;

        html += '<tr>';
        if (cat.color) {
            html += '<td style="border-left: 3px solid ' + cat.color + ';">' + cat.label + '</td>';
        } else {
            html += '<td>' + cat.label + '</td>';
        }
        html += '<td>' + total + '</td>';

        allTagDefs.forEach(function(def) {
            var cnt = matching.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
            var rate = total > 0 ? (cnt / total * 100) : 0;
            html += '<td>' + cnt + '</td>';
            html += '<td>' + buildPctBarCell(rate) + '</td>';
        });

        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
}

// ========== 分析コピー・ダウンロード ==========

function extractAnalysisTablesData() {
    var results = [];

    // サマリーカード
    var summaryEl = document.getElementById('analysisSummary');
    if (summaryEl) {
        var cards = summaryEl.querySelectorAll('.analysis-card');
        if (cards.length > 0) {
            var summaryHeaders = [];
            var summaryValues = [];
            var summarySubs = [];
            cards.forEach(function(card) {
                var label = card.querySelector('.analysis-card-label');
                var value = card.querySelector('.analysis-card-value');
                var sub = card.querySelector('.analysis-card-sub');
                summaryHeaders.push(label ? label.textContent.trim() : '');
                summaryValues.push(value ? value.textContent.trim() : '');
                summarySubs.push(sub ? sub.textContent.trim() : '');
            });
            results.push({
                title: 'タグ分析サマリー',
                headers: summaryHeaders,
                rows: [summaryValues, summarySubs]
            });
        }
    }

    // 各分析テーブル
    var tablesEl = document.getElementById('analysisTables');
    if (tablesEl) {
        var blocks = tablesEl.querySelectorAll('.analysis-table-block');
        blocks.forEach(function(block) {
            var titleEl = block.querySelector('.analysis-table-title');
            var title = titleEl ? titleEl.textContent.trim() : '分析テーブル';

            var table = block.querySelector('.analysis-table');
            if (!table) return;

            var headers = [];
            var headerRows = table.querySelectorAll('thead tr');
            if (headerRows.length === 1) {
                headerRows[0].querySelectorAll('th').forEach(function(th) {
                    headers.push(th.textContent.trim());
                });
            } else if (headerRows.length >= 2) {
                // 2段ヘッダーの場合: 1段目のグループ名 + 2段目の詳細をマージ
                var group1 = [];
                headerRows[0].querySelectorAll('th').forEach(function(th) {
                    var colspan = parseInt(th.getAttribute('colspan')) || 1;
                    var rowspan = parseInt(th.getAttribute('rowspan')) || 1;
                    var text = th.textContent.trim();
                    if (rowspan >= 2) {
                        group1.push({ text: text, span: 0, isRowspan: true });
                    } else {
                        group1.push({ text: text, span: colspan, isRowspan: false });
                    }
                });

                var sub = [];
                headerRows[1].querySelectorAll('th').forEach(function(th) {
                    sub.push(th.textContent.trim());
                });

                var subIdx = 0;
                group1.forEach(function(g) {
                    if (g.isRowspan) {
                        headers.push(g.text);
                    } else {
                        for (var i = 0; i < g.span; i++) {
                            var subText = subIdx < sub.length ? sub[subIdx] : '';
                            headers.push(g.text + ' ' + subText);
                            subIdx++;
                        }
                    }
                });
            }

            var rows = [];
            table.querySelectorAll('tbody tr').forEach(function(tr) {
                // セパレータ行をスキップ
                var cells = tr.querySelectorAll('td');
                if (cells.length <= 1) return;

                var rowData = [];
                cells.forEach(function(td) {
                    var text = td.textContent.trim();
                    // パーセント表示からテキスト部分だけ取得
                    var pctText = td.querySelector('.pct-text');
                    if (pctText) {
                        text = pctText.textContent.trim();
                    }
                    rowData.push(text);
                });
                rows.push(rowData);
            });

            if (headers.length > 0 || rows.length > 0) {
                results.push({ title: title, headers: headers, rows: rows });
            }
        });
    }

    return results;
}

function analysisDataToText(tables) {
    var lines = [];

    tables.forEach(function(table, idx) {
        if (idx > 0) lines.push('');
        lines.push('■ ' + table.title);

        if (table.headers.length > 0) {
            lines.push(table.headers.join('\t'));
        }

        table.rows.forEach(function(row) {
            lines.push(row.join('\t'));
        });
    });

    return lines.join('\n');
}

function analysisDataToCSV(tables) {
    var lines = [];

    tables.forEach(function(table, idx) {
        if (idx > 0) lines.push('');
        lines.push(csvEscapeRow([table.title]));

        if (table.headers.length > 0) {
            lines.push(csvEscapeRow(table.headers));
        }

        table.rows.forEach(function(row) {
            lines.push(csvEscapeRow(row));
        });
    });

    return lines.join('\n');
}

function csvEscapeRow(arr) {
    return arr.map(function(val) {
        var str = String(val);
        if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    }).join(',');
}

async function copyAnalysisTables() {
    var tables = extractAnalysisTablesData();
    if (tables.length === 0) {
        showCopyToast('コピーする分析データがありません', true);
        return;
    }

    var text = analysisDataToText(tables);
    var btn = document.getElementById('copyAnalysisBtn');

    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.classList.add('copied');
            setTimeout(function() { btn.classList.remove('copied'); }, 2000);
        }
        showCopyToast('分析データをコピーしました');
    } catch (e) {
        showCopyToast('コピーに失敗しました', true);
    }
}

function downloadAnalysisCSV() {
    var tables = extractAnalysisTablesData();
    if (tables.length === 0) {
        showCopyToast('ダウンロードする分析データがありません', true);
        return;
    }

    var csv = analysisDataToCSV(tables);
    var bom = '\uFEFF';
    var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;

    var baseFile = compareDataCache.baseFile || 'base';
    var datePart = baseFile.replace('data/', '').replace(/\.(json|csv)/, '');
    a.download = 'analysis_' + datePart + '.csv';

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showCopyToast('分析CSVをダウンロードしました');
}

function buildPrevGameRangeAnalysisTableForTag(rows, selectedDef, allTagDefs) {
    var targets = compareDataCache.targets;
    var ranges = [
        { label: '0G（未稼働）', min: 0, max: 0 },
        { label: '1〜2000G', min: 1, max: 2000 },
        { label: '2001〜4000G', min: 2001, max: 4000 },
        { label: '4001〜6000G', min: 4001, max: 6000 },
        { label: '6001〜8000G', min: 6001, max: 8000 },
        { label: '8001G以上', min: 8001, max: Infinity }
    ];

    var html = '';

    targets.forEach(function(t) {
        html += '<div class="analysis-table-block">';
        html += '<div class="analysis-table-title"><span class="title-icon">🎰</span>' + t.label + ' G数帯別 → 基準日タグ率</div>';
        html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
        html += '<thead><tr><th>G数帯</th><th>該当台数</th>';
        allTagDefs.forEach(function(def) {
            html += '<th style="color:' + def.color + ';">' + def.icon + ' ' + escapeHtml(def.name) + '</th>';
            html += '<th style="color:' + def.color + ';">率</th>';
        });
        html += '</tr></thead><tbody>';

        ranges.forEach(function(range) {
            var matching = rows.filter(function(r) {
                var tRow = r.targetRows[t.id];
                if (!tRow) return false;
                var g = parseInt(String(tRow['G数']).replace(/,/g, '')) || 0;
                return g >= range.min && g <= range.max;
            });
            var total = matching.length;

            html += '<tr>';
            html += '<td>' + range.label + '</td>';
            html += '<td>' + total + '</td>';

            allTagDefs.forEach(function(def) {
                var cnt = matching.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
                var rate = total > 0 ? (cnt / total * 100) : 0;
                html += '<td>' + cnt + '</td>';
                html += '<td>' + buildPctBarCell(rate) + '</td>';
            });

            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
    });

    return html;
}

function buildPrevSaRangeAnalysisTableForTag(rows, selectedDef, allTagDefs) {
    var targets = compareDataCache.targets;
    var ranges = [
        { label: '-3000枚以下', min: -Infinity, max: -3001 },
        { label: '-3000〜-1001枚', min: -3000, max: -1001 },
        { label: '-1000〜-1枚', min: -1000, max: -1 },
        { label: '±0枚', min: 0, max: 0 },
        { label: '+1〜+1000枚', min: 1, max: 1000 },
        { label: '+1001〜+3000枚', min: 1001, max: 3000 },
        { label: '+3001枚以上', min: 3001, max: Infinity }
    ];

    var html = '';

    targets.forEach(function(t) {
        html += '<div class="analysis-table-block">';
        html += '<div class="analysis-table-title"><span class="title-icon">💰</span>' + t.label + ' 差枚帯別 → 基準日タグ率</div>';
        html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
        html += '<thead><tr><th>差枚帯</th><th>該当台数</th>';
        allTagDefs.forEach(function(def) {
            html += '<th style="color:' + def.color + ';">' + def.icon + ' ' + escapeHtml(def.name) + '</th>';
            html += '<th style="color:' + def.color + ';">率</th>';
        });
        html += '</tr></thead><tbody>';

        ranges.forEach(function(range) {
            var matching = rows.filter(function(r) {
                var tRow = r.targetRows[t.id];
                if (!tRow) return false;
                var sa = parseInt(String(tRow['差枚']).replace(/,/g, '')) || 0;
                return sa >= range.min && sa <= range.max;
            });
            var total = matching.length;

            html += '<tr>';
            html += '<td>' + range.label + '</td>';
            html += '<td>' + total + '</td>';

            allTagDefs.forEach(function(def) {
                var cnt = matching.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
                var rate = total > 0 ? (cnt / total * 100) : 0;
                html += '<td>' + cnt + '</td>';
                html += '<td>' + buildPctBarCell(rate) + '</td>';
            });

            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
    });

    return html;
}

// ========== 機種別分析 ==========

function renderMachineAnalysis(rows, selectedDef, allTagDefs) {
    var container = document.getElementById('analysisTables');
    if (!container) return;

    var targets = compareDataCache.targets;
    var baseShort = compareDataCache.baseShortLabel || '基準';

    var machineMap = {};
    rows.forEach(function(r) {
        var name = r.machineName || '不明';
        if (!machineMap[name]) machineMap[name] = [];
        machineMap[name].push(r);
    });

    var machineNames = Object.keys(machineMap).sort(function(a, b) {
        return machineMap[b].length - machineMap[a].length;
    });

    // 全日付ラベルの配列: [基準日, 比較日1, 比較日2, ...]
    var allDays = [{ key: 'base', label: baseShort }];
    targets.forEach(function(t) {
        allDays.push({ key: 'target_' + t.id, label: t.shortLabel || '比較', targetId: t.id });
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">🎰</span>機種別タグ分析</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table analysis-machine-table">';

    // ---- ヘッダー1段目: グループヘッダー ----
    html += '<thead>';
    html += '<tr>';
    html += '<th rowspan="2">機種名</th>';
    html += '<th rowspan="2">台数</th>';
    allTagDefs.forEach(function(def) {
        var colSpan = allDays.length * 2;
        html += '<th colspan="' + colSpan + '" style="color:' + def.color + '; border-bottom: 2px solid ' + def.color + ';">' + def.icon + ' ' + escapeHtml(def.name) + '</th>';
    });
    html += '</tr>';

    // ---- ヘッダー2段目: 日付×(台数・率) ----
    html += '<tr>';
    allTagDefs.forEach(function(def) {
        allDays.forEach(function(day) {
            html += '<th style="color:' + def.color + '40;">' + day.label + '</th>';
            html += '<th style="color:' + def.color + '40;">率</th>';
        });
    });
    html += '</tr>';
    html += '</thead><tbody>';

    machineNames.forEach(function(name) {
        var mRows = machineMap[name];
        var total = mRows.length;

        html += '<tr>';
        html += '<td>' + escapeHtml(name) + '</td>';
        html += '<td>' + total + '</td>';

        allTagDefs.forEach(function(def) {
            allDays.forEach(function(day) {
                var cnt, rate;
                if (day.key === 'base') {
                    cnt = mRows.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
                } else {
                    var tid = day.targetId;
                    cnt = mRows.filter(function(r) { return rowHasTag(r.targetTags[tid] || [], def.id); }).length;
                }
                rate = total > 0 ? (cnt / total * 100) : 0;
                html += '<td>' + cnt + '</td>';
                html += '<td>' + buildPctBarCell(rate) + '</td>';
            });
        });

        html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    container.innerHTML = html;
}

// ========== パーセントバーセル ==========

function buildPctBarCell(rate, denominator) {
    if (denominator !== undefined && denominator === 0) {
        return '<span class="text-muted">-</span>';
    }
    var barClass = 'bar-low';
    var textClass = 'low';
    if (rate >= 30) { barClass = 'bar-high'; textClass = 'high'; }
    else if (rate >= 15) { barClass = 'bar-mid'; textClass = 'mid'; }
    var barWidth = Math.min(rate, 100);
    return '<div class="pct-bar-cell"><div class="pct-bar ' + barClass + '" style="width: ' + barWidth + '%;"></div><span class="pct-text ' + textClass + '">' + rate.toFixed(1) + '%</span></div>';
}

// ========== フォーマットヘルパー ==========

function formatCompareValue(val, column, showSign) {
    if (val === null || val === undefined || isNaN(val)) return '-';
    if (column === '機械割') return (showSign && val > 0 ? '+' : '') + val.toFixed(2) + '%';
    var rounded = Math.round(val);
    return (showSign ? (rounded >= 0 ? '+' : '') : '') + rounded.toLocaleString();
}

function formatCompareCell(val, column) {
    if (val === null || val === undefined) return '<span class="compare-no-data">-</span>';
    if (column === '機械割') return '<span class="' + (val >= 100 ? 'plus' : 'minus') + '">' + val.toFixed(2) + '%</span>';
    if (column === '差枚') {
        var cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
        return '<span class="' + cls + '">' + (val >= 0 ? '+' : '') + Math.round(val).toLocaleString() + '</span>';
    }
    return Math.round(val).toLocaleString();
}

function getDiffClass(diff) {
    if (diff === null || diff === undefined || isNaN(diff)) return '';
    if (diff > 0) return 'compare-diff-positive';
    if (diff < 0) return 'compare-diff-negative';
    return 'compare-diff-zero';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== タグ表示ヘルパー ==========

function renderHighSettingTagHtml(matchedTags) {
    if (!matchedTags || matchedTags.length === 0) {
        return '<span class="text-muted">-</span>';
    }
    return matchedTags.map(function(tagId) {
        var def = TagEngine.get(tagId);
        if (!def) return '';
        return '<span class="custom-tag-badge" style="background: ' + def.color + '20; border-color: ' + def.color + '; color: ' + def.color + ';">' + def.icon + ' ' + escapeHtml(def.name) + '</span>';
    }).join(' ');
}

function updateTagCountDisplay(rows, showTags) {
    var display = document.getElementById('tagCountDisplay');
    if (!display) return;
    if (!showTags || !TagEngine.hasAnyActiveConditions()) { display.textContent = ''; return; }

    var targets = compareDataCache.targets;
    var tagDefs = getActiveTagDefs();

    var parts = tagDefs.map(function(def) {
        var baseCount = rows.filter(function(r) { return rowHasTag(r.tagsBase, def.id); }).length;
        var targetParts = targets.map(function(t) {
            var cnt = rows.filter(function(r) { return rowHasTag(r.targetTags[t.id] || [], def.id); }).length;
            return cnt;
        });
        return def.icon + def.name + ' 基準:' + baseCount + ' 比較:' + targetParts.join('/');
    });

    display.textContent = parts.join(' / ');
}

// ========== コピー・ダウンロード ==========

function getCompareTableData() {
    var table = document.getElementById('compare-table');
    if (!table) return { headers: [], rows: [] };
    var headers = [];
    table.querySelectorAll('thead th').forEach(function(cell) { headers.push(cell.textContent.trim()); });
    var rows = [];
    table.querySelectorAll('tbody tr').forEach(function(row) {
        var rowData = [];
        row.querySelectorAll('td').forEach(function(cell) {
            var val = cell.textContent.trim();
            var cleaned = val.replace(/[+,]/g, '').replace('%', '');
            if (!isNaN(parseFloat(cleaned)) && cleaned !== '' && cleaned !== '-') {
                rowData.push(val.replace(/,/g, ''));
            } else {
                rowData.push(val);
            }
        });
        if (rowData.length > 0) rows.push(rowData);
    });
    return { headers: headers, rows: rows };
}

async function copyCompareTable() {
    var data = getCompareTableData();
    var btn = document.getElementById('copyCompareTableBtn');
    await copyToClipboard(data, btn);
}

function downloadCompareCSV() {
    var data = getCompareTableData();
    if (data.rows.length === 0) { showCopyToast('ダウンロードするデータがありません', true); return; }
    var baseFile = compareDataCache.baseFile || 'base';
    var datePart = baseFile.replace('data/', '').replace(/\.(json|csv)/, '');
    downloadAsCSV(data, 'compare_' + datePart + '.csv');
}

// ========== イベントリスナー ==========

function setupCompareEventListeners() {
    var el;

    el = document.getElementById('compareDateBase');
    if (el) el.addEventListener('change', updateCompareDateInfo);

    el = document.getElementById('addCompareDate');
    if (el) el.addEventListener('click', function() { addCompareTargetDate(); });

    el = document.getElementById('loadCompare');
    if (el) el.addEventListener('click', loadCompareData);

    ['compareDataColumn', 'compareSortBy'].forEach(function(id) {
        el = document.getElementById(id);
        if (el) el.addEventListener('change', function() { if (hasCompareData()) renderCompare(); });
    });

    ['compareDiffFilterType', 'compareShowFilter', 'compareUnitSuffixFilter'].forEach(function(id) {
        el = document.getElementById(id);
        if (el) el.addEventListener('change', function() { if (hasCompareData()) renderCompare(); });
    });

    el = document.getElementById('compareDiffFilterValue');
    if (el) el.addEventListener('input', function() { if (hasCompareData()) renderCompare(); });

    el = document.getElementById('resetCompareFilter');
    if (el) el.addEventListener('click', function() {
        ['compareDiffFilterType', 'compareShowFilter', 'compareUnitSuffixFilter'].forEach(function(id) {
            var e = document.getElementById(id); if (e) e.value = '';
        });
        var diffVal = document.getElementById('compareDiffFilterValue');
        if (diffVal) diffVal.value = '';
        if (compareMachineFilterSelect) compareMachineFilterSelect.reset();
        if (hasCompareData()) renderCompare();
    });

    // 列選択ドロップダウン
    el = document.getElementById('compareColSelectBtn');
    if (el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            var dropdown = document.getElementById('compareColDropdown');
            var btn = this;
            if (dropdown) {
                var isOpen = dropdown.classList.contains('open');
                dropdown.classList.toggle('open');
                btn.classList.toggle('active', !isOpen);
            }
        });
    }

    el = document.getElementById('compareColDropdown');
    if (el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }

    document.addEventListener('click', function() {
        var dropdown = document.getElementById('compareColDropdown');
        var btn = document.getElementById('compareColSelectBtn');
        if (dropdown && dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
            if (btn) btn.classList.remove('active');
        }
    });

    el = document.getElementById('compareSelectAllCols');
    if (el) el.addEventListener('click', function() {
        var checkboxes = document.querySelectorAll('#compareColumnCheckboxes input[type="checkbox"]');
        checkboxes.forEach(function(cb) {
            cb.checked = true;
            compareVisibleColumns[cb.getAttribute('data-col-key')] = true;
        });
        updateColSelectBtnLabel();
        if (hasCompareData()) renderCompareTable(buildCompareRows());
    });

    el = document.getElementById('compareDeselectAllCols');
    if (el) el.addEventListener('click', function() {
        var checkboxes = document.querySelectorAll('#compareColumnCheckboxes input[type="checkbox"]');
        checkboxes.forEach(function(cb) {
            cb.checked = false;
            compareVisibleColumns[cb.getAttribute('data-col-key')] = false;
        });
        updateColSelectBtnLabel();
        if (hasCompareData()) renderCompareTable(buildCompareRows());
    });

    // タグ分析トグル
    el = document.getElementById('compareAnalysisToggle');
    if (el) {
        el.addEventListener('click', function() {
            var header = this;
            var content = document.getElementById('compareAnalysisContent');
            if (header && content) {
                header.classList.toggle('open');
                content.classList.toggle('open');
            }
        });
    }

    el = document.getElementById('analysisTagSelect');
    if (el) el.addEventListener('change', function() {
        selectedAnalysisTagId = this.value;
        if (hasCompareData()) {
            var rows = buildCompareRows();
            renderCompareAnalysis(rows);
        }
    });

    el = document.getElementById('analysisViewMode');
    if (el) el.addEventListener('change', function() {
        if (hasCompareData()) {
            var rows = buildCompareRows();
            renderCompareAnalysis(rows);
        }
    });

    // 分析コピー・ダウンロード
    el = document.getElementById('copyAnalysisBtn');
    if (el) el.addEventListener('click', copyAnalysisTables);
    el = document.getElementById('downloadAnalysisCsvBtn');
    if (el) el.addEventListener('click', downloadAnalysisCSV);

    el = document.getElementById('copyCompareTableBtn');
    if (el) el.addEventListener('click', copyCompareTable);
    el = document.getElementById('downloadCompareCsvBtn');
    if (el) el.addEventListener('click', downloadCompareCSV);
}
