// ===================
// 日別比較タブ
// ===================

var compareMachineFilterSelect = null;
var compareDataCache = { a: null, b: null };

// ========== 初期化 ==========

function initCompareTab() {
    populateCompareDateSelects();
    updateCompareDateInfo();

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
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    if (!selectA || !selectB) return;

    var sortedFiles = sortFilesByDate(CSV_FILES, true);

    var optionsHtml = sortedFiles.map(function(file) {
        return createDateSelectOption(file, false);
    }).join('');

    selectA.innerHTML = optionsHtml;
    selectB.innerHTML = optionsHtml;

    if (sortedFiles.length >= 2) {
        selectA.selectedIndex = 1;
        selectB.selectedIndex = 0;
    }
}

function updateCompareDateInfo() {
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    var infoA = document.getElementById('compareDateAInfo');
    var infoB = document.getElementById('compareDateBInfo');

    if (selectA && selectA.value && infoA) {
        infoA.textContent = getDayOfWeekName(getDayOfWeek(selectA.value));
    }
    if (selectB && selectB.value && infoB) {
        infoB.textContent = getDayOfWeekName(getDayOfWeek(selectB.value));
    }
}

// ========== データ読み込み ==========

async function loadCompareData() {
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    if (!selectA || !selectB) return;

    var fileA = selectA.value;
    var fileB = selectB.value;

    if (!fileA || !fileB) {
        showCopyToast('日付を選択してください', true);
        return;
    }
    if (fileA === fileB) {
        showCopyToast('異なる日付を選択してください', true);
        return;
    }

    var dataA = await loadCSV(fileA);
    var dataB = await loadCSV(fileB);

    if (!dataA || !dataB) {
        showCopyToast('データの読み込みに失敗しました', true);
        return;
    }

    dataA = addMechanicalRateToData(dataA);
    dataB = addMechanicalRateToData(dataB);

    compareDataCache.a = dataA;
    compareDataCache.b = dataB;

    initCompareMachineFilter(dataA, dataB);
    renderCompare();
}

