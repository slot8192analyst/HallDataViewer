// ===================
// 機種内バッジシステム
// タコだし（高差枚）1,2,3位 / 凹み（低差枚）1,2,3位
// フィルター後の表示データに対して機種内順位を付与
// ===================

var MachineBadge = (function() {

    // ========== 設定 ==========

    // バッジの有効/無効をlocalStorageで管理
    var STORAGE_KEY_ENABLED   = 'machineBadgeEnabled';
    var STORAGE_KEY_TARGET     = 'machineBadgeTarget';   // 'diff'=差枚 or 'games'=G数
    var STORAGE_KEY_SHOW_TAKO  = 'machineBadgeShowTako'; // タコだし表示
    var STORAGE_KEY_SHOW_KUBI  = 'machineBadgeShowKubi'; // 凹み表示

    var enabled   = true;
    var target    = 'diff';   // 'diff' | 'games'
    var showTako  = true;
    var showKubi  = true;
    var topN      = 3;        // 上位・下位何位まで

    // ========== ストレージ ==========

    function loadSettings() {
        try {
            enabled  = localStorage.getItem(STORAGE_KEY_ENABLED)  !== 'false';
            target   = localStorage.getItem(STORAGE_KEY_TARGET)   || 'diff';
            showTako = localStorage.getItem(STORAGE_KEY_SHOW_TAKO) !== 'false';
            showKubi = localStorage.getItem(STORAGE_KEY_SHOW_KUBI) !== 'false';
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_ENABLED,   enabled);
            localStorage.setItem(STORAGE_KEY_TARGET,    target);
            localStorage.setItem(STORAGE_KEY_SHOW_TAKO, showTako);
            localStorage.setItem(STORAGE_KEY_SHOW_KUBI, showKubi);
        } catch (e) {}
    }

    // ========== コアロジック ==========

    /**
     * rows: 同じ機種の行データ配列 [{台番号, 差枚, G数, ...}, ...]
     * targetCol: 順位付けに使う列名（'差枚' or 'G数'）
     * 戻り値: { '台番号_キー': { tako: 1|2|3|null, kubi: 1|2|3|null } }
     */
    function calcRanks(rows, targetCol) {
        if (!rows || rows.length === 0) return {};

        // 数値パース
        var parsed = rows.map(function(row) {
            var raw = row[targetCol] !== undefined ? row[targetCol] : row['差枚'];
            var num = parseInt(String(raw || '0').replace(/,/g, '')) || 0;
            return { key: row['機種名'] + '_' + row['台番号'], num: num, row: row };
        });

        // 値が全て同じ場合は順位付けしない
        var vals = parsed.map(function(p) { return p.num; });
        var allSame = vals.every(function(v) { return v === vals[0]; });

        var result = {};
        parsed.forEach(function(p) { result[p.key] = { tako: null, kubi: null }; });

        if (allSame) return result;

        // タコだし: 降順ソートして上位topN
        if (showTako) {
            var sorted_desc = parsed.slice().sort(function(a, b) { return b.num - a.num; });
            var takoRank = 0;
            var lastVal  = null;
            sorted_desc.forEach(function(item, i) {
                if (item.num !== lastVal) {
                    takoRank = i + 1;
                    lastVal  = item.num;
                }
                if (takoRank <= topN) result[item.key].tako = takoRank;
            });
        }

        // 凹み: 昇順ソートして上位topN（最も差枚が低い）
        if (showKubi) {
            var sorted_asc = parsed.slice().sort(function(a, b) { return a.num - b.num; });
            var kubiRank = 0;
            var lastKVal = null;
            sorted_asc.forEach(function(item, i) {
                if (item.num !== lastKVal) {
                    kubiRank = i + 1;
                    lastKVal = item.num;
                }
                if (kubiRank <= topN) result[item.key].kubi = kubiRank;
            });
        }

        return result;
    }

    /**
     * データ配列全体に機種内順位バッジ情報を付与する（日別タブ用）
     * data: フィルター適用済みの全行
     * targetCol: '差枚' or 'G数'
     * 戻り値: 各行に _machineBadge: { tako, kubi } が追加されたデータ
     */
    function assignBadges(data, targetCol) {
        if (!enabled || !data || data.length === 0) return data;
        var col = targetCol || target || '差枚';

        // 機種ごとにグループ化
        var machineGroups = {};
        data.forEach(function(row) {
            var machine = row['機種名'] || '';
            if (!machineGroups[machine]) machineGroups[machine] = [];
            machineGroups[machine].push(row);
        });

        // 機種ごとに順位計算
        var allRanks = {};
        Object.keys(machineGroups).forEach(function(machine) {
            var rows  = machineGroups[machine];
            var ranks = calcRanks(rows, col);
            Object.assign(allRanks, ranks);
        });

        // 行に付与
        return data.map(function(row) {
            var key = row['機種名'] + '_' + row['台番号'];
            var badge = allRanks[key] || { tako: null, kubi: null };
            return Object.assign({}, row, { _machineBadge: badge });
        });
    }

    /**
     * トレンドタブ用: aggregated結果（{machine, num, total}配列）の機種内順位付与
     * 同じmachineを持つ行の中でtotalで順位付け
     */
    function assignBadgesForTrend(results, targetProp) {
        if (!enabled || !results || results.length === 0) return results;
        var prop = targetProp || 'total';

        var machineGroups = {};
        results.forEach(function(row) {
            var machine = row.machine || '';
            if (!machineGroups[machine]) machineGroups[machine] = [];
            machineGroups[machine].push(row);
        });

        var allRanks = {};
        Object.keys(machineGroups).forEach(function(machine) {
            var rows = machineGroups[machine];
            // trendのrowは {machine, num, total, avg, ...}
            var parsed = rows.map(function(r) {
                var num = (typeof r[prop] === 'number' && !isNaN(r[prop])) ? r[prop] : 0;
                return { key: machine + '_' + r.num, num: num };
            });

            var vals = parsed.map(function(p) { return p.num; });
            var allSame = vals.length > 1 && vals.every(function(v) { return v === vals[0]; });

            parsed.forEach(function(p) {
                allRanks[p.key] = { tako: null, kubi: null };
            });

            if (allSame || parsed.length < 2) return;

            if (showTako) {
                var sd = parsed.slice().sort(function(a, b) { return b.num - a.num; });
                var tr = 0, lv = null;
                sd.forEach(function(item, i) {
                    if (item.num !== lv) { tr = i + 1; lv = item.num; }
                    if (tr <= topN) allRanks[item.key].tako = tr;
                });
            }

            if (showKubi) {
                var sa = parsed.slice().sort(function(a, b) { return a.num - b.num; });
                var kr = 0, lkv = null;
                sa.forEach(function(item, i) {
                    if (item.num !== lkv) { kr = i + 1; lkv = item.num; }
                    if (kr <= topN) allRanks[item.key].kubi = kr;
                });
            }
        });

        return results.map(function(row) {
            var key = row.machine + '_' + row.num;
            var badge = allRanks[key] || { tako: null, kubi: null };
            return Object.assign({}, row, { _machineBadge: badge });
        });
    }

    // ========== HTML描画 ==========

    /**
     * バッジHTMLを返す（コンパクト版）
     * badge: { tako: 1|2|3|null, kubi: 1|2|3|null }
     */
    function renderBadgeHtml(badge) {
        if (!badge) return '<td class="mb-cell">-</td>';
        var inner = renderBadgeInner(badge);
        return '<td class="mb-cell">' + inner + '</td>';
    }

    /**
     * バッジ内側のHTMLのみ（tdなし）
     */
    function renderBadgeInner(badge) {
        if (!badge) return '-';
        var html = '';
        if (badge.tako !== null && showTako) {
            html += '<span class="mb-tako mb-tako-' + badge.tako + '" title="🐙 タコだし ' + badge.tako + '位（機種内）">🐙' + badge.tako + '</span>';
        }
        if (badge.kubi !== null && showKubi) {
            html += '<span class="mb-kubi mb-kubi-' + badge.kubi + '" title="凹み ' + badge.kubi + '位（機種内）">凹' + badge.kubi + '</span>';
        }
        if (!html) {
            html = '<span class="mb-none">-</span>';
        }
        return html;
    }

    // ========== 設定UI ==========

    /**
     * 設定ツールチップHTML（フィルターパネルに差し込む用）
     */
    function renderSettingsHtml(idPrefix) {
        idPrefix = idPrefix || 'mb';
        return '<div class="mb-settings">'
            + '<label class="mb-settings-toggle">'
            + '<input type="checkbox" id="' + idPrefix + 'Enabled"' + (enabled ? ' checked' : '') + '>'
            + '<span>🐙凹バッジ表示</span>'
            + '</label>'
            + '<label class="mb-settings-item">'
            + '<input type="checkbox" id="' + idPrefix + 'ShowTako"' + (showTako ? ' checked' : '') + '>'
            + '<span>🐙タコだし</span>'
            + '</label>'
            + '<label class="mb-settings-item">'
            + '<input type="checkbox" id="' + idPrefix + 'ShowKubi"' + (showKubi ? ' checked' : '') + '>'
            + '<span>凹み</span>'
            + '</label>'
            + '<div class="mb-settings-item">'
            + '<span>順位基準:</span>'
            + '<select id="' + idPrefix + 'Target" class="mb-target-select">'
            + '<option value="diff"' + (target === 'diff' ? ' selected' : '') + '>差枚</option>'
            + '<option value="games"' + (target === 'games' ? ' selected' : '') + '>G数</option>'
            + '</select>'
            + '</div>'
            + '</div>';
    }

    /**
     * 設定UIのイベントを設定する
     * onChange: 設定変更時に呼ぶコールバック
     */
    function setupSettingsEvents(idPrefix, onChange) {
        idPrefix = idPrefix || 'mb';

        var enEl = document.getElementById(idPrefix + 'Enabled');
        var takoEl = document.getElementById(idPrefix + 'ShowTako');
        var kubiEl = document.getElementById(idPrefix + 'ShowKubi');
        var targetEl = document.getElementById(idPrefix + 'Target');

        function update() {
            if (enEl)    enabled  = enEl.checked;
            if (takoEl)  showTako = takoEl.checked;
            if (kubiEl)  showKubi = kubiEl.checked;
            if (targetEl) target  = targetEl.value;
            saveSettings();
            if (onChange) onChange();
        }

        if (enEl)    enEl.addEventListener('change', update);
        if (takoEl)  takoEl.addEventListener('change', update);
        if (kubiEl)  kubiEl.addEventListener('change', update);
        if (targetEl) targetEl.addEventListener('change', update);
    }

    // ========== ゲッター ==========

    function isEnabled()   { return enabled;  }
    function getTarget()   { return target;   }
    function isShowTako()  { return showTako; }
    function isShowKubi()  { return showKubi; }
    function getTopN()     { return topN;     }

    function getTargetColumn() {
        return target === 'games' ? 'G数' : '差枚';
    }

    // ========== 初期化 ==========

    loadSettings();

    // ========== 公開API ==========
    return {
        loadSettings:           loadSettings,
        saveSettings:           saveSettings,
        assignBadges:           assignBadges,
        assignBadgesForTrend:   assignBadgesForTrend,
        renderBadgeHtml:        renderBadgeHtml,
        renderBadgeInner:       renderBadgeInner,
        renderSettingsHtml:     renderSettingsHtml,
        setupSettingsEvents:    setupSettingsEvents,
        isEnabled:              isEnabled,
        getTarget:              getTarget,
        getTargetColumn:        getTargetColumn,
        isShowTako:             isShowTako,
        isShowKubi:             isShowKubi,
        getTopN:                getTopN
    };
})();
