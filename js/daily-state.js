// ===================
// 日別タブ 状態管理モジュール
// ===================
//
// 使い方:
//   DailyState.get()           → 現在の状態スナップショットを返す
//   DailyState.setState(patch) → 差分更新 → localStorage + URL 同期 → filterAndRender を呼ぶ
//   DailyState.init()          → ページロード時に localStorage / URL から状態を復元
//
// 状態キー一覧:
//   dateFile        : string  選択中ファイル名 (例: "data/2026_06_01.csv")
//   search          : string  台番号検索文字列
//   sortBy          : string  ソートキー
//   showTaggedOnly  : boolean タグ付きのみ表示
//   selectedMachines: string[] 選択機種リスト（空 = 全機種）
//   visibleColumns  : string[] 表示列リスト（空 = 未初期化）
//   filterGroups    : Array   数値フィルターグループ（dailyFilterGroups と共有）
//   suffixPanelOpen : boolean 末尾統計パネル展開状態
//
// ※ filterGroups は既存の dailyFilterGroups 変数と二重管理にならないよう
//    setState 側で dailyFilterGroups へ書き戻す処理を含める。

(function(global) {
    'use strict';

    // ----------------
    // ストレージキー
    // ----------------
    var STORAGE_KEY = 'dailyTabState';

    // URL に反映するキー（共有可能にしたいもの）
    var URL_KEYS = ['dateFile', 'search', 'sortBy', 'showTaggedOnly', 'selectedMachines'];

    // ----------------
    // デフォルト値
    // ----------------
    var DEFAULT_STATE = {
        dateFile: null,          // null のとき最新日を使用
        search: '',
        sortBy: '',
        showTaggedOnly: false,
        selectedMachines: [],    // 空 = 全機種
        visibleColumns: [],      // 空 = 未初期化（initColumnSelector に任せる）
        filterGroups: [],
        suffixPanelOpen: false
    };

    // ----------------
    // 内部状態
    // ----------------
    var _state = deepClone(DEFAULT_STATE);
    var _renderScheduled = false;  // 連続 setState 時の二重レンダリング防止

    // ----------------
    // ユーティリティ
    // ----------------

    function deepClone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch(e) { return obj; }
    }

    function shallowMerge(target, patch) {
        Object.keys(patch).forEach(function(k) { target[k] = patch[k]; });
        return target;
    }

    // ----------------
    // localStorage
    // ----------------

    function saveToStorage() {
        try {
            var toSave = deepClone(_state);
            // visibleColumns は別キーで既存コードが管理しているので二重保存しない
            delete toSave.visibleColumns;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch(e) {}
    }

    function loadFromStorage() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) return null;
            return parsed;
        } catch(e) { return null; }
    }

    // ----------------
    // URL クエリ
    // ----------------

    function encodeStateToUrl(state) {
        var params = new URLSearchParams(window.location.search);

        URL_KEYS.forEach(function(key) {
            var val = state[key];
            if (val === null || val === undefined || val === DEFAULT_STATE[key]) {
                params.delete(key);
            } else if (Array.isArray(val)) {
                if (val.length === 0) {
                    params.delete(key);
                } else {
                    params.set(key, val.join(','));
                }
            } else if (typeof val === 'boolean') {
                if (val) {
                    params.set(key, '1');
                } else {
                    params.delete(key);
                }
            } else if (val !== '') {
                params.set(key, String(val));
            } else {
                params.delete(key);
            }
        });

        var newSearch = params.toString();
        var newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash;
        if (newUrl !== window.location.pathname + window.location.search + window.location.hash) {
            history.replaceState(null, '', newUrl);
        }
    }

    function decodeStateFromUrl() {
        var params = new URLSearchParams(window.location.search);
        var patch = {};

        if (params.has('dateFile'))         patch.dateFile = params.get('dateFile');
        if (params.has('search'))           patch.search = params.get('search');
        if (params.has('sortBy'))           patch.sortBy = params.get('sortBy');
        if (params.has('showTaggedOnly'))   patch.showTaggedOnly = params.get('showTaggedOnly') === '1';
        if (params.has('selectedMachines')) {
            var raw = params.get('selectedMachines');
            patch.selectedMachines = raw ? raw.split(',') : [];
        }

        return patch;
    }

    // ----------------
    // DOM への反映
    // ----------------

    function syncDomFromState(state) {
        // 台番号検索ボックス
        var searchEl = document.getElementById('search');
        if (searchEl && searchEl.value !== state.search) {
            searchEl.value = state.search;
        }

        // ソート選択
        var sortEl = document.getElementById('sortBy');
        if (sortEl && sortEl.value !== state.sortBy) {
            sortEl.value = state.sortBy;
        }

        // タグ付きのみチェックボックス
        var taggedOnlyEl = document.getElementById('dailyShowTaggedOnly');
        if (taggedOnlyEl && taggedOnlyEl.checked !== state.showTaggedOnly) {
            taggedOnlyEl.checked = state.showTaggedOnly;
        }

        // 機種フィルター（既存の dailyMachineFilterSelect コンポーネント経由）
        if (global.dailyMachineFilterSelect && state.selectedMachines !== undefined) {
            var currentSelected = global.dailyMachineFilterSelect.getSelectedValues();
            var isSame = JSON.stringify(currentSelected.slice().sort()) ===
                         JSON.stringify(state.selectedMachines.slice().sort());
            if (!isSame) {
                global.dailyMachineFilterSelect.setSelectedValues(state.selectedMachines);
            }
        }
    }

    // ----------------
    // 既存グローバル変数との同期
    // ----------------

    function syncLegacyGlobals(state) {
        // dailyFilterGroups（既存変数）との同期
        if (global.dailyFilterGroups !== undefined) {
            global.dailyFilterGroups = state.filterGroups;
        }

        // currentDateIndex との同期
        if (state.dateFile && global.CSV_FILES) {
            var sortedFiles = global.sortFilesByDate(global.CSV_FILES, true);
            var idx = sortedFiles.indexOf(state.dateFile);
            if (idx !== -1) {
                global.currentDateIndex = idx;
            }
        }

        // visibleColumns（既存変数）との同期（initColumnSelector 後のみ）
        if (state.visibleColumns && state.visibleColumns.length > 0 && global.visibleColumns !== undefined) {
            global.visibleColumns = state.visibleColumns;
        }
    }

    // ----------------
    // 公開 API
    // ----------------

    var DailyState = {

        /**
         * 現在の状態スナップショットを返す（書き換え不可のコピー）
         */
        get: function() {
            return deepClone(_state);
        },

        /**
         * 状態を差分更新する。
         * patch に含まれるキーだけ更新し、保存・URL反映・レンダリングを行う。
         *
         * @param {Object} patch - 更新したいキーと値のオブジェクト
         * @param {Object} [options]
         * @param {boolean} [options.silent=false] - true のとき filterAndRender を呼ばない
         */
        setState: function(patch, options) {
            options = options || {};
            shallowMerge(_state, patch);

            saveToStorage();
            encodeStateToUrl(_state);
            syncLegacyGlobals(_state);

            if (!options.silent) {
                this._scheduleRender();
            }
        },

        /**
         * 連続した setState 呼び出しをバッチして 1 フレームに 1 回だけレンダリング
         */
        _scheduleRender: function() {
            if (_renderScheduled) return;
            _renderScheduled = true;
            var self = this;
            requestAnimationFrame(function() {
                _renderScheduled = false;
                if (typeof global.filterAndRender === 'function') {
                    global.filterAndRender();
                }
            });
        },

        /**
         * 現在の状態を DOM に同期する（filterAndRender 呼び出し後に使う）
         */
        syncDom: function() {
            syncDomFromState(_state);
        },

        /**
         * ページロード時の初期化。
         * 優先順位: URL パラメータ > localStorage > デフォルト
         */
        init: function() {
            // 1) localStorage から復元
            var stored = loadFromStorage();
            if (stored) {
                shallowMerge(_state, stored);
            }

            // 2) visibleColumns は既存の localStorage キーを優先
            var savedCols = null;
            try {
                var rawCols = localStorage.getItem('visibleColumns');
                if (rawCols) savedCols = JSON.parse(rawCols);
            } catch(e) {}
            if (savedCols && Array.isArray(savedCols) && savedCols.length > 0) {
                _state.visibleColumns = savedCols;
            }

            // 3) filterGroups は既存の localStorage キーを優先
            var savedFG = null;
            try {
                var rawFG = localStorage.getItem('dailyFilterGroups');
                if (rawFG) savedFG = JSON.parse(rawFG);
            } catch(e) {}
            if (savedFG && Array.isArray(savedFG)) {
                _state.filterGroups = savedFG;
            }

            // 4) URL パラメータで上書き（最優先）
            var urlPatch = decodeStateFromUrl();
            if (Object.keys(urlPatch).length > 0) {
                shallowMerge(_state, urlPatch);
            }

            // 5) 既存グローバル変数に反映（silent: レンダリングはまだしない）
            syncLegacyGlobals(_state);
        },

        /**
         * dateFile を「最新日」に設定する。
         * CSV_FILES が確定した後（loadInitialData 完了後）に呼ぶ。
         */
        applyDefaultDate: function() {
            if (!_state.dateFile && global.CSV_FILES && global.CSV_FILES.length > 0) {
                var sortedFiles = global.sortFilesByDate(global.CSV_FILES, true);
                _state.dateFile = sortedFiles[0];
                global.currentDateIndex = 0;
                saveToStorage();
                encodeStateToUrl(_state);
            }
        },

        /**
         * 状態を完全リセット（テスト・デバッグ用）
         */
        reset: function() {
            _state = deepClone(DEFAULT_STATE);
            try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        },

        // テスト用に内部状態を直接参照できるようにする（本番では使わない）
        _raw: function() { return _state; }
    };

    global.DailyState = DailyState;

})(window);
