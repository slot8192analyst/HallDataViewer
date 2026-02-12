// ===================
// 汎用タグ判定エンジン（複数タグ定義対応）
// ===================

var TagEngine = (function() {

    // ========== 定数 ==========

    var STORAGE_KEY = 'customTagDefinitions';
    var ACTIVE_TAG_KEY = 'activeTagId';

    var COLUMNS = [
        { value: '差枚',   label: '差枚',   unit: '枚',  step: 100 },
        { value: 'G数',    label: 'G数',    unit: 'G',   step: 100 },
        { value: '機械割',  label: '機械割',  unit: '%',   step: 0.5 },
        { value: 'BB',     label: 'BB回数',  unit: '回',  step: 1 },
        { value: 'RB',     label: 'RB回数',  unit: '回',  step: 1 },
        { value: 'ART',    label: 'ART回数', unit: '回',  step: 1 }
    ];

    var OPERATORS = [
        { value: 'gte', label: '≧' },
        { value: 'lte', label: '≦' },
        { value: 'gt',  label: '>' },
        { value: 'lt',  label: '<' }
    ];

    var PRESET_COLORS = [
        { value: '#fbbf24', label: '黄' },
        { value: '#f87171', label: '赤' },
        { value: '#60a5fa', label: '青' },
        { value: '#4ade80', label: '緑' },
        { value: '#a855f7', label: '紫' },
        { value: '#fb923c', label: '橙' },
        { value: '#f472b6', label: 'ピンク' },
        { value: '#94a3b8', label: 'グレー' }
    ];

    var PRESETS = {
        suspect: {
            name: '高設定疑惑',
            color: '#f87171',
            icon: '🏷️',
            groups: [
                { conditions: [
                    { column: 'G数',  operator: 'gte', value: 4000 },
                    { column: '差枚', operator: 'gte', value: 3000 }
                ]},
                { conditions: [
                    { column: '差枚', operator: 'gte', value: 7000 }
                ]}
            ]
        },
        notUsed: {
            name: 'やれてない台',
            color: '#60a5fa',
            icon: '💀',
            groups: [
                { conditions: [
                    { column: '差枚', operator: 'gte', value: -3000 },
                    { column: '差枚', operator: 'lt',  value: 0 },
                    { column: 'G数',  operator: 'gte', value: 5000 }
                ]}
            ]
        }
    };

    // ========== 状態 ==========

    var definitions = [];
    var nextDefId = 1;
    var nextGroupId = 1;
    var nextCondId = 1;

    // UIインスタンス管理
    var uiInstances = [];

    // ========== ストレージ ==========

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                definitions: definitions,
                nextDefId: nextDefId,
                nextGroupId: nextGroupId,
                nextCondId: nextCondId
            }));
        } catch (e) {}
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                definitions = parsed.definitions || [];
                nextDefId = parsed.nextDefId || 1;
                nextGroupId = parsed.nextGroupId || 1;
                nextCondId = parsed.nextCondId || 1;
            }
        } catch (e) {}

        // 旧形式からの移行
        migrateFromOldFormat();
    }

    function migrateFromOldFormat() {
        if (definitions.length > 0) return;
        try {
            var old = localStorage.getItem('highSettingTagState');
            if (!old) return;
            var parsed = JSON.parse(old);
            if (!parsed.groups || parsed.groups.length === 0) return;

            var migrated = createDefinition('高設定疑惑', '#fbbf24', '🏷️');
            parsed.groups.forEach(function(og) {
                var group = addGroup(migrated.id);
                if (!group) return;
                group.conditions = [];
                (og.conditions || []).forEach(function(oc) {
                    group.conditions.push({
                        id: nextCondId++,
                        column: oc.column || '差枚',
                        operator: oc.operator || 'gte',
                        value: oc.value !== undefined ? oc.value : ''
                    });
                });
            });
            save();
            console.log('旧高設定タグデータを移行しました');
        } catch (e) {}
    }

    // ========== タグ定義CRUD ==========

    function createDefinition(name, color, icon) {
        var def = {
            id: 'tag_' + nextDefId++,
            name: name || '新しいタグ',
            color: color || PRESET_COLORS[0].value,
            icon: icon || '🏷️',
            groups: []
        };
        definitions.push(def);
        save();
        return def;
    }

    function removeDefinition(defId) {
        definitions = definitions.filter(function(d) { return d.id !== defId; });
        save();
    }

    function getDefinition(defId) {
        return definitions.find(function(d) { return d.id === defId; }) || null;
    }

    function getAll() {
        return definitions;
    }

    function updateDefinition(defId, updates) {
        var def = getDefinition(defId);
        if (!def) return;
        if (updates.name !== undefined) def.name = updates.name;
        if (updates.color !== undefined) def.color = updates.color;
        if (updates.icon !== undefined) def.icon = updates.icon;
        save();
    }

    // ========== グループ・条件操作 ==========

    function addGroup(defId) {
        var def = getDefinition(defId);
        if (!def) return null;
        var group = {
            id: nextGroupId++,
            conditions: [{
                id: nextCondId++,
                column: '差枚',
                operator: 'gte',
                value: ''
            }]
        };
        def.groups.push(group);
        save();
        return group;
    }

    function removeGroup(defId, groupId) {
        var def = getDefinition(defId);
        if (!def) return;
        def.groups = def.groups.filter(function(g) { return g.id !== groupId; });
        save();
    }

    function addCondition(defId, groupId) {
        var def = getDefinition(defId);
        if (!def) return;
        var group = def.groups.find(function(g) { return g.id === groupId; });
        if (!group) return;
        group.conditions.push({
            id: nextCondId++,
            column: '差枚',
            operator: 'gte',
            value: ''
        });
        save();
    }

    function removeCondition(defId, groupId, condId) {
        var def = getDefinition(defId);
        if (!def) return;
        var group = def.groups.find(function(g) { return g.id === groupId; });
        if (!group) return;
        group.conditions = group.conditions.filter(function(c) { return c.id !== condId; });
        if (group.conditions.length === 0) {
            def.groups = def.groups.filter(function(g) { return g.id !== groupId; });
        }
        save();
    }

    function updateCondition(defId, groupId, condId, field, value) {
        var def = getDefinition(defId);
        if (!def) return;
        var group = def.groups.find(function(g) { return g.id === groupId; });
        if (!group) return;
        var cond = group.conditions.find(function(c) { return c.id === condId; });
        if (!cond) return;
        if (field === 'value') {
            cond[field] = value !== '' ? parseFloat(value) : '';
        } else {
            cond[field] = value;
        }
        save();
    }

    // ========== プリセット ==========

    function loadPreset(presetKey) {
        var preset = PRESETS[presetKey];
        if (!preset) return null;
        var def = createDefinition(preset.name, preset.color, preset.icon);
        def.groups = [];
        preset.groups.forEach(function(pg) {
            var group = addGroup(def.id);
            if (!group) return;
            group.conditions = [];
            pg.conditions.forEach(function(pc) {
                group.conditions.push({
                    id: nextCondId++,
                    column: pc.column,
                    operator: pc.operator,
                    value: pc.value
                });
            });
        });
        save();
        return def;
    }

    // ========== 判定ロジック ==========

    function getColumnValue(row, column) {
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

    function evaluateCondition(row, cond) {
        if (!cond.column || !cond.operator || cond.value === '' || cond.value === null || cond.value === undefined) return true;
        var rowVal = getColumnValue(row, cond.column);
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

    /**
     * 特定タグ定義で行を評価
     */
    function evaluate(defId, row) {
        var def = getDefinition(defId);
        if (!def || def.groups.length === 0) return false;

        for (var g = 0; g < def.groups.length; g++) {
            var conditions = def.groups[g].conditions;
            if (conditions.length === 0) continue;
            var groupPass = true;
            for (var c = 0; c < conditions.length; c++) {
                if (!evaluateCondition(row, conditions[c])) {
                    groupPass = false;
                    break;
                }
            }
            if (groupPass && conditions.length > 0) return true;
        }
        return false;
    }

    /**
     * 全タグ定義で行を評価し、マッチしたタグIDの配列を返す
     */
    function evaluateAll(row) {
        var matched = [];
        definitions.forEach(function(def) {
            if (evaluate(def.id, row)) {
                matched.push(def.id);
            }
        });
        return matched;
    }

    /**
     * 特定タグに有効な条件があるか
     */
    function hasActiveConditions(defId) {
        var def = getDefinition(defId);
        if (!def) return false;
        return def.groups.some(function(g) {
            return g.conditions.some(function(c) {
                return c.column && c.operator && c.value !== '' && c.value !== null && c.value !== undefined;
            });
        });
    }

    /**
     * いずれかのタグに有効な条件があるか
     */
    function hasAnyActiveConditions() {
        return definitions.some(function(def) {
            return hasActiveConditions(def.id);
        });
    }

    // ========== UI描画 ==========

    function renderAllUIs() {
        uiInstances.forEach(function(inst) {
            renderUIFor(inst.containerId, inst.options);
        });
    }

    function notifyAllChanged() {
        save();
        uiInstances.forEach(function(inst) {
            if (typeof inst.options.onChange === 'function') inst.options.onChange();
        });
    }

    /**
     * タグ管理UI全体を描画
     */
    function renderUIFor(containerId, options) {
        var container = document.getElementById(containerId);
        if (!container) return;
        options = options || {};

        var html = '';

        if (definitions.length === 0) {
            html += '<div class="tag-defs-empty">タグを追加して条件を設定してください</div>';
        } else {
            definitions.forEach(function(def, di) {
                html += renderTagDefinitionUI(def, di);
            });
        }

        html += '<div class="tag-defs-actions">';
        html += '<button class="btn-small tag-add-def-btn">＋ タグを追加</button>';

        if (options.showPresets !== false) {
            html += '<span class="tag-preset-label">プリセット:</span>';
            Object.keys(PRESETS).forEach(function(key) {
                html += '<button class="preset-btn tag-load-preset-btn" data-preset="' + key + '">' + PRESETS[key].name + '</button>';
            });
        }
        html += '</div>';

        container.innerHTML = html;
        bindUIEvents(containerId, options);
    }

    function renderTagDefinitionUI(def, index) {
        var html = '';

        html += '<div class="tag-def-block" data-def-id="' + def.id + '" style="border-left: 3px solid ' + def.color + ';">';

        html += '<div class="tag-def-header">';
        html += '<div class="tag-def-header-left">';
        html += '<span class="tag-def-icon" data-def-id="' + def.id + '">' + def.icon + '</span>';
        html += '<input type="text" class="tag-def-name-input" data-def-id="' + def.id + '" value="' + escapeAttr(def.name) + '" placeholder="タグ名">';
        html += '<div class="tag-def-color-picker">';
        PRESET_COLORS.forEach(function(pc) {
            var activeClass = def.color === pc.value ? ' active' : '';
            html += '<button class="tag-color-btn' + activeClass + '" data-def-id="' + def.id + '" data-color="' + pc.value + '" style="background: ' + pc.value + ';" title="' + pc.label + '"></button>';
        });
        html += '</div>';
        html += '</div>';
        html += '<button class="tag-def-remove-btn" data-def-id="' + def.id + '" title="タグを削除">🗑️</button>';
        html += '</div>';

        html += '<div class="tag-def-body">';

        if (def.groups.length === 0) {
            html += '<div class="text-muted" style="padding: 8px; text-align: center; font-size: var(--font-size-sm);">条件グループを追加してください</div>';
        } else {
            def.groups.forEach(function(group, gi) {
                if (gi > 0) {
                    html += '<div class="tag-group-or-divider"><span class="tag-group-or-label">OR</span></div>';
                }

                html += '<div class="tag-group" data-def-id="' + def.id + '" data-group-id="' + group.id + '">';
                html += '<div class="tag-group-header">';
                html += '<span class="tag-group-title"><span class="group-number">' + (gi + 1) + '</span>条件グループ</span>';
                html += '<button class="tag-group-remove" data-def-id="' + def.id + '" data-group-id="' + group.id + '" title="グループを削除">✕</button>';
                html += '</div>';
                html += '<div class="tag-group-body">';

                group.conditions.forEach(function(cond, ci) {
                    if (ci > 0) html += '<div class="tag-condition-and-label">AND</div>';
                    html += '<div class="tag-condition-row" data-def-id="' + def.id + '" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '">';

                    html += '<select class="condition-column" data-field="column">';
                    COLUMNS.forEach(function(col) {
                        html += '<option value="' + col.value + '"' + (cond.column === col.value ? ' selected' : '') + '>' + col.label + '</option>';
                    });
                    html += '</select>';

                    html += '<select class="condition-operator" data-field="operator">';
                    OPERATORS.forEach(function(op) {
                        html += '<option value="' + op.value + '"' + (cond.operator === op.value ? ' selected' : '') + '>' + op.label + '</option>';
                    });
                    html += '</select>';

                    var colDef = COLUMNS.find(function(tc) { return tc.value === cond.column; });
                    var step = colDef ? colDef.step : 1;
                    var unit = colDef ? colDef.unit : '';

                    html += '<input type="number" class="condition-value" data-field="value" value="' + (cond.value !== '' && cond.value !== null ? cond.value : '') + '" step="' + step + '" placeholder="値">';
                    html += '<span class="tag-condition-unit">' + unit + '</span>';
                    html += '<button class="tag-condition-remove" data-def-id="' + def.id + '" data-group-id="' + group.id + '" data-condition-id="' + cond.id + '" title="条件を削除">✕</button>';
                    html += '</div>';
                });

                html += '<button class="tag-group-add-condition" data-def-id="' + def.id + '" data-group-id="' + group.id + '">＋ AND条件を追加</button>';
                html += '</div></div>';
            });
        }

        html += '<button class="btn-small tag-add-group-btn" data-def-id="' + def.id + '">＋ ORグループを追加</button>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function escapeAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ========== UIイベント ==========

    function bindUIEvents(containerId, options) {
        var container = document.getElementById(containerId);
        if (!container) return;

        container.querySelectorAll('.tag-add-def-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                createDefinition();
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-load-preset-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                loadPreset(this.dataset.preset);
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-def-remove-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (confirm('このタグを削除しますか？')) {
                    removeDefinition(this.dataset.defId);
                    renderAllUIs();
                    notifyAllChanged();
                }
            });
        });

        container.querySelectorAll('.tag-def-name-input').forEach(function(inp) {
            inp.addEventListener('click', function(e) { e.stopPropagation(); });
            inp.addEventListener('change', function() {
                updateDefinition(this.dataset.defId, { name: this.value.trim() || '新しいタグ' });
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-color-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                updateDefinition(this.dataset.defId, { color: this.dataset.color });
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-add-group-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                addGroup(this.dataset.defId);
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-group-remove').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeGroup(this.dataset.defId, parseInt(this.dataset.groupId));
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-group-add-condition').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                addCondition(this.dataset.defId, parseInt(this.dataset.groupId));
                renderAllUIs();
            });
        });

        container.querySelectorAll('.tag-condition-remove').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                removeCondition(this.dataset.defId, parseInt(this.dataset.groupId), parseInt(this.dataset.conditionId));
                renderAllUIs();
                notifyAllChanged();
            });
        });

        container.querySelectorAll('.tag-condition-row select, .tag-condition-row input').forEach(function(el) {
            var handler = function() {
                var row = el.closest('.tag-condition-row');
                if (!row) return;
                updateCondition(
                    row.dataset.defId,
                    parseInt(row.dataset.groupId),
                    parseInt(row.dataset.conditionId),
                    el.dataset.field,
                    el.value
                );
                if (el.dataset.field === 'column') renderAllUIs();
                notifyAllChanged();
            };
            el.addEventListener('change', handler);
            if (el.tagName === 'INPUT') {
                el.addEventListener('input', handler);
            }
        });
    }

    // ========== UI登録 ==========

    function registerUI(containerId, options) {
        options = options || {};
        var existing = uiInstances.find(function(i) { return i.containerId === containerId; });
        if (!existing) {
            uiInstances.push({ containerId: containerId, options: options });
        } else {
            existing.options = options;
        }
        renderUIFor(containerId, options);
    }

    // ========== 初期化 ==========

    function init() {
        load();
    }

    // ========== 公開API ==========

    return {
        init: init,

        COLUMNS: COLUMNS,
        OPERATORS: OPERATORS,
        PRESET_COLORS: PRESET_COLORS,
        PRESETS: PRESETS,

        create: createDefinition,
        remove: removeDefinition,
        get: getDefinition,
        getAll: getAll,
        update: updateDefinition,

        addGroup: addGroup,
        removeGroup: removeGroup,
        addCondition: addCondition,
        removeCondition: removeCondition,
        updateCondition: updateCondition,

        loadPreset: loadPreset,

        evaluate: evaluate,
        evaluateAll: evaluateAll,
        hasActiveConditions: hasActiveConditions,
        hasAnyActiveConditions: hasAnyActiveConditions,
        getColumnValue: getColumnValue,

        registerUI: registerUI,
        renderAllUIs: renderAllUIs,
        notifyAllChanged: notifyAllChanged,

        save: save,
        load: load
    };
})();

// ===================
// 後方互換性のためのラッパー関数
// ===================

function evaluateHighSettingTag(row) {
    var matched = TagEngine.evaluateAll(row);
    return matched.length > 0;
}

function hasActiveTagConditions() {
    return TagEngine.hasAnyActiveConditions();
}

function initTagUI() {
    TagEngine.init();
    TagEngine.registerUI('tagGroupsList', {
        onChange: function() {
            if (typeof hasCompareData === 'function' && hasCompareData()) renderCompare();
        },
        showPresets: true,
        context: 'compare'
    });
}

function initDailyTagUI() {
    TagEngine.init();
    TagEngine.registerUI('dailyTagGroupsList', {
        onChange: function() {
            if (typeof filterAndRender === 'function') filterAndRender();
        },
        showPresets: true,
        context: 'daily'
    });

    var showTaggedOnly = document.getElementById('dailyShowTaggedOnly');
    if (showTaggedOnly) {
        showTaggedOnly.addEventListener('change', function() {
            if (typeof filterAndRender === 'function') filterAndRender();
        });
    }
}

function saveTagState() {
    TagEngine.save();
}

function loadTagState() {
    TagEngine.load();
}
