// ===================
// 日別データタブ
// ===================

var visibleColumns = [];
var allColumns = [];
var filterPanelOpen = false;
var dailyMachineFilterSelect = null;
var selectedPositionFilter = '';
var dailyTagUIInitialized = false;

function syncDailyState() {
    HallData.state.daily.visibleColumns = visibleColumns;
    HallData.state.daily.allColumns = allColumns;
    HallData.state.daily.filterPanelOpen = filterPanelOpen;
    HallData.state.daily.positionFilter = selectedPositionFilter;
}

function loadDailyState() {
    if (HallData.state.daily.visibleColumns.length > 0) visibleColumns = HallData.state.daily.visibleColumns;
    if (HallData.state.daily.allColumns.length > 0) allColumns = HallData.state.daily.allColumns;
    filterPanelOpen = HallData.state.daily.filterPanelOpen;
    selectedPositionFilter = HallData.state.daily.positionFilter || '';
}

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

function toggleFilterPanel() {
    var content = document.getElementById('filterContent');
    var toggle = document.getElementById('filterToggle');
    var icon = toggle ? toggle.querySelector('.toggle-icon') : null;
    if (!content || !toggle) return;
    filterPanelOpen = !filterPanelOpen;
    if (filterPanelOpen) {
        content.classList.add('open');
        toggle.classList.add('open');
        if (icon) icon.textContent = '▲';
    } else {
        content.classList.remove('open');
        toggle.classList.remove('open');
        if (icon) icon.textContent = '▼';
    }
    localStorage.setItem('filterPanelOpen', filterPanelOpen);
}

function restoreFilterPanelState() {
    var saved = localStorage.getItem('filterPanelOpen');
    if (saved === 'true') {
        filterPanelOpen = false;
        toggleFilterPanel();
    }
}

function initDailyMachineFilter() {
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    var machineOptions = getMachineOptionsForDate(currentFile);
    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    } else {
        dailyMachineFilterSelect = initMultiSelectMachineFilter(
            'dailyMachineFilterContainer', machineOptions, '全機種',
            function() { filterAndRender(); }
        );
    }
}

function updateDailyMachineFilterCounts() {
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    var machineOptions = getMachineOptionsForDate(currentFile);
    if (dailyMachineFilterSelect) dailyMachineFilterSelect.updateOptions(machineOptions);
}

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

    // 高設定タグ列を追加
    if (allColumns.indexOf('高設定タグ') === -1) {
        allColumns.push('高設定タグ');
    }

    var savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
        try {
            var parsed = JSON.parse(savedColumns);
            visibleColumns = parsed.filter(function(col) { return allColumns.indexOf(col) !== -1; });
            if (visibleColumns.length === 0) visibleColumns = [].concat(allColumns);
        } catch (e) {
            visibleColumns = [].concat(allColumns);
        }
    } else {
        visibleColumns = [].concat(allColumns);
    }

    renderColumnCheckboxes();
}

function renderPositionFilter() {
    var positionTags = getAllPositionTags();
    var html = '<div class="position-filter">';
    html += '<button class="position-filter-btn ' + (selectedPositionFilter === '' ? 'active' : '') + '" data-position="" style="background: ' + (selectedPositionFilter === '' ? 'var(--primary-color)' : '') + '">全て</button>';
    positionTags.forEach(function(tag) {
        var isActive = selectedPositionFilter === tag.value;
        html += '<button class="position-filter-btn ' + (isActive ? 'active' : '') + '" data-position="' + tag.value + '" style="' + (isActive ? 'background: ' + tag.color + '; border-color: ' + tag.color + ';' : 'border-color: ' + tag.color + '40;') + '">' + tag.icon + ' ' + tag.label + '</button>';
    });
    html += '</div>';
    return html;
}

function renderPositionFilterSection() {
    var filterContent = document.getElementById('filterContent');
    if (!filterContent) return;
    var existingSection = filterContent.querySelector('.position-filter-section');
    if (existingSection) existingSection.remove();
    var section = document.createElement('div');
    section.className = 'filter-section position-filter-section';
    section.innerHTML = '<h5>📍 位置フィルター</h5>' + renderMultiPositionFilter('daily', function() {
        renderPositionFilterSection();
        filterAndRender();
    });
    var firstSection = filterContent.querySelector('.filter-section');
    if (firstSection) firstSection.before(section);
    else filterContent.prepend(section);
    setupMultiPositionFilterEvents('daily', function() {
        renderPositionFilterSection();
        filterAndRender();
    });
}

