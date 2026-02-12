// ===================
// タグマッチングタブ
// ===================

var TagMatch = (function() {

    // グループ構造: groups = [ { id, rules: [ { id, dateFile, conditionType, ... } ] } ]
    var groups = [];
    var results = [];
    var initialized = false;
    var lastRuleResults = [];
    var lastGroupMap = [];
    var machineFilterSelect = null;

    var idCounter = 0;

    function generateId(prefix) {
        idCounter++;
        return prefix + '_' + idCounter + '_' + Date.now();
    }

    // ===================
    // 条件タイプ定義
    // ===================

    var CONDITION_TYPES = [
        { value: 'tag', label: '🏷️ タグ', group: 'タグ' },
        { value: 'sa', label: '差枚', group: '数値', column: '差枚', unit: '枚', type: 'int' },
        { value: 'game', label: 'G数', group: '数値', column: 'G数', unit: 'G', type: 'int' },
        { value: 'rate', label: '機械割', group: '数値', column: '機械割', unit: '%', type: 'float' },
        { value: 'bb', label: 'BB', group: '数値', column: 'BB', unit: '回', type: 'int' },
        { value: 'rb', label: 'RB', group: '数値', column: 'RB', unit: '回', type: 'int' },
        { value: 'art', label: 'ART', group: '数値', column: 'ART', unit: '回', type: 'int' },
        { value: 'suffix', label: '台番号末尾', group: '台番号', unit: '', type: 'suffix' },
        { value: 'position', label: '📍 位置', group: '位置', type: 'position' }
    ];

    var OPERATORS = [
        { value: 'gte', label: '以上' },
        { value: 'lte', label: '以下' },
        { value: 'gt', label: 'より大きい' },
        { value: 'lt', label: 'より小さい' },
        { value: 'eq', label: '等しい' },
        { value: 'neq', label: '等しくない' }
    ];

    var SUFFIX_OPERATORS = [
        { value: 'eq', label: '等しい' },
        { value: 'neq', label: '等しくない' }
    ];

    var POSITION_OPERATORS = [
        { value: 'has', label: 'を含む' },
        { value: 'not_has', label: 'を含まない' }
    ];

    // ===================
    // 選択肢取得
    // ===================

    function getTagOptions() {
        if (typeof TagEngine === 'undefined') return [];
        var allDefs = TagEngine.getAll();
        return allDefs.map(function(def) {
            return {
                id: def.id,
                name: def.name,
                icon: def.icon || '🏷️',
                color: def.color || '#8b5cf6'
            };
        });
    }

    function getDateOptions() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        return sortedFiles.map(function(file) {
            var formattedDate = formatDate(file);
            var dayOfWeek = getDayOfWeekName(getDayOfWeek(file));
            var dateKey = getDateKeyFromFilename(file);
            var eventText = dateKey ? getEventTextForDateSelect(dateKey) : '';
            return {
                value: file,
                label: formattedDate + '（' + dayOfWeek + '）' + eventText
            };
        });
    }

    function getPositionOptions() {
        return getAllPositionTags().map(function(tag) {
            return {
                value: tag.value,
                label: (tag.icon ? tag.icon + ' ' : '') + tag.label,
                color: tag.color
            };
        });
    }

    // ===================
    // 機種フィルター
    // ===================

    function initMachineFilter() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var latestFile = sortedFiles[0];
        var machineOptions = getMachineOptionsForDate(latestFile);

        if (machineFilterSelect) {
            machineFilterSelect.updateOptions(machineOptions);
        } else {
            machineFilterSelect = initMultiSelectMachineFilter(
                'tmMachineFilterContainer', machineOptions, '全機種', null
            );
        }
    }

    // ===================
    // デフォルトルール生成
    // ===================

    function createDefaultRule() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var defaultDate = sortedFiles.length > 0 ? sortedFiles[0] : '';
        var tagOptions = getTagOptions();
        var defaultTag = tagOptions.length > 0 ? tagOptions[0].id : '';
        var posOptions = getPositionOptions();
        var defaultPosition = posOptions.length > 0 ? posOptions[0].value : '';

        return {
            id: generateId('rule'),
            dateFile: defaultDate,
            conditionType: 'tag',
            tagId: defaultTag,
            negate: false,
            operator: 'gte',
            value: '',
            positionValue: defaultPosition,
            positionOperator: 'has'
        };
    }

    // ===================
    // グループ操作
    // ===================

    function addGroup() {
        groups.push({
            id: generateId('group'),
            rules: [createDefaultRule()]
        });
        renderAll();
    }

    function removeGroup(groupId) {
        groups = groups.filter(function(g) { return g.id !== groupId; });
        renderAll();
    }

    function addRuleToGroup(groupId) {
        var group = groups.find(function(g) { return g.id === groupId; });
        if (!group) return;
        group.rules.push(createDefaultRule());
        renderAll();
    }

    function removeRuleFromGroup(groupId, ruleId) {
        var group = groups.find(function(g) { return g.id === groupId; });
        if (!group) return;
        group.rules = group.rules.filter(function(r) { return r.id !== ruleId; });
        if (group.rules.length === 0) {
            groups = groups.filter(function(g) { return g.id !== groupId; });
        }
        renderAll();
    }

    function updateRule(ruleId, field, value) {
        for (var gi = 0; gi < groups.length; gi++) {
            var rule = groups[gi].rules.find(function(r) { return r.id === ruleId; });
            if (!rule) continue;

            if (field === 'negate') {
                rule[field] = value === true || value === 'true';
            } else if (field === 'conditionType') {
                rule.conditionType = value;
                if (value === 'suffix') {
                    rule.operator = 'eq';
                    rule.value = '';
                } else if (value === 'position') {
                    rule.positionOperator = 'has';
                    var posOpts = getPositionOptions();
                    if (posOpts.length > 0 && !rule.positionValue) {
                        rule.positionValue = posOpts[0].value;
                    }
                } else if (value !== 'tag') {
                    rule.operator = 'gte';
                }
                renderAll();
                return;
            } else {
                rule[field] = value;
            }
            return;
        }
    }

    function clearAll() {
        groups = [];
        results = [];
        lastRuleResults = [];
        lastGroupMap = [];
        renderAll();
        hideResults();
    }

    // ===================
    // 描画
    // ===================

    function renderAll() {
        var container = document.getElementById('tmRulesList');
        if (!container) return;

        if (groups.length === 0) {
            container.innerHTML = '<div class="tagmatch-rules-empty">条件グループを追加してマッチングを開始してください</div>';
            return;
        }

        var dateOptions = getDateOptions();
        var tagOptions = getTagOptions();
        var posOptions = getPositionOptions();

        var html = '';

        groups.forEach(function(group, gi) {
            // OR区切り
            if (gi > 0) {
                html += '<div class="tag-group-or-divider">';
                html += '<span class="tag-group-or-label">OR</span>';
                html += '</div>';
            }

            html += '<div class="tag-group" data-group-id="' + group.id + '">';

            // グループヘッダー
            html += '<div class="tag-group-header">';
            html += '<span class="tag-group-title">';
            html += '<span class="group-number">' + (gi + 1) + '</span>';
            html += ' グループ ' + (gi + 1);
            html += '<span style="font-size:11px; color:var(--text-muted); margin-left:8px;">(AND結合)</span>';
            html += '</span>';
            html += '<button class="tag-group-remove" data-group-id="' + group.id + '" title="グループを削除">×</button>';
            html += '</div>';

            // グループ本体
            html += '<div class="tag-group-body">';

            group.rules.forEach(function(rule, ri) {
                if (ri > 0) {
                    html += '<div class="tag-condition-and-label">AND</div>';
                }

                html += '<div class="tagmatch-rule" data-rule-id="' + rule.id + '" data-group-id="' + group.id + '">';
                html += '<div class="tagmatch-rule-body">';

                // 日付
                html += '<div class="tagmatch-rule-field">';
                html += '<label>日付</label>';
                html += '<select class="tm-rule-date" data-rule-id="' + rule.id + '">';
                dateOptions.forEach(function(opt) {
                    var selected = opt.value === rule.dateFile ? ' selected' : '';
                    html += '<option value="' + opt.value + '"' + selected + '>' + opt.label + '</option>';
                });
                html += '</select>';
                html += '</div>';

                // 条件タイプ
                html += '<div class="tagmatch-rule-field">';
                html += '<label>条件タイプ</label>';
                html += '<select class="tm-rule-condtype" data-rule-id="' + rule.id + '">';
                var currentCatGroup = '';
                CONDITION_TYPES.forEach(function(ct) {
                    if (ct.group !== currentCatGroup) {
                        if (currentCatGroup !== '') html += '</optgroup>';
                        html += '<optgroup label="' + ct.group + '">';
                        currentCatGroup = ct.group;
                    }
                    var selected = ct.value === rule.conditionType ? ' selected' : '';
                    html += '<option value="' + ct.value + '"' + selected + '>' + ct.label + '</option>';
                });
                if (currentCatGroup !== '') html += '</optgroup>';
                html += '</select>';
                html += '</div>';

                // 条件タイプ別フィールド
                if (rule.conditionType === 'tag') {
                    html += renderTagFields(rule, tagOptions);
                } else if (rule.conditionType === 'suffix') {
                    html += renderSuffixFields(rule);
                } else if (rule.conditionType === 'position') {
                    html += renderPositionFields(rule, posOptions);
                } else {
                    html += renderNumericFields(rule);
                }

                html += '</div>'; // .tagmatch-rule-body

                // 条件削除ボタン
                html += '<button class="tag-condition-remove" data-rule-id="' + rule.id + '" data-group-id="' + group.id + '" title="条件を削除">×</button>';

                html += '</div>'; // .tagmatch-rule
            });

            // AND条件追加ボタン
            html += '<button class="tag-group-add-condition" data-group-id="' + group.id + '">＋ AND条件を追加</button>';

            html += '</div>'; // .tag-group-body
            html += '</div>'; // .tag-group
        });

        container.innerHTML = html;
        setupAllEventListeners(container);
    }

    function renderTagFields(rule, tagOptions) {
        var html = '';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>タグ</label>';
        html += '<select class="tm-rule-tag" data-rule-id="' + rule.id + '">';
        if (tagOptions.length === 0) {
            html += '<option value="">タグが未定義です</option>';
        } else {
            tagOptions.forEach(function(tag) {
                var selected = tag.id === rule.tagId ? ' selected' : '';
                html += '<option value="' + tag.id + '"' + selected + '>' + tag.icon + ' ' + escapeHtml(tag.name) + '</option>';
            });
        }
        html += '</select>';
        html += '</div>';

        html += '<div class="tagmatch-rule-field tagmatch-rule-negate">';
        html += '<label class="column-checkbox-item">';
        html += '<input type="checkbox" class="tm-rule-negate" data-rule-id="' + rule.id + '"' + (rule.negate ? ' checked' : '') + '>';
        html += '<span>除外</span>';
        html += '</label>';
        html += '</div>';

        return html;
    }

    function renderNumericFields(rule) {
        var html = '';
        var condDef = CONDITION_TYPES.find(function(ct) { return ct.value === rule.conditionType; });
        var step = condDef && condDef.type === 'float' ? ' step="0.1"' : '';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>演算子</label>';
        html += '<select class="tm-rule-operator" data-rule-id="' + rule.id + '">';
        OPERATORS.forEach(function(op) {
            var selected = op.value === rule.operator ? ' selected' : '';
            html += '<option value="' + op.value + '"' + selected + '>' + op.label + '</option>';
        });
        html += '</select>';
        html += '</div>';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>値' + (condDef && condDef.unit ? '（' + condDef.unit + '）' : '') + '</label>';
        html += '<div class="tagmatch-value-input-wrap">';
        html += '<input type="number" class="tm-rule-value" data-rule-id="' + rule.id + '" value="' + (rule.value || '') + '" placeholder="値を入力"' + step + '>';
        if (condDef && condDef.unit) {
            html += '<span class="tagmatch-value-unit">' + condDef.unit + '</span>';
        }
        html += '</div>';
        html += '</div>';

        return html;
    }

    function renderSuffixFields(rule) {
        var html = '';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>演算子</label>';
        html += '<select class="tm-rule-operator" data-rule-id="' + rule.id + '">';
        SUFFIX_OPERATORS.forEach(function(op) {
            var selected = op.value === rule.operator ? ' selected' : '';
            html += '<option value="' + op.value + '"' + selected + '>' + op.label + '</option>';
        });
        html += '</select>';
        html += '</div>';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>末尾</label>';
        html += '<select class="tm-rule-value" data-rule-id="' + rule.id + '">';
        html += '<option value="">選択...</option>';
        for (var s = 0; s <= 9; s++) {
            var selected = String(rule.value) === String(s) ? ' selected' : '';
            html += '<option value="' + s + '"' + selected + '>' + s + '</option>';
        }
        html += '</select>';
        html += '</div>';

        return html;
    }

    function renderPositionFields(rule, posOptions) {
        var html = '';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>条件</label>';
        html += '<select class="tm-rule-pos-operator" data-rule-id="' + rule.id + '">';
        POSITION_OPERATORS.forEach(function(op) {
            var selected = op.value === rule.positionOperator ? ' selected' : '';
            html += '<option value="' + op.value + '"' + selected + '>' + op.label + '</option>';
        });
        html += '</select>';
        html += '</div>';

        html += '<div class="tagmatch-rule-field">';
        html += '<label>位置</label>';
        html += '<div class="tagmatch-position-buttons" data-rule-id="' + rule.id + '">';
        posOptions.forEach(function(pos) {
            var isActive = rule.positionValue === pos.value;
            var style = isActive
                ? 'background:' + pos.color + '; border-color:' + pos.color + '; color:#fff;'
                : 'border-color:' + pos.color + '60;';
            html += '<button type="button" class="tm-pos-btn position-filter-btn' + (isActive ? ' active' : '') + '" ';
            html += 'data-rule-id="' + rule.id + '" data-position="' + pos.value + '" ';
            html += 'style="' + style + '">';
            html += pos.label;
            html += '</button>';
        });
        html += '</div>';
        html += '</div>';

        return html;
    }

    // ===================
    // イベントリスナー設定
    // ===================

    function setupAllEventListeners(container) {
        container.querySelectorAll('.tag-group-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                removeGroup(this.dataset.groupId);
            });
        });

        container.querySelectorAll('.tag-group-add-condition').forEach(function(btn) {
            btn.addEventListener('click', function() {
                addRuleToGroup(this.dataset.groupId);
            });
        });

        container.querySelectorAll('.tag-condition-remove').forEach(function(btn) {
            btn.addEventListener('click', function() {
                removeRuleFromGroup(this.dataset.groupId, this.dataset.ruleId);
            });
        });

        container.querySelectorAll('.tm-rule-date').forEach(function(sel) {
            sel.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'dateFile', this.value);
            });
        });

        container.querySelectorAll('.tm-rule-condtype').forEach(function(sel) {
            sel.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'conditionType', this.value);
            });
        });

        container.querySelectorAll('.tm-rule-tag').forEach(function(sel) {
            sel.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'tagId', this.value);
            });
        });

        container.querySelectorAll('.tm-rule-negate').forEach(function(cb) {
            cb.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'negate', this.checked);
            });
        });

        container.querySelectorAll('.tm-rule-operator').forEach(function(sel) {
            sel.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'operator', this.value);
            });
        });

        container.querySelectorAll('.tm-rule-value').forEach(function(el) {
            var eventName = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(eventName, function() {
                updateRule(this.dataset.ruleId, 'value', this.value);
            });
        });

        container.querySelectorAll('.tm-rule-pos-operator').forEach(function(sel) {
            sel.addEventListener('change', function() {
                updateRule(this.dataset.ruleId, 'positionOperator', this.value);
            });
        });

        container.querySelectorAll('.tm-pos-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var ruleId = this.dataset.ruleId;
                var posValue = this.dataset.position;
                updateRule(ruleId, 'positionValue', posValue);

                var wrap = this.closest('.tagmatch-position-buttons');
                if (wrap) {
                    wrap.querySelectorAll('.tm-pos-btn').forEach(function(b) {
                        var posInfo = getPositionOptions().find(function(p) { return p.value === b.dataset.position; });
                        if (b.dataset.position === posValue) {
                            b.classList.add('active');
                            b.style.background = posInfo ? posInfo.color : '';
                            b.style.borderColor = posInfo ? posInfo.color : '';
                            b.style.color = '#fff';
                        } else {
                            b.classList.remove('active');
                            b.style.background = '';
                            b.style.borderColor = posInfo ? posInfo.color + '60' : '';
                            b.style.color = '';
                        }
                    });
                }
            });
        });
    }

    // ===================
    // 行評価
    // ===================

    function getRowNumericValue(row, conditionType) {
        var condDef = CONDITION_TYPES.find(function(ct) { return ct.value === conditionType; });
        if (!condDef) return null;

        if (conditionType === 'suffix') {
            var numOnly = (row['台番号'] || '').replace(/\D/g, '');
            if (numOnly.length === 0) return null;
            return parseInt(numOnly.slice(-1));
        }

        if (conditionType === 'rate') {
            var rate = row['機械割'];
            return (rate !== null && rate !== undefined && !isNaN(rate)) ? rate : null;
        }

        var column = condDef.column;
        var raw = row[column];
        if (raw === undefined || raw === null || raw === '') return null;
        var str = String(raw).replace(/,/g, '');
        var num = parseFloat(str);
        return isNaN(num) ? null : num;
    }

    function evaluateNumericCondition(rowValue, operator, targetValue) {
        if (rowValue === null) return false;
        var target = parseFloat(targetValue);
        if (isNaN(target)) return false;

        switch (operator) {
            case 'gte': return rowValue >= target;
            case 'lte': return rowValue <= target;
            case 'gt':  return rowValue > target;
            case 'lt':  return rowValue < target;
            case 'eq':  return rowValue === target;
            case 'neq': return rowValue !== target;
            default: return false;
        }
    }

    function evaluateRule(rule, row) {
        if (rule.conditionType === 'tag') {
            var matchedTags = TagEngine.evaluateAll(row);
            var hasTag = matchedTags.indexOf(rule.tagId) !== -1;
            return rule.negate ? !hasTag : hasTag;
        }

        if (rule.conditionType === 'position') {
            var unitNum = row['台番号'] || '';
            var tags = getPositionTags(unitNum);
            var hasPosition = tags.indexOf(rule.positionValue) !== -1;
            return rule.positionOperator === 'has' ? hasPosition : !hasPosition;
        }

        if (rule.value === '' || rule.value === null || rule.value === undefined) return true;
        var rowValue = getRowNumericValue(row, rule.conditionType);
        return evaluateNumericCondition(rowValue, rule.operator, rule.value);
    }

    // ===================
    // バリデーション
    // ===================

    function validateRule(rule, ruleLabel) {
        if (rule.conditionType === 'tag') {
            var tagOptions = getTagOptions();
            if (tagOptions.length === 0) {
                showCopyToast(ruleLabel + ': タグが定義されていません', true);
                return false;
            }
            if (!rule.tagId) {
                showCopyToast(ruleLabel + ': タグを選択してください', true);
                return false;
            }
        } else if (rule.conditionType === 'suffix') {
            if (rule.value === '' || rule.value === null || rule.value === undefined) {
                showCopyToast(ruleLabel + ': 末尾の値を選択してください', true);
                return false;
            }
        } else if (rule.conditionType === 'position') {
            if (!rule.positionValue) {
                showCopyToast(ruleLabel + ': 位置を選択してください', true);
                return false;
            }
        } else {
            if (rule.value === '' || rule.value === null || rule.value === undefined) {
                showCopyToast(ruleLabel + ': 値を入力してください', true);
                return false;
            }
        }
        return true;
    }

    // ===================
    // マッチング実行
    // ===================

    async function execute() {
        if (groups.length === 0) {
            showCopyToast('条件グループを1つ以上追加してください', true);
            return;
        }

        // バリデーション
        for (var gi = 0; gi < groups.length; gi++) {
            for (var ri = 0; ri < groups[gi].rules.length; ri++) {
                var label = 'グループ' + (gi + 1) + ' 条件' + (ri + 1);
                if (!validateRule(groups[gi].rules[ri], label)) return;
            }
        }

        var selectedMachines = machineFilterSelect ? machineFilterSelect.getSelectedValues() : [];

        // 各ルールを個別に評価
        var allRuleResults = [];
        var groupMapForResults = []; // groupIndex, ruleIndexInGroup

        for (var gi2 = 0; gi2 < groups.length; gi2++) {
            for (var ri2 = 0; ri2 < groups[gi2].rules.length; ri2++) {
                var rule = groups[gi2].rules[ri2];

                var data = await loadCSV(rule.dateFile);
                if (!data || data.length === 0) {
                    showCopyToast('グループ' + (gi2 + 1) + ' 条件' + (ri2 + 1) + ': データがありません', true);
                    return;
                }

                data = addMechanicalRateToData(data);

                var matchedUnits = new Set();

                data.forEach(function(row) {
                    var unitNum = row['台番号'];
                    if (!unitNum) return;
                    if (selectedMachines.length > 0 && selectedMachines.indexOf(row['機種名']) === -1) return;
                    if (evaluateRule(rule, row)) {
                        matchedUnits.add(unitNum);
                    }
                });

                allRuleResults.push({
                    rule: rule,
                    units: matchedUnits,
                    dateLabel: formatDate(rule.dateFile),
                    data: data,
                    groupIndex: gi2,
                    ruleIndex: ri2
                });

                groupMapForResults.push({ groupIndex: gi2, ruleIndex: ri2 });
            }
        }

        // グループ内AND → グループ間OR
        var groupMatchedUnits = [];

        groups.forEach(function(group, gIdx) {
            var groupRules = allRuleResults.filter(function(rr) { return rr.groupIndex === gIdx; });
            if (groupRules.length === 0) return;

            var groupUnits = new Set(groupRules[0].units);
            for (var k = 1; k < groupRules.length; k++) {
                var nextUnits = groupRules[k].units;
                groupUnits = new Set(Array.from(groupUnits).filter(function(u) {
                    return nextUnits.has(u);
                }));
            }

            groupMatchedUnits.push(groupUnits);
        });

        // グループ間OR
        var finalUnits = new Set();
        groupMatchedUnits.forEach(function(gUnits) {
            gUnits.forEach(function(u) { finalUnits.add(u); });
        });

        // 結果構築
        var unitDataMap = {};

        allRuleResults.forEach(function(rr) {
            if (!rr.data) return;
            rr.data.forEach(function(row) {
                var unitNum = row['台番号'];
                if (!unitNum || !finalUnits.has(unitNum)) return;
                if (selectedMachines.length > 0 && selectedMachines.indexOf(row['機種名']) === -1) return;

                if (!unitDataMap[unitNum]) {
                    unitDataMap[unitNum] = {
                        unitNum: unitNum,
                        machine: row['機種名'] || '',
                        ruleMatches: [],
                        groupMatches: [],
                        matchGroupCount: 0
                    };
                }
                if (row['機種名']) {
                    unitDataMap[unitNum].machine = row['機種名'];
                }
            });
        });

        Object.keys(unitDataMap).forEach(function(unitNum) {
            var entry = unitDataMap[unitNum];

            // ルール単位のマッチ
            allRuleResults.forEach(function(rr) {
                entry.ruleMatches.push(rr.units.has(unitNum));
            });

            // グループ単位のマッチ
            var matchGroupCount = 0;
            groupMatchedUnits.forEach(function(gUnits) {
                var matched = gUnits.has(unitNum);
                entry.groupMatches.push(matched);
                if (matched) matchGroupCount++;
            });
            entry.matchGroupCount = matchGroupCount;
        });

        results = Object.values(unitDataMap);
        lastRuleResults = allRuleResults;
        lastGroupMap = groupMapForResults;

        renderResults();
    }

    // ===================
    // 条件ラベル
    // ===================

    function getRuleLabel(rule) {
        if (rule.conditionType === 'tag') {
            var tagOptions = getTagOptions();
            var tag = tagOptions.find(function(t) { return t.id === rule.tagId; });
            var tagName = tag ? tag.icon + ' ' + tag.name : '(不明)';
            return tagName + (rule.negate ? '（除外）' : '');
        }

        if (rule.conditionType === 'position') {
            var posOptions = getPositionOptions();
            var pos = posOptions.find(function(p) { return p.value === rule.positionValue; });
            var posLabel = pos ? pos.label : rule.positionValue;
            var opDef = POSITION_OPERATORS.find(function(o) { return o.value === rule.positionOperator; });
            var opLabel = opDef ? opDef.label : rule.positionOperator;
            return '📍' + posLabel + ' ' + opLabel;
        }

        var condDef = CONDITION_TYPES.find(function(ct) { return ct.value === rule.conditionType; });
        var label = condDef ? condDef.label : rule.conditionType;

        if (rule.conditionType === 'suffix') {
            var opDef2 = SUFFIX_OPERATORS.find(function(o) { return o.value === rule.operator; });
            var opLabel2 = opDef2 ? opDef2.label : rule.operator;
            return label + ' ' + opLabel2 + ' ' + rule.value;
        }

        var opDef3 = OPERATORS.find(function(o) { return o.value === rule.operator; });
        var opLabel3 = opDef3 ? opDef3.label : rule.operator;
        var unit = condDef && condDef.unit ? condDef.unit : '';
        return label + ' ' + rule.value + unit + ' ' + opLabel3;
    }

    // ===================
    // 結果描画
    // ===================

    function renderResults() {
        var summarySection = document.getElementById('tmSummary');
        var resultSection = document.getElementById('tmResultSection');

        if (results.length === 0) {
            summarySection.style.display = 'block';
            document.getElementById('tmSummaryCards').innerHTML =
                '<div class="compare-summary-card">' +
                '<div class="compare-card-label">結果</div>' +
                '<div class="compare-card-value" style="color: var(--text-muted);">該当台なし</div>' +
                '</div>';
            resultSection.style.display = 'none';
            return;
        }

        var machineSet = new Set();
        results.forEach(function(r) { if (r.machine) machineSet.add(r.machine); });
        var allGroupMatchCount = results.filter(function(r) { return r.matchGroupCount === groups.length; }).length;

        var totalRules = 0;
        groups.forEach(function(g) { totalRules += g.rules.length; });

        var summaryHtml = '';
        summaryHtml += '<div class="compare-summary-card card-a"><div class="compare-card-label">該当台数</div><div class="compare-card-value">' + results.length + '台</div></div>';
        summaryHtml += '<div class="compare-summary-card card-b"><div class="compare-card-label">該当機種数</div><div class="compare-card-value">' + machineSet.size + '機種</div></div>';

        if (groups.length > 1) {
            summaryHtml += '<div class="compare-summary-card card-improved"><div class="compare-card-label">全グループマッチ</div><div class="compare-card-value">' + allGroupMatchCount + '台</div></div>';
        }

        summaryHtml += '<div class="compare-summary-card card-diff"><div class="compare-card-label">条件構成</div><div class="compare-card-value">' + groups.length + 'グループ / ' + totalRules + '条件</div></div>';

        document.getElementById('tmSummaryCards').innerHTML = summaryHtml;
        summarySection.style.display = 'block';

        sortResults();
        renderResultTable();
        resultSection.style.display = 'block';
    }

    function sortResults() {
        var sortBy = document.getElementById('tmSortBy') ? document.getElementById('tmSortBy').value : 'match_desc';

        switch (sortBy) {
            case 'match_desc':
                results.sort(function(a, b) {
                    if (b.matchGroupCount !== a.matchGroupCount) return b.matchGroupCount - a.matchGroupCount;
                    return HallData.sort.compareJapanese(a.machine, b.machine);
                });
                break;
            case 'unit_asc':
                results.sort(function(a, b) {
                    return HallData.sort.extractUnitNumber(a.unitNum) - HallData.sort.extractUnitNumber(b.unitNum);
                });
                break;
            case 'unit_desc':
                results.sort(function(a, b) {
                    return HallData.sort.extractUnitNumber(b.unitNum) - HallData.sort.extractUnitNumber(a.unitNum);
                });
                break;
            case 'machine_asc':
                results.sort(function(a, b) {
                    var cmp = HallData.sort.compareJapanese(a.machine, b.machine);
                    if (cmp !== 0) return cmp;
                    return HallData.sort.extractUnitNumber(a.unitNum) - HallData.sort.extractUnitNumber(b.unitNum);
                });
                break;
        }
    }

    function renderResultTable() {
        var table = document.getElementById('tmResultTable');
        if (!table) return;

        var thead = table.querySelector('thead');
        var tbody = table.querySelector('tbody');

        // ヘッダー: グループ単位で列を作成
        var headerHtml = '<tr><th>台番号</th><th>機種名</th><th>位置</th>';

        groups.forEach(function(group, gi) {
            var ruleLabels = group.rules.map(function(rule) {
                var dateShort = formatDateShort(rule.dateFile);
                return dateShort + ' ' + getRuleLabel(rule);
            });

            var headerTitle = 'G' + (gi + 1) + ': ' + ruleLabels.join(' AND ');
            var shortLabel = ruleLabels.length <= 2
                ? ruleLabels.join(' & ')
                : ruleLabels[0] + ' & 他' + (ruleLabels.length - 1) + '件';

            headerHtml += '<th title="' + escapeHtml(headerTitle) + '">';
            headerHtml += '<div style="font-size:10px; color:var(--color-info);">G' + (gi + 1) + '</div>';
            headerHtml += '<div style="font-size:11px;">' + escapeHtml(shortLabel) + '</div>';
            headerHtml += '</th>';
        });

        if (groups.length > 1) {
            headerHtml += '<th>マッチ<br>グループ</th>';
        }

        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;

        // ボディ
        var bodyHtml = '';

        results.forEach(function(row) {
            bodyHtml += '<tr>';
            bodyHtml += '<td style="text-align:left; font-weight:bold;">' + escapeHtml(row.unitNum) + '</td>';
            bodyHtml += '<td style="text-align:left;">' + escapeHtml(row.machine) + '</td>';

            var posHtml = renderPositionTags(row.unitNum, { compact: true });
            bodyHtml += '<td style="text-align:center;">' + (posHtml || '-') + '</td>';

            row.groupMatches.forEach(function(matched) {
                if (matched) {
                    bodyHtml += '<td style="text-align:center;"><span class="plus" style="font-size:1.2em;">✓</span></td>';
                } else {
                    bodyHtml += '<td style="text-align:center;"><span class="text-muted">-</span></td>';
                }
            });

            if (groups.length > 1) {
                var countClass = row.matchGroupCount === groups.length ? 'plus' : row.matchGroupCount > 0 ? '' : 'text-muted';
                bodyHtml += '<td style="text-align:center;" class="' + countClass + '">' + row.matchGroupCount + '/' + groups.length + '</td>';
            }

            bodyHtml += '</tr>';
        });

        tbody.innerHTML = bodyHtml;
    }

    function hideResults() {
        var summarySection = document.getElementById('tmSummary');
        var resultSection = document.getElementById('tmResultSection');
        if (summarySection) summarySection.style.display = 'none';
        if (resultSection) resultSection.style.display = 'none';
    }

    // ===================
    // コピー・ダウンロード
    // ===================

    function getResultTableData() {
        var table = document.getElementById('tmResultTable');
        if (!table) return { headers: [], rows: [] };

        var thead = table.querySelector('thead');
        var tbody = table.querySelector('tbody');

        var hdrs = [];
        thead.querySelectorAll('th').forEach(function(cell) {
            hdrs.push(cell.textContent.trim().replace(/\n/g, ' '));
        });

        var rows = [];
        tbody.querySelectorAll('tr').forEach(function(row) {
            var rowData = [];
            row.querySelectorAll('td').forEach(function(cell) {
                rowData.push(cell.textContent.trim());
            });
            if (rowData.length > 0) rows.push(rowData);
        });

        return { headers: hdrs, rows: rows };
    }

    function copyResults() {
        var data = getResultTableData();
        var btn = document.getElementById('tmCopyBtn');
        copyToClipboard(data, btn);
    }

        function copySimpleResults() {
        if (results.length === 0) {
            showCopyToast('コピーするデータがありません', true);
            return;
        }

        var data = {
            headers: ['台番号', '機種名'],
            rows: results.map(function(r) {
                return [r.unitNum, r.machine];
            })
        };

        var btn = document.getElementById('tmCopySimpleBtn');
        copyToClipboard(data, btn);
    }


    function downloadResults() {
        var data = getResultTableData();
        if (data.rows.length === 0) {
            showCopyToast('ダウンロードするデータがありません', true);
            return;
        }
        downloadAsCSV(data, 'tagmatch_result.csv');
    }

    // ===================
    // ヘルパー
    // ===================

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ===================
    // 初期化
    // ===================

    function setupGlobalEventListeners() {
        document.getElementById('tmAddGroup').addEventListener('click', function() {
            addGroup();
        });

        document.getElementById('tmClearRules').addEventListener('click', function() {
            clearAll();
        });

        document.getElementById('tmExecute').addEventListener('click', function() {
            execute();
        });

        document.getElementById('tmCopyBtn').addEventListener('click', function() {
            copyResults();
        });

        document.getElementById('tmDownloadBtn').addEventListener('click', function() {
            downloadResults();
        });

        document.getElementById('tmSortBy').addEventListener('change', function() {
            if (results.length > 0) {
                sortResults();
                renderResultTable();
            }
        });

                document.getElementById('tmCopySimpleBtn').addEventListener('click', function() {
            copySimpleResults();
        });
    }

    function init() {
        if (initialized) return;
        setupGlobalEventListeners();
        initMachineFilter();
        initialized = true;
    }

    return {
        init: init,
        addGroup: addGroup,
        execute: execute
    };

})();

function setupTagMatchEventListeners() {
    TagMatch.init();
}
