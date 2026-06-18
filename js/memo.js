// ===================
// メモタブ（SeatMemo）
//
// 「誰が座っていたか」「設定がどれだったか」を 日付×台番号 で1件メモする。
// 保存: localStorage（常時・ソースオブトゥルース）＋ Cloudflare D1（任意・同期できれば上乗せ）。
// 日付選択は iOS 風ホイール（データのある日だけが並ぶ）。
// メモは日別タブの「メモ」列にも バッジ で表示される。
// ===================

var SeatMemo = (function() {

    var MEMO_API_URL = 'https://aim-api.slot8192analyst.workers.dev/api/memo';

    var STORAGE_KEY = 'seatMemoState';
    var AUTHOR_KEY  = 'aimSheetAuthor';

    var SETTINGS = ['1', '2', '3', '4', '5', '6'];

    // memos[dateKey][daiban] = { machine, person, setting:[..], author, updatedAt }
    var memos = {};
    var author = '';
    var initialized = false;
    var currentDateKey = null;
    var selectedSetting = {};

    // ========== ストレージ（ローカル） ==========

    function loadLocal() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') memos = parsed;
            }
        } catch (e) {}
        try { author = localStorage.getItem(AUTHOR_KEY) || ''; } catch (e) {}
    }

    function saveLocal() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(memos)); } catch (e) {}
    }

    function saveAuthor() {
        try { localStorage.setItem(AUTHOR_KEY, author); } catch (e) {}
    }

    // ========== メモ操作（ローカル） ==========

    function getForDate(dateKey) {
        return memos[dateKey] || {};
    }

    function getMemo(dateKey, daiban) {
        return (memos[dateKey] && memos[dateKey][daiban]) ? memos[dateKey][daiban] : null;
    }

    function upsertMemo(dateKey, daiban, payload) {
        if (!dateKey || !daiban) return;
        if (!memos[dateKey]) memos[dateKey] = {};
        memos[dateKey][daiban] = {
            machine:   payload.machine || '',
            person:    payload.person  || '',
            setting:   payload.setting || [],
            author:    payload.author  || author || '',
            updatedAt: Date.now()
        };
        saveLocal();
        cloudPush(dateKey, daiban, memos[dateKey][daiban]);
    }

    function deleteMemo(dateKey, daiban) {
        if (memos[dateKey] && memos[dateKey][daiban]) {
            delete memos[dateKey][daiban];
            if (Object.keys(memos[dateKey]).length === 0) delete memos[dateKey];
            saveLocal();
            cloudDelete(dateKey, daiban);
        }
    }

    // ========== バッジ生成（日別タブ・メモ一覧で共用） ==========

    // 設定バッジ（色分け: 6=赤 → 1=青）
    function settingBadgesHtml(settingArr) {
        if (!settingArr || settingArr.length === 0) return '';
        return settingArr.map(function(s) {
            return '<span class="memo-badge memo-setting-badge memo-set-' + escapeAttr(s) + '">' + escapeHtml(s) + '</span>';
        }).join('');
    }

    // 人物バッジ
    function personBadgeHtml(person) {
        if (!person) return '';
        return '<span class="memo-badge memo-person-badge">👤' + escapeHtml(person) + '</span>';
    }

    // メモ全体をバッジHTMLで（日別タブのメモ列で使用）
    function badgeHtml(memo) {
        if (!memo) return '';
        var html = '';
        html += personBadgeHtml(memo.person);
        if (memo.setting && memo.setting.length > 0) {
            html += '<span class="memo-setting-badges">' + settingBadgesHtml(memo.setting) + '</span>';
        }
        return html;
    }

    // テキスト要約（CSVコピー等のフォールバック用に残す）
    function summaryText(memo) {
        if (!memo) return '';
        var parts = [];
        if (memo.person)  parts.push('👤' + memo.person);
        if (memo.setting && memo.setting.length > 0) parts.push('設定' + memo.setting.join(','));
        return parts.join(' / ');
    }

    // ========== クラウド（D1 / Workers・任意） ==========

    function cloudEnabled() { return !!MEMO_API_URL; }

    function cloudPush(dateKey, daiban, memo) {
        if (!cloudEnabled()) return;
        fetch(MEMO_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dateKey: dateKey,
                daiban: daiban,
                machine: memo.machine,
                person: memo.person,
                setting: memo.setting,
                author: memo.author
            })
        }).catch(function() {});
    }

    function cloudDelete(dateKey, daiban) {
        if (!cloudEnabled()) return;
        fetch(MEMO_API_URL + '?dateKey=' + encodeURIComponent(dateKey) + '&daiban=' + encodeURIComponent(daiban),
            { method: 'DELETE' }
        ).catch(function() {});
    }

    function cloudPull() {
        if (!cloudEnabled()) return Promise.resolve(false);
        return fetch(MEMO_API_URL)
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var rows = (res && res.memos) ? res.memos : [];
                rows.forEach(function(row) {
                    var dk = row.date_key, db = row.daiban;
                    if (!dk || !db) return;
                    if (!memos[dk]) memos[dk] = {};
                    var local = memos[dk][db];
                    var remote = {
                        machine:   row.machine || '',
                        person:    row.person  || '',
                        setting:   parseSetting(row.setting),
                        author:    row.author  || '',
                        updatedAt: row.updated_at || 0
                    };
                    if (!local || (remote.updatedAt >= (local.updatedAt || 0))) {
                        memos[dk][db] = remote;
                    }
                });
                saveLocal();
                return true;
            })
            .catch(function() { return false; });
    }

    function parseSetting(s) {
        if (Array.isArray(s)) return s.map(String);
        if (typeof s === 'string' && s) return s.split(',').filter(Boolean);
        return [];
    }

    // ========== 日付ホイールピッカー ==========

    // データのある日付キー一覧（新しい順）
    function getDateKeys() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        return sortedFiles.map(function(f) { return dateKeyFromFile(f); }).filter(Boolean);
    }

    // 表示ラベル（"6/18(水)" のような短い形式）
    function wheelLabel(dateKey) {
        var file = fileFromDateKey(dateKey);
        if (typeof formatDate === 'function') {
            try {
                var full = formatDate(file); // 既存フォーマット
                // 曜日があれば付ける
                if (typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
                    var dow = getDayOfWeekName(getDayOfWeek(file));
                    return full + '（' + dow + '）';
                }
                return full;
            } catch (e) {}
        }
        return dateKey.replace(/_/g, '/');
    }

    var wheel = {
        keys: [],
        itemHeight: 40,
        scrollTimer: null,
        lastIndex: -1
    };

    function renderWheel() {
        var container = document.getElementById('memoDateWheel');
        if (!container) return;
        wheel.keys = getDateKeys();
        if (wheel.keys.length === 0) {
            container.innerHTML = '<div class="memo-wheel-empty">データがありません</div>';
            return;
        }

        // currentDateKey 未設定なら先頭（最新日）
        if (!currentDateKey || wheel.keys.indexOf(currentDateKey) === -1) {
            currentDateKey = wheel.keys[0];
        }

        var pad = ''; // 上下の余白アイテム（中央寄せ用）
        var padCount = 2; // 中央の上下に見える件数
        var padItem = '<div class="memo-wheel-item memo-wheel-pad" aria-hidden="true"></div>';
        for (var i = 0; i < padCount; i++) pad += padItem;

        var itemsHtml = wheel.keys.map(function(dk, idx) {
            return '<div class="memo-wheel-item" data-index="' + idx + '" data-key="' + escapeAttr(dk) + '">'
                + escapeHtml(wheelLabel(dk)) + '</div>';
        }).join('');

        container.innerHTML =
            '<div class="memo-wheel-highlight" aria-hidden="true"></div>'
            + '<div class="memo-wheel-scroll" id="memoWheelScroll">'
            + pad + itemsHtml + pad
            + '</div>';

        var scroll = document.getElementById('memoWheelScroll');
        if (!scroll) return;

        // 初期位置へスクロール
        var initIndex = wheel.keys.indexOf(currentDateKey);
        if (initIndex < 0) initIndex = 0;
        scrollToIndex(initIndex, false);
        highlightActive(initIndex);

        scroll.addEventListener('scroll', onWheelScroll);
        // クリックでも選択できるように
        scroll.querySelectorAll('.memo-wheel-item[data-index]').forEach(function(el) {
            el.addEventListener('click', function() {
                var idx = parseInt(this.dataset.index);
                scrollToIndex(idx, true);
                selectIndex(idx);
            });
        });
    }

    function scrollToIndex(index, smooth) {
        var scroll = document.getElementById('memoWheelScroll');
        if (!scroll) return;
        var top = index * wheel.itemHeight;
        if (smooth && scroll.scrollTo) {
            scroll.scrollTo({ top: top, behavior: 'smooth' });
        } else {
            scroll.scrollTop = top;
        }
    }

    function currentWheelIndex() {
        var scroll = document.getElementById('memoWheelScroll');
        if (!scroll) return 0;
        return Math.round(scroll.scrollTop / wheel.itemHeight);
    }

    function highlightActive(index) {
        var scroll = document.getElementById('memoWheelScroll');
        if (!scroll) return;
        scroll.querySelectorAll('.memo-wheel-item[data-index]').forEach(function(el) {
            el.classList.toggle('active', parseInt(el.dataset.index) === index);
        });
    }

    function onWheelScroll() {
        var index = currentWheelIndex();
        if (index !== wheel.lastIndex) {
            wheel.lastIndex = index;
            highlightActive(index);
            tick(); // カチッ（バイブ）
        }
        // スクロール停止を検知してスナップ＆確定
        if (wheel.scrollTimer) clearTimeout(wheel.scrollTimer);
        wheel.scrollTimer = setTimeout(function() {
            var idx = currentWheelIndex();
            idx = Math.max(0, Math.min(idx, wheel.keys.length - 1));
            scrollToIndex(idx, true);
            selectIndex(idx);
        }, 120);
    }

    function tick() {
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
    }

    function selectIndex(index) {
        if (index < 0 || index >= wheel.keys.length) return;
        var dk = wheel.keys[index];
        if (dk === currentDateKey) { highlightActive(index); return; }
        currentDateKey = dk;
        highlightActive(index);
        // 日付が変わったら機種・台一覧・メモ一覧を更新
        populateMachineSelect();
        populateUnitSelect();
        renderMemoList();
    }

    // ========== 入力 UI ==========

    function dateKeyFromFile(file) {
        if (!file) return '';
        if (typeof getDateKeyFromFilename === 'function') {
            try { return getDateKeyFromFilename(file) || ''; } catch (e) {}
        }
        return file.replace('data/', '').replace('.csv', '');
    }

    function fileFromDateKey(dateKey) {
        return 'data/' + dateKey + '.csv';
    }

    function populateMachineSelect() {
        var sel = document.getElementById('memoMachineSelect');
        if (!sel) return;
        var file = fileFromDateKey(currentDateKey);
        var options = (typeof getMachineOptionsForDate === 'function')
            ? getMachineOptionsForDate(file)
            : [];
        var html = ['<option value="">機種を選択...</option>'];
        options.forEach(function(opt) {
            var v = opt.value !== undefined ? opt.value : opt;
            var c = opt.count !== undefined ? '（' + opt.count + '台）' : '';
            html.push('<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + c + '</option>');
        });
        sel.innerHTML = html.join('');
    }

    function populateUnitSelect() {
        var machineSel = document.getElementById('memoMachineSelect');
        var unitSel = document.getElementById('memoUnitSelect');
        if (!unitSel) return;
        var machine = machineSel ? machineSel.value : '';
        var file = fileFromDateKey(currentDateKey);
        var rows = (dataCache && dataCache[file]) ? dataCache[file] : [];

        var filtered = machine
            ? rows.filter(function(r) { return r['機種名'] === machine; })
            : [];

        filtered = filtered.slice().sort(function(a, b) {
            return (parseInt(String(b['差枚']).replace(/,/g, '')) || 0)
                 - (parseInt(String(a['差枚']).replace(/,/g, '')) || 0);
        });

        var html = ['<option value="">台番号を選択...</option>'];
        filtered.forEach(function(r) {
            var num = r['台番号'] || '';
            var diff = parseInt(String(r['差枚']).replace(/,/g, '')) || 0;
            var diffStr = (diff >= 0 ? '+' : '') + diff.toLocaleString();
            html.push('<option value="' + escapeAttr(num) + '">' + escapeHtml(num) + '（差枚 ' + diffStr + '）</option>');
        });
        unitSel.innerHTML = html.join('');
    }

    function renderSettingChecks() {
        var wrap = document.getElementById('memoSettingChecks');
        if (!wrap) return;
        wrap.innerHTML = SETTINGS.map(function(s) {
            var checked = selectedSetting[s] ? ' checked' : '';
            return '<label class="memo-setting-chip memo-set-chip-' + s + '">'
                + '<input type="checkbox" class="memo-setting-cb" value="' + s + '"' + checked + '>'
                + '<span>設定' + s + '</span>'
                + '</label>';
        }).join('');
        wrap.querySelectorAll('.memo-setting-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
                if (this.checked) selectedSetting[this.value] = true;
                else delete selectedSetting[this.value];
            });
        });
    }

    function clearInputs() {
        var unitDirect = document.getElementById('memoUnitDirect');
        var unitSel = document.getElementById('memoUnitSelect');
        var person = document.getElementById('memoPersonInput');
        if (unitDirect) unitDirect.value = '';
        if (unitSel) unitSel.value = '';
        if (person) person.value = '';
        selectedSetting = {};
        renderSettingChecks();
    }

    function submitMemo() {
        var unitDirect = document.getElementById('memoUnitDirect');
        var unitSel = document.getElementById('memoUnitSelect');
        var machineSel = document.getElementById('memoMachineSelect');
        var person = document.getElementById('memoPersonInput');

        var daiban = (unitDirect && unitDirect.value.trim())
            ? unitDirect.value.trim()
            : (unitSel ? unitSel.value : '');

        if (!daiban) { alert('台番号を選択または入力してください。'); return; }

        var settingArr = Object.keys(selectedSetting).sort();
        var personVal = person ? person.value.trim() : '';

        if (!personVal && settingArr.length === 0) {
            alert('「誰が座っていたか」か「設定」のどちらかは入力してください。');
            return;
        }

        var machine = machineSel ? machineSel.value : '';
        if (!machine) {
            var file = fileFromDateKey(currentDateKey);
            var rows = (dataCache && dataCache[file]) ? dataCache[file] : [];
            var hit = rows.filter(function(r) { return String(r['台番号']) === String(daiban); })[0];
            if (hit) machine = hit['機種名'] || '';
        }

        upsertMemo(currentDateKey, daiban, {
            machine: machine,
            person: personVal,
            setting: settingArr,
            author: author
        });

        clearInputs();
        renderMemoList();
        toast('💾 メモを保存しました（' + daiban + '番）');
        refreshDailyIfSameDate();
    }

    // ========== メモ一覧 ==========

    function renderMemoList() {
        var listEl = document.getElementById('memoList');
        if (!listEl) return;
        var dayMemos = getForDate(currentDateKey);
        var keys = Object.keys(dayMemos).sort(function(a, b) {
            var na = parseInt(String(a).replace(/\D/g, '')) || 0;
            var nb = parseInt(String(b).replace(/\D/g, '')) || 0;
            return na - nb;
        });

        if (keys.length === 0) {
            listEl.innerHTML = '<div class="memo-list-empty">この日のメモはまだありません</div>';
            return;
        }

        var html = '<table class="memo-list-table"><thead><tr>'
            + '<th>台番号</th><th>機種</th><th>誰が</th><th>設定</th><th>記録者</th><th></th>'
            + '</tr></thead><tbody>';
        keys.forEach(function(daiban) {
            var m = dayMemos[daiban];
            html += '<tr>'
                + '<td class="memo-cell-num">' + escapeHtml(daiban) + '</td>'
                + '<td>' + escapeHtml(m.machine || '-') + '</td>'
                + '<td>' + (m.person ? personBadgeHtml(m.person) : '-') + '</td>'
                + '<td>' + (m.setting && m.setting.length ? settingBadgesHtml(m.setting) : '-') + '</td>'
                + '<td class="memo-cell-author">' + escapeHtml(m.author || '-') + '</td>'
                + '<td><button class="memo-del-btn" data-daiban="' + escapeAttr(daiban) + '">🗑️</button></td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        listEl.innerHTML = html;

        listEl.querySelectorAll('.memo-del-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var daiban = this.dataset.daiban;
                if (!confirm(daiban + '番のメモを削除しますか？')) return;
                deleteMemo(currentDateKey, daiban);
                renderMemoList();
                refreshDailyIfSameDate();
                toast('🗑️ ' + daiban + '番のメモを削除しました');
            });
        });
    }

    function refreshDailyIfSameDate() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var dailyFile = sortedFiles[currentDateIndex];
        if (dateKeyFromFile(dailyFile) === currentDateKey && typeof filterAndRender === 'function') {
            filterAndRender();
        }
    }

    // ========== 初期化 / イベント ==========

    function init() {
        loadLocal();
        renderWheel();          // ホイールが currentDateKey を確定する
        populateMachineSelect();
        populateUnitSelect();
        renderSettingChecks();
        renderMemoList();
        syncAuthorInput();
        cloudPull().then(function(ok) {
            if (ok) { renderMemoList(); refreshDailyIfSameDate(); }
        });
    }

    function syncAuthorInput() {
        var input = document.getElementById('memoAuthorInput');
        if (input && input.value !== author) input.value = author;
    }

    function setupEvents() {
        if (initialized) return;
        initialized = true;

        var machineSel = document.getElementById('memoMachineSelect');
        if (machineSel) machineSel.addEventListener('change', populateUnitSelect);

        var submitBtn = document.getElementById('memoSubmitBtn');
        if (submitBtn) submitBtn.addEventListener('click', submitMemo);

        var clearBtn = document.getElementById('memoClearBtn');
        if (clearBtn) clearBtn.addEventListener('click', clearInputs);

        var authorInput = document.getElementById('memoAuthorInput');
        if (authorInput) authorInput.addEventListener('input', function() {
            author = this.value.trim();
            saveAuthor();
        });
    }

    function toast(msg) {
        if (typeof showCopyToast === 'function') { showCopyToast(msg); return; }
        console.log(msg);
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

    return {
        init: init,
        setupEvents: setupEvents,
        getForDate: getForDate,
        getMemo: getMemo,
        summaryText: summaryText,
        badgeHtml: badgeHtml,
        settingBadgesHtml: settingBadgesHtml,
        personBadgeHtml: personBadgeHtml
    };
})();
