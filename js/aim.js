// ===================
// 狙い台ページ（AimSheet）
//
// ホーム（ターミナル）から独立ページ #aim として起動。
// ページ内タブ: 「作成」と「振り返り」。
//
// 【作成】基準日（独立管理・デフォルト最新日）の凹み台を 3ゾーンに振り分け。
// 【振り返り】選んだシート（現在の作成配置 or クラウドの他人/自分のシート）を
//            「答え合わせ日」のデータで答え合わせ。
//            凹み判定は答え合わせ日の前日基準でN日累積。的中=機械割105%以上。
//            振り返りは reviewState を使い、作成タブの state は壊さない。
//            3位を隠す設定（rank3ByPreset / 後方互換 showRank3）はシートごとに従う。
//
// PC: HTML5 Drag&Drop / スマホ: 長押しドラッグ＋タップメニュー。
// 凹みは 💀🥇💀🥈💀🥉。3位トグルはプリセット単位。機種除外（プリセット一括）。
// 凹み判定（バッジ）設定もこのページで可能（MachineBadge 設定を共有 / このページでは即再計算）。
// 保存: localStorage（自動）＋ Cloudflare D1（作成者ごと upsert / 他人のシート読込・削除）。
// ===================

var AimSheet = (function() {

    // ▼▼▼ ここをあなたの Worker URL に書き換える ▼▼▼
    var AIM_API_URL = 'https://aim-api.slot8192analyst.workers.dev/api/aim';
    // ▲▲▲ /api/aim まで含めること ▲▲▲

    var STORAGE_KEY = 'aimSheetState';
    var AUTHOR_KEY  = 'aimSheetAuthor';

    // バッジ設定の localStorage キー（前日基準への一時切替に使用）
    var MB_BASE_KEY = 'machineBadgeBase';

    var WIN_RATE = 105; // 的中とみなす機械割(%)。設定4相当

    var ZONES = [
        { id: 'top',    label: '最優先', presetId: 'at_main' },
        { id: 'high',   label: '優先',   presetId: 'at_sub'  },
        { id: 'other',  label: 'その他', presetId: null      }
    ];

    var KUBI_RANKS = [1, 2, 3];
    var LONGPRESS_MS = 350;
    var MOVE_TOLERANCE = 10;

    // 機種除外リストのグループ表示順（プリセットIDで指定）
    // メイン → サブ → バラエティ → ジャグ・ハナ・沖スロ → アクロス
    var HIDDEN_GROUP_ORDER = ['at_main', 'at_sub', 'variety', 'jug_hana_oki', 'acros'];

    // プリセット未所属（その他グループ）の rank3ByPreset 用キー
    var OTHER_PRESET_KEY = '__other__';

    function kubiMedal(kubi) {
        if (kubi === 1) return '💀🥇';
        if (kubi === 2) return '💀🥈';
        if (kubi === 3) return '💀🥉';
        return '💀' + kubi;
    }

    // ========== 状態 ==========
    var state = {
        placement: {},
        perUnit: {},
        excluded: {},
        hiddenMachines: {},
        showRank3: true,          // 後方互換・デフォルト値として使用
        rank3ByPreset: {},        // { presetId(or __other__): true/false } 未設定は showRank3 を採用
        order: {}
    };

    var author = '';
    var builtRaw = {};
    var built = {};
    var currentFile = null;
    var aimDateFile = null;        // 作成: 基準日（daily と独立。デフォルト最新日）
    var reviewDateFile = null;     // 振り返り: 答え合わせ日（デフォルト最新日）
    var activeTab = 'create';      // 'create' | 'review'
    var initialized = false;

    // 機種 -> プリセットID（or __other__）のキャッシュ。buildData / 設置台数変化時に再計算
    var machinePresetMap = null;

    // ★ 振り返り専用の一時状態（作成タブの state を壊さない）
    var reviewState = {
        placement: {},
        perUnit: {},
        excluded: {},
        hiddenMachines: {},
        showRank3: true,
        rank3ByPreset: {}
    };
    var reviewSheetSel = '__current__';   // 選択中シート（'__current__' または作成者名）
    var reviewCloudCache = {};            // author -> data のキャッシュ

    // クラウド保存対象だけを抜き出す（死に台の数値は含めない）
    function pickPersist() {
        return {
            placement: state.placement,
            perUnit: state.perUnit,
            excluded: state.excluded,
            hiddenMachines: state.hiddenMachines,
            showRank3: state.showRank3,
            rank3ByPreset: state.rank3ByPreset,
            order: state.order
        };
    }
    function applyPersist(p) {
        if (!p || typeof p !== 'object') return;
        state.placement      = p.placement      || {};
        state.perUnit        = p.perUnit        || {};
        state.excluded       = p.excluded       || {};
        state.hiddenMachines = p.hiddenMachines || {};
        state.showRank3      = (p.showRank3 !== undefined) ? p.showRank3 : true;
        state.rank3ByPreset  = p.rank3ByPreset  || {};
        state.order          = p.order          || {};
    }

    // ========== ストレージ（ローカル） ==========

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) applyPersist(JSON.parse(raw));
        } catch (e) {}
        try {
            author = localStorage.getItem(AUTHOR_KEY) || '';
        } catch (e) {}
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersist())); } catch (e) {}
    }

    function saveAuthor() {
        try { localStorage.setItem(AUTHOR_KEY, author); } catch (e) {}
    }

    // ========== クラウド（D1 / Workers） ==========

    function dateKeyOfCurrent() {
        if (currentFile && typeof getDateKeyFromFilename === 'function') {
            try { return getDateKeyFromFilename(currentFile) || ''; } catch (e) {}
        }
        return currentFile ? currentFile.replace('data/', '').replace('.csv', '') : '';
    }

    function cloudSave() {
        if (!author) { alert('先に作成者名を入力してください。'); return; }
        var btn = document.getElementById('aimCloudSaveBtn');
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

        fetch(AIM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                author: author,
                dateKey: dateKeyOfCurrent(),
                data: pickPersist()
            })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.ok) {
                toast('☁️ クラウドに保存しました（' + author + '）');
                refreshCloudList();
            } else {
                alert('保存に失敗しました: ' + (res && res.error ? res.error : '不明なエラー'));
            }
        })
        .catch(function(err) {
            alert('保存に失敗しました（通信エラー）: ' + err);
        })
        .finally(function() {
            if (btn) { btn.disabled = false; btn.textContent = '☁️ クラウド保存'; }
        });
    }

    function cloudLoad(targetAuthor) {
        if (!targetAuthor) return;
        if (!confirm(targetAuthor + ' さんのシートを読み込みます。\n現在の配置は上書きされます。よろしいですか?')) {
            var sel = document.getElementById('aimCloudList');
            if (sel) sel.value = '';
            return;
        }

        fetch(AIM_API_URL + '?author=' + encodeURIComponent(targetAuthor))
        .then(function(r) {
            if (!r.ok) throw new Error('not found');
            return r.json();
        })
        .then(function(res) {
            if (res && res.data) {
                applyPersist(res.data);
                rebuildVisible();
                saveState();
                renderBoard();
                toast('☁️ ' + targetAuthor + ' さんのシートを読み込みました');
            }
        })
        .catch(function(err) {
            alert('読み込みに失敗しました: ' + err);
        });
    }

    function cloudDelete() {
        var sel = document.getElementById('aimCloudList');
        if (!sel || !sel.value) {
            alert('削除するシートをセレクトから選んでください。');
            return;
        }
        var targetAuthor = sel.value;
        if (!confirm('「' + targetAuthor + '」さんのシートをクラウドから削除します。\nこの操作は取り消せません。よろしいですか?')) {
            return;
        }
        var btn = document.getElementById('aimCloudDeleteBtn');
        if (btn) { btn.disabled = true; btn.textContent = '削除中...'; }

        fetch(AIM_API_URL + '?author=' + encodeURIComponent(targetAuthor), { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.ok) {
                toast('🗑️ ' + targetAuthor + ' さんのシートを削除しました');
                sel.value = '';
                refreshCloudList();
                // 振り返りキャッシュからも除去
                delete reviewCloudCache[targetAuthor];
            } else {
                alert('削除に失敗しました: ' + (res && res.error ? res.error : '不明なエラー'));
            }
        })
        .catch(function(err) {
            alert('削除に失敗しました（通信エラー）: ' + err);
        })
        .finally(function() {
            if (btn) { btn.disabled = false; btn.textContent = '🗑️ 選択シートを削除'; }
        });
    }

    function refreshCloudList() {
        var sel = document.getElementById('aimCloudList');
        if (!sel) return;
        fetch(AIM_API_URL)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var sheets = (res && res.sheets) ? res.sheets : [];
            var opts = ['<option value="">他の人のシートを開く...</option>'];
            sheets.forEach(function(s) {
                var label = s.author + (s.date_key ? '（' + s.date_key.replace(/_/g, '/') + '）' : '');
                opts.push('<option value="' + escapeAttr(s.author) + '">' + escapeHtml(label) + '</option>');
            });
            sel.innerHTML = opts.join('');
        })
        .catch(function() { /* オフライン時は黙って無視 */ });
    }

    function toast(msg) {
        if (typeof showCopyToast === 'function') { showCopyToast(msg); return; }
        var meta = document.getElementById('aimMeta');
        if (meta) {
            meta.textContent = msg;
            setTimeout(function() { updateMeta(); }, 2000);
        }
    }

    // ========== 基準日の解決 / データロード ==========

    function aimSortedFiles() {
        return (typeof sortFilesByDate === 'function') ? sortFilesByDate(CSV_FILES, true) : [];
    }

    function resolveAimDateFile() {
        var files = aimSortedFiles();
        if (aimDateFile && files.indexOf(aimDateFile) !== -1) return aimDateFile;
        aimDateFile = files.length ? files[0] : null;
        return aimDateFile;
    }

    function resolveReviewDateFile() {
        var files = aimSortedFiles();
        if (reviewDateFile && files.indexOf(reviewDateFile) !== -1) return reviewDateFile;
        reviewDateFile = files.length ? files[0] : null;
        return reviewDateFile;
    }

    // 指定ファイル＋累積期間ぶんの月別JSONが未キャッシュなら読み込む
    function ensureDataLoaded(file) {
        var loaders = [];
        if (!file) return Promise.resolve();

        var files = aimSortedFiles();
        var idx = files.indexOf(file);
        if (idx === -1) idx = 0;
        var days = (typeof MachineBadge !== 'undefined') ? MachineBadge.getBadgeDays() : 7;
        var windowFiles = files.slice(idx, idx + days + 1);

        var monthsToLoad = {};
        windowFiles.forEach(function(f) {
            if (dataCache && dataCache[f]) return;
            if (typeof getDateKeyFromFilename !== 'function') return;
            var dk = getDateKeyFromFilename(f);
            if (!dk) return;
            var ym = dk.substring(0, 7);
            monthsToLoad['data/' + ym + '.json'] = true;
        });

        if (typeof loadMonthlyJSON === 'function') {
            Object.keys(monthsToLoad).forEach(function(mf) {
                loaders.push(loadMonthlyJSON(mf).catch(function() {}));
            });
        }
        return Promise.all(loaders);
    }

    // ========== プリセット振り分け（共通） ==========

    // プリセットを HIDDEN_GROUP_ORDER の順に並べ替えて返す（ID指定）
    function orderedPresetsForHidden() {
        if (typeof MachinePreset === 'undefined') return [];
        var presets = MachinePreset.getAll() || [];
        var byId = {};
        presets.forEach(function(p) { byId[p.id] = p; });

        var ordered = [];
        var used = {};
        HIDDEN_GROUP_ORDER.forEach(function(id) {
            if (byId[id] && !used[id]) { ordered.push(byId[id]); used[id] = true; }
        });
        presets.forEach(function(p) {
            if (!used[p.id]) { ordered.push(p); used[p.id] = true; }
        });
        return ordered;
    }

    // 基準日の machineOptions（value -> count を持つ）
    function currentMachineOptions() {
        return (typeof getMachineOptionsForDate === 'function')
            ? getMachineOptionsForDate(currentFile)
            : Object.keys(builtRaw).map(function(m) { return { value: m, count: builtRaw[m].length }; });
    }

    // builtRaw の各機種を「最初にマッチしたプリセットID（or __other__）」へ対応付けて返す。
    // 並びは HIDDEN_GROUP_ORDER 準拠。1機種は1グループのみ所属。
    function computeMachinePresetMap() {
        var map = {};
        var allMachines = Object.keys(builtRaw);
        if (allMachines.length === 0) return map;

        var machineOptions = currentMachineOptions();
        var presets = orderedPresetsForHidden();
        var assigned = {};

        presets.forEach(function(p) {
            var resolved = (typeof MachinePreset !== 'undefined')
                ? (MachinePreset.resolve(p, machineOptions, machineOptions) || [])
                : [];
            resolved.forEach(function(machine) {
                if (builtRaw[machine] === undefined) return;
                if (assigned[machine]) return;
                assigned[machine] = true;
                map[machine] = p.id;
            });
        });
        allMachines.forEach(function(m) {
            if (!assigned[m]) map[m] = OTHER_PRESET_KEY;
        });
        return map;
    }

    function getMachinePresetMap() {
        if (!machinePresetMap) machinePresetMap = computeMachinePresetMap();
        return machinePresetMap;
    }

    function presetKeyOfMachine(machine) {
        var map = getMachinePresetMap();
        return map[machine] || OTHER_PRESET_KEY;
    }

    // そのプリセットキーで「3位を表示するか」。未設定は showRank3 をデフォルトに。
    function isRank3VisibleForPresetKey(presetKey, st) {
        st = st || state;
        var byPreset = st.rank3ByPreset || {};
        if (byPreset[presetKey] !== undefined) return byPreset[presetKey];
        return (st.showRank3 !== undefined) ? st.showRank3 : true;
    }

    // 機種単位で 3位を表示するか（作成 state ベース）
    function isRank3VisibleForMachine(machine) {
        return isRank3VisibleForPresetKey(presetKeyOfMachine(machine), state);
    }

    // ========== 作成: データ構築 ==========

    function buildData() {
        builtRaw = {};
        machinePresetMap = null; // 再計算させる
        if (typeof MachineBadge === 'undefined') { built = {}; return; }

        currentFile = resolveAimDateFile();

        if (!currentFile || !dataCache || !dataCache[currentFile]) { built = {}; return; }

        var rawData = dataCache[currentFile].map(function(r) { return Object.assign({}, r); });
        if (typeof addMechanicalRateToData === 'function') rawData = addMechanicalRateToData(rawData);
        var badged = MachineBadge.assignBadges(rawData, currentFile, dataCache, MachineBadge.getTargetColumn());

        badged.forEach(function(row) {
            var mb = row['_machineBadge'];
            if (!mb || mb.kubi === null || mb.kubi === undefined) return;
            if (KUBI_RANKS.indexOf(mb.kubi) === -1) return;
            var machine = row['機種名'] || '';
            if (!builtRaw[machine]) builtRaw[machine] = [];
            builtRaw[machine].push({
                machine: machine,
                num:     row['台番号'] || '',
                kubi:    mb.kubi,
                cumVal:  (mb.cumVal !== null && mb.cumVal !== undefined) ? mb.cumVal : null,
                diff:    parseInt(String(row['差枚']).replace(/,/g, '')) || 0
            });
        });

        Object.keys(builtRaw).forEach(function(m) {
            builtRaw[m].sort(function(a, b) { return a.kubi - b.kubi; });
        });

        machinePresetMap = computeMachinePresetMap();
        rebuildVisible();
    }

    function rebuildVisible() {
        built = {};
        Object.keys(builtRaw).forEach(function(m) {
            if (state.hiddenMachines[m]) return;
            built[m] = builtRaw[m];
        });
    }

    function applyDefaultPlacement() {
        var machineOptions = currentMachineOptions();

        var allBuilt = Object.keys(builtRaw);

        if (typeof MachinePreset !== 'undefined') {
            ZONES.forEach(function(zone) {
                if (!zone.presetId) return;
                var preset = MachinePreset.getAll().filter(function(p) { return p.id === zone.presetId; })[0];
                if (!preset) return;
                var resolved = MachinePreset.resolve(preset, machineOptions, machineOptions);
                resolved.forEach(function(machine) {
                    if (allBuilt.indexOf(machine) === -1) return;
                    if (state.placement[machine] === undefined) state.placement[machine] = zone.id;
                });
            });
        }
        allBuilt.forEach(function(machine) {
            if (state.placement[machine] === undefined) state.placement[machine] = 'other';
        });
    }

    // ========== 区分振り分け（共通） ==========

    function chipKey(machine, num) { return machine + '_' + num; }

    // 機種ごとの 3位表示フラグに従って3位を除外
    function visibleItems(machine, items) {
        if (isRank3VisibleForMachine(machine)) return items;
        return items.filter(function(it) { return it.kubi !== 3; });
    }

    function itemsForMachineInZone(machine, zoneId) {
        var items = built[machine] || [];
        var base = state.placement[machine] || 'other';
        var filtered = items.filter(function(it) {
            var pk = chipKey(machine, it.num);
            var z = (state.perUnit[pk] !== undefined) ? state.perUnit[pk] : base;
            return z === zoneId;
        });
        return visibleItems(machine, filtered);
    }

    // 作成用: 台→ゾーン解決（state ベース）
    function resolveZoneOf(machine, num) {
        var pk = chipKey(machine, num);
        if (state.perUnit[pk] !== undefined) return state.perUnit[pk];
        return state.placement[machine] || 'other';
    }

    // 振り返り用: reviewState からゾーン解決
    function reviewZoneOf(machine, num) {
        var pk = chipKey(machine, num);
        if (reviewState.perUnit[pk] !== undefined) return reviewState.perUnit[pk];
        return reviewState.placement[machine] || 'other';
    }

    function machinesInZone(zoneId) {
        var present = Object.keys(built).filter(function(m) {
            return itemsForMachineInZone(m, zoneId).length > 0;
        });
        var saved = (state.order[zoneId] || []).filter(function(m) { return present.indexOf(m) !== -1; });
        var rest  = present.filter(function(m) { return saved.indexOf(m) === -1; });
        rest.sort(function(a, b) {
            var ai = itemsForMachineInZone(a, zoneId)[0];
            var bi = itemsForMachineInZone(b, zoneId)[0];
            var av = ai ? (ai.cumVal !== null ? ai.cumVal : ai.diff) : 0;
            var bv = bi ? (bi.cumVal !== null ? bi.cumVal : bi.diff) : 0;
            return av - bv;
        });
        return saved.concat(rest);
    }

    function shortNameOf(machine) {
        if (typeof getMachineShortName === 'function') {
            try { return getMachineShortName(machine) || machine; } catch (e) {}
        }
        return machine;
    }

    function valText(item) {
        var v = (item.cumVal !== null) ? item.cumVal : item.diff;
        return (v >= 0 ? '+' : '') + v.toLocaleString();
    }

    function zoneOfMachine(machine) { return state.placement[machine] || 'other'; }

    // ========== 作成: 描画 ==========

    function renderChip(item) {
        var key = chipKey(item.machine, item.num);
        var isExcluded = !!state.excluded[key];
        var cls = 'aim-chip aim-chip-kubi-' + item.kubi + (isExcluded ? ' aim-chip-excluded' : '');
        return '<span class="' + cls + '"'
            + ' data-machine="' + escapeAttr(item.machine) + '"'
            + ' data-num="' + escapeAttr(item.num) + '"'
            + ' data-kubi="' + item.kubi + '">'
            + '<span class="aim-chip-rank">' + kubiMedal(item.kubi) + '</span>'
            + '<span class="aim-chip-num">' + escapeAttr(item.num) + '</span>'
            + '<span class="aim-chip-val">' + valText(item) + '</span>'
            + '</span>';
    }

    function renderCard(machine, zoneId) {
        var items = itemsForMachineInZone(machine, zoneId);
        var chips = items.map(renderChip).join('');
        return '<div class="aim-card" data-machine="' + escapeAttr(machine) + '" data-zone="' + zoneId + '">'
            + '<div class="aim-card-head">'
            + '<span class="aim-card-grip" aria-hidden="true">⠿</span>'
            + '<span class="aim-card-name">' + escapeHtml(shortNameOf(machine)) + '</span>'
            + '</div>'
            + '<div class="aim-card-chips">' + chips + '</div>'
            + '</div>';
    }

    function renderBoard() {
        var board = document.getElementById('aimBoard');
        if (!board) return;
        var html = ZONES.map(function(zone) {
            var machines = machinesInZone(zone.id);
            var cards = machines.map(function(m) { return renderCard(m, zone.id); }).join('');
            var emptyHint = machines.length === 0 ? '<div class="aim-zone-empty">ここにドラッグ</div>' : '';
            return '<div class="aim-zone aim-zone-' + zone.id + '" data-zone="' + zone.id + '">'
                + '<div class="aim-zone-head">'
                + '<span class="aim-zone-label">' + zone.label + '</span>'
                + '<span class="aim-zone-count">' + machines.length + '機種</span>'
                + '</div>'
                + '<div class="aim-zone-body" data-zone="' + zone.id + '">'
                + cards + emptyHint
                + '</div>'
                + '</div>';
        }).join('');
        board.innerHTML = html;
        bindDrag();
        bindChipToggle();
        bindCardTapMenu();
        updateMeta();
    }

    function updateMeta() {
        var dateLabel = currentFile && typeof formatDate === 'function' ? formatDate(currentFile) : (currentFile || '-');
        var days = (typeof MachineBadge !== 'undefined') ? MachineBadge.getBadgeDays() : '?';
        var base = (typeof MachineBadge !== 'undefined' && MachineBadge.getBadgeBase() === 'prev') ? '前日基準' : '当日含む';
        var col  = (typeof MachineBadge !== 'undefined') ? MachineBadge.getTargetColumn() : '差枚';
        var meta = document.getElementById('aimMeta');
        if (meta) meta.textContent = dateLabel + ' / 凹み判定: ' + days + '日累積・' + base + '・' + col;
    }

    // プリセットキー単位で3位表示をトグル
    function toggleRank3ForPreset(presetKey) {
        var cur = isRank3VisibleForPresetKey(presetKey, state);
        state.rank3ByPreset[presetKey] = !cur;
        saveState();
        renderHiddenList(); // ボタン表記更新
        renderBoard();      // 盤面に反映
    }

    // ========== 凹み判定（バッジ）設定パネル ==========

    var badgePanelRendered = false;

    function renderBadgePanel() {
        var container = document.getElementById('aimBadgeSettings');
        if (!container || typeof MachineBadge === 'undefined') return;
        container.innerHTML = MachineBadge.renderSettingsHtml('aimMb');
        MachineBadge.setupSettingsEvents('aimMb', function() {
            render();
        });
        badgePanelRendered = true;
    }

    function toggleBadgePanel() {
        var panel = document.getElementById('aimBadgePanel');
        if (!panel) return;
        panel.classList.toggle('open');
        if (panel.classList.contains('open') && !badgePanelRendered) {
            renderBadgePanel();
        }
    }

    // ========== 機種除外パネル ==========

    function renderHiddenPanel() { renderHiddenList(); }

    function applyPresetToHidden(presetId, hide) {
        if (presetId === OTHER_PRESET_KEY) {
            // 「その他」グループはプリセット未所属機種を直接操作
            var map = getMachinePresetMap();
            Object.keys(builtRaw).forEach(function(machine) {
                if (map[machine] !== OTHER_PRESET_KEY) return;
                if (hide) state.hiddenMachines[machine] = true;
                else delete state.hiddenMachines[machine];
            });
            rebuildVisible();
            saveState();
            renderHiddenList();
            renderBoard();
            return;
        }

        if (typeof MachinePreset === 'undefined') return;
        var preset = MachinePreset.getAll().filter(function(p) { return p.id === presetId; })[0];
        if (!preset) return;
        var machineOptions = currentMachineOptions();
        var resolved = MachinePreset.resolve(preset, machineOptions, machineOptions);
        resolved.forEach(function(machine) {
            if (builtRaw[machine] === undefined) return;
            if (hide) state.hiddenMachines[machine] = true;
            else delete state.hiddenMachines[machine];
        });
        rebuildVisible();
        saveState();
        renderHiddenList();
        renderBoard();
    }

    // 機種除外リスト：プリセットグループ順＋各グループ内は基準日の設置台数の降順で描画。
    // 各グループ見出しに「表示／除外」「3位表示/非表示」ボタンを配置。
    function renderHiddenList() {
        var panel = document.getElementById('aimHiddenList');
        if (!panel) return;

        var allMachines = Object.keys(builtRaw);
        if (allMachines.length === 0) {
            panel.innerHTML = '<div class="aim-zone-empty">対象機種がありません</div>';
            return;
        }

        var machineOptions = currentMachineOptions();
        var countMap = {};
        machineOptions.forEach(function(o) {
            if (o && o.value !== undefined) countMap[o.value] = (o.count !== undefined ? o.count : 0);
        });
        function installCount(m) {
            return (countMap[m] !== undefined) ? countMap[m] : builtRaw[m].length;
        }

        // 機種 -> プリセットキーのマップで振り分け
        var map = getMachinePresetMap();
        var presets = orderedPresetsForHidden();

        // グループ枠を順番どおりに用意（プリセット順 → その他）
        var groups = []; // { key, name, machines:[] }
        presets.forEach(function(p) {
            groups.push({ key: p.id, name: p.name, machines: [] });
        });
        var otherGroup = { key: OTHER_PRESET_KEY, name: 'その他', machines: [] };

        allMachines.forEach(function(m) {
            var key = map[m] || OTHER_PRESET_KEY;
            var g = null;
            for (var i = 0; i < groups.length; i++) { if (groups[i].key === key) { g = groups[i]; break; } }
            if (!g) g = otherGroup;
            g.machines.push(m);
        });
        if (otherGroup.machines.length > 0) groups.push(otherGroup);

        // 空グループは描画しない
        groups = groups.filter(function(g) { return g.machines.length > 0; });

        // 各グループ内を設置台数の降順（同数なら短縮名順）でソート
        groups.forEach(function(g) {
            g.machines.sort(function(a, b) {
                var diff = installCount(b) - installCount(a);
                if (diff !== 0) return diff;
                return shortNameOf(a).localeCompare(shortNameOf(b), 'ja');
            });
        });

        // 描画
        var html = groups.map(function(g) {
            var rank3On = isRank3VisibleForPresetKey(g.key, state);
            var rank3Label = rank3On ? '💀🥉 3位を隠す' : '💀🥉 3位を表示';
            var rank3Cls = 'btn-small aim-group-rank3' + (rank3On ? '' : ' aim-rank3-off');

            var headBtns = ''
                + '<div class="aim-hidden-group-btns">'
                + '<button class="btn-small aim-preset-show" data-preset="' + escapeAttr(g.key) + '">表示</button>'
                + '<button class="btn-small aim-preset-hide" data-preset="' + escapeAttr(g.key) + '">除外</button>'
                + '<button class="' + rank3Cls + '" data-preset="' + escapeAttr(g.key) + '">' + rank3Label + '</button>'
                + '</div>';

            var items = g.machines.map(function(m) {
                var checked = state.hiddenMachines[m] ? '' : ' checked';
                var cnt = installCount(m);
                return '<label class="aim-hidden-item">'
                    + '<input type="checkbox" class="aim-hidden-cb" data-machine="' + escapeAttr(m) + '"' + checked + '>'
                    + '<span>' + escapeHtml(shortNameOf(m)) + '</span>'
                    + '<span class="aim-hidden-count">' + cnt + '台</span>'
                    + '</label>';
            }).join('');

            return '<div class="aim-hidden-group">'
                + '<div class="aim-hidden-group-head">'
                + '<span class="aim-hidden-group-name">' + escapeHtml(g.name) + '</span>'
                + headBtns
                + '</div>'
                + '<div class="aim-hidden-group-body">' + items + '</div>'
                + '</div>';
        }).join('');

        panel.innerHTML = html;

        // 機種チェックボックス
        panel.querySelectorAll('.aim-hidden-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
                var m = this.dataset.machine;
                if (this.checked) delete state.hiddenMachines[m];
                else state.hiddenMachines[m] = true;
                rebuildVisible();
                saveState();
                renderBoard();
            });
        });

        // グループ「表示」ボタン
        panel.querySelectorAll('.aim-preset-show').forEach(function(btn) {
            btn.addEventListener('click', function() { applyPresetToHidden(this.dataset.preset, false); });
        });
        // グループ「除外」ボタン
        panel.querySelectorAll('.aim-preset-hide').forEach(function(btn) {
            btn.addEventListener('click', function() { applyPresetToHidden(this.dataset.preset, true); });
        });
        // グループ「3位表示/非表示」ボタン
        panel.querySelectorAll('.aim-group-rank3').forEach(function(btn) {
            btn.addEventListener('click', function() { toggleRank3ForPreset(this.dataset.preset); });
        });
    }

    function toggleHiddenPanel() {
        var panel = document.getElementById('aimHiddenPanel');
        if (!panel) return;
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) renderHiddenPanel();
    }

    // ========== ドラッグ統合 ==========

    var drag = null;

    function bindDrag() {
        var board = document.getElementById('aimBoard');
        if (!board) return;

        board.querySelectorAll('.aim-card').forEach(function(card) {
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', function(e) {
                if (e.target.closest('.aim-chip')) return;
                drag = { type: 'card', machine: card.dataset.machine, fromZone: card.dataset.zone };
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', 'card'); } catch (ex) {}
                card.classList.add('aim-dragging');
            });
            card.addEventListener('dragend', function() {
                card.classList.remove('aim-dragging'); clearDropMarkers(); drag = null;
            });
        });

        board.querySelectorAll('.aim-chip').forEach(function(chip) {
            chip.setAttribute('draggable', 'true');
            chip.addEventListener('dragstart', function(e) {
                e.stopPropagation();
                drag = { type: 'chip', machine: chip.dataset.machine, num: chip.dataset.num, kubi: parseInt(chip.dataset.kubi) };
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', 'chip'); } catch (ex) {}
                chip.classList.add('aim-dragging');
            });
            chip.addEventListener('dragend', function() {
                chip.classList.remove('aim-dragging'); clearDropMarkers(); drag = null;
            });
        });

        board.querySelectorAll('.aim-zone-body').forEach(function(zoneBody) {
            zoneBody.addEventListener('dragover', function(e) {
                e.preventDefault(); e.dataTransfer.dropEffect = 'move'; showDropMarker(zoneBody, e.clientY);
            });
            zoneBody.addEventListener('dragleave', function(e) {
                if (e.target === zoneBody) zoneBody.classList.remove('aim-zone-over');
            });
            zoneBody.addEventListener('drop', function(e) {
                e.preventDefault();
                var targetZone = zoneBody.dataset.zone;
                var beforeMachine = cardMachineAtY(zoneBody, e.clientY);
                clearDropMarkers();
                if (!drag || !targetZone) return;
                applyDrop(drag, targetZone, beforeMachine);
                drag = null;
            });
        });

        board.querySelectorAll('.aim-chip').forEach(function(chip) {
            chip.addEventListener('touchstart', function(e) { onTouchStart(e, 'chip'); }, { passive: false });
        });
        board.querySelectorAll('.aim-card').forEach(function(card) {
            card.addEventListener('touchstart', function(e) {
                if (e.target.closest('.aim-chip')) return;
                onTouchStart(e, 'card');
            }, { passive: false });
        });
    }

    var lp = null;

    function onTouchStart(e, kind) {
        cancelLongPress(); removeAllGhosts();
        var el = e.currentTarget;
        var t = e.touches[0];
        lp = { el: el, kind: kind, startX: t.clientX, startY: t.clientY, dragging: false, tapped: true, timer: null };
        lp.timer = setTimeout(function() { startTouchDrag(); }, LONGPRESS_MS);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });
        document.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    function startTouchDrag() {
        if (!lp) return;
        lp.dragging = true; lp.tapped = false;
        var el = lp.el;
        if (lp.kind === 'chip') drag = { type: 'chip', machine: el.dataset.machine, num: el.dataset.num, kubi: parseInt(el.dataset.kubi) };
        else drag = { type: 'card', machine: el.dataset.machine, fromZone: el.dataset.zone };
        var ghost = el.cloneNode(true);
        ghost.classList.add('aim-touch-ghost'); ghost.classList.remove('aim-dragging');
        ghost.style.width = el.offsetWidth + 'px';
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        moveGhost(lp.startX, lp.startY);
        el.classList.add('aim-dragging');
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    }

    function onTouchMove(e) {
        if (!lp) return;
        var t = e.touches[0];
        if (!lp.dragging) {
            var dx = Math.abs(t.clientX - lp.startX), dy = Math.abs(t.clientY - lp.startY);
            if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
                cancelLongPress(); detachTouchListeners(); lp = null;
            }
            return;
        }
        e.preventDefault();
        moveGhost(t.clientX, t.clientY);
        var zoneBody = zoneBodyAtPoint(t.clientX, t.clientY);
        clearDropMarkers();
        if (zoneBody) showDropMarker(zoneBody, t.clientY);
    }

    function onTouchEnd(e) {
        var wasDragging = lp && lp.dragging, wasTap = lp && lp.tapped, kind = lp ? lp.kind : null, el = lp ? lp.el : null;
        cancelLongPress(); detachTouchListeners();
        var point = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
        if (wasDragging) {
            var zoneBody = point ? zoneBodyAtPoint(point.clientX, point.clientY) : null;
            removeAllGhosts();
            var localDrag = drag;
            clearDropMarkers(); cleanupDragClasses();
            if (localDrag && zoneBody) {
                var targetZone = zoneBody.dataset.zone;
                var beforeMachine = point ? cardMachineAtY(zoneBody, point.clientY) : null;
                applyDrop(localDrag, targetZone, beforeMachine);
            } else { renderBoard(); }
            drag = null; lp = null; return;
        }
        if (wasTap && el) {
            if (kind === 'chip') toggleChipExcluded(el.dataset.machine, el.dataset.num);
            else openCardMenu(el, point);
        }
        lp = null;
    }

    function cancelLongPress() { if (lp && lp.timer) { clearTimeout(lp.timer); lp.timer = null; } }
    function detachTouchListeners() {
        document.removeEventListener('touchmove', onTouchMove, { passive: false });
        document.removeEventListener('touchend', onTouchEnd, { passive: false });
        document.removeEventListener('touchcancel', onTouchEnd, { passive: false });
    }
    function cleanupDragClasses() {
        var board = document.getElementById('aimBoard');
        if (!board) return;
        board.querySelectorAll('.aim-dragging').forEach(function(el) { el.classList.remove('aim-dragging'); });
    }
    function moveGhost(x, y) {
        if (!drag || !drag.ghost) return;
        drag.ghost.style.left = (x + 8) + 'px';
        drag.ghost.style.top  = (y + 8) + 'px';
    }
    function removeAllGhosts() {
        var g = document.querySelectorAll('.aim-touch-ghost');
        for (var i = 0; i < g.length; i++) if (g[i].parentNode) g[i].parentNode.removeChild(g[i]);
    }
    function zoneBodyAtPoint(x, y) {
        var el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('.aim-zone-body') : null;
    }
    function cardMachineAtY(zoneBody, y) {
        var cards = Array.prototype.slice.call(zoneBody.querySelectorAll('.aim-card'));
        for (var i = 0; i < cards.length; i++) {
            var r = cards[i].getBoundingClientRect();
            if (y < r.top + r.height / 2) return cards[i].dataset.machine;
        }
        return null;
    }
    function showDropMarker(zoneBody, y) {
        clearDropMarkers();
        zoneBody.classList.add('aim-zone-over');
        var before = cardMachineAtY(zoneBody, y);
        var cards = zoneBody.querySelectorAll('.aim-card');
        if (before === null) { if (cards.length) cards[cards.length - 1].classList.add('aim-drop-after'); }
        else {
            var target = zoneBody.querySelector('.aim-card[data-machine="' + cssEsc(before) + '"]');
            if (target) target.classList.add('aim-drop-before');
        }
    }
    function clearDropMarkers() {
        var board = document.getElementById('aimBoard');
        if (!board) return;
        board.querySelectorAll('.aim-zone-over').forEach(function(z) { z.classList.remove('aim-zone-over'); });
        board.querySelectorAll('.aim-drop-before').forEach(function(c) { c.classList.remove('aim-drop-before'); });
        board.querySelectorAll('.aim-drop-after').forEach(function(c) { c.classList.remove('aim-drop-after'); });
    }

    // ========== カードのタップメニュー ==========

    function bindCardTapMenu() {
        var board = document.getElementById('aimBoard');
        if (!board) return;
        board.querySelectorAll('.aim-card').forEach(function(card) {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.aim-chip')) return;
                if (drag) return;
                openCardMenu(card, { clientX: e.clientX, clientY: e.clientY });
            });
        });
    }

    function openCardMenu(cardEl, point) {
        closeCardMenu();
        var machine = cardEl.dataset.machine;
        var curZone = zoneOfMachine(machine);
        var menu = document.createElement('div');
        menu.className = 'aim-card-menu'; menu.id = 'aimCardMenu';
        var title = document.createElement('div');
        title.className = 'aim-card-menu-title'; title.textContent = shortNameOf(machine) + ' を移動';
        menu.appendChild(title);
        ZONES.forEach(function(z) {
            var btn = document.createElement('button');
            btn.className = 'aim-card-menu-item' + (z.id === curZone ? ' current' : '');
            btn.textContent = (z.id === curZone ? '✓ ' : '') + z.label + 'へ';
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (z.id !== curZone) {
                    state.placement[machine] = z.id;
                    clearPerUnit(machine);
                    reorderInZone(z.id, machine, null);
                    saveState(); renderBoard();
                }
                closeCardMenu();
            });
            menu.appendChild(btn);
        });
        document.body.appendChild(menu);
        var px = point && point.clientX ? point.clientX : (window.innerWidth / 2);
        var py = point && point.clientY ? point.clientY : (window.innerHeight / 2);
        var mw = menu.offsetWidth, mh = menu.offsetHeight;
        menu.style.left = Math.max(8, Math.min(px, window.innerWidth - mw - 8)) + 'px';
        menu.style.top  = Math.max(8, Math.min(py, window.innerHeight - mh - 8)) + 'px';
        setTimeout(function() {
            document.addEventListener('click', onDocClickCloseMenu, true);
            document.addEventListener('touchstart', onDocClickCloseMenu, true);
        }, 0);
    }
    function onDocClickCloseMenu(e) {
        var menu = document.getElementById('aimCardMenu');
        if (menu && !menu.contains(e.target)) closeCardMenu();
    }
    function closeCardMenu() {
        var menu = document.getElementById('aimCardMenu');
        if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
        document.removeEventListener('click', onDocClickCloseMenu, true);
        document.removeEventListener('touchstart', onDocClickCloseMenu, true);
    }

    // ========== ドロップ確定 ==========

    function applyDrop(payload, targetZone, beforeMachine) {
        if (payload.type === 'card') {
            state.placement[payload.machine] = targetZone;
            clearPerUnit(payload.machine);
            reorderInZone(targetZone, payload.machine, beforeMachine);
        } else if (payload.type === 'chip') {
            state.perUnit[chipKey(payload.machine, payload.num)] = targetZone;
            reorderInZone(targetZone, payload.machine, beforeMachine);
        }
        saveState();
        renderBoard();
    }

    function reorderInZone(zoneId, machine, beforeMachine) {
        ZONES.forEach(function(z) {
            if (!state.order[z.id]) return;
            state.order[z.id] = state.order[z.id].filter(function(m) { return m !== machine; });
        });
        if (!state.order[zoneId]) state.order[zoneId] = machinesInZone(zoneId).filter(function(m) { return m !== machine; });
        var arr = state.order[zoneId];
        if (beforeMachine && beforeMachine !== machine && arr.indexOf(beforeMachine) !== -1) {
            arr.splice(arr.indexOf(beforeMachine), 0, machine);
        } else { arr.push(machine); }
    }

    function clearPerUnit(machine) {
        Object.keys(state.perUnit).forEach(function(k) {
            if (k.indexOf(machine + '_') === 0) delete state.perUnit[k];
        });
    }

    // ========== チップ除外トグル ==========

    function bindChipToggle() {
        var board = document.getElementById('aimBoard');
        if (!board) return;
        board.querySelectorAll('.aim-chip').forEach(function(chip) {
            var moved = false;
            chip.addEventListener('mousedown', function() { moved = false; });
            chip.addEventListener('dragstart', function() { moved = true; });
            chip.addEventListener('click', function(e) {
                if (moved) { moved = false; return; }
                e.stopPropagation();
                toggleChipExcluded(chip.dataset.machine, chip.dataset.num);
            });
        });
    }

    function toggleChipExcluded(machine, num) {
        var key = chipKey(machine, num);
        if (state.excluded[key]) delete state.excluded[key];
        else state.excluded[key] = true;
        saveState();
        renderBoard();
    }

    // ========== 画像出力 ==========

    function buildExportListEl() {
        var wrap = document.createElement('div');
        wrap.className = 'aim-export-list';
        var dateLabel = currentFile && typeof formatDate === 'function' ? formatDate(currentFile) : (currentFile || '-');
        var authorLabel = author ? '　作成: ' + author : '';
        var head = document.createElement('div');
        head.className = 'aim-export-head';
        head.innerHTML = '<div class="aim-export-title">🎯 狙い台シート</div>'
            + '<div class="aim-export-sub">' + escapeHtml(dateLabel) + escapeHtml(authorLabel) + '</div>';
        wrap.appendChild(head);

        ZONES.forEach(function(zone) {
            var machines = machinesInZone(zone.id);
            var section = document.createElement('div');
            section.className = 'aim-export-section aim-export-' + zone.id;
            var zoneHead = document.createElement('div');
            zoneHead.className = 'aim-export-zone-label';
            zoneHead.textContent = zone.label;
            section.appendChild(zoneHead);
            var anyRow = false;
            machines.forEach(function(machine) {
                var items = itemsForMachineInZone(machine, zone.id).filter(function(it) {
                    return !state.excluded[chipKey(machine, it.num)];
                });
                if (items.length === 0) return;
                anyRow = true;
                var row = document.createElement('div');
                row.className = 'aim-export-row';
                var name = document.createElement('span');
                name.className = 'aim-export-name';
                name.textContent = shortNameOf(machine);
                row.appendChild(name);
                items.forEach(function(it) {
                    var unit = document.createElement('span');
                    unit.className = 'aim-export-unit aim-export-kubi-' + it.kubi;
                    unit.textContent = kubiMedal(it.kubi) + ' ' + it.num;
                    row.appendChild(unit);
                });
                section.appendChild(row);
            });
            if (!anyRow) {
                var empty = document.createElement('div');
                empty.className = 'aim-export-empty'; empty.textContent = '—';
                section.appendChild(empty);
            }
            wrap.appendChild(section);
        });
        return wrap;
    }

    function exportImage() {
        if (typeof html2canvas === 'undefined') { alert('画像ライブラリ(html2canvas)が読み込まれていません。'); return; }
        var holder = document.createElement('div');
        holder.style.position = 'fixed'; holder.style.left = '-99999px'; holder.style.top = '0'; holder.style.zIndex = '-1';
        var listEl = buildExportListEl();
        holder.appendChild(listEl);
        document.body.appendChild(holder);
        var bg = getComputedStyle(document.body).backgroundColor || '#1a1a2e';
        html2canvas(listEl, { backgroundColor: bg, scale: 2, useCORS: true, logging: false })
        .then(function(canvas) {
            document.body.removeChild(holder);
            var dateStr = currentFile ? currentFile.replace('data/', '').replace('.csv', '') : 'aim';
            canvas.toBlob(function(blob) {
                if (!blob) return;
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = '狙い台_' + dateStr + (author ? '_' + author : '') + '.png';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
            }, 'image/png');
        }).catch(function(err) {
            if (holder.parentNode) document.body.removeChild(holder);
            console.error('画像出力エラー:', err);
            alert('画像の出力に失敗しました。');
        });
    }

    // ========== 振り返り（答え合わせ） ==========

    // 振り返り用の機種→プリセットキー対応（答え合わせ日の設置台数で判定）
    var reviewPresetMap = null;

    function computeReviewPresetMap(reviewFile, machineSet) {
        var map = {};
        var machines = Object.keys(machineSet);
        if (machines.length === 0) return map;

        var machineOptions = (typeof getMachineOptionsForDate === 'function')
            ? getMachineOptionsForDate(reviewFile)
            : machines.map(function(m) { return { value: m, count: 1 }; });

        var presets = orderedPresetsForHidden();
        var assigned = {};
        presets.forEach(function(p) {
            var resolved = (typeof MachinePreset !== 'undefined')
                ? (MachinePreset.resolve(p, machineOptions, machineOptions) || [])
                : [];
            resolved.forEach(function(machine) {
                if (!machineSet[machine]) return;
                if (assigned[machine]) return;
                assigned[machine] = true;
                map[machine] = p.id;
            });
        });
        machines.forEach(function(m) { if (!assigned[m]) map[m] = OTHER_PRESET_KEY; });
        return map;
    }

    function reviewPresetKeyOf(machine) {
        return (reviewPresetMap && reviewPresetMap[machine]) ? reviewPresetMap[machine] : OTHER_PRESET_KEY;
    }

    // 答え合わせ日を前日基準でバッジ計算し、凹み台を {machine, num, kubi} で返す。
    function buildReviewKubiList(reviewFile) {
        if (typeof MachineBadge === 'undefined') return [];
        if (!reviewFile || !dataCache || !dataCache[reviewFile]) return [];

        var savedBase = null;
        try { savedBase = localStorage.getItem(MB_BASE_KEY); } catch (e) {}

        var list = [];
        try {
            try { localStorage.setItem(MB_BASE_KEY, 'prev'); } catch (e) {}
            if (typeof MachineBadge.loadSettings === 'function') MachineBadge.loadSettings();

            var rawData = dataCache[reviewFile].map(function(r) { return Object.assign({}, r); });
            if (typeof addMechanicalRateToData === 'function') rawData = addMechanicalRateToData(rawData);
            var badged = MachineBadge.assignBadges(rawData, reviewFile, dataCache, MachineBadge.getTargetColumn());

            badged.forEach(function(row) {
                var mb = row['_machineBadge'];
                if (!mb || mb.kubi === null || mb.kubi === undefined) return;
                if (KUBI_RANKS.indexOf(mb.kubi) === -1) return;
                list.push({
                    machine: row['機種名'] || '',
                    num:     row['台番号'] || '',
                    kubi:    mb.kubi
                });
            });
        } finally {
            try {
                if (savedBase === null) localStorage.removeItem(MB_BASE_KEY);
                else localStorage.setItem(MB_BASE_KEY, savedBase);
            } catch (e) {}
            if (typeof MachineBadge.loadSettings === 'function') MachineBadge.loadSettings();
        }
        return list;
    }

    // 答え合わせ日の台データを台番号でマップ化（G数/差枚/機械割）
    function reviewDayDataMap(reviewFile) {
        var map = {};
        if (!reviewFile || !dataCache || !dataCache[reviewFile]) return map;
        var rows = dataCache[reviewFile];
        var withRate = (typeof addMechanicalRateToData === 'function') ? addMechanicalRateToData(rows) : rows;
        withRate.forEach(function(row) {
            var num = String(row['台番号'] || '');
            map[num] = {
                machine: row['機種名'] || '',
                games:   parseInt(String(row['G数']).replace(/,/g, '')) || 0,
                diff:    parseInt(String(row['差枚']).replace(/,/g, '')) || 0,
                rate:    (row['機械割'] !== null && row['機械割'] !== undefined && !isNaN(row['機械割'])) ? row['機械割'] : null
            };
        });
        return map;
    }

    // 振り返り結果を構築。ゾーンごとに対象台の実績を集計（reviewState を使用）。
    function buildReviewResult(reviewFile) {
        var kubiList = buildReviewKubiList(reviewFile);
        var dayMap = reviewDayDataMap(reviewFile);

        // 振り返り対象機種のプリセットマップを答え合わせ日基準で作る
        var machineSet = {};
        kubiList.forEach(function(it) { machineSet[it.machine] = true; });
        reviewPresetMap = computeReviewPresetMap(reviewFile, machineSet);

        var byZone = { top: [], high: [], other: [] };

        kubiList.forEach(function(it) {
            // 3位非表示はシートのプリセット単位設定に従う
            if (it.kubi === 3) {
                var pkey = reviewPresetKeyOf(it.machine);
                if (!isRank3VisibleForPresetKey(pkey, reviewState)) return;
            }

            var key = chipKey(it.machine, it.num);
            if (reviewState.excluded[key]) return;
            if (reviewState.hiddenMachines[it.machine]) return;

            var zone = reviewZoneOf(it.machine, it.num);
            if (!byZone[zone]) byZone[zone] = [];

            var day = dayMap[String(it.num)];
            var hasData = !!day;
            var rate = hasData ? day.rate : null;
            var hit = (hasData && rate !== null) ? (rate >= WIN_RATE) : null;

            byZone[zone].push({
                machine: it.machine,
                num:     it.num,
                kubi:    it.kubi,
                hasData: hasData,
                games:   hasData ? day.games : null,
                diff:    hasData ? day.diff  : null,
                rate:    rate,
                hit:     hit
            });
        });

        Object.keys(byZone).forEach(function(z) {
            byZone[z].sort(function(a, b) {
                var ar = (a.rate === null) ? -Infinity : a.rate;
                var br = (b.rate === null) ? -Infinity : b.rate;
                return br - ar;
            });
        });

        return byZone;
    }

    function zoneHitStats(rows) {
        var denom = 0, hit = 0;
        rows.forEach(function(r) {
            if (r.hasData && r.hit !== null) {
                denom++;
                if (r.hit) hit++;
            }
        });
        return { denom: denom, hit: hit, rate: denom > 0 ? (hit / denom * 100) : null };
    }

    function fmtRate(v) {
        return (v === null || v === undefined || isNaN(v)) ? '-' : v.toFixed(2) + '%';
    }
    function fmtHitRate(v) {
        return (v === null) ? '-' : v.toFixed(1) + '%';
    }

    function refreshReviewSheetList() {
        var sel = document.getElementById('aimReviewSheetSelect');
        if (!sel) return Promise.resolve();

        return fetch(AIM_API_URL)
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var sheets = (res && res.sheets) ? res.sheets : [];
                var opts = ['<option value="__current__">現在の作成タブの配置</option>'];
                sheets.forEach(function(s) {
                    var dateTxt = s.date_key ? '（' + s.date_key.replace(/_/g, '/') + '）' : '';
                    opts.push('<option value="' + escapeAttr(s.author) + '">'
                        + escapeHtml(s.author + dateTxt) + '</option>');
                });
                sel.innerHTML = opts.join('');
                sel.value = reviewSheetSel;
                if (sel.value !== reviewSheetSel) {
                    reviewSheetSel = '__current__';
                    sel.value = '__current__';
                }
            })
            .catch(function() {
                sel.innerHTML = '<option value="__current__">現在の作成タブの配置</option>';
                sel.value = '__current__';
                reviewSheetSel = '__current__';
            });
    }

    function loadReviewState() {
        if (reviewSheetSel === '__current__') {
            reviewState.placement      = Object.assign({}, state.placement);
            reviewState.perUnit        = Object.assign({}, state.perUnit);
            reviewState.excluded       = Object.assign({}, state.excluded);
            reviewState.hiddenMachines = Object.assign({}, state.hiddenMachines);
            reviewState.showRank3      = state.showRank3;
            reviewState.rank3ByPreset  = Object.assign({}, state.rank3ByPreset);
            return Promise.resolve();
        }

        if (reviewCloudCache[reviewSheetSel]) {
            applyToReviewState(reviewCloudCache[reviewSheetSel]);
            return Promise.resolve();
        }

        return fetch(AIM_API_URL + '?author=' + encodeURIComponent(reviewSheetSel))
            .then(function(r) {
                if (!r.ok) throw new Error('not found');
                return r.json();
            })
            .then(function(res) {
                var data = (res && res.data) ? res.data : null;
                reviewCloudCache[reviewSheetSel] = data || {};
                applyToReviewState(data);
            })
            .catch(function() {
                applyToReviewState(null);
            });
    }

    function applyToReviewState(data) {
        data = data || {};
        reviewState.placement      = data.placement      || {};
        reviewState.perUnit        = data.perUnit        || {};
        reviewState.excluded       = data.excluded       || {};
        reviewState.hiddenMachines = data.hiddenMachines || {};
        reviewState.showRank3      = (data.showRank3 !== undefined) ? data.showRank3 : true;
        reviewState.rank3ByPreset  = data.rank3ByPreset  || {};
    }

    function renderReview() {
        var reviewFile = resolveReviewDateFile();
        syncReviewDateNav();

        var summaryEl = document.getElementById('aimReviewSummary');
        var bodyEl    = document.getElementById('aimReviewBody');
        if (!summaryEl || !bodyEl) return;

        if (!reviewFile || !dataCache || !dataCache[reviewFile]) {
            summaryEl.innerHTML = '';
            bodyEl.innerHTML = '<div class="aim-empty-guide">答え合わせ日のデータが読み込めませんでした。</div>';
            return;
        }

        loadReviewState().then(function() {
            var byZone = buildReviewResult(reviewFile);

            var allRows = byZone.top.concat(byZone.high).concat(byZone.other);
            var totalStats = zoneHitStats(allRows);

            var summaryCards = [];
            summaryCards.push(
                '<div class="aim-review-stat aim-review-stat-total">'
                + '<div class="aim-review-stat-label">全体的中率</div>'
                + '<div class="aim-review-stat-value">' + fmtHitRate(totalStats.rate) + '</div>'
                + '<div class="aim-review-stat-sub">' + totalStats.hit + ' / ' + totalStats.denom + ' 台</div>'
                + '</div>'
            );
            ZONES.forEach(function(zone) {
                var st = zoneHitStats(byZone[zone.id] || []);
                summaryCards.push(
                    '<div class="aim-review-stat aim-review-stat-' + zone.id + '">'
                    + '<div class="aim-review-stat-label">' + zone.label + '</div>'
                    + '<div class="aim-review-stat-value">' + fmtHitRate(st.rate) + '</div>'
                    + '<div class="aim-review-stat-sub">' + st.hit + ' / ' + st.denom + ' 台</div>'
                    + '</div>'
                );
            });
            summaryEl.innerHTML = '<div class="aim-review-stats">' + summaryCards.join('') + '</div>'
                + '<div class="aim-review-note">的中 = 機械割 ' + WIN_RATE + '% 以上（設定4相当）。母数はデータがある台のみ。</div>';

            var html = ZONES.map(function(zone) {
                var rows = byZone[zone.id] || [];
                var st = zoneHitStats(rows);
                var tableRows = rows.map(function(r) {
                    if (!r.hasData) {
                        return '<tr class="aim-review-nodata">'
                            + '<td>' + kubiMedal(r.kubi) + '</td>'
                            + '<td>' + escapeHtml(shortNameOf(r.machine)) + '</td>'
                            + '<td>' + escapeHtml(r.num) + '</td>'
                            + '<td colspan="3" class="aim-review-nodata-cell">この日はデータなし（撤去/移動など）</td>'
                            + '<td>-</td>'
                            + '</tr>';
                    }
                    var diffCls = r.diff > 0 ? 'plus' : (r.diff < 0 ? 'minus' : '');
                    var rateCls = (r.rate !== null && r.rate >= 100) ? 'plus' : 'minus';
                    var hitBadge = r.hit
                        ? '<span class="aim-hit-badge hit">⭕ 的中</span>'
                        : '<span class="aim-hit-badge miss">✕</span>';
                    return '<tr>'
                        + '<td>' + kubiMedal(r.kubi) + '</td>'
                        + '<td>' + escapeHtml(shortNameOf(r.machine)) + '</td>'
                        + '<td>' + escapeHtml(r.num) + '</td>'
                        + '<td>' + r.games.toLocaleString() + '</td>'
                        + '<td class="' + diffCls + '">' + (r.diff >= 0 ? '+' : '') + r.diff.toLocaleString() + '</td>'
                        + '<td class="' + rateCls + '">' + fmtRate(r.rate) + '</td>'
                        + '<td>' + hitBadge + '</td>'
                        + '</tr>';
                }).join('');

                var emptyRow = rows.length === 0
                    ? '<tr><td colspan="7" class="aim-review-empty-cell">対象台なし</td></tr>'
                    : '';

                return '<div class="aim-review-zone aim-review-zone-' + zone.id + '">'
                    + '<div class="aim-review-zone-head">'
                    + '<span class="aim-review-zone-label">' + zone.label + '</span>'
                    + '<span class="aim-review-zone-hit">的中率 ' + fmtHitRate(st.rate) + '（' + st.hit + '/' + st.denom + '）</span>'
                    + '</div>'
                    + '<div class="table-wrapper">'
                    + '<table class="aim-review-table">'
                    + '<thead><tr><th>順位</th><th>機種</th><th>台番号</th><th>G数</th><th>差枚</th><th>機械割</th><th>判定</th></tr></thead>'
                    + '<tbody>' + tableRows + emptyRow + '</tbody>'
                    + '</table>'
                    + '</div>'
                    + '</div>';
            }).join('');

            bodyEl.innerHTML = html;
        });
    }

    function syncReviewDateNav() {
        var files = aimSortedFiles();
        var cur = resolveReviewDateFile();
        var idx = files.indexOf(cur);
        if (idx === -1) idx = 0;

        var sel = document.getElementById('aimReviewDateSelect');
        if (sel) {
            sel.innerHTML = files.map(function(f, i) {
                var t = (typeof formatDate === 'function') ? formatDate(f) : f;
                return '<option value="' + escapeAttr(f) + '"' + (i === idx ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
            }).join('');
        }
        var label = document.getElementById('aimReviewDateLabel');
        if (label) {
            var f = files[idx];
            var txt = '';
            if (f && typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
                try { txt = '（' + getDayOfWeekName(getDayOfWeek(f)) + '）'; } catch (e) {}
            }
            label.textContent = txt;
        }
    }

    function gotoReviewFile(file) {
        if (!file) return;
        reviewDateFile = file;
        ensureDataLoaded(file).then(function() {
            renderReview();
        });
    }

    // ========== タブ切替 ==========

    function switchTab(tab) {
        activeTab = (tab === 'review') ? 'review' : 'create';

        var createView = document.getElementById('aimCreateView');
        var reviewView = document.getElementById('aimReviewView');
        if (createView) createView.style.display = (activeTab === 'create') ? '' : 'none';
        if (reviewView) reviewView.style.display = (activeTab === 'review') ? '' : 'none';

        document.querySelectorAll('.aim-tab').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.aimTab === activeTab);
        });

        if (activeTab === 'review') {
            var file = resolveReviewDateFile();
            Promise.all([
                ensureDataLoaded(file),
                refreshReviewSheetList()
            ]).then(function() { renderReview(); });
        } else {
            render();
        }
    }

    // ========== ページ表示（作成ビュー） ==========

    function render() {
        loadState();

        var file = resolveAimDateFile();
        return ensureDataLoaded(file).then(function() {
            buildData();

            var board   = document.getElementById('aimBoard');
            var guide   = document.getElementById('aimEmptyGuide');
            var hasData = Object.keys(builtRaw).length > 0;

            if (guide) guide.style.display = hasData ? 'none' : 'block';
            if (board) board.style.display = hasData ? '' : 'none';

            syncDateNav();
            syncAuthorInput();
            refreshCloudList();

            var panel = document.getElementById('aimHiddenPanel');
            if (panel) panel.classList.remove('open');

            if (!hasData) {
                updateMeta();
                return;
            }

            applyDefaultPlacement();
            renderBoard();
        });
    }

    // 後方互換: 旧 open()/close() 呼び出し用の薄いラッパ
    function open()  { return render(); }
    function close() { closeCardMenu(); removeAllGhosts(); clearDropMarkers(); }

    function resetPlacement() {
        if (!confirm('配置をプリセット初期状態に戻しますか?（除外・機種除外・並び順・3位設定もクリアされます）')) return;
        state.placement = {}; state.perUnit = {}; state.excluded = {};
        state.hiddenMachines = {}; state.showRank3 = true; state.rank3ByPreset = {}; state.order = {};
        saveState();
        buildData();
        applyDefaultPlacement();
        renderBoard();
    }

    // ========== 日付ナビ（作成: 基準日セレクトのみ） ==========

    function gotoFile(file) {
        if (!file) return;
        aimDateFile = file;
        render();
    }

    function syncDateNav() {
        var files = aimSortedFiles();
        var cur = resolveAimDateFile();
        var idx = files.indexOf(cur);
        if (idx === -1) idx = 0;

        var sel = document.getElementById('aimDateSelect');
        if (sel) {
            sel.innerHTML = files.map(function(f, i) {
                var t = (typeof formatDate === 'function') ? formatDate(f) : f;
                return '<option value="' + escapeAttr(f) + '"' + (i === idx ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
            }).join('');
        }

        var label = document.getElementById('aimCurrentDateLabel');
        if (label) {
            var f = files[idx];
            var txt = '';
            if (f && typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
                try { txt = '（' + getDayOfWeekName(getDayOfWeek(f)) + '）'; } catch (e) {}
            }
            label.textContent = txt;
        }
    }

    // ========== 作成者欄 ==========

    function syncAuthorInput() {
        var input = document.getElementById('aimAuthorInput');
        if (input && input.value !== author) input.value = author;
    }

    // ========== イベント登録 ==========

    function setupEvents() {
        if (initialized) return;
        initialized = true;

        var bind = function(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
        bind('aimExportImageBtn', exportImage);
        bind('aimResetBtn', resetPlacement);
        bind('aimBadgeToggle', toggleBadgePanel);
        bind('aimHiddenToggle', toggleHiddenPanel);
        bind('aimCloudSaveBtn', cloudSave);
        bind('aimCloudDeleteBtn', cloudDelete);

        // ---- タブ切替 ----
        document.querySelectorAll('.aim-tab').forEach(function(btn) {
            btn.addEventListener('click', function() { switchTab(this.dataset.aimTab); });
        });

        // ---- 作成: 基準日セレクト ----
        var dateSel = document.getElementById('aimDateSelect');
        if (dateSel) {
            dateSel.addEventListener('change', function() { gotoFile(this.value); });
        }

        // ---- 振り返り: 答え合わせ日セレクト ----
        var reviewSel = document.getElementById('aimReviewDateSelect');
        if (reviewSel) {
            reviewSel.addEventListener('change', function() { gotoReviewFile(this.value); });
        }

        // ---- 振り返り: シート選択 ----
        var sheetSel = document.getElementById('aimReviewSheetSelect');
        if (sheetSel) {
            sheetSel.addEventListener('change', function() {
                reviewSheetSel = this.value;
                renderReview();
            });
        }

        // ---- 振り返り: シート一覧 再取得 ----
        var reloadBtn = document.getElementById('aimReviewReloadBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', function() {
                reviewCloudCache = {};
                refreshReviewSheetList().then(function() { renderReview(); });
            });
        }

        // 作成者入力
        var authorInput = document.getElementById('aimAuthorInput');
        if (authorInput) {
            authorInput.addEventListener('input', function() {
                author = this.value.trim();
                saveAuthor();
            });
        }

        // 他の人のシート読み込み（作成タブ）
        var cloudList = document.getElementById('aimCloudList');
        if (cloudList) {
            cloudList.addEventListener('change', function() {
                if (this.value) cloudLoad(this.value);
            });
        }

        // Esc でカードメニューだけ閉じる
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeCardMenu(); });
    }

    // ========== ヘルパ ==========

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function cssEsc(str) {
        if (window.CSS && CSS.escape) return CSS.escape(str);
        return String(str).replace(/["\\]/g, '\\$&');
    }

    return { setupEvents: setupEvents, render: render, open: open, close: close, exportImage: exportImage };
})();
