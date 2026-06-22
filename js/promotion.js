// ===================
// 取材ページ共通モジュール（promotion.js）
//   - events は HallData.store.events を優先。無ければ events.json を自前fetch
//   - name は配列／文字列どちらも対応
//   - date はアンダースコア区切り（例: 2026_06_06）
//   - 対象機種は機種名 完全一致で日別データ(dataCache)から抽出
// ===================
var Promotion = (function() {
    'use strict';

    var PROMO_NAMES = {
        tenun:  '天運総撃',
        ougi:   '奥義ノ矢',
        zombie: 'ゾンビ狩り取材'
    };

    var COLUMNS = [
        { key: '機種名', label: '機種名' },
        { key: '台番号', label: '台番号' },
        { key: 'G数',    label: 'G数' },
        { key: '差枚',   label: '差枚' }
    ];

    // events 取得（ストア優先 → 無ければ自前 fetch してキャッシュ）
    var _eventsCache = null;

    function getAllEvents() {
        // 1) ストアにあればそれを使う
        var fromStore = (HallData && HallData.store && HallData.store.events) || null;
        if (fromStore && fromStore.length) return Promise.resolve(fromStore);

        // 2) 自前キャッシュ
        if (_eventsCache) return Promise.resolve(_eventsCache);

        // 3) events.json を直接読む
        return fetch('events.json')
            .then(function(res) { return res.json(); })
            .then(function(json) {
                _eventsCache = (json && json.events) || [];
                return _eventsCache;
            })
            .catch(function(e) {
                console.error('events.json 読み込み失敗:', e);
                return [];
            });
    }

    function nameMatches(evName, target) {
        if (Array.isArray(evName)) return evName.indexOf(target) !== -1;
        return evName === target;
    }

    function filterEventsFor(allEvents, promoKey) {
        var name = PROMO_NAMES[promoKey];
        if (!name) return [];
        return allEvents
            .filter(function(ev) { return nameMatches(ev.name, name); })
            .sort(function(a, b) { return (a.date < b.date) ? 1 : -1; });
    }

    function pad2(s) { s = String(s); return s.length < 2 ? '0' + s : s; }

    function dateToCacheKey(dateStr) {
        var p = dateStr.split('_');
        if (p.length === 3) dateStr = p[0] + '_' + pad2(p[1]) + '_' + pad2(p[2]);
        return 'data/' + dateStr + '.csv';
    }

    function getTargetGroups(dateStr, ev) {
        var key = dateToCacheKey(dateStr);
        var records = (typeof dataCache !== 'undefined' && dataCache[key]) || null;
        if (!records) return null;

        function pick(names) {
            if (!names || !names.length) return [];
            var set = {};
            names.forEach(function(n) { set[n] = true; });
            return records
                .filter(function(r) { return set[r['機種名']]; })
                .sort(function(a, b) {
                    if (a['機種名'] !== b['機種名']) return a['機種名'] < b['機種名'] ? -1 : 1;
                    return (parseInt(a['台番号'], 10) || 0) - (parseInt(b['台番号'], 10) || 0);
                });
        }
        return {
            target:    pick(ev && ev.target_machines),
            candidate: pick(ev && ev.candidate_machines)
        };
    }

    // ---- 描画エントリ（events を取得してから描く） ----
    function render(promoKey, param) {
        var container = document.getElementById(promoKey);
        if (!container) return;
        var body = container.querySelector('.promo-body');
        if (!body) return;

        getAllEvents().then(function(allEvents) {
            var events = filterEventsFor(allEvents, promoKey);
            if (!param) renderList(promoKey, body, events);
            else renderDetail(promoKey, param, body, events);
        });
    }

    function renderList(promoKey, body, events) {
        var html = '';
        if (!events.length) {
            html = '<p class="promo-empty">登録された開催日がありません。</p>';
        } else {
            html = '<ul class="promo-date-list">';
            events.forEach(function(ev) {
                var hasDetail = !!(ev.report_url || ev.target_machines || ev.candidate_machines);
                html += '<li><a href="#' + promoKey + '/' + ev.date + '"'
                     + ' data-nav="' + promoKey + '" data-param="' + ev.date + '">'
                     + ev.date.replace(/_/g, '-')
                     + (hasDetail ? '' : ' <span class="promo-nodetail">（詳細未登録）</span>')
                     + '</a></li>';
            });
            html += '</ul>';
        }
        body.innerHTML = html;
    }

    function tableBlock(title, rows) {
        if (!rows || !rows.length) return '';
        var t = '<h4 class="promo-group-title">' + title + '（' + rows.length + '台）</h4>';
        t += '<table class="promo-table"><thead><tr>';
        COLUMNS.forEach(function(c) { t += '<th>' + c.label + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function(r) {
            t += '<tr>';
            COLUMNS.forEach(function(c) {
                t += '<td>' + (r[c.key] != null ? r[c.key] : '-') + '</td>';
            });
            t += '</tr>';
        });
        return t + '</tbody></table>';
    }

    function renderDetail(promoKey, dateStr, body, events) {
        var ev = events.filter(function(e) { return e.date === dateStr; })[0];

        var html = '<p><a href="#' + promoKey + '" data-nav="' + promoKey + '">← 開催日一覧</a></p>';
        html += '<h3>' + dateStr.replace(/_/g, '-') + '</h3>';

        if (ev && ev.report_url) {
            html += '<p><a class="promo-report-link" href="' + ev.report_url
                 + '" target="_blank" rel="noopener">来店レポートを見る ↗</a></p>';
        }

        // 機種示唆メモ（note）。文字列 or 配列の両対応、改行で表示
        if (ev && ev.note && (Array.isArray(ev.note) ? ev.note.length : ev.note.trim())) {
            var lines = Array.isArray(ev.note) ? ev.note : String(ev.note).split('\n');
            html += '<div class="promo-note"><h4 class="promo-note-title">機種示唆</h4>';
            lines.forEach(function(line) {
                html += '<p class="promo-note-line">' + escapeHtml(line) + '</p>';
            });
            html += '</div>';
        }

        var groups = ev ? getTargetGroups(dateStr, ev) : { target: [], candidate: [] };
        if (groups === null) {
            html += '<p class="promo-empty">データを読み込んでいます…</p>';
            body.innerHTML = html;
            loadDayThenRerender(promoKey, dateStr);
            return;
        }

        var hasAny = ev && (ev.target_machines || ev.candidate_machines);
        if (!hasAny) {
            html += '<p class="promo-empty">対象機種が未登録です。</p>';
        } else if (!groups.target.length && !groups.candidate.length) {
            html += '<p class="promo-empty">この日のデータに対象機種が見つかりません。</p>';
        } else {
            html += tableBlock('対象機種', groups.target);
            html += tableBlock('候補（推定）機種', groups.candidate);
        }
        body.innerHTML = html;
    }

    function loadDayThenRerender(promoKey, dateStr) {
        if (typeof loadMonthlyJSON === 'function') {
            var p = dateStr.split('_');
            var ym = p[0] + '_' + pad2(p[1]);
            Promise.resolve(loadMonthlyJSON('data/' + ym + '.json'))
                .then(function() { render(promoKey, dateStr); })
                .catch(function() { render(promoKey, dateStr); });
        }
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }


    return { render: render, PROMO_NAMES: PROMO_NAMES };
})();
window.Promotion = Promotion;
