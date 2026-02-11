// ===================
// 高設定タグ判定エンジン
// ===================

var highSettingTagState = {
    groups: [],
    nextGroupId: 1,
    nextConditionId: 1
};

var TAG_COLUMNS = [
    { value: '差枚',   label: '差枚',   unit: '枚',  step: 100 },
    { value: 'G数',    label: 'G数',    unit: 'G',   step: 100 },
    { value: '機械割',  label: '機械割',  unit: '%',   step: 0.5 },
    { value: 'BB',     label: 'BB回数',  unit: '回',  step: 1 },
    { value: 'RB',     label: 'RB回数',  unit: '回',  step: 1 },
    { value: 'ART',    label: 'ART回数', unit: '回',  step: 1 }
];

var TAG_OPERATORS = [
    { value: 'gte', label: '≧' },
    { value: 'lte', label: '≦' },
    { value: 'gt',  label: '>' },
    { value: 'lt',  label: '<' }
];

var TAG_PRESETS = {
    suspect: {
        name: '高設定疑惑',
        groups: [
            { conditions: [
                { column: 'G数',  operator: 'gte', value: 4000 },
                { column: '差枚', operator: 'gte', value: 3000 }
            ]},
            { conditions: [
                { column: '差枚', operator: 'gte', value: 7000 }
            ]}
        ]
    }
};

// 登録されたUIインスタンス（タブごと）
var tagUIInstances = [];

// ========== 判定ロジック ==========

function evaluateHighSettingTag(row) {
    var groups = highSettingTagState.groups;
    if (groups.length === 0) return false;

    for (var g = 0; g < groups.length; g++) {
        var conditions = groups[g].conditions;
        if (conditions.length === 0) continue;
        var groupPass = true;
        for (var c = 0; c < conditions.length; c++) {
            var cond = conditions[c];
            if (!cond.column || !cond.operator || cond.value === '' || cond.value === null || cond.value === undefined) continue;
            if (!evaluateCondition(row, cond)) { groupPass = false; break; }
        }
        if (groupPass && conditions.length > 0) return true;
    }
    return false;
}

function evaluateCondition(row, cond) {
    var rowVal = getTagColumnValue(row, cond.column);
    if (rowVal === null) return false;
    var threshold = parseFloat(cond.value);
    if (isNaN(threshold)) return false;
    switch (cond.operator) {
        case 'gte': return rowVal >= threshold;
        case 'lte': return rowVal <= threshold;
        case 'gt':  return rowVal > threshold;
        case 'lt':  return rowVal < threshold;
        default:    return false;
    }
}

