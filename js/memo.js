// ===================
// 着席メモ（SeatMemo）
//
// 「誰が座っていたか」「設定がどれだったか」を 日付×台番号 で1件メモする。
// 保存: localStorage（常時・ソースオブトゥルース）＋ Cloudflare D1（任意・同期できれば上乗せ）。
//
// 入力UIは「日別タブのメモ列セルをクリック → 小さなモーダルを開く」方式。
// （旧・独立メモタブ／日付ホイールピッカーは廃止）
// メモは日別タブの「メモ」列に バッジ で表示される。
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
    var cloudPulled = false;

    // モーダルの現在編集対象
    var editorCtx = { dateKey: null, daiban: null, machine: '' };
    var editorSelectedSetting = {};
    var modalBuilt = false;

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

    // ========== バッジ生成（日別タブ・メモ列で共用） ==========

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

    // ========== 入力モーダル（動的生成） ==========

    function buildModal() {
        if (modalBuilt) return;
        modalBuilt = true;

        var modal = document.createElement('div');
        modal.className = 'app-modal memo-edit-modal';
        modal.id = 'memoEditModal';
        modal.innerHTML =
            '<div class="app-modal-content memo-edit-content">'
            +   '<div class="app-modal-header">'
            +     '<h3>📝 着席メモ</h3>'
            +     '<button class="close-btn" id="memoEditClose">×</button>'
            +   '</div>'
            +   '<div class="app-modal-body">'
            +     '<div class="memo-edit-target" id="memoEditTarget"></div>'
            +     '<div class="memo-edit-row">'
            +       '<label class="memo-field-label">記録者</label>'
            +       '<input type="text" id="memoEditAuthor" placeholder="あなたの名前" maxlength="20">'
            +     '</div>'
            +     '<div class="memo-edit-row">'
            +       '<label class="memo-field-label">誰が</label>'
            +       '<input type="text" id="memoEditPerson" placeholder="例: 常連の○○さん（空欄可）">'
            +     '</div>'
            +     '<div class="memo-edit-row">'
            +       '<label class="memo-field-label">設定</label>'
            +       '<div class="memo-setting-checks" id="memoEditSettingChecks"></div>'
            +     '</div>'
            +   '</div>'
            +   '<div class="app-modal-footer">'
            +     '<button class="btn-reset" id="memoEditDelete">🗑️ 削除</button>'
            +     '<button class="modal-btn primary" id="memoEditSave">💾 保存</button>'
            +   '</div>'
            + '</div>';
        document.body.appendChild(modal);

        // 背景クリックで閉じる
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeEditor();
        });

        document.getElementById('memoEditClose').addEventListener('click', closeEditor);
        document.getElementById('memoEditSave').addEventListener('click', saveFromModal);
        document.getElementById('memoEditDelete').addEventListener('click', deleteFromModal);

        var authorInput = document.getElementById('memoEditAuthor');
        if (authorInput) {
            authorInput.addEventListener('input', function() {
                author = this.value.trim();
                saveAuthor();
            });
        }

        // Escで閉じる
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var m = document.getElementById('memoEditModal');
                if (m && m.classList.contains('open')) closeEditor();
            }
        });
    }

    function renderEditorSettingChecks() {
        var wrap = document.getElementById('memoEditSettingChecks');
        if (!wrap) return;
        wrap.innerHTML = SETTINGS.map(function(s) {
            var checked = editorSelectedSetting[s] ? ' checked' : '';
            return '<label class="memo-setting-chip memo-set-chip-' + s + '">'
                + '<input type="checkbox" class="memo-edit-setting-cb" value="' + s + '"' + checked + '>'
                + '<span>設定' + s + '</span>'
                + '</label>';
        }).join('');
        wrap.querySelectorAll('.memo-edit-setting-cb').forEach(function(cb) {
            cb.addEventListener('change', function() {
                if (this.checked) editorSelectedSetting[this.value] = true;
                else delete editorSelectedSetting[this.value];
            });
        });
    }

    /**
     * メモ入力モーダルを開く。
     * @param {string} dateKey - 日付キー（YYYY_MM_DD）。仮想日キーでも可
     * @param {string} daiban  - 台番号
     * @param {string} machine - 機種名（任意・表示と保存に使用）
     */
    function openEditor(dateKey, daiban, machine) {
        if (!dateKey || !daiban) return;
        if (!initialized) { loadLocal(); initialized = true; }
        buildModal();

        editorCtx = { dateKey: dateKey, daiban: String(daiban), machine: machine || '' };

        var existing = getMemo(dateKey, String(daiban));
        editorSelectedSetting = {};
        if (existing && existing.setting) {
            existing.setting.forEach(function(s) { editorSelectedSetting[String(s)] = true; });
        }

        // 対象表示
        var targetEl = document.getElementById('memoEditTarget');
        if (targetEl) {
            var machineLabel = (existing && existing.machine) ? existing.machine : (machine || '');
            targetEl.innerHTML =
                '<span class="memo-edit-daiban">' + escapeHtml(String(daiban)) + '番</span>'
                + (machineLabel ? '<span class="memo-edit-machine">' + escapeHtml(machineLabel) + '</span>' : '')
                + '<span class="memo-edit-date">' + escapeHtml(dateKeyToLabel(dateKey)) + '</span>';
        }

        // 入力欄初期値
        var authorInput = document.getElementById('memoEditAuthor');
        if (authorInput) authorInput.value = author || (existing ? existing.author : '') || '';

        var personInput = document.getElementById('memoEditPerson');
        if (personInput) personInput.value = existing ? (existing.person || '') : '';

        renderEditorSettingChecks();

        // 削除ボタンは既存メモがあるときだけ有効
        var delBtn = document.getElementById('memoEditDelete');
        if (delBtn) delBtn.style.display = existing ? '' : 'none';

        var modal = document.getElementById('memoEditModal');
        if (modal) modal.classList.add('open');
    }

    function closeEditor() {
        var modal = document.getElementById('memoEditModal');
        if (modal) modal.classList.remove('open');
    }

    function saveFromModal() {
        var personInput = document.getElementById('memoEditPerson');
        var personVal = personInput ? personInput.value.trim() : '';
        var settingArr = Object.keys(editorSelectedSetting).sort();

        if (!personVal && settingArr.length === 0) {
            // 既存メモがあって両方空 → 削除扱い、無ければ何もしない
            var existing = getMemo(editorCtx.dateKey, editorCtx.daiban);
            if (existing) {
                deleteMemo(editorCtx.dateKey, editorCtx.daiban);
                afterChange('🗑️ ' + editorCtx.daiban + '番のメモを削除しました');
            } else {
                alert('「誰が座っていたか」か「設定」のどちらかは入力してください。');
                return;
            }
            closeEditor();
            return;
        }

        upsertMemo(editorCtx.dateKey, editorCtx.daiban, {
            machine: editorCtx.machine,
            person: personVal,
            setting: settingArr,
            author: author
        });

        closeEditor();
        afterChange('💾 メモを保存しました（' + editorCtx.daiban + '番）');
    }

    function deleteFromModal() {
        if (!confirm(editorCtx.daiban + '番のメモを削除しますか？')) return;
        deleteMemo(editorCtx.dateKey, editorCtx.daiban);
        closeEditor();
        afterChange('🗑️ ' + editorCtx.daiban + '番のメモを削除しました');
    }

    // 保存・削除後の共通処理：日別テーブルを再描画
    function afterChange(msg) {
        toast(msg);
        if (typeof filterAndRender === 'function') filterAndRender();
    }

    // ========== 日付ラベル ==========

    // 日付キー（YYYY_MM_DD）→ 表示ラベル
    function dateKeyToLabel(dateKey) {
        if (!dateKey) return '';
        var parts = String(dateKey).split('_');
        if (parts.length === 3) {
            var label = parts[1] + '/' + parts[2];
            // 曜日が付けられれば付ける
            var file = 'data/' + dateKey + '.csv';
            if (typeof getDayOfWeek === 'function' && typeof getDayOfWeekName === 'function') {
                try {
                    var dow = getDayOfWeekName(getDayOfWeek(file));
                    if (dow) label += '（' + dow + '）';
                } catch (e) {}
            }
            return label;
        }
        return String(dateKey).replace(/_/g, '/');
    }

    // ========== 初期化 ==========

    // ページ初期化（日別タブ初回表示時などに呼ぶ）。
    // クラウドから一度だけ取得して、取得できたら日別テーブルを再描画。
    function init() {
        if (!initialized) { loadLocal(); initialized = true; }
        if (!cloudPulled) {
            cloudPulled = true;
            cloudPull().then(function(ok) {
                if (ok && typeof filterAndRender === 'function') filterAndRender();
            });
        }
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
        openEditor: openEditor,
        getForDate: getForDate,
        getMemo: getMemo,
        summaryText: summaryText,
        badgeHtml: badgeHtml,
        settingBadgesHtml: settingBadgesHtml,
        personBadgeHtml: personBadgeHtml
    };
})();
