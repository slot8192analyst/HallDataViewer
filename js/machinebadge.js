// ===================
// 機種内バッジシステム
// タコだし（高差枚）🐙1,2,3位 / 死に台（低差枚）💀1,2,3位
//
// 【計算ベース】
//   日別タブ: 表示中の日を含む過去7日間の累積差枚（機種内・フィルター後）
//   トレンドタブ: 選択期間の合計値（既存の動作と同じ）
//
// 【変更点】
//   バッジ表示・🐙タコだし・💀死に台 のチェックボックスは廃止。
//   これらは常にオン（true）固定。非表示にしたい場合は表示列で
//   「機種内順位」のチェックを外す運用とする。
// ===================

var MachineBadge = (function() {

    // ========== 設定 ==========

    var STORAGE_KEY_TARGET    = 'machineBadgeTarget';    // 'diff'=差枚 or 'games'=G数
    var STORAGE_KEY_DAYS      = 'machineBadgeDays';      // 累積日数
    var STORAGE_KEY_BASE      = 'machineBadgeBase';      // 'current'=当日基準 / 'prev'=前日基準

    var enabled   = true;       // 常にオン（チェックボックス廃止）
    var target    = 'diff';     // 'diff' | 'games'
    var showTako  = true;       // 常にオン（チェックボックス廃止）
    var showKubi  = true;       // 常にオン（チェックボックス廃止）
    var badgeDays = 7;          // 過去何日分累積するか
    var badgeBase = 'current';  // 'current'=当日含む / 'prev'=前日から遡る
    var topN      = 3;          // 上位・下位何位まで

    // ========== ストレージ ==========

    function loadSettings() {
        try {
            // バッジ表示・タコだし・死に台は常にオン（チェックボックスを廃止したため）
            enabled  = true;
            showTako = true;
            showKubi = true;

            target = localStorage.getItem(STORAGE_KEY_TARGET) || 'diff';

            var d = parseInt(localStorage.getItem(STORAGE_KEY_DAYS));
            if (!isNaN(d) && d >= 1 && d <= 30) badgeDays = d;

            var b = localStorage.getItem(STORAGE_KEY_BASE);
            if (b === 'prev' || b === 'current') badgeBase = b;
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_TARGET, target);
            localStorage.setItem(STORAGE_KEY_DAYS,   badgeDays);
            localStorage.setItem(STORAGE_KEY_BASE,   badgeBase);
        } catch (e) {}
    }

    // ========== 7日累積計算 ==========

    /**
     * currentFile: 今表示中のファイル名（例: "data/2026_05_27.csv"）
     * dataCache: グローバルの dataCache オブジェクト
     * targetCol: '差枚' or 'G数'
     * 戻り値: { '機種名_台番号': 累積値, ... }
     */
    function calcCumulativeValues(currentFile, dataCacheRef, targetCol) {
        var col = targetCol || '差枚';

        var allSorted = sortFilesByDate(CSV_FILES, true); // 新しい順
        var currentIdx = allSorted.indexOf(currentFile);
        if (currentIdx === -1) return {};

        // 基準モードに応じてウィンドウ開始位置を決定
        //   current : 当日含む → [currentIdx, currentIdx+badgeDays)
        //   prev    : 前日基準 → [currentIdx+1, currentIdx+1+badgeDays)
        var startIdx = (badgeBase === 'prev') ? currentIdx + 1 : currentIdx;
        var windowFiles = allSorted.slice(startIdx, startIdx + badgeDays);

        var cumulative = {}; // key: '機種名_台番号' → 累積値

        windowFiles.forEach(function(file) {
            var rows = dataCacheRef[file];
            if (!rows) return;
            rows.forEach(function(row) {
                var machine = row['機種名'] || '';
                var num     = row['台番号'] || '';
                var key     = machine + '_' + num;
                var raw     = row[col] !== undefined ? row[col] : '0';
                var val     = parseInt(String(raw).replace(/,/g, '')) || 0;
                if (cumulative[key] === undefined) cumulative[key] = 0;
                cumulative[key] += val;
            });
        });

        return { values: cumulative, windowFiles: windowFiles };
    }

    // ========== コアランク計算 ==========

    /**
     * items: [{ key, num }, ...]  ← num は累積値
     * 戻り値: { key: { tako, kubi } }
     */
    function calcRanksFromItems(items) {
        var result = {};
        items.forEach(function(p) { result[p.key] = { tako: null, kubi: null }; });

        if (items.length < 2) return result;

        var vals = items.map(function(p) { return p.num; });
        var allSame = vals.every(function(v) { return v === vals[0]; });
        if (allSame) return result;

        // タコだし: 降順
        if (showTako) {
            var sd = items.slice().sort(function(a, b) { return b.num - a.num; });
            var tr = 0, lv = null;
            sd.forEach(function(item, i) {
                if (item.num !== lv) { tr = i + 1; lv = item.num; }
                if (tr <= topN) result[item.key].tako = tr;
            });
        }

        // 💀死に台: 昇順
        if (showKubi) {
            var sa = items.slice().sort(function(a, b) { return a.num - b.num; });
            var kr = 0, lkv = null;
            sa.forEach(function(item, i) {
                if (item.num !== lkv) { kr = i + 1; lkv = item.num; }
                if (kr <= topN) result[item.key].kubi = kr;
            });
        }

        return result;
    }

    // ========== 日別タブ用: 7日累積でバッジ付与 ==========

    /**
     * data        : フィルター適用済みの行配列（表示中の1日分）
     * currentFile : 表示中ファイル名
     * dataCacheRef: グローバル dataCache
     * targetCol   : '差枚' or 'G数'
     *
     * 戻り値: 各行に _machineBadge: { tako, kubi, cumVal, windowDays } を付与したデータ
     */
    function assignBadges(data, currentFile, dataCacheRef, targetCol) {
        if (!enabled || !data || data.length === 0) return data;
        var col = targetCol || getTargetColumn();

        // --- 7日累積値を計算 ---
        var cumResult = calcCumulativeValues(currentFile, dataCacheRef, col);
        var cumValues = cumResult.values || {};
        var windowFiles = cumResult.windowFiles || [];

        // --- フィルター後の表示台のみで機種ごとにグループ化 ---
        var machineGroups = {};
        data.forEach(function(row) {
            var machine = row['機種名'] || '';
            if (!machineGroups[machine]) machineGroups[machine] = [];
            var key = machine + '_' + (row['台番号'] || '');
            machineGroups[machine].push({
                key: key,
                num: cumValues[key] !== undefined ? cumValues[key] : 0,
                row: row
            });
        });

        // --- 機種ごとにランク計算 ---
        var allRanks = {};
        Object.keys(machineGroups).forEach(function(machine) {
            var items = machineGroups[machine];
            var ranks = calcRanksFromItems(items);
            Object.assign(allRanks, ranks);
        });

        // --- 行に付与（累積値・期間情報も一緒に保存） ---
        return data.map(function(row) {
            var key   = (row['機種名'] || '') + '_' + (row['台番号'] || '');
            var badge = Object.assign(
                allRanks[key] || { tako: null, kubi: null },
                {
                    cumVal:     cumValues[key] !== undefined ? cumValues[key] : null,
                    windowDays: windowFiles.length,
                    baseMode:   badgeBase
                }
            );
            return Object.assign({}, row, { _machineBadge: badge });
        });
    }

    // ========== トレンドタブ用: aggregated結果に対してバッジ付与 ==========

    /**
     * results    : trend集計結果 [{machine, num, total, avg, ...}]
     * targetProp : 'total' など
     */
    function assignBadgesForTrend(results, targetProp) {
        if (!enabled || !results || results.length === 0) return results;
        var prop = targetProp || 'total';

        var machineGroups = {};
        results.forEach(function(row) {
            var machine = row.machine || '';
            if (!machineGroups[machine]) machineGroups[machine] = [];
            machineGroups[machine].push({
                key: machine + '_' + row.num,
                num: (typeof row[prop] === 'number' && !isNaN(row[prop])) ? row[prop] : 0
            });
        });

        var allRanks = {};
        Object.keys(machineGroups).forEach(function(machine) {
            var items = machineGroups[machine];
            var ranks = calcRanksFromItems(items);
            Object.assign(allRanks, ranks);
        });

        return results.map(function(row) {
            var key   = row.machine + '_' + row.num;
            var badge = allRanks[key] || { tako: null, kubi: null };
            return Object.assign({}, row, { _machineBadge: badge });
        });
    }

    // ========== HTML描画 ==========

    /**
     * badge: { tako, kubi, cumVal, windowDays }
     * 戻り値: <td>...</td>
     */
    function renderBadgeHtml(badge) {
        return '<td class="mb-cell">' + renderBadgeInner(badge) + '</td>';
    }

    /**
     * バッジ内側HTMLのみ（tdなし）
     * tooltip に累積値・期間を表示
     */
    function renderBadgeInner(badge) {
        if (!badge) return '<span class="mb-none">-</span>';

        var html    = '';
        var baseModeLabel = badge.baseMode === 'prev' ? '前日基準' : '当日基準';
        var daysTip = badge.windowDays
            ? badge.windowDays + '日累積（' + baseModeLabel + '）'
            : '';
        var cumTip  = (badge.cumVal !== null && badge.cumVal !== undefined)
            ? '累積: ' + (badge.cumVal >= 0 ? '+' : '') + badge.cumVal.toLocaleString()
            : '';
        var baseTip = [daysTip, cumTip].filter(Boolean).join(' / ');

        if (badge.tako !== null && showTako) {
            var tip = '🐙タコだし ' + badge.tako + '位（機種内）' + (baseTip ? ' | ' + baseTip : '');
            html += '<span class="mb-tako mb-tako-' + badge.tako + '" title="' + tip + '">🐙' + badge.tako + '</span>';
        }
        if (badge.kubi !== null && showKubi) {
            var tip2 = '💀 ' + badge.kubi + '位（機種内）' + (baseTip ? ' | ' + baseTip : '');
            html += '<span class="mb-kubi mb-kubi-' + badge.kubi + '" title="' + tip2 + '">💀' + badge.kubi + '</span>';
        }
        if (!html) {
            html = '<span class="mb-none">-</span>';
        }
        return html;
    }

    // ========== 設定UI ==========
    // チェックボックス（バッジ表示・タコだし・死に台）は廃止。
    // 集計期間・基準日・基準列のみ表示する。

    function renderSettingsHtml(idPrefix) {
        idPrefix = idPrefix || 'mb';
        var daysOpts = [3, 5, 7, 10, 14].map(function(d) {
            return '<option value="' + d + '"' + (badgeDays === d ? ' selected' : '') + '>' + d + '日</option>';
        }).join('');

        return '<div class="mb-settings">'
            + '<div class="mb-settings-item">'
            + '<span>集計期間:</span>'
            + '<select id="' + idPrefix + 'Days" class="mb-target-select">' + daysOpts + '</select>'
            + '</div>'
            + '<div class="mb-settings-item">'
            + '<span>基準日:</span>'
            + '<select id="' + idPrefix + 'Base" class="mb-target-select">'
            + '<option value="current"' + (badgeBase === 'current' ? ' selected' : '') + '>当日含む</option>'
            + '<option value="prev"'    + (badgeBase === 'prev'    ? ' selected' : '') + '>前日基準</option>'
            + '</select>'
            + '</div>'
            + '<div class="mb-settings-item">'
            + '<span>基準列:</span>'
            + '<select id="' + idPrefix + 'Target" class="mb-target-select">'
            + '<option value="diff"'  + (target === 'diff'  ? ' selected' : '') + '>差枚</option>'
            + '<option value="games"' + (target === 'games' ? ' selected' : '') + '>G数</option>'
            + '</select>'
            + '</div>'
            + '</div>';
    }

    function setupSettingsEvents(idPrefix, onChange) {
        idPrefix = idPrefix || 'mb';
        var daysEl   = document.getElementById(idPrefix + 'Days');
        var baseEl   = document.getElementById(idPrefix + 'Base');
        var targetEl = document.getElementById(idPrefix + 'Target');

        function update() {
            if (daysEl)   badgeDays = parseInt(daysEl.value) || 7;
            if (baseEl)   badgeBase = baseEl.value;
            if (targetEl) target    = targetEl.value;
            saveSettings();
            if (onChange) onChange();
        }

        if (daysEl)   daysEl.addEventListener('change', update);
        if (baseEl)   baseEl.addEventListener('change', update);
        if (targetEl) targetEl.addEventListener('change', update);
    }

    // ========== ゲッター ==========

    function isEnabled()      { return enabled;   }
    function getTarget()      { return target;    }
    function isShowTako()     { return showTako;  }
    function isShowKubi()     { return showKubi;  }
    function getTopN()        { return topN;      }
    function getBadgeDays()   { return badgeDays; }
    function getBadgeBase()   { return badgeBase; }

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
        getTopN:                getTopN,
        getBadgeDays:           getBadgeDays,
        getBadgeBase:           getBadgeBase
    };
})();
