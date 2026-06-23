// ===================
// 狙い台作成ページ（AimSheet）
//
// ホーム（ターミナル）から独立ページ #aim として起動。
// 日付は DailyState を daily ページと共有（aim ページ独自の日付ナビも持つ）。
//
// PC: HTML5 Drag&Drop / スマホ: 長押しドラッグ＋タップメニュー の両対応。
// 凹みは 💀🥇💀🥈💀🥉 表記。3位は表示/非表示トグル。機種除外（プリセット一括可）。
// 画像はリスト形式で html2canvas 出力。
// 保存: localStorage（自動）＋ Cloudflare D1（作成者ごとに upsert / 他人のシート読込・削除）。
// ===================

var AimSheet = (function() {

    // ▼▼▼ ここをあなたの Worker URL に書き換える ▼▼▼
    var AIM_API_URL = 'https://aim-api.slot8192analyst.workers.dev/api/aim';
    // ▲▲▲ /api/aim まで含めること ▲▲▲

    var STORAGE_KEY = 'aimSheetState';
    var AUTHOR_KEY  = 'aimSheetAuthor';

    var ZONES = [
        { id: 'top',    label: '最優先', presetId: 'at_main' },
        { id: 'high',   label: '優先',   presetId: 'at_sub'  },
        { id: 'other',  label: 'その他', presetId: null      }
    ];

    var KUBI_RANKS = [1, 2, 3];
    var LONGPRESS_MS = 350;
    var MOVE_TOLERANCE = 10;

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
        showRank3: true,
        order: {}
    };

    var author = '';
    var builtRaw = {};
    var built = {};
    var currentFile = null;
    var initialized = false;

    // クラウド保存対象だけを抜き出す（死に台の数値は含めない）
    function pickPersist() {
        return {
            placement: state.placement,
            perUnit: state.perUnit,
            excluded: state.excluded,
            hiddenMachines: state.hiddenMachines,
            showRank3: state.showRank3,
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
            // セレクトを戻す
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

    // ========== データ構築 ==========

    function buildData() {
        builtRaw = {};
        if (typeof MachineBadge === 'undefined') { built = {}; return; }

        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var _s = (typeof DailyState !== 'undefined') ? DailyState.get() : {};
        currentFile = (_s.dateFile && sortedFiles.indexOf(_s.dateFile) !== -1)
            ? _s.dateFile : sortedFiles[currentDateIndex];

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
        var machineOptions = (typeof getMachineOptionsForDate === 'function')
            ? getMachineOptionsForDate(currentFile)
            : Object.keys(builtRaw).map(function(m) { return { value: m, count: builtRaw[m].length }; });

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

    // ========== 区分振り分け ==========

    function chipKey(machine, num) { return machine + '_' + num; }

    function visibleItems(items) {
        if (state.showRank3) return items;
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
        return visibleItems(filtered);
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

    // ========== 描画 ==========

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
        updateRank3Button();
    }

    function updateMeta() {
        var dateLabel = currentFile && typeof formatDate === 'function' ? formatDate(currentFile) : (currentFile || '-');
        var days = (typeof MachineBadge !== 'undefined') ? MachineBadge.getBadgeDays() : '?';
        var base = (typeof MachineBadge !== 'undefined' && MachineBadge.getBadgeBase() === 'prev') ? '前日基準' : '当日含む';
        var col  = (typeof MachineBadge !== 'undefined') ? MachineBadge.getTargetColumn() : '差枚';
        var meta = document.getElementById('aimMeta');
        if (meta) meta.textContent = dateLabel + ' / 凹み判定: ' + days + '日累積・' + base + '・' + col;
    }

    function updateRank3Button() {
        var btn = document.getElementById('aimRank3Toggle');
        if (!btn) return;
        btn.textContent = state.showRank3 ? '💀🥉 3位を隠す' : '💀🥉 3位を表示';
        btn.classList.toggle('aim-rank3-off', !state.showRank3);
    }

    function toggleRank3() {
        state.showRank3 = !state.showRank3;
        saveState();
        renderBoard();
    }

    // ========== 機種除外パネル ==========

    function renderHiddenPanel() { renderPresetButtons(); renderHiddenList(); }

    function renderPresetButtons() {
        var container = document.getElementById('aimPresetFilters');
        if (!container || typeof MachinePreset === 'undefined') return;
        var presets = MachinePreset.getAll();
        if (!presets || presets.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = presets.map(function(p) {
            return '<div class="aim-preset-row">'
                + '<span class="aim-preset-name">' + escapeHtml(p.name) + '</span>'
                + '<button class="btn-small aim-preset-show" data-preset="' + escapeAttr(p.id) + '">表示</button>'
                + '<button class="btn-small aim-preset-hide" data-preset="' + escapeAttr(p.id) + '">除外</button>'
                + '</div>';
        }).join('');
        container.querySelectorAll('.aim-preset-show').forEach(function(btn) {
            btn.addEventListener('click', function() { applyPresetToHidden(this.dataset.preset, false); });
        });
        container.querySelectorAll('.aim-preset-hide').forEach(function(btn) {
            btn.addEventListener('click', function() { applyPresetToHidden(this.dataset.preset, true); });
        });
    }

    function applyPresetToHidden(presetId, hide) {
        if (typeof MachinePreset === 'undefined') return;
        var preset = MachinePreset.getAll().filter(function(p) { return p.id === presetId; })[0];
        if (!preset) return;
        var machineOptions = (typeof getMachineOptionsForDate === 'function')
            ? getMachineOptionsForDate(currentFile)
            : Object.keys(builtRaw).map(function(m) { return { value: m, count: builtRaw[m].length }; });
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

    function renderHiddenList() {
        var panel = document.getElementById('aimHiddenList');
        if (!panel) return;
        var machines = Object.keys(builtRaw).sort(function(a, b) {
            return shortNameOf(a).localeCompare(shortNameOf(b), 'ja');
        });
        if (machines.length === 0) { panel.innerHTML = '<div class="aim-zone-empty">対象機種がありません</div>'; return; }
        panel.innerHTML = machines.map(function(m) {
            var checked = state.hiddenMachines[m] ? '' : ' checked';
            return '<label class="aim-hidden-item">'
                + '<input type="checkbox" class="aim-hidden-cb" data-machine="' + escapeAttr(m) + '"' + checked + '>'
                + '<span>' + escapeHtml(shortNameOf(m)) + '</span>'
                + '<span class="aim-hidden-count">' + builtRaw[m].length + '台</span>'
                + '</label>';
        }).join('');
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

    // ========== ページ表示（旧 open のモーダル非依存版） ==========

    function render() {
        loadState();
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
    }

    // 後方互換: 旧 open()/close() 呼び出し用の薄いラッパ
    function open()  { render(); }
    function close() { closeCardMenu(); removeAllGhosts(); clearDropMarkers(); }

    function resetPlacement() {
        if (!confirm('配置をプリセット初期状態に戻しますか?（除外・機種除外・並び順もクリアされます）')) return;
        state.placement = {}; state.perUnit = {}; state.excluded = {};
        state.hiddenMachines = {}; state.showRank3 = true; state.order = {};
        saveState();
        buildData();
        applyDefaultPlacement();
        renderBoard();
    }

    // ========== 日付ナビ（aim ページ独自） ==========

    function aimSortedFiles() {
        return (typeof sortFilesByDate === 'function') ? sortFilesByDate(CSV_FILES, true) : [];
    }

    function aimCurrentIndex() {
        var files = aimSortedFiles();
        var idx = currentFile ? files.indexOf(currentFile) : -1;
        if (idx === -1) idx = (typeof currentDateIndex === 'number') ? currentDateIndex : 0;
        return idx;
    }

    // 指定ファイルへ移動して再構築（DailyState 共有で daily と同期）
    function gotoFile(file) {
        if (!file) return;
        if (typeof DailyState !== 'undefined') {
            DailyState.setState({ dateFile: file }, { silent: true });
        } else if (typeof currentDateIndex === 'number') {
            var files = aimSortedFiles();
            var i = files.indexOf(file);
            if (i !== -1) currentDateIndex = i;
        }
        render();
    }

    // セレクトとラベルを現在ファイルに合わせて更新
    function syncDateNav() {
        var files = aimSortedFiles();
        var idx = aimCurrentIndex();

        var label = document.getElementById('aimCurrentDateLabel');
        if (label) {
            var f = files[idx];
            var txt = f && typeof formatDate === 'function' ? formatDate(f) : (f || '-');
            if (f && typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
                try { txt += '（' + getDayOfWeekName(getDayOfWeek(f)) + '）'; } catch (e) {}
            }
            label.textContent = txt;
        }

        var sel = document.getElementById('aimDateSelect');
        if (sel) {
            sel.innerHTML = files.map(function(f, i) {
                var t = (typeof formatDate === 'function') ? formatDate(f) : f;
                return '<option value="' + escapeAttr(f) + '"' + (i === idx ? ' selected' : '') + '>' + escapeHtml(t) + '</option>';
            }).join('');
        }

        var prev = document.getElementById('aimPrevDate');
        var next = document.getElementById('aimNextDate');
        if (prev) prev.disabled = idx >= files.length - 1;
        if (next) next.disabled = idx <= 0;
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
        bind('aimHiddenToggle', toggleHiddenPanel);
        bind('aimRank3Toggle', toggleRank3);
        bind('aimCloudSaveBtn', cloudSave);
        bind('aimCloudDeleteBtn', cloudDelete);

        // ---- 日付ナビ ----
        bind('aimPrevDate', function() {
            var files = aimSortedFiles();
            var idx = aimCurrentIndex();
            if (idx < files.length - 1) gotoFile(files[idx + 1]);
        });
        bind('aimNextDate', function() {
            var files = aimSortedFiles();
            var idx = aimCurrentIndex();
            if (idx > 0) gotoFile(files[idx - 1]);
        });
        bind('aimLatestDate', function() {
            var files = aimSortedFiles();
            if (files.length) gotoFile(files[0]);
        });
        var dateSel = document.getElementById('aimDateSelect');
        if (dateSel) {
            dateSel.addEventListener('change', function() { gotoFile(this.value); });
        }

        // 作成者入力
        var authorInput = document.getElementById('aimAuthorInput');
        if (authorInput) {
            authorInput.addEventListener('input', function() {
                author = this.value.trim();
                saveAuthor();
            });
        }

        // 他の人のシート読み込み
        var cloudList = document.getElementById('aimCloudList');
        if (cloudList) {
            cloudList.addEventListener('change', function() {
                if (this.value) cloudLoad(this.value);
            });
        }

        // Esc でカードメニューだけ閉じる（ページなのでモーダル close は不要）
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