function getTagColumnValue(row, column) {
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

function hasActiveTagConditions() {
    return highSettingTagState.groups.some(function(g) {
        return g.conditions.some(function(c) {
            return c.column && c.operator && c.value !== '' && c.value !== null && c.value !== undefined;
        });
    });
}

// ========== 状態管理 ==========

function addTagGroup() {
    var group = {
        id: highSettingTagState.nextGroupId++,
        conditions: [{
            id: highSettingTagState.nextConditionId++,
            column: '差枚', operator: 'gte', value: ''
        }]
    };
    highSettingTagState.groups.push(group);
    return group;
}

function removeTagGroup(groupId) {
    highSettingTagState.groups = highSettingTagState.groups.filter(function(g) { return g.id !== groupId; });
}

function addTagCondition(groupId) {
    var group = highSettingTagState.groups.find(function(g) { return g.id === groupId; });
    if (!group) return;
    group.conditions.push({
        id: highSettingTagState.nextConditionId++,
        column: '差枚', operator: 'gte', value: ''
    });
}

function removeTagCondition(groupId, conditionId) {
    var group = highSettingTagState.groups.find(function(g) { return g.id === groupId; });
    if (!group) return;
    group.conditions = group.conditions.filter(function(c) { return c.id !== conditionId; });
    if (group.conditions.length === 0) removeTagGroup(groupId);
}

function clearAllTagGroups() {
    highSettingTagState.groups = [];
    highSettingTagState.nextGroupId = 1;
    highSettingTagState.nextConditionId = 1;
}

function loadTagPreset(presetKey) {
    var preset = TAG_PRESETS[presetKey];
    if (!preset) return;
    clearAllTagGroups();
    preset.groups.forEach(function(pg) {
        var group = addTagGroup();
        group.conditions = [];
        pg.conditions.forEach(function(pc) {
            group.conditions.push({
                id: highSettingTagState.nextConditionId++,
                column: pc.column, operator: pc.operator, value: pc.value
            });
        });
    });
}

// ========== LocalStorage ==========

function saveTagState() {
    try {
        localStorage.setItem('highSettingTagState', JSON.stringify(highSettingTagState));
    } catch (e) {}
}

function loadTagState() {
    try {
        var saved = localStorage.getItem('highSettingTagState');
        if (saved) {
            var parsed = JSON.parse(saved);
            highSettingTagState.groups = parsed.groups || [];
            highSettingTagState.nextGroupId = parsed.nextGroupId || 1;
            highSettingTagState.nextConditionId = parsed.nextConditionId || 1;
        }
    } catch (e) {}
}

// ========== 全UIインスタンスの同期描画 ==========

function renderAllTagUIs() {
    tagUIInstances.forEach(function(inst) {
        renderTagGroupsUIFor(inst.containerId, inst.onChange);
    });
}

function notifyAllTagChanged() {
    saveTagState();
    tagUIInstances.forEach(function(inst) {
        if (typeof inst.onChange === 'function') inst.onChange();
    });
}

// ========== UI描画（汎用・コンテナID指定） ==========

function renderTagGroupsUIFor(containerId, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var groups = highSettingTagState.groups;

    if (groups.length === 0) {
        container.innerHTML = '<div class="text-muted" style="padding: 10px; text-align: center; font-size: var(--font-size-sm);">条件グループを追加してください</div>';
        return;
    }

    var html = '';
    groups.forEach(function(group, gi) {
        if (gi > 0) {
            html += '<div class="tag-group-or-divider"><span class="tag-group-or-label">OR</span></div>';
        }
        html += '<div class="tag-group" data-group-id="' + group.id + '">';
        html += '<div class="tag-group-header">';
        html += '<span class="tag-group-title"><span class="group-number">' + (gi + 1) + '</span>条件グループ</span>';
        html += '<button class="tag-group-remove" data-group-id="' + group.id + '" title="グループを削除">✕</button>';
        html += '</div>';
        html += '<div class="tag-group-body">';

        group.conditions.forEach(function(cond, ci) {
            if (ci > 0) html += '<div class="tag-condition-and-label">AND</div>';
            html += '<div class="tag-condition-row" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '">';
            html += '<select class="condition-column" data-field="column">';
            TAG_COLUMNS.forEach(function(col) {
                html += '<option value="' + col.value + '"' + (cond.column === col.value ? ' selected' : '') + '>' + col.label + '</option>';
            });
            html += '</select>';
            html += '<select class="condition-operator" data-field="operator">';
            TAG_OPERATORS.forEach(function(op) {
                html += '<option value="' + op.value + '"' + (cond.operator === op.value ? ' selected' : '') + '>' + op.label + '</option>';
            });
            html += '</select>';
            var colDef = TAG_COLUMNS.find(function(tc) { return tc.value === cond.column; });
            var step = colDef ? colDef.step : 1;
            var unit = colDef ? colDef.unit : '';
            html += '<input type="number" class="condition-value" data-field="value" value="' + (cond.value !== '' && cond.value !== null ? cond.value : '') + '" step="' + step + '" placeholder="値">';
            html += '<span class="tag-condition-unit">' + unit + '</span>';
            html += '<button class="tag-condition-remove" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '" title="条件を削除">✕</button>';
            html += '</div>';
        });

        html += '<button class="tag-group-add-condition" data-group-id="' + group.id + '">＋ AND条件を追加</button>';
        html += '</div></div>';
    });

    container.innerHTML = html;
    bindTagGroupEventsFor(containerId, onChange);
}

function bindTagGroupEventsFor(containerId, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.tag-group-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
            removeTagGroup(parseInt(this.dataset.groupId));
            renderAllTagUIs();
            notifyAllTagChanged();
        });
    });

    container.querySelectorAll('.tag-condition-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
            removeTagCondition(parseInt(this.dataset.groupId), parseInt(this.dataset.conditionId));
            renderAllTagUIs();
            notifyAllTagChanged();
        });
    });

    container.querySelectorAll('.tag-group-add-condition').forEach(function(btn) {
        btn.addEventListener('click', function() {
            addTagCondition(parseInt(this.dataset.groupId));
            renderAllTagUIs();
        });
    });

    container.querySelectorAll('.tag-condition-row select, .tag-condition-row input').forEach(function(el) {
        el.addEventListener('change', function() {
            syncTagConditionFromUIFor(containerId, this);
            if (this.dataset.field === 'column') renderAllTagUIs();
            notifyAllTagChanged();
        });
        if (el.tagName === 'INPUT') {
            el.addEventListener('input', function() {
                syncTagConditionFromUIFor(containerId, this);
                notifyAllTagChanged();
            });
        }
    });
}

