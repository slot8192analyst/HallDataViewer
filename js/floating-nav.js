// ===================
// floating-nav.js
// スクロール時に固定ハンバーガーボタンを表示し、
// ハーフモーダルでページ間ナビゲーションを提供する
// ===================

var FloatingNav = (function () {
    'use strict';

    // ページ表示名マップ
    var PAGE_LABELS = {
        home:      'ホーム',
        daily:     '日別データ',
        aim:       '狙い台作成',
        analysis:  '解析',
        calendar:  'カレンダー',
        island:    'ヒートマップ',
        promotion: '取材',
        tenun:     '取材 / 天運',
        ougi:      '取材 / 扇',
        zombie:    '取材 / ゾンビ'
    };

    // DOM 参照
    var _btn;
    var _overlay;
    var _modal;
    var _currentLabel;
    var _header;

    // 状態
    var _isOpen = false;
    var _currentPage = 'home';

    // ---- 初期化 ----
    function init() {
        _btn          = document.getElementById('floating-menu-btn');
        _overlay      = document.getElementById('half-modal-overlay');
        _modal        = document.getElementById('half-modal');
        _currentLabel = document.getElementById('half-modal-current-page');
        _header       = document.getElementById('site-header');

        if (!_btn || !_overlay || !_modal) return;

        // 初期は hidden を外して opacity で制御（CSS の .visible でフェードイン）
        _btn.removeAttribute('hidden');
        _overlay.removeAttribute('hidden');
        _modal.removeAttribute('hidden');

        _setupScrollObserver();
        _setupEvents();
    }

    // ---- IntersectionObserver でヘッダーの可視状態を監視 ----
    function _setupScrollObserver() {
        if (!_header) {
            // ヘッダー要素がなければ常に表示
            _showBtn(true);
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            // ヘッダーが見切れた（画面外へ出た）ら表示
            var isHeaderVisible = entries[0].isIntersecting;
            _showBtn(!isHeaderVisible);
        }, {
            root: null,
            threshold: 0.0   // 少しでも隠れたら反応
        });

        observer.observe(_header);
    }

    // ---- ボタン表示切り替え ----
    function _showBtn(show) {
        if (show) {
            _btn.classList.add('visible');
        } else {
            _btn.classList.remove('visible');
            // ボタン非表示時にモーダルも閉じる
            if (_isOpen) _closeModal();
        }
    }

    // ---- イベント登録 ----
    function _setupEvents() {
        // ハンバーガーボタン → モーダル開閉
        _btn.addEventListener('click', function () {
            _isOpen ? _closeModal() : _openModal();
        });

        // オーバーレイクリック → 閉じる
        _overlay.addEventListener('click', _closeModal);

        // 閉じるボタン
        var closeBtn = document.getElementById('half-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', _closeModal);

        // ナビアイテムクリック → 遷移 & 閉じる
        _modal.querySelectorAll('.half-modal-nav-item[data-nav]').forEach(function (item) {
            item.addEventListener('click', function () {
                var page = item.getAttribute('data-nav');
                _closeModal();
                if (typeof Router !== 'undefined') {
                    Router.navigate(page);
                }
            });
        });

        // ESCキー
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _isOpen) _closeModal();
        });

        // ハーフモーダル上でのスワイプダウン → 閉じる
        _setupSwipeClose();
    }

    // ---- モーダル開く ----
    function _openModal() {
        _isOpen = true;
        _updateCurrentPage();
        _overlay.classList.add('open');
        _modal.classList.add('open');
        _btn.classList.add('open');          // ✕ アニメーション
        document.body.style.overflow = 'hidden';
    }

    // ---- モーダル閉じる ----
    function _closeModal() {
        _isOpen = false;
        _overlay.classList.remove('open');
        _modal.classList.remove('open');
        _btn.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ---- 現在ページの強調表示 & ラベル更新 ----
    function _updateCurrentPage() {
        var page = _currentPage;
        // ナビアイテムの active 状態更新
        _modal.querySelectorAll('.half-modal-nav-item').forEach(function (item) {
            var nav = item.getAttribute('data-nav');
            // tenun/ougi/zombie は promotion グループとして扱う
            var isActive = (nav === page) ||
                           (['tenun', 'ougi', 'zombie'].includes(page) && nav === 'promotion');
            item.classList.toggle('current-page', isActive);
        });
        // 現在ページラベル
        var label = PAGE_LABELS[page] || page;
        if (_currentLabel) {
            _currentLabel.textContent = '現在: ' + label;
        }
    }

    // ---- ページ変更時に呼び出す（Router から通知を受ける） ----
    function setCurrentPage(pageName) {
        _currentPage = pageName || 'home';
        if (_isOpen) _updateCurrentPage();
    }

    // ---- スワイプで閉じる（タッチデバイス向け） ----
    function _setupSwipeClose() {
        var startY = 0;
        var isDragging = false;

        _modal.addEventListener('touchstart', function (e) {
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });

        _modal.addEventListener('touchmove', function (e) {
            if (!isDragging) return;
            var dy = e.touches[0].clientY - startY;
            if (dy > 0) {
                // 下方向のみ追従（引っ張り感）
                _modal.style.transform = _getBaseTransform() + ' translateY(' + dy + 'px)';
            }
        }, { passive: true });

        _modal.addEventListener('touchend', function (e) {
            if (!isDragging) return;
            isDragging = false;
            var dy = e.changedTouches[0].clientY - startY;
            _modal.style.transform = '';  // スタイルをリセット（CSS トランジションに戻す）
            if (dy > 80) {
                _closeModal();
            }
        }, { passive: true });
    }

    // PC 幅では translateX(-50%) が加わるため
    function _getBaseTransform() {
        return window.innerWidth >= 769 ? 'translateX(-50%)' : '';
    }

    // ---- 公開 API ----
    return {
        init: init,
        setCurrentPage: setCurrentPage,
        open: function () { _openModal(); },
        close: function () { _closeModal(); }
    };

})();

window.FloatingNav = FloatingNav;
