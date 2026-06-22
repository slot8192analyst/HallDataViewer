// ===================
// ハッシュルーター（完全版 / ステップ1〜3統合）
//
// 役割:
//   - URLハッシュ（#home, #daily ...）でページを切り替える
//   - [data-nav] を持つ要素のクリックでページ遷移（イベント委譲）
//   - data-partial を持つページは初回表示時に fetch して中身を挿入
//   - 各ページの init（初回1回）/ onShow（表示のたび）を呼ぶ
//
// 前提:
//   - 各ページは <div id="ページ名" class="tab-content"> として存在する
//   - パーシャル化したページは <div id="..." data-partial="partials/xxx.html">
//     のように data-partial を持ち、中身は空にしておく
//   - JSファイル（daily.js 等）は index.html で常駐読み込みされている
//
// 注意:
//   - data-partial を使うため、ローカル確認時は file:// では動かない。
//     必ずローカルサーバー経由（例: python -m http.server）で開くこと。
// ===================

var Router = (function() {
    'use strict';

    // ----------------
    // ページ定義テーブル
    //   tabId  : 対応する .tab-content の id
    //   init   : そのページを「初めて表示したとき」に1回だけ呼ぶ（DOM挿入後）
    //   onShow : そのページを表示するたびに呼ぶ（init の後にも呼ばれる）
    // ----------------
    var PAGES = {

        // ホーム（ターミナル）。中身は index.html にベタ書き、fetch なし
        home: {
            tabId: 'home',
            init: null,
            onShow: null
        },

        // 日別データ（ステップ3: partials/daily.html に切り出し済み）
        // → DOM が挿入された後に初期化する
        daily: {
            tabId: 'daily',
            init: function() {
                if (typeof setupDailyEventListeners === 'function') setupDailyEventListeners();
                if (typeof filterAndRender === 'function') filterAndRender();
            },
            onShow: null
        },

        // メモ
        //   未切り出しの間は従来どおり（init で setupEvents + init）。
        //   切り出したら index.html のラッパーに data-partial を付けるだけで、
        //   この init はそのまま使える（DOM挿入後に呼ばれるため）。
        memo: {
            tabId: 'memo',
            init: function() {
                if (typeof SeatMemo !== 'undefined') {
                    SeatMemo.setupEvents();
                    SeatMemo.init();
                }
            },
            onShow: null
        },

        // 解析（トレンド）
        //   未切り出しの間: setupTrendEventListeners は app.js の init() で実行済み。
        //                   表示のたびに loadTrendData を呼ぶ（onShow）。
        //   切り出すとき: app.js の init() から setupTrendEventListeners() を外し、
        //                 下の init に移すこと。
        //                 例)
        //                 init: function() {
        //                     if (typeof setupTrendEventListeners === 'function') setupTrendEventListeners();
        //                 },
        analysis: {
            tabId: 'analysis',
            init: function() {
                if (typeof setupTrendEventListeners === 'function') setupTrendEventListeners();
                // trendViewMode の変更ハンドラ（元 app.js にあったもの）
                var vm = document.getElementById('trendViewMode');
                if (vm) {
                    vm.addEventListener('change', function() {
                        var g = document.getElementById('machineValueTypeGroup');
                        if (g) g.style.display = this.value === 'machine' ? 'flex' : 'none';
                    });
                }
                if (typeof setupFilterPanelToggle === 'function') {
                    setupFilterPanelToggle('trendFilterToggle', 'trendFilterContent');
                }
            },
            onShow: function() {
                if (typeof loadTrendData === 'function') loadTrendData();
            }
        },

        // カレンダー
        //   表示のたびに renderCalendar。
        //   setupCalendarEventListeners は app.js の init() で実行済み。
        //   切り出すときは setupCalendarEventListeners() を init へ移すこと。
        calendar: {
            tabId: 'calendar',
            init: function() {
                if (typeof setupCalendarEventListeners === 'function') setupCalendarEventListeners();
            },
            onShow: function() {
                if (typeof renderCalendar === 'function') renderCalendar();
            }
        },


        // ヒートマップ（島図）
        island: {
            tabId: 'island',
            init: function() {
                if (typeof IslandMap !== 'undefined' && typeof IslandMap.init === 'function') {
                    IslandMap.init();
                }
            },
            onShow: null
        }
    };

    // ハッシュ無しのときに開くページ
    var DEFAULT_PAGE = 'home';

    // 状態フラグ
    var _initialized = {};   // ページごとの init 済みフラグ
    var _loaded = {};        // ページごとのパーシャル挿入済みフラグ

    // ----------------
    // ハッシュ → ページ名
    // ----------------
    function getPageFromHash() {
        var h = (window.location.hash || '').replace(/^#/, '');
        return PAGES[h] ? h : DEFAULT_PAGE;
    }

    // ----------------
    // パーシャル読み込み（初回のみ）
    //   data-partial を持つページだけ fetch して挿入する。
    //   data-partial が無いページ（home 等、ベタ書き）は何もしない。
    // ----------------
    function ensurePartial(pageName) {
        var page = PAGES[pageName];
        if (!page) return Promise.resolve();

        var container = document.getElementById(page.tabId);
        if (!container) return Promise.resolve();

        var partialUrl = container.getAttribute('data-partial');
        if (!partialUrl) return Promise.resolve();   // ベタ書きページ
        if (_loaded[pageName]) return Promise.resolve(); // 挿入済み

        return fetch(partialUrl)
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.text();
            })
            .then(function(html) {
                container.innerHTML = html;
                _loaded[pageName] = true;
            })
            .catch(function(e) {
                container.innerHTML =
                    '<p style="padding:16px;color:#f87171;">'
                    + 'ページの読み込みに失敗しました（' + partialUrl + '）<br>'
                    + 'ローカルで開いている場合はサーバー経由で表示してください。'
                    + '</p>';
                console.error('partial load failed:', partialUrl, e);
            });
    }

    // ----------------
    // ページ表示
    // ----------------
    function show(pageName) {
        var page = PAGES[pageName];
        if (!page) { pageName = DEFAULT_PAGE; page = PAGES[DEFAULT_PAGE]; }

        return ensurePartial(pageName).then(function() {
            // 表示切り替え
            document.querySelectorAll('.tab-content').forEach(function(c) {
                c.classList.remove('active');
            });
            var content = document.getElementById(page.tabId);
            if (content) content.classList.add('active');

            // タブバーが残っている場合の見た目同期（無ければ何もしない）
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.tab === pageName);
            });

            // 初回だけ init（DOM挿入後）
            if (!_initialized[pageName]) {
                _initialized[pageName] = true;
                if (typeof page.init === 'function') page.init();
            }

            // 表示のたびに onShow
            if (typeof page.onShow === 'function') page.onShow();

            // ページ先頭へスクロール（任意。不要なら削除可）
            window.scrollTo(0, 0);
        });
    }

    // ----------------
    // 遷移
    // ----------------
    function navigate(pageName) {
        if (!PAGES[pageName]) return;
        if (window.location.hash === '#' + pageName) {
            show(pageName); // 同じハッシュでも明示遷移なら再表示
        } else {
            window.location.hash = '#' + pageName; // hashchange が show を呼ぶ
        }
    }

    // ----------------
    // 起動
    // ----------------
    function start() {
        // ハッシュ変更で表示切り替え
        window.addEventListener('hashchange', function() {
            show(getPageFromHash());
        });

        // [data-nav] を持つ要素のクリックで遷移（イベント委譲）
        //   後から fetch で挿入された要素にも効くよう document に登録する
        document.addEventListener('click', function(e) {
            var navEl = e.target.closest('[data-nav]');
            if (!navEl) return;
            e.preventDefault();
            navigate(navEl.dataset.nav);
        });

        // 初期表示
        show(getPageFromHash());
    }

    // ----------------
    // 公開API
    // ----------------
    return {
        start: start,
        navigate: navigate,
        show: show,
        // デバッグ用
        _pages: PAGES,
        _state: function() { return { initialized: _initialized, loaded: _loaded }; }
    };

})();

window.Router = Router;
