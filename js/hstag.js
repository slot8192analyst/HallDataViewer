// ===================
// 高設定タグ判定エンジン
// ===================
// グループ内: AND（すべて満たす）
// グループ間: OR（いずれか満たす）
//
// 例: (差枚>=1000 AND G数>=3000) OR (差枚>=3000)

var highSettingTagState = {
    groups: [],    // [ { conditions: [ {column, operator, value}, ... ] }, ... ]
    nextGroupId: 1,
    nextConditionId: 1
};

// ========== 条件の選択肢 ==========

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

// ========== プリセット定義 ==========

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

// ========== 判定ロジック ==========

// 1台のデータが高設定タグに該当するか判定
function evaluateHighSettingTag(row) {
    var groups = highSettingTagState.groups;
    if (groups.length === 0) return false;

    // グループ間はOR: いずれかのグループを満たせばtrue
    for (var g = 0; g < groups.length; g++) {
        var conditions = groups[g].conditions;
        if (conditions.length === 0) continue;

        var groupPass = true;

        // グループ内はAND: すべての条件を満たす必要がある
        for (var c = 0; c < conditions.length; c++) {
            var cond = conditions[c];
            if (!cond.column || !cond.operator || cond.value === '' || cond.value === null || cond.value === undefined) {
                continue; // 未入力の条件はスキップ
            }
            if (!evaluateCondition(row, cond)) {
                groupPass = false;
                break;
            }
        }

        if (groupPass && conditions.length > 0) return true;
    }

    return false;
}

// 単一条件の判定
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

// データ行から数値を取得
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

// データ配列全体にタグを付与（元データを変更せずフラグを返す）
function applyHighSettingTags(dataArray) {
    return dataArray.map(function(row) {
        return {
            row: row,
            isHighSetting: evaluateHighSettingTag(row)
        };
    });
}

// ========== 状態管理 ==========

function addTagGroup() {
    var group = {
        id: highSettingTagState.nextGroupId++,
        conditions: []
    };
    // 新規グループにはデフォルト条件1つ追加
    group.conditions.push({
        id: highSettingTagState.nextConditionId++,
        column: '差枚',
        operator: 'gte',
        value: ''
    });
    highSettingTagState.groups.push(group);
    return group;
}

function removeTagGroup(groupId) {
    highSettingTagState.groups = highSettingTagState.groups.filter(function(g) {
        return g.id !== groupId;
    });
}

function addTagCondition(groupId) {
    var group = highSettingTagState.groups.find(function(g) { return g.id === groupId; });
    if (!group) return;

    group.conditions.push({
        id: highSettingTagState.nextConditionId++,
        column: '差枚',
        operator: 'gte',
        value: ''
    });
}

function removeTagCondition(groupId, conditionId) {
    var group = highSettingTagState.groups.find(function(g) { return g.id === groupId; });
    if (!group) return;

    group.conditions = group.conditions.filter(function(c) {
        return c.id !== conditionId;
    });

    // 条件が0になったらグループごと削除
    if (group.conditions.length === 0) {
        removeTagGroup(groupId);
    }
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
        // デフォルト条件を削除して置き換え
        group.conditions = [];
        pg.conditions.forEach(function(pc) {
            group.conditions.push({
                id: highSettingTagState.nextConditionId++,
                column: pc.column,
                operator: pc.operator,
                value: pc.value
            });
        });
    });
}

// 有効な条件が1つでもあるか
function hasActiveTagConditions() {
    return highSettingTagState.groups.some(function(g) {
        return g.conditions.some(function(c) {
            return c.column && c.operator && c.value !== '' && c.value !== null && c.value !== undefined;
        });
    });
}

// 条件のテキスト要約を生成
function getTagConditionsSummary() {
    if (!hasActiveTagConditions()) return '';

    return highSettingTagState.groups.map(function(g, gi) {
        var condTexts = g.conditions.map(function(c) {
            if (!c.column || !c.operator || c.value === '' || c.value === null) return '';
            var colDef = TAG_COLUMNS.find(function(tc) { return tc.value === c.column; });
            var opDef = TAG_OPERATORS.find(function(to) { return to.value === c.operator; });
            var label = colDef ? colDef.label : c.column;
            var op = opDef ? opDef.label : c.operator;
            var unit = colDef ? colDef.unit : '';
            return label + op + c.value + unit;
        }).filter(function(t) { return t; });

        return condTexts.join(' AND ');
    }).filter(function(t) { return t; }).join(' OR ');
}

// ========== UI描画 ==========