function syncTagConditionFromUIFor(containerId, el) {
    var row = el.closest('.tag-condition-row');
    if (!row) return;
    var groupId = parseInt(row.dataset.groupId);
    var condId = parseInt(row.dataset.conditionId);
    var field = el.dataset.field;
    var group = highSettingTagState.groups.find(function(g) { return g.id === groupId; });
    if (!group) return;
    var cond = group.conditions.find(function(c) { return c.id === condId; });
    if (!cond) return;
    if (field === 'value') {
        cond[field] = el.value !== '' ? parseFloat(el.value) : '';
    } else {
        cond[field] = el.value;
    }
}

// ========== 初期化（タブごとにUIインスタンスを登録） ==========

// 比較タブ用（従来互換）
function initTagUI() {
    loadTagState();
    registerTagUI('tagGroupsList', 'addTagGroup', function() {
        if (typeof hasCompareData === 'function' && hasCompareData()) renderCompare();
    });
    // プリセットボタン（比較タブ）
    document.querySelectorAll('#compareFilterContent .preset-btn[data-preset]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            loadTagPreset(this.dataset.preset);
            renderAllTagUIs();
            notifyAllTagChanged();
        });
    });
}

// 日別タブ用
function initDailyTagUI() {
    loadTagState();
    registerTagUI('dailyTagGroupsList', 'dailyAddTagGroup', function() {
        if (typeof filterAndRender === 'function') filterAndRender();
    });
    // プリセットボタン（日別タブ）
    document.querySelectorAll('#filterContent .preset-btn[data-preset][data-context="daily"]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            loadTagPreset(this.dataset.preset);
            renderAllTagUIs();
            notifyAllTagChanged();
        });
    });
    // 高設定のみ表示チェック
    var showHighOnly = document.getElementById('dailyShowHighSettingOnly');
    if (showHighOnly) {
        showHighOnly.addEventListener('change', function() {
            if (typeof filterAndRender === 'function') filterAndRender();
        });
    }
}

function registerTagUI(containerId, addBtnId, onChange) {
    // 重複登録防止
    var existing = tagUIInstances.find(function(i) { return i.containerId === containerId; });
    if (!existing) {
        tagUIInstances.push({ containerId: containerId, onChange: onChange });
    }

    renderTagGroupsUIFor(containerId, onChange);

    var addBtn = document.getElementById(addBtnId);
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            addTagGroup();
            renderAllTagUIs();
            notifyAllTagChanged();
        });
    }
}

// 条件変更時の外部コールバック（後方互換）
var onTagConditionsChanged = function() {};