function renderColumnCheckboxes() {
    var container = document.getElementById('columnCheckboxes');
    if (!container) return;
    container.innerHTML = allColumns.map(function(col) {
        var checked = visibleColumns.indexOf(col) !== -1 ? 'checked' : '';
        var id = 'col-' + col.replace(/[^a-zA-Z0-9]/g, '_');
        return '<label class="column-checkbox-item"><input type="checkbox" id="' + id + '" value="' + col + '" ' + checked + '><span>' + col + '</span></label>';
    }).join('');
    container.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
        cb.addEventListener('change', function() {
            updateVisibleColumns();
            filterAndRender();
        });
    });
}

function updateVisibleColumns() {
    var checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]:checked');
    visibleColumns = Array.from(checkboxes).map(function(cb) { return cb.value; });
    if (visibleColumns.length === 0 && allColumns.length > 0) {
        visibleColumns = [allColumns[0]];
        var firstCheckbox = document.querySelector('#columnCheckboxes input[type="checkbox"]');
        if (firstCheckbox) firstCheckbox.checked = true;
    }
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

function selectAllColumns() {
    visibleColumns = [].concat(allColumns);
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(function(cb) { cb.checked = true; });
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    filterAndRender();
}

function deselectAllColumns() {
    var essentialColumns = ['機種名', '台番号'].filter(function(col) { return allColumns.indexOf(col) !== -1; });
    visibleColumns = essentialColumns.length > 0 ? essentialColumns : [allColumns[0]];
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(function(cb) {
        cb.checked = visibleColumns.indexOf(cb.value) !== -1;
    });
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    filterAndRender();
}

function updateFilterBadge() {
    var toggle = document.getElementById('filterToggle');
    if (!toggle) return;
    var activeCount = 0;
    if (document.getElementById('saFilterType') && document.getElementById('saFilterType').value && document.getElementById('saFilterValue') && document.getElementById('saFilterValue').value) activeCount++;
    if (document.getElementById('gameFilterType') && document.getElementById('gameFilterType').value && document.getElementById('gameFilterValue') && document.getElementById('gameFilterValue').value) activeCount++;
    if (document.getElementById('rateFilterType') && document.getElementById('rateFilterType').value && document.getElementById('rateFilterValue') && document.getElementById('rateFilterValue').value) activeCount++;
    if (document.getElementById('unitSuffixFilter') && document.getElementById('unitSuffixFilter').value) activeCount++;
    var hiddenColumns = allColumns.length - visibleColumns.length;
    var existingBadge = toggle.querySelector('.filter-badge');
    if (existingBadge) existingBadge.remove();
    if (activeCount > 0 || hiddenColumns > 0) {
        var badge = document.createElement('span');
        badge.className = 'filter-badge';
        var badgeText = [];
        if (activeCount > 0) badgeText.push(activeCount + '件');
        if (hiddenColumns > 0) badgeText.push(hiddenColumns + '列非表示');
        badge.textContent = badgeText.join(' / ');
        toggle.querySelector('h4').appendChild(badge);
    }
}

async function initDateSelectWithEvents() {
    await loadEventData();
    var dateSelect = document.getElementById('dateSelect');
    if (!dateSelect) return;
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    dateSelect.innerHTML = sortedFiles.map(function(file, index) {
        return createDateSelectOption(file, index === currentDateIndex);
    }).join('');
}

