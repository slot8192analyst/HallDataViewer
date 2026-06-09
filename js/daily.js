// ===================
// 日別データタブ
// ===================

var visibleColumns = [];
var allColumns = [];
var dailyMachineFilterSelect = null;
var dailyTagUIInitialized = false;
var dailyBadgeUIInitialized = false;

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

var DAILY_FILTER_OPERATORS = [
    { value: 'gte', label: '以上' },
    { value: 'lte', label: '以下' },
    { value: 'eq', label: '等しい' },
    { value: 'neq', label: '等しくない' }
];

var DAILY_FILTER_STORAGE_KEY = 'dailyFilterGroups';

function loadDailyFilterGroups() {
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
        return '<span class="daily-tag-preview-badge" style="background: ' + def.color +
            '20; border-color: ' + def.color + '; color: ' + def.color + ';' +
            (hasCond ? '' : ' opacity:0.5;') + '"' +
            (hasCond ? '' : ' title="条件未設定"') + '>' +
            def.icon + ' ' + escapeHtmlTag(def.name) + '</span>';
    }).join('');

    preview.innerHTML = html;
    preview.classList.add('active');
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
    el.textContent = days + '日 / ' + base + ' / ' + col;
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

    var savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
        try {
            var parsed = JSON.parse(savedColumns);
            parsed = parsed.map(function(col) { return col === '高設定タグ' ? 'タグ' : col; });
            visibleColumns = parsed.filter(function(col) { return allColumns.indexOf(col) !== -1; });
            // 機種内順位列が既存設定にない場合は追加
            if (visibleColumns.length > 0 && visibleColumns.indexOf('機種内順位') === -1) {
                visibleColumns.push('機種内順位');
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

function renderBadgeSettings() {
    var container = document.getElementById('badgeSettingsContainer');
    if (!container) return;
    if (typeof MachineBadge === 'undefined') return;

    container.innerHTML = MachineBadge.renderSettingsHtml('dailyMb');

    MachineBadge.setupSettingsEvents('dailyMb', function() {
        updateBadgePreview();
        filterAndRender();
    });
}

// ===================
// 表示列（統合グループ対応）
// ===================

// 統合グループ定義
var COLUMN_GROUPS = [
    { id: '__group_atari_count', label: '当たり回数', members: ['BB', 'RB', 'ART'] },
    { id: '__group_atari_rate',  label: '当たり確率', members: ['合成確率', 'BB確率', 'RB確率', 'ART確率'] }
];

function getGroupedColumnLayout() {
    // allColumns を、グループに属する列はグループ化し、その他は単独項目として並べる
    var layout = [];
    var consumedGroupIds = {};

    allColumns.forEach(function(col) {
        var group = COLUMN_GROUPS.find(function(g) { return g.members.indexOf(col) !== -1; });
        if (group) {
            if (!consumedGroupIds[group.id]) {
                consumedGroupIds[group.id] = true;
                // このグループに実在するメンバーだけを対象にする
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
            // グループ内のメンバーが1つでも表示中ならチェック
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

function updateVisibleColumns() {
    var checkedCols = {};

    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]:checked').forEach(function(cb) {
        if (cb.dataset.groupId) {
            // グループ → メンバー実列を全て追加
            (cb.dataset.members || '').split(',').forEach(function(m) {
                if (m) checkedCols[m] = true;
            });
        } else if (cb.value) {
            checkedCols[cb.value] = true;
        }
    });

    // allColumns の並び順を維持して visibleColumns を構築
    visibleColumns = allColumns.filter(function(col) { return checkedCols[col]; });

    if (visibleColumns.length === 0 && allColumns.length > 0) {
        visibleColumns = [allColumns[0]];
        renderColumnCheckboxes(); // 最低1列を確実にチェック状態へ反映
    }

    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

function selectAllColumns() {
    visibleColumns = [].concat(allColumns);
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    renderColumnCheckboxes();
    filterAndRender();
}

function deselectAllColumns() {
    var essentialColumns = ['機種名', '台番号'].filter(function(col) { return allColumns.indexOf(col) !== -1; });
    visibleColumns = essentialColumns.length > 0 ? essentialColumns : [allColumns[0]];
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
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
// メインフィルター＆描画
// ===================

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

    data = [].concat(data);

    // 複数タグ判定
    var tagDefs = TagEngine.getAll();
    data = data.map(function(row) {
        var newRow = Object.assign({}, row);
        newRow['_matchedTags'] = TagEngine.evaluateAll(row);
        return newRow;
    });

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

    // 数値フィルター（グループAND/OR方式）
    data = applyDailyFilterGroups(data);

    // タグ付きのみ表示
    var showTaggedOnly = document.getElementById('dailyShowTaggedOnly');
    if (showTaggedOnly && showTaggedOnly.checked) {
        data = data.filter(function(row) { return row['_matchedTags'] && row['_matchedTags'].length > 0; });
    }

    // ソート
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

    // 機種内バッジ付与（フィルター・ソート後のデータで機種内順位を確定）
    if (typeof MachineBadge !== 'undefined' && MachineBadge.isEnabled()) {
        data = MachineBadge.assignBadges(data, currentFile, dataCache, MachineBadge.getTargetColumn());
    }

    renderTableWithColumns(data, 'data-table', 'summary', visibleColumns);
    await updateDateNavWithEvents();
    updateDailyTagCountDisplay(data);
    renderSuffixStatsTable(data);

    // プレビュー更新
    updateNumFilterPreview();
    renderDailyTagPreview();
    updateColumnPreview();
    updateBadgePreview();
}

// ===================
// テーブル描画
// ===================

function renderTableWithColumns(data, tableId, summaryId, columns) {
    var table = document.getElementById(tableId);
    if (!table) return;

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    var displayColumns = columns.length > 0 ? columns : allColumns;

    thead.innerHTML = '<tr>' + displayColumns.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';

    var tagDefs = TagEngine.getAll();

    tbody.innerHTML = data.map(function(row) {
        return '<tr>' + displayColumns.map(function(h) {
            var val = row[h];

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

            var tagInfo = '';
            if (TagEngine.hasAnyActiveConditions()) {
                var taggedCount = data.filter(function(r) { return r['_matchedTags'] && r['_matchedTags'].length > 0; }).length;
                tagInfo = ' | タグ付き: ' + taggedCount + '台';
            }

            var filterInfo = '';
            if (hasActiveDailyFilters()) {
                filterInfo = ' | フィルター適用中';
            }

            summaryEl.innerHTML =
                '表示: ' + data.length + '台' + tagInfo + filterInfo + ' | ' +
                '総G数: ' + totalGames.toLocaleString() + ' | ' +
                '総差枚: <span class="' + saClass + '">' + (totalSa >= 0 ? '+' : '') + totalSa.toLocaleString() + '</span> | ' +
                '機械割: <span class="' + avgRateClass + '">' + avgRateText + '</span> | ' +
                '勝率: ' + winRate + '%';
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
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    var dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/', '') : 'data';
    downloadAsCSV(data, dateStr + '_export.csv');
}

// ===================
// モーダルイベント
// ===================

function setupDailyModalEvents() {
    // 数値フィルターモーダル
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

    // タグモーダル
    bindModalOpen('openDailyTagModal', 'dailyTagModal');
    bindModalClose('closeDailyTagModal', 'dailyTagModal');
    var applyTagBtn = document.getElementById('applyDailyTagModal');
    if (applyTagBtn) applyTagBtn.addEventListener('click', function() {
        renderDailyTagPreview();
        closeAppModal('dailyTagModal');
    });

    // 表示列モーダル
    bindModalOpen('openColumnModal', 'columnModal');
    bindModalClose('closeColumnModal', 'columnModal');
    var applyColumnBtn = document.getElementById('applyColumnModal');
    if (applyColumnBtn) applyColumnBtn.addEventListener('click', function() {
        closeAppModal('columnModal');
    });

    // バッジ設定モーダル
    bindModalOpen('openBadgeModal', 'badgeModal');
    bindModalClose('closeBadgeModal', 'badgeModal');
    var applyBadgeBtn = document.getElementById('applyBadgeModal');
    if (applyBadgeBtn) applyBadgeBtn.addEventListener('click', function() {
        closeAppModal('badgeModal');
    });

    // 全モーダル共通: 背景クリック・Escで閉じる
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

    var showTaggedOnly = document.getElementById('dailyShowTaggedOnly');
    if (showTaggedOnly) {
        showTaggedOnly.addEventListener('change', filterAndRender);
    }

    loadDailyFilterGroups();
    renderDailyFilterGroups();

    setupDailyModalEvents();

    initDateSelectWithEvents();
    setupSuffixStatsEventListeners();
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
    localStorage.setItem('suffixStatsPanelOpen', suffixStatsPanelOpen);
}

function restoreSuffixStatsPanelState() {
    var saved = localStorage.getItem('suffixStatsPanelOpen');
    if (saved === 'true') {
        suffixStatsPanelOpen = false;
        toggleSuffixStatsPanel();
    }
}

function calculateSuffixStats(data) {
    // 末尾0〜9のデータを集計
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

    // 全体合計の計算
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

    // 合計行
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
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];
    var dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/', '') : 'data';
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
