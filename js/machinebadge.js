// ===================
// 機種内バッジシステム
// タコだし（高差枚）🐙1,2,3位 / 死に台（低差枚）💀1,2,3位
//
// 【計算ベース】
//   日別タブ: 表示中の日を基準に、集計期間（日数）ぶんの累積差枚（機種内・フィルター後）
//             - 当日含む / 前日基準 を選択
//             - イベント日除外 / 末尾0・5の日除外 を選択
//             - 除外時の窓の取り方: fill（有効日がN日たまるまで遡る）/ trim（直近Nカレンダー日から抜くだけ）
//             - 仮想日（最新+1日）では基準設定にかかわらず常に前日基準で計算
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
    var STORAGE_KEY_TAKO_RANKS = 'machineBadgeTakoRanks'; // タコだし表示順位 (例: [1,2,3])
    var STORAGE_KEY_KUBI_RANKS = 'machineBadgeKubiRanks'; // 死に台表示順位 (例: [1,2,3])
    var STORAGE_KEY_EX_EVENT  = 'machineBadgeExEvent';   // イベント日除外 'true'/'false'
    var STORAGE_KEY_EX_TAIL05 = 'machineBadgeExTail05';  // 末尾0・5の日除外 'true'/'false'
    var STORAGE_KEY_FILL_MODE = 'machineBadgeFillMode';  // 'fill'=遡って補う / 'trim'=抜くだけ

    var enabled   = true;       // 常にオン（チェックボックス廃止）
    var target    = 'diff';     // 'diff' | 'games'
    var showTako  = true;       // 常にオン（チェックボックス廃止）
    var showKubi  = true;       // 常にオン（チェックボックス廃止）
    var badgeDays = 7;          // 過去何日分累積するか（1〜31）
    var badgeBase = 'current';  // 'current'=当日含む / 'prev'=前日から遡る
    var topN      = 3;          // 上位・下位何位まで
    var takoRanks = [1, 2, 3];  // タコだし表示する順位リスト（デフォルト全表示）
    var kubiRanks = [1, 2, 3];  // 死に台表示する順位リスト（デフォルト全表示）
    var exEvent   = false;      // イベント日を除外するか
    var exTail05  = false;      // 末尾0・5の日を除外するか
    var fillMode  = 'fill';     // 'fill'=有効日がN日たまるまで遡る / 'trim'=直近Nカレンダー日から抜くだけ

    var MIN_DAYS = 1;
    var MAX_DAYS = 31;
    var DEFAULT_DAYS = 7;

    // ========== ストレージ ==========

    function loadSettings() {
        try {
            // バッジ表示・タコだし・死に台は常にオン（チェックボックスを廃止したため）
            enabled  = true;
            showTako = true;
            showKubi = true;

            target = localStorage.getItem(STORAGE_KEY_TARGET) || 'diff';

            var d = parseInt(localStorage.getItem(STORAGE_KEY_DAYS));
            if (!isNaN(d) && d >= MIN_DAYS && d <= MAX_DAYS) badgeDays = d;

            var b = localStorage.getItem(STORAGE_KEY_BASE);
            if (b === 'prev' || b === 'current') badgeBase = b;

            // タコだし/死に台の表示順位
            var tr = localStorage.getItem(STORAGE_KEY_TAKO_RANKS);
            if (tr) { try { takoRanks = JSON.parse(tr); } catch(e) {} }
            var kr = localStorage.getItem(STORAGE_KEY_KUBI_RANKS);
            if (kr) { try { kubiRanks = JSON.parse(kr); } catch(e) {} }

            // 除外設定・補完モード
            exEvent  = localStorage.getItem(STORAGE_KEY_EX_EVENT)  === 'true';
            exTail05 = localStorage.getItem(STORAGE_KEY_EX_TAIL05) === 'true';
            var fm = localStorage.getItem(STORAGE_KEY_FILL_MODE);
            if (fm === 'fill' || fm === 'trim') fillMode = fm;
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY_TARGET, target);
            localStorage.setItem(STORAGE_KEY_DAYS,   badgeDays);
            localStorage.setItem(STORAGE_KEY_BASE,   badgeBase);
            localStorage.setItem(STORAGE_KEY_TAKO_RANKS, JSON.stringify(takoRanks));
            localStorage.setItem(STORAGE_KEY_KUBI_RANKS, JSON.stringify(kubiRanks));
            localStorage.setItem(STORAGE_KEY_EX_EVENT,  exEvent  ? 'true' : 'false');
            localStorage.setItem(STORAGE_KEY_EX_TAIL05, exTail05 ? 'true' : 'false');
            localStorage.setItem(STORAGE_KEY_FILL_MODE, fillMode);
        } catch (e) {}
    }

    // ========== 日付・除外判定ヘルパ ==========

    // ファイル名（data/YYYY_MM_DD.csv）→ 日付キー（YYYY_MM_DD）
    function fileToDateKey(file) {
        if (!file) return '';
        if (typeof getDateKeyFromFilename === 'function') {
            try { var k = getDateKeyFromFilename(file); if (k) return k; } catch (e) {}
        }
        return String(file).replace('data/', '').replace('.csv', '');
    }

    // その日付キーがイベント日か（events.json に1件でも載っていれば true）
    function isEventDate(dateKey) {
        if (!dateKey) return false;
        // 優先: グローバルの getEventsForDate（events.json をロード済み前提）
        if (typeof getEventsForDate === 'function') {
            try {
                var evs = getEventsForDate(dateKey);
                return !!(evs && evs.length > 0);
            } catch (e) {}
        }
        // フォールバック: HallData.store.events を直接見る
        try {
            if (typeof HallData !== 'undefined' && HallData.store && HallData.store.events) {
                var store = HallData.store.events;
                if (Array.isArray(store)) {
                    return store.some(function(ev) {
                        return ev && (ev.date === dateKey || String(ev.date).replace(/-/g, '_') === dateKey);
                    });
                }
            }
        } catch (e) {}
        return false;
    }

    // その日付キーの末尾が0または5か（YYYY_MM_DD の DD の末尾1桁）
    function isTail05Date(dateKey) {
        if (!dateKey) return false;
        var parts = String(dateKey).split('_');
        var dd = parts[parts.length - 1] || '';
        var lastDigit = dd.slice(-1);
        return lastDigit === '0' || lastDigit === '5';
    }

    // 除外対象の日付キーか（イベント除外 or 末尾05除外の設定に従う）
    function isExcludedDate(dateKey) {
        if (exEvent && isEventDate(dateKey)) return true;
        if (exTail05 && isTail05Date(dateKey)) return true;
        return false;
    }

    // ========== 累積計算 ==========

    /**
     * baseFile  : 集計の起点となる「当日」ファイル名（仮想日のときは最新実データ日を渡す）
     * dataCacheRef: グローバルの dataCache オブジェクト
     * targetCol : '差枚' or 'G数'
     * opts      : { forcePrev: boolean }  仮想日などで強制的に前日基準にする
     *
     * 戻り値: { values: {key: 累積値}, windowFiles: [...] }
     *
     * 窓の決め方:
     *   開始 = forcePrev/prev のとき baseIdx+1（前日から）、current のとき baseIdx（当日から）
     *   そこから過去へ向かって日を見ていき、除外日を扱いながら badgeDays 日ぶん集める。
     *     fillMode='fill' : 除外日はスキップして「有効日が badgeDays たまるまで」遡る
     *     fillMode='trim' : 連続した badgeDays カレンダー日を取り、その中の除外日を抜く
     */
    function calcCumulativeValues(baseFile, dataCacheRef, targetCol, opts) {
        opts = opts || {};
        var col = targetCol || '差枚';

        var allSorted = sortFilesByDate(CSV_FILES, true); // 新しい順
        var baseIdx = allSorted.indexOf(baseFile);
        if (baseIdx === -1) return { values: {}, windowFiles: [] };

        var usePrev = opts.forcePrev || (badgeBase === 'prev');
        var startIdx = usePrev ? baseIdx + 1 : baseIdx;

        var windowFiles = [];

        if (fillMode === 'trim') {
            // 直近 badgeDays カレンダー日を取り、その中から除外日を抜く
            var slice = allSorted.slice(startIdx, startIdx + badgeDays);
            slice.forEach(function(file) {
                if (!isExcludedDate(fileToDateKey(file))) windowFiles.push(file);
            });
        } else {
            // fill: 除外日はスキップしつつ、有効日が badgeDays たまるまで遡る
            for (var i = startIdx; i < allSorted.length && windowFiles.length < badgeDays; i++) {
                var f = allSorted[i];
                if (isExcludedDate(fileToDateKey(f))) continue;
                windowFiles.push(f);
            }
        }

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

    // ========== 日別タブ用: 累積でバッジ付与 ==========

    /**
     * data        : フィルター適用済みの行配列（表示中の1日分）
     * currentFile : 表示中ファイル名（仮想日のときは仮想ファイル名でも可。集計起点は baseFileOverride で渡す）
     * dataCacheRef: グローバル dataCache
     * targetCol   : '差枚' or 'G数'
     * opts        : { baseFileOverride: 集計起点ファイル, forcePrev: 前日基準を強制 }
     *
     * 戻り値: 各行に _machineBadge: { tako, kubi, cumVal, windowDays, baseMode } を付与したデータ
     */
    function assignBadges(data, currentFile, dataCacheRef, targetCol, opts) {
        if (!enabled || !data || data.length === 0) return data;
        opts = opts || {};
        var col = targetCol || getTargetColumn();

        // 集計の起点ファイル（仮想日のときは最新実データ日を渡してもらう）
        var baseFile = opts.baseFileOverride || currentFile;
        var forcePrev = !!opts.forcePrev;

        // --- 累積値を計算 ---
        var cumResult = calcCumulativeValues(baseFile, dataCacheRef, col, { forcePrev: forcePrev });
        var cumValues = cumResult.values || {};
        var windowFiles = cumResult.windowFiles || [];

        // 実際に使われた基準モード（仮想日は前日基準固定）
        var effectiveBase = (forcePrev || badgeBase === 'prev') ? 'prev' : 'current';

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

        // --- 機種ごとに台数別ロジックでランク計算 ---
        //   3台以上 : 機種内で 🐙💀 を通常どおり順位付け
        //   2台      : 💀（死に台）1位のみ付与（🐙 は付けない）
        //   1台      : 「1台設置機種」をすべてまとめた横断グループで順位付け
        var allRanks = {};
        var singleUnitItems = []; // 1台設置機種の台を集約

        Object.keys(machineGroups).forEach(function(machine) {
            var items = machineGroups[machine];

            if (items.length >= 3) {
                // 通常: 機種内ランク
                Object.assign(allRanks, calcRanksFromItems(items));
            } else if (items.length === 2) {
                // 2台: 💀のみ。calcRanksFromItems の結果から tako を除去
                var ranks2 = calcRanksFromItems(items);
                Object.keys(ranks2).forEach(function(k) {
                    ranks2[k].tako = null;
                });
                Object.assign(allRanks, ranks2);
            } else {
                // 1台: 横断グループへ集約（後でまとめて順位付け）
                singleUnitItems = singleUnitItems.concat(items);
            }
        });

        // --- 1台設置機種の横断グループでランク計算 ---
        if (singleUnitItems.length > 0) {
            Object.assign(allRanks, calcRanksFromItems(singleUnitItems));
        }

        // --- 行に付与（累積値・期間情報も一緒に保存） ---
        return data.map(function(row) {
            var key   = (row['機種名'] || '') + '_' + (row['台番号'] || '');
            var badge = Object.assign(
                allRanks[key] || { tako: null, kubi: null },
                {
                    cumVal:     cumValues[key] !== undefined ? cumValues[key] : null,
                    windowDays: windowFiles.length,
                    baseMode:   effectiveBase
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

        if (badge.tako !== null && showTako && takoRanks.indexOf(badge.tako) !== -1) {
            var tip = '🐙タコだし ' + badge.tako + '位（機種内）' + (baseTip ? ' | ' + baseTip : '');
            html += '<span class="mb-tako mb-tako-' + badge.tako + '" title="' + tip + '">🐙' + badge.tako + '</span>';
        }
        if (badge.kubi !== null && showKubi && kubiRanks.indexOf(badge.kubi) !== -1) {
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
    // 集計期間（数値入力）・基準日・基準列・除外設定・補完モード・順位表示を表示する。

    function renderRankCheckboxes(idPrefix, kind, ranks) {
        return [1, 2, 3].map(function(n) {
            var chkId = idPrefix + 'Rank' + kind + n;
            var checked = ranks.indexOf(n) !== -1 ? ' checked' : '';
            return '<label class="mb-rank-label">'
                + '<input type="checkbox" id="' + chkId + '" value="' + n + '"' + checked + '>'
                + n + '位'
                + '</label>';
        }).join('');
    }

    function renderSettingsHtml(idPrefix) {
        idPrefix = idPrefix || 'mb';

        return '<div class="mb-settings">'
            // 集計期間（数値入力 1〜31）
            + '<div class="mb-settings-item">'
            + '<span>集計期間:</span>'
            + '<input type="number" id="' + idPrefix + 'Days" class="mb-days-input" '
            +   'min="' + MIN_DAYS + '" max="' + MAX_DAYS + '" step="1" value="' + badgeDays + '">'
            + '<span class="mb-days-unit">日（1〜' + MAX_DAYS + '）</span>'
            + '</div>'
            // 基準日
            + '<div class="mb-settings-item">'
            + '<span>基準日:</span>'
            + '<select id="' + idPrefix + 'Base" class="mb-target-select">'
            + '<option value="current"' + (badgeBase === 'current' ? ' selected' : '') + '>当日含む</option>'
            + '<option value="prev"'    + (badgeBase === 'prev'    ? ' selected' : '') + '>前日基準</option>'
            + '</select>'
            + '</div>'
            // 基準列
            + '<div class="mb-settings-item">'
            + '<span>基準列:</span>'
            + '<select id="' + idPrefix + 'Target" class="mb-target-select">'
            + '<option value="diff"'  + (target === 'diff'  ? ' selected' : '') + '>差枚</option>'
            + '<option value="games"' + (target === 'games' ? ' selected' : '') + '>G数</option>'
            + '</select>'
            + '</div>'
            // 除外設定
            + '<div class="mb-settings-item mb-exclude-item">'
            + '<span>集計から除外:</span>'
            + '<div class="mb-exclude-checks">'
            +   '<label class="mb-exclude-label">'
            +     '<input type="checkbox" id="' + idPrefix + 'ExEvent"' + (exEvent ? ' checked' : '') + '>'
            +     'イベント日'
            +   '</label>'
            +   '<label class="mb-exclude-label">'
            +     '<input type="checkbox" id="' + idPrefix + 'ExTail05"' + (exTail05 ? ' checked' : '') + '>'
            +     '末尾0・5の日'
            +   '</label>'
            + '</div>'
            + '</div>'
            // 補完モード（除外時の窓の取り方）
            + '<div class="mb-settings-item">'
            + '<span>除外時の集計:</span>'
            + '<select id="' + idPrefix + 'FillMode" class="mb-target-select">'
            + '<option value="fill"' + (fillMode === 'fill' ? ' selected' : '') + '>遡って日数を補う</option>'
            + '<option value="trim"' + (fillMode === 'trim' ? ' selected' : '') + '>抜くだけ（補わない）</option>'
            + '</select>'
            + '</div>'
            // 表示順位
            + '<div class="mb-settings-item mb-rank-item">'
            + '<span>🐙 表示順位:</span>'
            + '<div class="mb-rank-checks">' + renderRankCheckboxes(idPrefix, 'Tako', takoRanks) + '</div>'
            + '</div>'
            + '<div class="mb-settings-item mb-rank-item">'
            + '<span>💀 表示順位:</span>'
            + '<div class="mb-rank-checks">' + renderRankCheckboxes(idPrefix, 'Kubi', kubiRanks) + '</div>'
            + '</div>'
            + '</div>';
    }

    function setupSettingsEvents(idPrefix, onChange) {
        idPrefix = idPrefix || 'mb';
        var daysEl     = document.getElementById(idPrefix + 'Days');
        var baseEl     = document.getElementById(idPrefix + 'Base');
        var targetEl   = document.getElementById(idPrefix + 'Target');
        var exEventEl  = document.getElementById(idPrefix + 'ExEvent');
        var exTail05El = document.getElementById(idPrefix + 'ExTail05');
        var fillModeEl = document.getElementById(idPrefix + 'FillMode');

        function update() {
            if (daysEl) {
                var d = parseInt(daysEl.value);
                if (isNaN(d)) d = DEFAULT_DAYS;
                if (d < MIN_DAYS) d = MIN_DAYS;
                if (d > MAX_DAYS) d = MAX_DAYS;
                badgeDays = d;
                // 入力欄もクランプ後の値に反映
                daysEl.value = d;
            }
            if (baseEl)     badgeBase = baseEl.value;
            if (targetEl)   target    = targetEl.value;
            if (exEventEl)  exEvent   = exEventEl.checked;
            if (exTail05El) exTail05  = exTail05El.checked;
            if (fillModeEl) fillMode  = fillModeEl.value;

            // タコだし/死に台順位チェックボックスを読み取る
            takoRanks = [1, 2, 3].filter(function(n) {
                var el = document.getElementById(idPrefix + 'RankTako' + n);
                return el ? el.checked : true;
            });
            kubiRanks = [1, 2, 3].filter(function(n) {
                var el = document.getElementById(idPrefix + 'RankKubi' + n);
                return el ? el.checked : true;
            });
            // 一つもチェックなしの場合は全表示にフォールバック
            if (takoRanks.length === 0) takoRanks = [1, 2, 3];
            if (kubiRanks.length === 0) kubiRanks = [1, 2, 3];

            saveSettings();
            if (onChange) onChange();
        }

        if (daysEl) {
            daysEl.addEventListener('change', update);
            daysEl.addEventListener('input', update);
        }
        if (baseEl)     baseEl.addEventListener('change', update);
        if (targetEl)   targetEl.addEventListener('change', update);
        if (exEventEl)  exEventEl.addEventListener('change', update);
        if (exTail05El) exTail05El.addEventListener('change', update);
        if (fillModeEl) fillModeEl.addEventListener('change', update);

        // 順位チェックボックス
        [1, 2, 3].forEach(function(n) {
            var takoEl = document.getElementById(idPrefix + 'RankTako' + n);
            var kubiEl = document.getElementById(idPrefix + 'RankKubi' + n);
            if (takoEl) takoEl.addEventListener('change', update);
            if (kubiEl) kubiEl.addEventListener('change', update);
        });
    }

    // ========== ゲッター ==========

    function isEnabled()      { return enabled;   }
    function getTarget()      { return target;    }
    function isShowTako()     { return showTako;  }
    function isShowKubi()     { return showKubi;  }
    function getTopN()        { return topN;      }
    function getBadgeDays()   { return badgeDays; }
    function getBadgeBase()   { return badgeBase; }
    function getTakoRanks()   { return takoRanks.slice(); }
    function getKubiRanks()   { return kubiRanks.slice(); }
    function isExEvent()      { return exEvent;   }
    function isExTail05()     { return exTail05;  }
    function getFillMode()    { return fillMode;  }

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
        getBadgeBase:           getBadgeBase,
        getTakoRanks:           getTakoRanks,
        getKubiRanks:           getKubiRanks,
        isExEvent:              isExEvent,
        isExTail05:             isExTail05,
        getFillMode:            getFillMode
    };
})();
