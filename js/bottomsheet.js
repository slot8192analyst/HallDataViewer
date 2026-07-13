// ===================
// ボトムシート（ハーフモーダル）共通モジュール
// 画面下部からスライドインする軽量シート。
// 既存の .app-modal とは別系統。DESIGN.md（DevFocus Dark）準拠。
//
// 使い方:
//   var sheet = BottomSheet.create('badgeSheet', { title: 'バッジ設定' });
//   sheet.setContent(htmlString);   // 中身を差し込む
//   sheet.open();  / sheet.close();
//   sheet.onOpen(fn)               // 開いた直後に呼ばれる
// ===================

var BottomSheet = (function() {

    var _sheets = {}; // id → インスタンス

    function create(id, opts) {
        opts = opts || {};
        if (_sheets[id]) return _sheets[id];

        // オーバーレイ + シート本体を生成
        var overlay = document.createElement('div');
        overlay.className = 'bottom-sheet-overlay';
        overlay.id = id + '__overlay';

        var sheet = document.createElement('div');
        sheet.className = 'bottom-sheet';
        sheet.id = id;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-modal', 'true');

        sheet.innerHTML =
            '<div class="bottom-sheet-handle-area">'
            +   '<div class="bottom-sheet-handle"></div>'
            + '</div>'
            + '<div class="bottom-sheet-header">'
            +   '<span class="bottom-sheet-title">' + (opts.title || '') + '</span>'
            +   '<button class="bottom-sheet-close" type="button" aria-label="閉じる">×</button>'
            + '</div>'
            + '<div class="bottom-sheet-body"></div>';

        overlay.appendChild(sheet);
        document.body.appendChild(overlay);

        var body       = sheet.querySelector('.bottom-sheet-body');
        var closeBtn   = sheet.querySelector('.bottom-sheet-close');
        var handleArea = sheet.querySelector('.bottom-sheet-handle-area');

        var openCallbacks = [];
        var isOpen = false;

        function open() {
            overlay.classList.add('open');
            // 次フレームでシートをスライドイン（トランジションを効かせる）
            requestAnimationFrame(function() {
                sheet.classList.add('open');
            });
            isOpen = true;
            openCallbacks.forEach(function(fn) { try { fn(); } catch (e) {} });
        }

        function close() {
            sheet.classList.remove('open');
            overlay.classList.remove('open');
            isOpen = false;
        }

        // 閉じる操作: ×ボタン / オーバーレイ空白 / ハンドルタップ
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) close();
        });
        handleArea.addEventListener('click', close);

        // Escで閉じる
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isOpen) close();
        });

        var instance = {
            el: sheet,
            setContent: function(html) { body.innerHTML = html; return this; },
            getBody: function() { return body; },
            open: open,
            close: close,
            isOpen: function() { return isOpen; },
            onOpen: function(fn) { if (typeof fn === 'function') openCallbacks.push(fn); return this; }
        };

        _sheets[id] = instance;
        return instance;
    }

    function get(id) { return _sheets[id]; }

    return { create: create, get: get };
})();
