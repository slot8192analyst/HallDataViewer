// ===================
// 取材掲示板モジュール（board.js）
//   - 取材ページ(tenun/ougi/zombie) と 取材ハブ(hub) の各スレッドを描画
//   - <div class="promo-memo" data-promo="tenun"> をプレースホルダにする
//   - 作成者名は aim.js と共用（localStorage 'aimSheetAuthor'）
//   - Cloudflare Workers + D1（/api/board）に投稿・編集・削除
// ===================
var Board = (function() {
    'use strict';

    // aim.js と同じ Worker（/api/board に差し替え）
    var BOARD_API_URL = 'https://aim-api.slot8192analyst.workers.dev/api/board';
    var AUTHOR_KEY = 'aimSheetAuthor';

    var VALID = { tenun: 1, ougi: 1, zombie: 1, hub: 1 };

    function getAuthor() {
        try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch (e) { return ''; }
    }
    function setAuthor(name) {
        try { localStorage.setItem(AUTHOR_KEY, name); } catch (e) {}
    }

    // ---- 描画エントリ（取材ページ/ハブの onShow から呼ぶ） ----
    function render(boardKey) {
        if (!VALID[boardKey]) return;
        var el = document.querySelector('.promo-memo[data-promo="' + boardKey + '"]');
        if (!el) return;

        // 投稿フォーム（一度だけ組む）
        if (!el.getAttribute('data-board-ready')) {
            el.setAttribute('data-board-ready', '1');
            el.innerHTML = formHtml(boardKey);
            bindForm(el, boardKey);
        }
        loadPosts(el, boardKey);
    }

    function formHtml(boardKey) {
        var author = getAuthor();
        return ''
            + '<div class="board">'
            + '  <h3 class="board-title">💬 掲示板</h3>'
            + '  <div class="board-form">'
            + '    <input type="text" class="board-author" placeholder="名前"'
            + '           value="' + escapeAttr(author) + '" maxlength="40">'
            + '    <textarea class="board-body" placeholder="コメントを書く..." rows="3" maxlength="2000"></textarea>'
            + '    <div class="board-form-actions">'
            + '      <button class="btn-apply board-submit">投稿する</button>'
            + '    </div>'
            + '  </div>'
            + '  <div class="board-list">読み込み中...</div>'
            + '</div>';
    }

    function bindForm(el, boardKey) {
        var authorInput = el.querySelector('.board-author');
        var bodyInput = el.querySelector('.board-body');
        var submit = el.querySelector('.board-submit');

        if (authorInput) {
            authorInput.addEventListener('input', function() { setAuthor(this.value.trim()); });
        }
        if (submit) {
            submit.addEventListener('click', function() {
                var author = (authorInput.value || '').trim();
                var body = (bodyInput.value || '').trim();
                if (!author) { alert('名前を入力してください。'); return; }
                if (!body) { alert('本文を入力してください。'); return; }
                postNew(el, boardKey, author, body, submit, bodyInput);
            });
        }
    }

    // ---- 投稿一覧の読み込み ----
    function loadPosts(el, boardKey) {
        var list = el.querySelector('.board-list');
        if (!list) return;
        fetch(BOARD_API_URL + '?board=' + encodeURIComponent(boardKey))
            .then(function(r) { return r.json(); })
            .then(function(res) {
                var posts = (res && res.posts) ? res.posts : [];
                renderList(list, boardKey, posts);
            })
            .catch(function() {
                list.innerHTML = '<p class="board-empty">読み込みに失敗しました（通信エラー）。</p>';
            });
    }

    function renderList(list, boardKey, posts) {
        if (!posts.length) {
            list.innerHTML = '<p class="board-empty">まだ投稿がありません。</p>';
            return;
        }
        list.innerHTML = posts.map(function(p) {
            var edited = (p.updated_at && p.created_at && p.updated_at - p.created_at > 1000)
                ? ' <span class="board-edited">(編集済)</span>' : '';
            return ''
                + '<div class="board-post" data-id="' + escapeAttr(p.id) + '">'
                + '  <div class="board-post-head">'
                + '    <span class="board-post-author">' + escapeHtml(p.author) + '</span>'
                + '    <span class="board-post-date">' + fmtTime(p.created_at) + edited + '</span>'
                + '  </div>'
                + '  <div class="board-post-body">' + escapeHtml(p.body).replace(/\n/g, '<br>') + '</div>'
                + '  <div class="board-post-actions">'
                + '    <button class="btn-small board-edit">編集</button>'
                + '    <button class="btn-small board-delete">削除</button>'
                + '  </div>'
                + '</div>';
        }).join('');

        // 各投稿のボタンを束ねる
        list.querySelectorAll('.board-post').forEach(function(postEl) {
            var id = postEl.getAttribute('data-id');
            var p = posts.filter(function(x) { return String(x.id) === String(id); })[0];
            var editBtn = postEl.querySelector('.board-edit');
            var delBtn = postEl.querySelector('.board-delete');
            if (editBtn) editBtn.addEventListener('click', function() { startEdit(postEl, boardKey, p); });
            if (delBtn) delBtn.addEventListener('click', function() { removePost(boardKey, p, postEl); });
        });
    }

    // ---- 新規投稿 ----
    function postNew(el, boardKey, author, body, submitBtn, bodyInput) {
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '投稿中...'; }
        fetch(BOARD_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board: boardKey, author: author, body: body })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.ok) {
                if (bodyInput) bodyInput.value = '';
                loadPosts(el, boardKey);
            } else {
                alert('投稿に失敗しました: ' + (res && res.error ? res.error : '不明なエラー'));
            }
        })
        .catch(function(err) { alert('投稿に失敗しました（通信エラー）: ' + err); })
        .finally(function() {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '投稿する'; }
        });
    }

    // ---- 編集（インライン） ----
    function startEdit(postEl, boardKey, p) {
        if (!p) return;
        var bodyEl = postEl.querySelector('.board-post-body');
        var actions = postEl.querySelector('.board-post-actions');
        if (!bodyEl || postEl.querySelector('.board-edit-area')) return;

        var ta = document.createElement('textarea');
        ta.className = 'board-edit-area';
        ta.rows = 3;
        ta.maxLength = 2000;
        ta.value = p.body;
        bodyEl.style.display = 'none';
        postEl.insertBefore(ta, actions);

        actions.innerHTML = ''
            + '<button class="btn-apply board-edit-save">保存</button>'
            + '<button class="btn-small board-edit-cancel">キャンセル</button>';

        postEl.querySelector('.board-edit-save').addEventListener('click', function() {
            var newBody = (ta.value || '').trim();
            if (!newBody) { alert('本文を入力してください。'); return; }
            saveEdit(boardKey, p, newBody);
        });
        postEl.querySelector('.board-edit-cancel').addEventListener('click', function() {
            var list = postEl.closest('.board-list');
            if (list) loadPosts(list.closest('.promo-memo') ? null : null, boardKey), reloadByBoard(boardKey);
        });
    }

    function saveEdit(boardKey, p, newBody) {
        var author = getAuthor() || p.author;
        fetch(BOARD_API_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.id, author: author, body: newBody })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.ok) { reloadByBoard(boardKey); }
            else { alert('編集に失敗しました: ' + (res && res.error ? res.error : '不明なエラー')); }
        })
        .catch(function(err) { alert('編集に失敗しました（通信エラー）: ' + err); });
    }

    // ---- 削除 ----
    function removePost(boardKey, p, postEl) {
        if (!p) return;
        if (!confirm('この投稿を削除します。よろしいですか?')) return;
        fetch(BOARD_API_URL + '?id=' + encodeURIComponent(p.id), { method: 'DELETE' })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res && res.ok) { reloadByBoard(boardKey); }
            else { alert('削除に失敗しました: ' + (res && res.error ? res.error : '不明なエラー')); }
        })
        .catch(function(err) { alert('削除に失敗しました（通信エラー）: ' + err); });
    }

    // boardKey から該当プレースホルダを探して一覧だけ再読込
    function reloadByBoard(boardKey) {
        var el = document.querySelector('.promo-memo[data-promo="' + boardKey + '"]');
        if (el) loadPosts(el, boardKey);
    }

    // ---- ユーティリティ ----
    function fmtTime(ms) {
        var d = new Date(Number(ms) || 0);
        if (isNaN(d.getTime())) return '';
        function z(n) { return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '/' + z(d.getMonth() + 1) + '/' + z(d.getDate())
            + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeAttr(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { render: render };
})();
window.Board = Board;
