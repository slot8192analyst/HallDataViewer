// ===================
// 取材ページ共通モジュール（promotion.js）
//   - events は HallData.store.events を優先。無ければ events.json を自前fetch
//   - name は配列／文字列どちらも対応
//   - date はアンダースコア区切り（例: 2026_06_06）
//   - 対象機種は機種名 完全一致で日別データ(dataCache)から抽出
//   - 未来の開催日（今日より後）はデータを読みに行かない（404防止）
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

    // 開催日カードに出す機種名の上限
    var PREVIEW_LIMIT = 3;

    // ===================
    // events 取得（ストア優先 → 無ければ自前 fetch してキャッシュ）
    // ===================
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

    // ===================
    // 日付・キャッシュ・データ抽出
    // ===================
    function pad2(s) { s = String(s); return s.length < 2 ? '0' + s : s; }

    // その開催日が「今日より後（＝まだデータが無い）」か判定
    function isFutureDate(dateStr) {
        var p = String(dateStr).split('_');
        if (p.length !== 3) return false;
        var d = new Date(
            parseInt(p[0], 10),
            parseInt(p[1], 10) - 1,
            parseInt(p[2], 10)
        );
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        return d.getTime() > today.getTime();
    }

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

    // ===================
    // 集計ヘルパー
    // ===================
    function summarizeRows(rows) {
        var total = 0, win = 0, gTotal = 0;
        rows.forEach(function(r) {
            var d = parseInt(r['差枚'], 10) || 0;
            var g = parseInt(r['G数'], 10) || 0;
            total += d;
            gTotal += g;
            if (d > 0) win++;
        });
        return {
            count: rows.length,
            total: total,
            avgG: rows.length ? Math.round(gTotal / rows.length) : 0,
            winRate: rows.length ? Math.round(win / rows.length * 100) : 0
        };
    }

    function summaryBar(rows) {
        if (!rows || !rows.length) return '';
        var s = summarizeRows(rows);
        var totalCls = s.total > 0 ? 'plus' : (s.total < 0 ? 'minus' : 'zero');
        var totalStr = (s.total > 0 ? '+' : '') + s.total.toLocaleString();
        return '<div class="promo-summary summary">'
            + '<span>台数 <b>' + s.count + '</b></span>'
            + '<span>合計差枚 <b class="' + totalCls + '">' + totalStr + '</b></span>'
            + '<span>平均G数 <b>' + s.avgG.toLocaleString() + '</b></span>'
            + '<span>勝率 <b>' + s.winRate + '%</b></span>'
            + '</div>';
    }

    // 開催日カードに出す機種名（target優先、なければcandidate）。先頭N件＋省略
    //   未来日 … { ..., future: true }
    //   未ロード … null（後で再描画）
    function machinePreview(ev, dateStr) {
        if (isFutureDate(dateStr)) {
            return { names: [], more: 0, summary: null, future: true };
        }
        var groups = getTargetGroups(dateStr, ev);
        if (!groups) return null; // 未ロード → 後で再描画
        var rows = groups.target.length ? groups.target : groups.candidate;
        if (!rows.length) return { names: [], more: 0, summary: null };

        // 機種名の重複を除いて一覧化
        var seen = {}, names = [];
        rows.forEach(function(r) {
            var n = r['機種名'];
            if (n && !seen[n]) { seen[n] = true; names.push(n); }
        });

        return {
            names: names.slice(0, PREVIEW_LIMIT),
            more: Math.max(0, names.length - PREVIEW_LIMIT),
            summary: summarizeRows(rows)
        };
    }

    // ===================
    // 描画エントリ（events を取得してから描く）
    // ===================
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

    // ===================
    // 開催日一覧（カード ＋ 対象機種マトリクス）
    // ===================
    function renderList(promoKey, body, events) {
        if (!events.length) {
            body.innerHTML = '<p class="promo-empty">登録された開催日がありません。</p>';
            return;
        }

        var needReload = false;
        var html = '<div class="promo-day-cards">';

        events.forEach(function(ev) {
            var hasDetail = !!(ev.report_url || ev.target_machines || ev.candidate_machines);
            var pv = machinePreview(ev, ev.date);
            if (pv === null) needReload = true;

            html += '<a class="promo-day-card" href="#' + promoKey + '/' + ev.date + '"'
                 + ' data-nav="' + promoKey + '" data-param="' + ev.date + '"'
                 + ' data-promo="' + promoKey + '">';

            // ヘッダー: 日付＋サマリー（未来日は「開催予定」）
            html += '<div class="promo-day-head">';
            html += '<span class="promo-day-date">' + ev.date.replace(/_/g, '-') + '</span>';
            if (pv && pv.future) {
                html += '<span class="promo-day-badge">開催予定</span>';
            } else if (pv && pv.summary && pv.summary.count) {
                var s = pv.summary;
                var cls = s.total > 0 ? 'plus' : (s.total < 0 ? 'minus' : 'zero');
                var totalStr = (s.total > 0 ? '+' : '') + s.total.toLocaleString();
                html += '<span class="promo-day-stats">'
                     + '<b class="' + cls + '">' + totalStr + '</b>'
                     + '<span class="promo-day-winrate">勝率' + s.winRate + '%</span>'
                     + '</span>';
            }
            html += '</div>';

            // 対象機種チップ
            if (pv && pv.names.length) {
                html += '<div class="promo-day-machines">';
                pv.names.forEach(function(n) {
                    html += '<span class="promo-machine-chip">' + escapeHtml(n) + '</span>';
                });
                if (pv.more > 0) {
                    html += '<span class="promo-machine-chip promo-machine-more">ほか'
                         + pv.more + '機種</span>';
                }
                html += '</div>';
            } else if (!hasDetail) {
                html += '<div class="promo-day-machines">'
                     + '<span class="promo-nodetail">詳細未登録</span></div>';
            }

            html += '</a>';
        });

        html += '</div>';

        // 対象機種マトリクス（events だけで描けるのでロード状況に依存しない）
        html += buildMachineMatrix(promoKey, events);

        body.innerHTML = html;

        // どこかの日が未ロードなら、その月を読み込んでから一覧を再描画
        if (needReload) loadAllListDaysThenRerender(promoKey, events);
    }

    // 一覧の各日について、未ロードの月をまとめて読み込んでから再描画
    //   未来日（まだデータが無い）は読みに行かない
    function loadAllListDaysThenRerender(promoKey, events) {
        if (typeof loadMonthlyJSON !== 'function') return;
        var months = {};
        events.forEach(function(ev) {
            if (isFutureDate(ev.date)) return;                 // 未来日はスキップ
            if (getTargetGroups(ev.date, ev) === null) {
                var p = ev.date.split('_');
                months[p[0] + '_' + pad2(p[1])] = true;
            }
        });
        var jobs = Object.keys(months).map(function(ym) {
            return Promise.resolve(loadMonthlyJSON('data/' + ym + '.json')).catch(function(){});
        });
        if (!jobs.length) return;
        Promise.all(jobs).then(function() {
            var container = document.getElementById(promoKey);
            var bodyEl = container && container.querySelector('.promo-body');
            if (bodyEl) renderList(promoKey, bodyEl, events);
        });
    }

    // ===================
    // 対象機種マトリクス（縦:機種 × 横:開催日）
    //   target = 塗りつぶし(濃), candidate = 薄塗り
    //   events の target_machines / candidate_machines から直接組み立てるため
    //   日別データ(dataCache)のロード状況に依存しない（未来日も表示可）
    // ===================
    function buildMachineMatrix(promoKey, events) {
        // 横軸は古い順（左→右で時系列）
        var days = events.slice().sort(function(a, b) {
            return a.date < b.date ? -1 : 1;
        });

        var matrix = {};   // { 機種名: { date: 'target' | 'candidate' } }
        var order = [];    // 機種の出現順

        days.forEach(function(ev) {
            function mark(names, type) {
                (names || []).forEach(function(n) {
                    if (!n) return;
                    if (!matrix[n]) { matrix[n] = {}; order.push(n); }
                    // target は candidate より優先（上書きしない）
                    if (matrix[n][ev.date] !== 'target') matrix[n][ev.date] = type;
                });
            }
            mark(ev.target_machines, 'target');
            mark(ev.candidate_machines, 'candidate');   // candidate不要ならこの行を削除
        });

        if (!order.length) return '';

        // ピック回数カウント（type省略で全件）
        function pickCount(name, type) {
            var c = 0;
            for (var d in matrix[name]) {
                if (!matrix[name].hasOwnProperty(d)) continue;
                if (!type || matrix[name][d] === type) c++;
            }
            return c;
        }

        // target回数の多い順（同数なら全件数）
        order.sort(function(a, b) {
            return pickCount(b, 'target') - pickCount(a, 'target')
                || pickCount(b) - pickCount(a);
        });

        var html = '<div class="promo-matrix-section">';
        html += '<h3 class="promo-matrix-title">対象機種マトリクス</h3>';
        html += '<div class="promo-matrix-legend">'
             + '<span><i class="promo-cell-target"></i> 対象</span>'
             + '<span><i class="promo-cell-candidate"></i> 候補</span>'
             + '</div>';
        html += '<div class="table-wrapper"><table class="promo-matrix-table"><thead><tr>';
        html += '<th class="promo-matrix-machine">機種名</th>';
        html += '<th class="promo-matrix-count">回数</th>';
        days.forEach(function(ev) {
            var label = ev.date.replace(/^\d{4}_/, '').replace(/_/g, '/'); // MM/DD
            html += '<th class="promo-matrix-day">' + label + '</th>';
        });
        html += '</tr></thead><tbody>';

        order.forEach(function(name) {
            var cnt = pickCount(name, 'target');
            var cand = pickCount(name, 'candidate');
            html += '<tr>';
            html += '<td class="promo-matrix-machine">' + escapeHtml(name) + '</td>';
            html += '<td class="promo-matrix-count"><b>' + cnt + '</b>'
                 + (cand ? '<span class="promo-matrix-candcount">(+' + cand + ')</span>' : '')
                 + '</td>';
            days.forEach(function(ev) {
                var type = matrix[name][ev.date];
                var cls = type === 'target' ? 'promo-cell-target'
                        : (type === 'candidate' ? 'promo-cell-candidate' : '');
                html += '<td class="promo-matrix-cell ' + cls + '">'
                     + (type === 'target' ? '●' : (type === 'candidate' ? '○' : ''))
                     + '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
        return html;
    }

    // ===================
    // 詳細ページ（テーブル＋サマリーバー）
    // ===================
    function tableBlock(title, rows) {
        if (!rows || !rows.length) return '';
        var t = '<h4 class="promo-group-title">' + title + '（' + rows.length + '台）</h4>';
        t += summaryBar(rows);
        t += '<div class="table-wrapper"><table class="promo-table"><thead><tr>';
        COLUMNS.forEach(function(c) { t += '<th>' + c.label + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function(r) {
            t += '<tr>';
            COLUMNS.forEach(function(c) {
                var v = (r[c.key] != null ? r[c.key] : '-');
                var cls = '';
                if (c.key === '差枚') {
                    var n = parseInt(r[c.key], 10) || 0;
                    cls = n > 0 ? ' class="plus"' : (n < 0 ? ' class="minus"' : ' class="zero"');
                    if (n > 0) v = '+' + v;
                }
                t += '<td' + cls + '>' + v + '</td>';
            });
            t += '</tr>';
        });
        return t + '</tbody></table></div>';
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

        // 未来日（まだデータが無い）はテーブルを描かず案内のみ
        if (isFutureDate(dateStr)) {
            html += '<p class="promo-empty">この開催日はまだ来ていないため、データは未掲載です。</p>';
            body.innerHTML = html;
            return;
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
        if (isFutureDate(dateStr)) return;                     // 未来日はスキップ
        if (typeof loadMonthlyJSON === 'function') {
            var p = dateStr.split('_');
            var ym = p[0] + '_' + pad2(p[1]);
            Promise.resolve(loadMonthlyJSON('data/' + ym + '.json'))
                .then(function() { render(promoKey, dateStr); })
                .catch(function() { render(promoKey, dateStr); });
        }
    }

    // ===================
    // ユーティリティ
    // ===================
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { render: render, PROMO_NAMES: PROMO_NAMES };
})();
window.Promotion = Promotion;