function renderTagGroupsUI() {
    var container = document.getElementById('tagGroupsList');
    if (!container) return;

    var groups = highSettingTagState.groups;

    if (groups.length === 0) {
        container.innerHTML = '<div class="text-muted" style="padding: 10px; text-align: center; font-size: var(--font-size-sm);">条件グループを追加してください</div>';
        return;
    }

    var html = '';

    groups.forEach(function(group, gi) {
        // OR区切り（2グループ目以降）
        if (gi > 0) {
            html += '<div class="tag-group-or-divider"><span class="tag-group-or-label">OR</span></div>';
        }

        html += '<div class="tag-group" data-group-id="' + group.id + '">';

        // グループヘッダー
        html += '<div class="tag-group-header">';
        html += '<span class="tag-group-title"><span class="group-number">' + (gi + 1) + '</span>条件グループ</span>';
        html += '<button class="tag-group-remove" data-group-id="' + group.id + '" title="グループを削除">✕</button>';
        html += '</div>';

        // グループ本体
        html += '<div class="tag-group-body">';

        group.conditions.forEach(function(cond, ci) {
            // AND区切り（2条件目以降）
            if (ci > 0) {
                html += '<div class="tag-condition-and-label">AND</div>';
            }

            html += '<div class="tag-condition-row" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '">';

            // 列選択
            html += '<select class="condition-column" data-field="column">';
            TAG_COLUMNS.forEach(function(col) {
                var sel = cond.column === col.value ? ' selected' : '';
                html += '<option value="' + col.value + '"' + sel + '>' + col.label + '</option>';
            });
            html += '</select>';

            // 演算子
            html += '<select class="condition-operator" data-field="operator">';
            TAG_OPERATORS.forEach(function(op) {
                var sel = cond.operator === op.value ? ' selected' : '';
                html += '<option value="' + op.value + '"' + sel + '>' + op.label + '</option>';
            });
            html += '</select>';

            // 値
            var colDef = TAG_COLUMNS.find(function(tc) { return tc.value === cond.column; });
            var step = colDef ? colDef.step : 1;
            var unit = colDef ? colDef.unit : '';
            html += '<input type="number" class="condition-value" data-field="value" value="' + (cond.value !== '' && cond.value !== null ? cond.value : '') + '" step="' + step + '" placeholder="値">';
            html += '<span class="tag-condition-unit">' + unit + '</span>';

            // 削除ボタン
            html += '<button class="tag-condition-remove" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '" title="条件を削除">✕</button>';

            html += '</div>';
        });

        // 条件追加ボタン
        html += '<button class="tag-group-add-condition" data-group-id="' + group.id + '">＋ AND条件を追加</button>';

        html += '</div>'; // group-body
        html += '</div>'; // tag-group
    });

    container.innerHTML = html;

    // イベントバインド
    bindTagGroupEvents();
}

function bindTagGroupEvents() {
    // グループ削除
    document.querySelectorAll('.tag-group-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var groupId = parseInt(this.dataset.groupId);
            removeTagGroup(groupId);
            renderTagGroupsUI();
            onTagConditionsChanged();
        });
    });

    // 条件削除
    document.querySelectorAll('.tag-condition-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var groupId = parseInt(this.dataset.groupId);
            var condId = parseInt(this.dataset.conditionId);
            removeTagCondition(groupId, condId);
            renderTagGroupsUI();
            onTagConditionsChanged();
        });
    });

    // AND条件追加
    document.querySelectorAll('.tag-group-add-condition').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var groupId = parseInt(this.dataset.groupId);
            addTagCondition(groupId);
            renderTagGroupsUI();
        });
    });

    // 値変更の監視
    document.querySelectorAll('.tag-condition-row select, .tag-condition-row input').forEach(function(el) {
        el.addEventListener('change', function() {
            syncTagConditionFromUI(this);
            // 列が変わったらunit表示を更新
            if (this.dataset.field === 'column') {
                renderTagGroupsUI();
            }
            onTagConditionsChanged();
        });
        if (el.tagName === 'INPUT') {
            el.addEventListener('input', function() {
                syncTagConditionFromUI(this);
                onTagConditionsChanged();
            });
        }
    });
}

// UI → state の同期
function syncTagConditionFromUI(el) {
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

// 条件変更時のコールバック（compare.jsからオーバーライド可能）
var onTagConditionsChanged = function() {};

// LocalStorageへ保存/復元
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

// ========== 初期化 ==========

function initTagUI() {
    // 保存状態を復元
    loadTagState();

    // UIを描画
    renderTagGroupsUI();

    // グループ追加ボタン
    var addBtn = document.getElementById('addTagGroup');
    if (addBtn) {
        addBtn.addEventListener('click', function() {
            addTagGroup();
            renderTagGroupsUI();
            onTagConditionsChanged();
        });
    }

    // プリセットボタン
    document.querySelectorAll('.preset-btn[data-preset]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var presetKey = this.dataset.preset;
            loadTagPreset(presetKey);
            renderTagGroupsUI();
            onTagConditionsChanged();
        });
    });

    // クリアボタン（もしあれば）
    var clearBtn = document.getElementById('clearTagConditions');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            clearAllTagGroups();
            renderTagGroupsUI();
            onTagConditionsChanged();
        });
    }
}