function initCompareMachineFilter(dataA, dataB) {
    var machineUnitsMap = {};

    dataA.forEach(function(row) {
        var name = row['機種名'] || '';
        var unit = row['台番号'] || '';
        if (name) {
            if (!machineUnitsMap[name]) machineUnitsMap[name] = {};
            if (unit) machineUnitsMap[name][unit] = true;
        }
    });
    dataB.forEach(function(row) {
        var name = row['機種名'] || '';
        var unit = row['台番号'] || '';
        if (name) {
            if (!machineUnitsMap[name]) machineUnitsMap[name] = {};
            if (unit) machineUnitsMap[name][unit] = true;
        }
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

// ========== 比較ロジック ==========

function hasCompareData() {
    return compareDataCache.a && compareDataCache.b;
}

function buildCompareRows() {
    if (!hasCompareData()) return [];

    var dataA = compareDataCache.a;
    var dataB = compareDataCache.b;
    var column = document.getElementById('compareDataColumn').value;

    var selectedMachines = compareMachineFilterSelect ? compareMachineFilterSelect.getSelectedValues() : [];
    var filteredA = selectedMachines.length > 0 ? dataA.filter(function(r) { return selectedMachines.includes(r['機種名']); }) : dataA.slice();
    var filteredB = selectedMachines.length > 0 ? dataB.filter(function(r) { return selectedMachines.includes(r['機種名']); }) : dataB.slice();

    var suffixFilter = document.getElementById('compareUnitSuffixFilter').value;
    if (suffixFilter !== '') {
        filteredA = filteredA.filter(function(r) {
            var num = (r['台番号'] || '').replace(/\D/g, '');
            return num.length > 0 && num.slice(-1) === suffixFilter;
        });
        filteredB = filteredB.filter(function(r) {
            var num = (r['台番号'] || '').replace(/\D/g, '');
            return num.length > 0 && num.slice(-1) === suffixFilter;
        });
    }

    var rows = buildUnitCompareRows(filteredA, filteredB, column);

    // 複数タグ判定
    if (TagEngine.hasAnyActiveConditions()) {
        rows.forEach(function(row) {
            row.tagsA = row.rowA ? TagEngine.evaluateAll(row.rowA) : [];
            row.tagsB = row.rowB ? TagEngine.evaluateAll(row.rowB) : [];
        });
    } else {
        rows.forEach(function(row) {
            row.tagsA = [];
            row.tagsB = [];
        });
    }

    // 差分フィルター
    var diffFilterType = document.getElementById('compareDiffFilterType').value;
    var diffFilterValue = document.getElementById('compareDiffFilterValue').value;
    if (diffFilterType && diffFilterValue !== '') {
        var val = parseFloat(diffFilterValue);
        rows = rows.filter(function(r) {
            if (r.diff === null) return false;
            if (diffFilterType === 'gte') return r.diff >= val;
            if (diffFilterType === 'lte') return r.diff <= val;
            return true;
        });
    }

    var showFilter = document.getElementById('compareShowFilter').value;
    if (showFilter === 'improved') {
        rows = rows.filter(function(r) { return r.diff !== null && r.diff > 0; });
    } else if (showFilter === 'declined') {
        rows = rows.filter(function(r) { return r.diff !== null && r.diff < 0; });
    } else if (showFilter === 'both') {
        rows = rows.filter(function(r) { return r.valA !== null && r.valB !== null; });
    }

    var showTaggedOnly = document.getElementById('showTaggedOnly');
    if (showTaggedOnly && showTaggedOnly.checked) {
        rows = rows.filter(function(r) { return r.tagsA.length > 0 || r.tagsB.length > 0; });
    }
    var showBothDays = document.getElementById('showTagBothDays');
    if (showBothDays && showBothDays.checked) {
        rows = rows.filter(function(r) { return r.tagsA.length > 0 && r.tagsB.length > 0; });
    }

    var sortBy = document.getElementById('compareSortBy').value;
    rows = sortCompareRows(rows, sortBy);

    return rows;
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

function buildUnitCompareRows(dataA, dataB, column) {
    var mapA = {};
    dataA.forEach(function(r) { if (r['台番号']) mapA[r['台番号']] = r; });
    var mapB = {};
    dataB.forEach(function(r) { if (r['台番号']) mapB[r['台番号']] = r; });

    var allUnits = {};
    Object.keys(mapA).forEach(function(u) { allUnits[u] = true; });
    Object.keys(mapB).forEach(function(u) { allUnits[u] = true; });

    var rows = [];
    Object.keys(allUnits).forEach(function(unit) {
        var rowA = mapA[unit] || null;
        var rowB = mapB[unit] || null;
        var valA = rowA ? getNumericValue(rowA, column) : null;
        var valB = rowB ? getNumericValue(rowB, column) : null;
        var diff = (valA !== null && valB !== null) ? valB - valA : null;

        rows.push({
            key: unit,
            machineName: (rowA && rowA['機種名']) || (rowB && rowB['機種名']) || '',
            unit: unit,
            valA: valA, valB: valB, diff: diff,
            rowA: rowA, rowB: rowB
        });
    });
    return rows;
}

function sortCompareRows(rows, sortBy) {
    var sortFn;
    switch (sortBy) {
        case 'diff_desc':  sortFn = function(a, b) { return (b.diff !== null ? b.diff : -Infinity) - (a.diff !== null ? a.diff : -Infinity); }; break;
        case 'diff_asc':   sortFn = function(a, b) { return (a.diff !== null ? a.diff : Infinity) - (b.diff !== null ? b.diff : Infinity); }; break;
        case 'a_desc':     sortFn = function(a, b) { return (b.valA !== null ? b.valA : -Infinity) - (a.valA !== null ? a.valA : -Infinity); }; break;
        case 'a_asc':      sortFn = function(a, b) { return (a.valA !== null ? a.valA : Infinity) - (b.valA !== null ? b.valA : Infinity); }; break;
        case 'b_desc':     sortFn = function(a, b) { return (b.valB !== null ? b.valB : -Infinity) - (a.valB !== null ? a.valB : -Infinity); }; break;
        case 'b_asc':      sortFn = function(a, b) { return (a.valB !== null ? a.valB : Infinity) - (b.valB !== null ? b.valB : Infinity); }; break;
        case 'unit_asc':   sortFn = function(a, b) { return (parseInt((a.unit || '').replace(/\D/g, '')) || 0) - (parseInt((b.unit || '').replace(/\D/g, '')) || 0); }; break;
        case 'unit_desc':  sortFn = function(a, b) { return (parseInt((b.unit || '').replace(/\D/g, '')) || 0) - (parseInt((a.unit || '').replace(/\D/g, '')) || 0); }; break;
        case 'machine_asc': sortFn = function(a, b) { return (a.machineName || '').localeCompare(b.machineName || '', 'ja'); }; break;
        default:           sortFn = function(a, b) { return (b.diff !== null ? b.diff : -Infinity) - (a.diff !== null ? a.diff : -Infinity); };
    }
    return rows.sort(sortFn);
}

// ========== メイン描画 ==========

function renderCompare() {
    if (!hasCompareData()) return;
    var rows = buildCompareRows();
    renderCompareSummary(rows);
    renderCompareTable(rows);
    renderCompareAnalysis(rows);
}

// ========== 比較サマリー ==========

function renderCompareSummary(rows) {
    var container = document.getElementById('compareSummary');
    if (!container) return;

    var column = document.getElementById('compareDataColumn').value;
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    var labelA = selectA && selectA.value ? formatDate(selectA.value) : '前回';
    var labelB = selectB && selectB.value ? formatDate(selectB.value) : '今回';

    var bothRows = rows.filter(function(r) { return r.valA !== null && r.valB !== null; });
    var improvedCount = bothRows.filter(function(r) { return r.diff > 0; }).length;
    var declinedCount = bothRows.filter(function(r) { return r.diff < 0; }).length;

    var avgA = 0, avgB = 0, avgDiff = 0;
    var cntA = rows.filter(function(r) { return r.valA !== null; });
    var cntB = rows.filter(function(r) { return r.valB !== null; });
    if (cntA.length > 0) avgA = cntA.reduce(function(s, r) { return s + r.valA; }, 0) / cntA.length;
    if (cntB.length > 0) avgB = cntB.reduce(function(s, r) { return s + r.valB; }, 0) / cntB.length;
    if (bothRows.length > 0) avgDiff = bothRows.reduce(function(s, r) { return s + r.diff; }, 0) / bothRows.length;

    container.innerHTML =
        '<div class="compare-summary-card card-a">' +
        '  <div class="compare-card-label">' + labelA + '（平均）</div>' +
        '  <div class="compare-card-value">' + formatCompareValue(avgA, column) + '</div>' +
        '  <div class="compare-card-sub">' + cntA.length + '台</div>' +
        '</div>' +
        '<div class="compare-summary-card card-b">' +
        '  <div class="compare-card-label">' + labelB + '（平均）</div>' +
        '  <div class="compare-card-value">' + formatCompareValue(avgB, column) + '</div>' +
        '  <div class="compare-card-sub">' + cntB.length + '台</div>' +
        '</div>' +
        '<div class="compare-summary-card card-diff">' +
        '  <div class="compare-card-label">平均差分</div>' +
        '  <div class="compare-card-value ' + getDiffClass(avgDiff) + '">' + formatCompareValue(avgDiff, column, true) + '</div>' +
        '  <div class="compare-card-sub">比較可能: ' + bothRows.length + '件</div>' +
        '</div>' +
        '<div class="compare-summary-card card-improved">' +
        '  <div class="compare-card-label">改善（今回 > 前回）</div>' +
        '  <div class="compare-card-value plus">' + improvedCount + '</div>' +
        '  <div class="compare-card-sub">' + (bothRows.length > 0 ? (improvedCount / bothRows.length * 100).toFixed(1) + '%' : '-') + '</div>' +
        '</div>' +
        '<div class="compare-summary-card card-declined">' +
        '  <div class="compare-card-label">悪化（今回 < 前回）</div>' +
        '  <div class="compare-card-value minus">' + declinedCount + '</div>' +
        '  <div class="compare-card-sub">' + (bothRows.length > 0 ? (declinedCount / bothRows.length * 100).toFixed(1) + '%' : '-') + '</div>' +
        '</div>';
}

// ========== 比較テーブル ==========

function renderCompareTable(rows) {
    var table = document.getElementById('compare-table');
    if (!table) return;

    var column = document.getElementById('compareDataColumn').value;
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    var labelA = selectA && selectA.value ? '前回 ' + formatDate(selectA.value) : '前回';
    var labelB = selectB && selectB.value ? '今回 ' + formatDate(selectB.value) : '今回';
    var showTags = TagEngine.hasAnyActiveConditions();

    table.className = 'mode-unit';
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');

    var headerCells = [];
    headerCells.push('<th>機種名</th>');
    headerCells.push('<th>台番号</th>');
    headerCells.push('<th class="header-a">' + labelA + '</th>');
    headerCells.push('<th class="header-b">' + labelB + '</th>');
    headerCells.push('<th class="header-diff">差分</th>');
    if (showTags) {
        headerCells.push('<th class="header-a">前回タグ</th>');
        headerCells.push('<th class="header-b">今回タグ</th>');
    }
    thead.innerHTML = '<tr>' + headerCells.join('') + '</tr>';

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="' + headerCells.length + '" class="text-center text-muted">データがありません。「比較実行」を押してください。</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function(row) {
        var cells = [];
        cells.push('<td>' + escapeHtml(row.machineName) + '</td>');
        cells.push('<td>' + escapeHtml(row.unit || '') + '</td>');
        cells.push('<td class="compare-cell-a">' + formatCompareCell(row.valA, column) + '</td>');
        cells.push('<td class="compare-cell-b">' + formatCompareCell(row.valB, column) + '</td>');
        if (row.diff !== null) {
            cells.push('<td class="compare-cell-diff ' + getDiffClass(row.diff) + '">' + formatCompareValue(row.diff, column, true) + '</td>');
        } else {
            cells.push('<td class="compare-cell-diff compare-no-data">-</td>');
        }
        if (showTags) {
            cells.push('<td class="text-center">' + renderHighSettingTagHtml(row.tagsA) + '</td>');
            cells.push('<td class="text-center">' + renderHighSettingTagHtml(row.tagsB) + '</td>');
        }
        return '<tr>' + cells.join('') + '</tr>';
    }).join('');

    updateTagCountDisplay(rows, showTags);
}

// ========== 高設定タグ分析パネル ==========

function renderCompareAnalysis(rows) {
    var container = document.getElementById('compareAnalysisContainer');
    if (!container) return;

    if (!hasActiveTagConditions()) {
        document.getElementById('analysisSummary').innerHTML = '';
        document.getElementById('analysisTables').innerHTML =
            '<div class="analysis-empty">高設定タグの条件を設定すると分析が表示されます</div>';
        return;
    }

    var viewMode = document.getElementById('analysisViewMode').value;
    renderAnalysisSummary(rows);

    if (viewMode === 'overall') {
        renderOverallAnalysis(rows);
    } else {
        renderMachineAnalysis(rows);
    }
}

// ========== 分析サマリーカード ==========

function renderAnalysisSummary(rows) {
    var container = document.getElementById('analysisSummary');
    if (!container) return;

    var totalUnits = rows.length;
    var tagBCount = rows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
    var tagACount = rows.filter(function(r) { return r.tagsA && r.tagsA.length > 0; }).length;
    var tagBRate = totalUnits > 0 ? (tagBCount / totalUnits * 100) : 0;

    var prevTagRows = rows.filter(function(r) { return r.tagsA && r.tagsA.length > 0; });
    var repeatCount = prevTagRows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
    var repeatRate = prevTagRows.length > 0 ? (repeatCount / prevTagRows.length * 100) : 0;

    var prevMinusRows = rows.filter(function(r) {
        return r.rowA && (parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0) < 0;
    });
    var recoveryCount = prevMinusRows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
    var recoveryRate = prevMinusRows.length > 0 ? (recoveryCount / prevMinusRows.length * 100) : 0;

    container.innerHTML =
        '<div class="analysis-card card-total">' +
        '  <div class="analysis-card-label">設置台数</div>' +
        '  <div class="analysis-card-value">' + totalUnits + '</div>' +
        '  <div class="analysis-card-sub">前回タグ: ' + tagACount + '台 / 今回タグ: ' + tagBCount + '台</div>' +
        '</div>' +
        '<div class="analysis-card card-tag-rate">' +
        '  <div class="analysis-card-label">今回タグ率</div>' +
        '  <div class="analysis-card-value">' + tagBRate.toFixed(1) + '%</div>' +
        '  <div class="analysis-card-sub">' + tagBCount + ' / ' + totalUnits + '台</div>' +
        '</div>' +
        '<div class="analysis-card card-recovery">' +
        '  <div class="analysis-card-label">前回マイナス→今回タグ</div>' +
        '  <div class="analysis-card-value">' + recoveryRate.toFixed(1) + '%</div>' +
        '  <div class="analysis-card-sub">前回マイナス' + prevMinusRows.length + '台中 ' + recoveryCount + '台</div>' +
        '</div>';
}

// ========== 全体分析テーブル ==========

function renderOverallAnalysis(rows) {
    var container = document.getElementById('analysisTables');
    if (!container) return;

    var html = '';
    html += buildPositionAnalysisTable(rows);
    html += buildSuffixAnalysisTable(rows);
    html += buildPrevStateAnalysisTable(rows);
    html += buildPrevGameRangeAnalysisTable(rows);
    html += buildPrevSaRangeAnalysisTable(rows);
    container.innerHTML = html;
}

function buildPositionAnalysisTable(rows) {
    var positionTags = (typeof getAllPositionTags === 'function') ? getAllPositionTags() : [];
    if (positionTags.length === 0) return '';

    var tableRows = positionTags.map(function(tag) {
        var matching = rows.filter(function(r) {
            if (!r.unit) return false;
            var tags = (typeof getPositionTags === 'function') ? getPositionTags(r.unit) : [];
            return tags.indexOf(tag.value) !== -1;
        });
        var total = matching.length;
        var tagACount = matching.filter(function(r) { return r.tagsA && r.tagsA.length > 0; }).length;
        var tagBCount = matching.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        return {
            label: tag.icon + ' ' + tag.label, total: total,
            tagACount: tagACount, prevRate: total > 0 ? (tagACount / total * 100) : 0,
            tagBCount: tagBCount, rate: total > 0 ? (tagBCount / total * 100) : 0
        };
    }).filter(function(r) { return r.total > 0; });

    if (tableRows.length === 0) return '';

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">📍</span>位置別タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>位置</th><th>台数</th><th>前回タグ</th><th>前回タグ率</th><th>今回タグ</th><th>今回タグ率</th></tr></thead><tbody>';
    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td><td>' + r.tagACount + '</td><td>' + buildPctBarCell(r.prevRate) + '</td><td>' + r.tagBCount + '</td><td>' + buildPctBarCell(r.rate) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

function buildSuffixAnalysisTable(rows) {
    var suffixes = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var tableRows = suffixes.map(function(s) {
        var matching = rows.filter(function(r) {
            var num = (r.unit || '').replace(/\D/g, '');
            return num.length > 0 && num.slice(-1) === s;
        });
        var total = matching.length;
        var tagACount = matching.filter(function(r) { return r.tagsA && r.tagsA.length > 0; }).length;
        var tagBCount = matching.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        return {
            label: '末尾 ' + s, total: total,
            tagACount: tagACount, prevRate: total > 0 ? (tagACount / total * 100) : 0,
            tagBCount: tagBCount, rate: total > 0 ? (tagBCount / total * 100) : 0
        };
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">🔢</span>台番号末尾別タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>末尾</th><th>台数</th><th>前回タグ</th><th>前回タグ率</th><th>今回タグ</th><th>今回タグ率</th></tr></thead><tbody>';
    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td><td>' + r.tagACount + '</td><td>' + buildPctBarCell(r.prevRate) + '</td><td>' + r.tagBCount + '</td><td>' + buildPctBarCell(r.rate) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

function buildPrevStateAnalysisTable(rows) {
    var categories = [
        { label: '前回 高設定タグ', filter: function(r) { return r.tagsA && r.tagsA.length > 0; } },
        { label: '前回 タグなし＆プラス', filter: function(r) {
            if ((r.tagsA && r.tagsA.length > 0) || !r.rowA) return false;
            return (parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0) > 0;
        }},
        { label: '前回 マイナス', filter: function(r) {
            if (!r.rowA) return false;
            return (parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0) < 0;
        }},
        { label: '前回 ±0', filter: function(r) {
            if (!r.rowA) return false;
            return (parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0) === 0;
        }},
        { label: '前回 データなし', filter: function(r) { return !r.rowA; } }
    ];

    var tableRows = categories.map(function(cat) {
        var matching = rows.filter(cat.filter);
        var total = matching.length;
        var tagBCount = matching.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        return { label: cat.label, total: total, tagBCount: tagBCount, rate: total > 0 ? (tagBCount / total * 100) : 0 };
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">📊</span>前回状態別 → 今回タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>前回の状態</th><th>該当台数</th><th>今回タグ数</th><th>今回タグ率</th></tr></thead><tbody>';
    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td><td>' + r.tagBCount + '</td><td>' + buildPctBarCell(r.rate) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

function buildPrevGameRangeAnalysisTable(rows) {
    var ranges = [
        { label: '0G（未稼働）', min: 0, max: 0 },
        { label: '1〜2000G', min: 1, max: 2000 },
        { label: '2001〜4000G', min: 2001, max: 4000 },
        { label: '4001〜6000G', min: 4001, max: 6000 },
        { label: '6001〜8000G', min: 6001, max: 8000 },
        { label: '8001G以上', min: 8001, max: Infinity }
    ];

    var tableRows = ranges.map(function(range) {
        var matching = rows.filter(function(r) {
            if (!r.rowA) return false;
            var g = parseInt(String(r.rowA['G数']).replace(/,/g, '')) || 0;
            return g >= range.min && g <= range.max;
        });
        var total = matching.length;
        var tagBCount = matching.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        return { label: range.label, total: total, tagBCount: tagBCount, rate: total > 0 ? (tagBCount / total * 100) : 0 };
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">🎰</span>前回G数帯別 → 今回タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>前回G数帯</th><th>該当台数</th><th>今回タグ数</th><th>今回タグ率</th></tr></thead><tbody>';
    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td><td>' + r.tagBCount + '</td><td>' + buildPctBarCell(r.rate) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

function buildPrevSaRangeAnalysisTable(rows) {
    var ranges = [
        { label: '-3000枚以下', min: -Infinity, max: -3001 },
        { label: '-3000〜-1001枚', min: -3000, max: -1001 },
        { label: '-1000〜-1枚', min: -1000, max: -1 },
        { label: '±0枚', min: 0, max: 0 },
        { label: '+1〜+1000枚', min: 1, max: 1000 },
        { label: '+1001〜+3000枚', min: 1001, max: 3000 },
        { label: '+3001枚以上', min: 3001, max: Infinity }
    ];

    var tableRows = ranges.map(function(range) {
        var matching = rows.filter(function(r) {
            if (!r.rowA) return false;
            var sa = parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0;
            return sa >= range.min && sa <= range.max;
        });
        var total = matching.length;
        var tagBCount = matching.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        return { label: range.label, total: total, tagBCount: tagBCount, rate: total > 0 ? (tagBCount / total * 100) : 0 };
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">💰</span>前回差枚帯別 → 今回タグ率</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table">';
    html += '<thead><tr><th>前回差枚帯</th><th>該当台数</th><th>今回タグ数</th><th>今回タグ率</th></tr></thead><tbody>';
    tableRows.forEach(function(r) {
        html += '<tr><td>' + r.label + '</td><td>' + r.total + '</td><td>' + r.tagBCount + '</td><td>' + buildPctBarCell(r.rate) + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    return html;
}

// ========== 機種別分析 ==========

function renderMachineAnalysis(rows) {
    var container = document.getElementById('analysisTables');
    if (!container) return;

    var machineMap = {};
    rows.forEach(function(r) {
        var name = r.machineName || '不明';
        if (!machineMap[name]) machineMap[name] = [];
        machineMap[name].push(r);
    });

    var machineNames = Object.keys(machineMap).sort(function(a, b) {
        return machineMap[b].length - machineMap[a].length;
    });

    var html = '<div class="analysis-table-block">';
    html += '<div class="analysis-table-title"><span class="title-icon">🎰</span>機種別 高設定タグ分析</div>';
    html += '<div class="analysis-table-wrapper"><table class="analysis-table analysis-machine-table">';
    html += '<thead><tr><th>機種名</th><th>台数</th><th>前回タグ</th><th>前回タグ率</th><th>今回タグ</th><th>今回タグ率</th><th>前回マイナス→今回タグ</th></tr></thead><tbody>';

    machineNames.forEach(function(name) {
        var mRows = machineMap[name];
        var total = mRows.length;
        var tagACount = mRows.filter(function(r) { return r.tagsA && r.tagsA.length > 0; }).length;
        var tagBCount = mRows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        var tagARate = total > 0 ? (tagACount / total * 100) : 0;
        var tagBRate = total > 0 ? (tagBCount / total * 100) : 0;

        var prevMinusRows = mRows.filter(function(r) {
            if (!r.rowA) return false;
            return (parseInt(String(r.rowA['差枚']).replace(/,/g, '')) || 0) < 0;
        });
        var recoveryCount = prevMinusRows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
        var recoveryRate = prevMinusRows.length > 0 ? (recoveryCount / prevMinusRows.length * 100) : 0;

        html += '<tr>';
        html += '<td>' + escapeHtml(name) + '</td>';
        html += '<td>' + total + '</td>';
        html += '<td>' + tagACount + '</td>';
        html += '<td>' + buildPctBarCell(tagARate) + '</td>';
        html += '<td>' + tagBCount + '</td>';
        html += '<td>' + buildPctBarCell(tagBRate) + '</td>';
        html += '<td>' + buildPctBarCell(recoveryRate, prevMinusRows.length) + '</td>';
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
    var tagACount = rows.filter(function(r) { return r.tagsA && r.tagsA.length > 0; }).length;
    var tagBCount = rows.filter(function(r) { return r.tagsB && r.tagsB.length > 0; }).length;
    var bothCount = rows.filter(function(r) { return r.tagsA && r.tagsA.length > 0 && r.tagsB && r.tagsB.length > 0; }).length;
    display.textContent = '前回: ' + tagACount + '台 / 今回: ' + tagBCount + '台 / 両日: ' + bothCount + '台';
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
    var selectA = document.getElementById('compareDateA');
    var selectB = document.getElementById('compareDateB');
    var dateA = selectA ? selectA.value.replace('data/', '').replace(/\.(json|csv)/, '') : 'A';
    var dateB = selectB ? selectB.value.replace('data/', '').replace(/\.(json|csv)/, '') : 'B';
    downloadAsCSV(data, 'compare_' + dateA + '_vs_' + dateB + '.csv');
}

// ========== イベントリスナー ==========

function setupCompareEventListeners() {
    var el;

    el = document.getElementById('compareDateA');
    if (el) el.addEventListener('change', updateCompareDateInfo);
    el = document.getElementById('compareDateB');
    if (el) el.addEventListener('change', updateCompareDateInfo);

    el = document.getElementById('compareSwapDates');
    if (el) {
        el.addEventListener('click', function() {
            var selectA = document.getElementById('compareDateA');
            var selectB = document.getElementById('compareDateB');
            if (!selectA || !selectB) return;
            var tmpVal = selectA.value;
            selectA.value = selectB.value;
            selectB.value = tmpVal;
            updateCompareDateInfo();
            if (compareDataCache.a && compareDataCache.b) {
                var tmpData = compareDataCache.a;
                compareDataCache.a = compareDataCache.b;
                compareDataCache.b = tmpData;
                renderCompare();
            }
        });
    }

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

    el = document.getElementById('analysisViewMode');
    if (el) el.addEventListener('change', function() {
        if (hasCompareData()) {
            var rows = buildCompareRows();
            renderCompareAnalysis(rows);
        }
    });

    el = document.getElementById('copyCompareTableBtn');
    if (el) el.addEventListener('click', copyCompareTable);
    el = document.getElementById('downloadCompareCsvBtn');
    if (el) el.addEventListener('click', downloadCompareCSV);
}
