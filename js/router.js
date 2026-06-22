// ===================
// ハッシュルーター（完全版 / パラメータ対応 #page/param）
//
// 役割:
//   - URLハッシュ（#home, #daily, #tenun/2026-06-15 ...）でページを切り替える
//   - [data-nav]（+任意の data-param）を持つ要素のクリックで遷移（イベント委譲）
//   - data-partial を持つページは初回表示時に fetch して中身を挿入
//   - 各ページの init（初回1回）/ onShow（表示のたび。param を受け取れる）を呼ぶ
//
// 注意:
//   - data-partial を使うため file:// では動かない。ローカルはサーバー経由で。
// ===================

var Router = (function() {
    'use strict';

    // ----------------
    // ページ定義テーブル
    //   tabId  : 対応する .tab-content の id
    //   init   : そのページを「初めて表示したとき」に1回だけ呼ぶ（DOM挿入後）
    //   onShow : そのページを表示するたびに呼ぶ（param を引数で受け取れる）
    // ----------------
    var PAGES = {

        // ホーム（ターミナル）。中身は index.html にベタ書き、fetch なし
        home: {
            tabId: 'home',
            init: null,
            onShow: null
        },

        // 日別データ
        daily: {
            tabId: 'daily',
            init: function() {
                if (typeof setupDailyEventListeners === 'function') setupDailyEventListeners();
                if (typeof filterAndRender === 'function') filterAndRender();
            },
            onShow: null
        },

        // メモ
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
        analysis: {
            tabId: 'analysis',
            init: function() {
                if (typeof setupTrendEventListeners === 'function') setupTrendEventListeners();
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
        },

        // ===== 取材（promotion） =====
        // 取材ハブ（各取材へのリンクのみ。fetch あり・初期化不要）
        promotion: {
            tabId: 'promotion',
            init: null,
            onShow: null
        },
        // 各取材ページ（開催日一覧 / 日付詳細を Promotion が描画）
        //   param が無ければ開催日一覧、あれば該当日の詳細
        tenun: {
            tabId: 'tenun',
            init: null,
            onShow: function(param) {
                if (typeof Promotion !== 'undefined') Promotion.render('tenun', param);
            }
        },
        ougi: {
            tabId: 'ougi',
            init: null,
            onShow: function(param) {
                if (typeof Promotion !== 'undefined') Promotion.render('ougi', param);
            }
        },
        zombie: {
            tabId: 'zombie',
            init: null,
            onShow: function(param) {
                if (typeof Promotion !== 'undefined') Promotion.render('zombie', param);
            }
        }
    };

    // ハッシュ無しのときに開くページ
    var DEFAULT_PAGE = 'home';

    // 状態フラグ
    var _initialized = {};   // ページごとの init 済みフラグ
    var _loaded = {};        // ページごとのパーシャル挿入済みフラグ

    // ----------------
    // ハッシュ解析（#page/param → {page, param}）
    //   param が無いハッシュ（#daily 等）は param: null
    // ----------------
    function parseHash() {
        var h = (window.location.hash || '').replace(/^#/, '');
        var parts = h.split('/');
        return {
            page: PAGES[parts[0]] ? parts[0] : DEFAULT_PAGE,
            param: parts[1] ? decodeURIComponent(parts[1]) : null
        };
    }

    // 後方互換: ページ名だけ欲しい既存呼び出し用に残す
    function getPageFromHash() {
        return parseHash().page;
    }

    // ----------------
    // パーシャル読み込み（初回のみ）
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
    // ページ表示（param を onShow へ渡す）
    // ----------------
    function show(pageName, param) {
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

            // 表示のたびに onShow（param を渡す）
            if (typeof page.onShow === 'function') page.onShow(param);

            // ページ先頭へスクロール
            window.scrollTo(0, 0);
        });
    }

    // ----------------
    // 遷移（param 対応）
    // ----------------
    function navigate(pageName, param) {
        if (!PAGES[pageName]) return;
        var hash = '#' + pageName + (param ? '/' + encodeURIComponent(param) : '');
        if (window.location.hash === hash) {
            // 同じハッシュでも明示遷移なら再表示
            var p = parseHash();
            show(p.page, p.param);
        } else {
            window.location.hash = hash; // hashchange が show を呼ぶ
        }
    }

    // ----------------
    // 起動
    // ----------------
    function start() {
        // ハッシュ変更で表示切り替え
        window.addEventListener('hashchange', function() {
            var p = parseHash();
            show(p.page, p.param);
        });

        // [data-nav]（+ data-param）クリックで遷移（イベント委譲）
        document.addEventListener('click', function(e) {
            var navEl = e.target.closest('[data-nav]');
            if (!navEl) return;
            e.preventDefault();
            navigate(navEl.dataset.nav, navEl.dataset.param || null);
        });

        // 初期表示
        var p0 = parseHash();
        show(p0.page, p0.param);
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