async function updateDateNavWithEvents() {
    await loadEventData();
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;
    var dateLabel = document.getElementById('currentDateLabel');
    if (dateLabel) {
        var formattedDate = formatDate(currentFile);
        var dayOfWeek = getDayOfWeekName(getDayOfWeek(currentFile));
        dateLabel.textContent = formattedDate + '（' + dayOfWeek + '）';
    }
    var dateKey = getDateKeyFromFilename(currentFile);
    var events = getEventsForDate(dateKey);
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
    if (eventContainer) eventContainer.innerHTML = renderDailyEventBadges(events);
    var prevBtn = document.getElementById('prevDate');
    var nextBtn = document.getElementById('nextDate');
    if (prevBtn) prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
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

async function filterAndRender() {
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;

    var data = await loadCSV(currentFile);
    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    data = addMechanicalRateToData(data);

    if (allColumns.length === 0 && headers.length > 0) initColumnSelector();

    // 高設定タグUIの初期化（初回のみ）
    if (!dailyTagUIInitialized) {
        initDailyTagUI();
        dailyTagUIInitialized = true;
    }

    renderPositionFilterSection();

    if (!dailyMachineFilterSelect) initDailyMachineFilter();
    else updateDailyMachineFilterCounts();

    data = [].concat(data);

    // 高設定タグ判定
    if (hasActiveTagConditions()) {
        data = data.map(function(row) {
            return Object.assign({}, row, { '_highSettingTag': evaluateHighSettingTag(row) });
        });
    } else {
        data = data.map(function(row) {
            return Object.assign({}, row, { '_highSettingTag': false });
        });
    }

    // 位置フィルター
    data = applyMultiPositionFilter(data, 'daily', '台番号');

    // 機種フィルター
    var selectedMachines = dailyMachineFilterSelect ? dailyMachineFilterSelect.getSelectedValues() : [];
    if (selectedMachines.length > 0) {
        data = data.filter(function(row) { return selectedMachines.indexOf(row['機種名']) !== -1; });
    }

    // 台番号検索
    var searchTerm = (document.getElementById('search') ? document.getElementById('search').value : '').toLowerCase();
    if (searchTerm) {
        data = data.filter(function(row) { return (row['台番号'] || '').toLowerCase().indexOf(searchTerm) !== -1; });
    }

    var sortBy = document.getElementById('sortBy') ? document.getElementById('sortBy').value : '';

    // 差枚フィルター
    var saFilterType = document.getElementById('saFilterType') ? document.getElementById('saFilterType').value : '';
    var saFilterValue = document.getElementById('saFilterValue') ? document.getElementById('saFilterValue').value : '';
    if (saFilterType && saFilterValue) {
        var saVal = parseInt(saFilterValue);
        if (saFilterType === 'gte') data = data.filter(function(row) { return (parseInt(String(row['差枚']).replace(/,/g, '')) || 0) >= saVal; });
        else if (saFilterType === 'lte') data = data.filter(function(row) { return (parseInt(String(row['差枚']).replace(/,/g, '')) || 0) <= saVal; });
    }

    // G数フィルター
    var gameFilterType = document.getElementById('gameFilterType') ? document.getElementById('gameFilterType').value : '';
    var gameFilterValue = document.getElementById('gameFilterValue') ? document.getElementById('gameFilterValue').value : '';
    if (gameFilterType && gameFilterValue) {
        var gVal = parseInt(gameFilterValue);
        if (gameFilterType === 'gte') data = data.filter(function(row) { return (parseInt(String(row['G数']).replace(/,/g, '')) || 0) >= gVal; });
        else if (gameFilterType === 'lte') data = data.filter(function(row) { return (parseInt(String(row['G数']).replace(/,/g, '')) || 0) <= gVal; });
    }

    // 機械割フィルター
    var rateFilterType = document.getElementById('rateFilterType') ? document.getElementById('rateFilterType').value : '';
    var rateFilterValue = document.getElementById('rateFilterValue') ? document.getElementById('rateFilterValue').value : '';
    if (rateFilterType && rateFilterValue) {
        var rVal = parseFloat(rateFilterValue);
        if (rateFilterType === 'gte') data = data.filter(function(row) { return row['機械割'] !== null && row['機械割'] >= rVal; });
        else if (rateFilterType === 'lte') data = data.filter(function(row) { return row['機械割'] !== null && row['機械割'] <= rVal; });
    }

    // 台番号末尾フィルター
    var unitSuffixFilter = document.getElementById('unitSuffixFilter') ? document.getElementById('unitSuffixFilter').value : '';
    if (unitSuffixFilter !== '') {
        data = data.filter(function(row) {
            var numOnly = (row['台番号'] || '').replace(/\D/g, '');
            if (numOnly.length === 0) return false;
            return parseInt(numOnly.slice(-1)) === parseInt(unitSuffixFilter);
        });
    }

    // 高設定タグのみ表示
    var dailyShowHighOnly = document.getElementById('dailyShowHighSettingOnly');
    if (dailyShowHighOnly && dailyShowHighOnly.checked) {
        data = data.filter(function(row) { return row['_highSettingTag']; });
    }

    // ソート
    if (sortBy) {
        switch (sortBy) {
            case 'sa_desc': data.sort(function(a, b) { return (parseInt(String(b['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(a['差枚']).replace(/,/g, '')) || 0); }); break;
            case 'sa_asc': data.sort(function(a, b) { return (parseInt(String(a['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(b['差枚']).replace(/,/g, '')) || 0); }); break;
            case 'game_desc': data.sort(function(a, b) { return (parseInt(String(b['G数']).replace(/,/g, '')) || 0) - (parseInt(String(a['G数']).replace(/,/g, '')) || 0); }); break;
            case 'rate_desc': data.sort(function(a, b) { return (b['機械割'] || -Infinity) - (a['機械割'] || -Infinity); }); break;
            case 'rate_asc': data.sort(function(a, b) { return (a['機械割'] || Infinity) - (b['機械割'] || Infinity); }); break;
            case 'machine_asc': data = sortByMachineThenUnit(data, '機種名', '台番号', true, true); break;
            case 'machine_desc': data = sortByMachineThenUnit(data, '機種名', '台番号', false, true); break;
            case 'unit_asc': data = sortByUnitNumber(data, '台番号', true); break;
            case 'unit_desc': data = sortByUnitNumber(data, '台番号', false); break;
        }
    }

    renderTableWithColumns(data, 'data-table', 'summary', visibleColumns);
    await updateDateNavWithEvents();
    updateFilterBadge();
    updateDailyTagCountDisplay(data);
}

function updateDailyTagCountDisplay(data) {
    var display = document.getElementById('dailyTagCountDisplay');
    if (!display) return;
    if (!hasActiveTagConditions()) { display.textContent = ''; return; }
    var tagCount = data.filter(function(r) { return r['_highSettingTag']; }).length;
    display.textContent = 'タグ付き: ' + tagCount + '台 / ' + data.length + '台';
}

function renderTableWithColumns(data, tableId, summaryId, columns) {
    var table = document.getElementById(tableId);
    if (!table) return;

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var displayColumns = columns.length > 0 ? columns : allColumns;

    thead.innerHTML = '<tr>' + displayColumns.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';

    tbody.innerHTML = data.map(function(row) {
        return '<tr>' + displayColumns.map(function(h) {
            var val = row[h];

            if (h === '高設定タグ') {
                if (row['_highSettingTag']) {
                    return '<td class="text-center"><span class="high-setting-tag tag-high">🏷️ 高設定</span></td>';
                }
                return '<td class="text-center"><span class="text-muted">-</span></td>';
            }

            if (h === '位置') {
                var tagsHtml = renderPositionTags(row['台番号'], { compact: true });
                return '<td>' + (tagsHtml || '-') + '</td>';
            }

            if (h === '機械割') {
                var rate = val;
                var rateClass = getMechanicalRateClass(rate);
                var rateText = formatMechanicalRate(rate);
                return '<td class="' + rateClass + '">' + rateText + '</td>';
            }

            if (h === '差枚') {
                var numVal = parseInt(String(val).replace(/,/g, '')) || 0;
                var cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return '<td class="' + cls + '">' + (numVal >= 0 ? '+' : '') + numVal.toLocaleString() + '</td>';
            }

            if (h === 'G数') {
                var gVal = parseInt(String(val).replace(/,/g, '')) || 0;
                return '<td>' + gVal.toLocaleString() + '</td>';
            }

            var strVal = val || '';
            if (/^-?\d+$/.test(strVal)) return '<td>' + parseInt(strVal).toLocaleString() + '</td>';
            return '<td>' + strVal + '</td>';
        }).join('') + '</tr>';
    }).join('');

    if (summaryId) {
        var summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            var totalSa = data.reduce(function(sum, r) { return sum + (parseInt(String(r['差枚']).replace(/,/g, '')) || 0); }, 0);
            var totalGames = data.reduce(function(sum, r) { return sum + (parseInt(String(r['G数']).replace(/,/g, '')) || 0); }, 0);
            var plusCount = data.filter(function(r) { return (parseInt(String(r['差枚']).replace(/,/g, '')) || 0) > 0; }).length;
            var winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
            var saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
            var avgRate = calculateMechanicalRate(totalGames, totalSa);
            var avgRateText = formatMechanicalRate(avgRate);
            var avgRateClass = getMechanicalRateClass(avgRate);

            var positionInfo = '';
            var positionState = getPositionFilterState('daily');
            if (positionState.selected.length > 0) positionInfo = ' | 位置: ' + getPositionFilterDisplayText('daily');

            var tagInfo = '';
            if (hasActiveTagConditions()) {
                var tagCount = data.filter(function(r) { return r['_highSettingTag']; }).length;
                tagInfo = ' | タグ付き: ' + tagCount + '台';
            }

            summaryEl.innerHTML =
                '表示: ' + data.length + '台' + positionInfo + tagInfo + ' | ' +
                '総G数: ' + totalGames.toLocaleString() + ' | ' +
                '総差枚: <span class="' + saClass + '">' + (totalSa >= 0 ? '+' : '') + totalSa.toLocaleString() + '</span> | ' +
                '機械割: <span class="' + avgRateClass + '">' + avgRateText + '</span> | ' +
                '勝率: ' + winRate + '%';
        }
    }
}

function getDisplayedTableData() {
    var table = document.getElementById('data-table');
    if (!table) return { headers: [], rows: [] };
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var headers = [];
    thead.querySelectorAll('th').forEach(function(cell) { headers.push(cell.textContent.trim()); });
    var rows = [];
    tbody.querySelectorAll('tr').forEach(function(row) {
        var rowData = [];
        row.querySelectorAll('td').forEach(function(cell, index) {
            var value = cell.textContent.trim();
            var headerName = headers[index];
            if (headerName === '位置') {
                value = value.replace(/[🔲🔳⬜⭕🔷🔶]/g, '').trim();
                rowData.push(value);
                return;
            }
            if (headerName === '高設定タグ') {
                rowData.push(value === '🏷️ 高設定' ? '○' : '-');
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
    return { headers: headers, rows: rows };
}

async function copyTableToClipboard() {
    var data = getDisplayedTableData();
    var btn = document.getElementById('copyTableBtn');
    await copyToClipboard(data, btn);
}

function downloadTableAsCSV() {
    var data = getDisplayedTableData();
    if (data.rows.length === 0) { showCopyToast('ダウンロードするデータがありません', true); return; }
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    var dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/', '') : 'data';
    downloadAsCSV(data, dateStr + '_export.csv');
}

function setupDailyEventListeners() {
    document.getElementById('prevDate') && document.getElementById('prevDate').addEventListener('click', function() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex < sortedFiles.length - 1) {
            currentDateIndex++;
            initDateSelectWithEvents();
            filterAndRender();
        }
    });

    document.getElementById('nextDate') && document.getElementById('nextDate').addEventListener('click', function() {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            initDateSelectWithEvents();
            filterAndRender();
        }
    });

    document.getElementById('dateSelect') && document.getElementById('dateSelect').addEventListener('change', function(e) {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        currentDateIndex = sortedFiles.indexOf(e.target.value);
        filterAndRender();
    });

    document.getElementById('search') && document.getElementById('search').addEventListener('input', filterAndRender);
    document.getElementById('sortBy') && document.getElementById('sortBy').addEventListener('change', filterAndRender);
    document.getElementById('applyFilter') && document.getElementById('applyFilter').addEventListener('click', filterAndRender);

    document.getElementById('resetFilter') && document.getElementById('resetFilter').addEventListener('click', function() {
        document.getElementById('saFilterType').value = '';
        document.getElementById('saFilterValue').value = '';
        document.getElementById('gameFilterType').value = '';
        document.getElementById('gameFilterValue').value = '';
        document.getElementById('rateFilterType').value = '';
        document.getElementById('rateFilterValue').value = '';
        document.getElementById('unitSuffixFilter').value = '';
        resetPositionFilter('daily');
        if (dailyMachineFilterSelect) dailyMachineFilterSelect.reset();
        var dailyShowHighOnly = document.getElementById('dailyShowHighSettingOnly');
        if (dailyShowHighOnly) dailyShowHighOnly.checked = false;
        filterAndRender();
    });

    document.getElementById('unitSuffixFilter') && document.getElementById('unitSuffixFilter').addEventListener('change', filterAndRender);
    document.getElementById('rateFilterType') && document.getElementById('rateFilterType').addEventListener('change', filterAndRender);
    document.getElementById('rateFilterValue') && document.getElementById('rateFilterValue').addEventListener('input', filterAndRender);
    document.getElementById('selectAllColumns') && document.getElementById('selectAllColumns').addEventListener('click', selectAllColumns);
    document.getElementById('deselectAllColumns') && document.getElementById('deselectAllColumns').addEventListener('click', deselectAllColumns);
    document.getElementById('filterToggle') && document.getElementById('filterToggle').addEventListener('click', toggleFilterPanel);
    document.getElementById('copyTableBtn') && document.getElementById('copyTableBtn').addEventListener('click', copyTableToClipboard);
    document.getElementById('downloadCsvBtn') && document.getElementById('downloadCsvBtn').addEventListener('click', downloadTableAsCSV);

    restoreFilterPanelState();
    initDateSelectWithEvents();
}
