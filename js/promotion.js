// ===================
// 取材ページ共通モジュール（promotion.js）
//   - events は HallData.store.events を優先。無ければ events.json を自前fetch
//   - name は配列／文字列どちらも対応
//   - date はアンダースコア区切り（例: 2026_06_06）
//   - 対象機種は機種名 完全一致で日別データ(dataCache)から抽出
//   - 未来の開催日（今日より後）はデータを読みに行かない（404防止）
//   - 取材ハブには3取材を1枚にまとめた全体マトリクス（buildOverviewMatrix）を描画
//   - 各取材の日付詳細にはその日の全台ランキング（buildDayRanking）を描画
// ===================
var Promotion = (function() {
    'use strict';

    var PROMO_NAMES = {
        tenun:  '天運総撃',
        ougi:   '奥義ノ矢',
        zombie: 'ゾンビ狩り取材'
    };

    // 取材カラー定義（全体マトリクス用）。キーは router の data-nav / ページキーと一致
    var PROMO_COLORS = {
        tenun:  { name: '天運総撃',   accent: '#ef4444' },  // 赤
        ougi:   { name: '奥義の矢',   accent: '#3b82f6' },  // 青
        zombie: { name: 'ゾンビ狩り', accent: '#22c55e' }   // 緑
    };

    // 表示用ラベル（カード/凡例と揃える。PROMO_NAMES は events.json の name 値なので別物）
    var PROMO_LABELS = {
        tenun:  '天運総撃',
        ougi:   '奥義の矢',
        zombie: 'ゾンビ狩り'
    };

    var COLUMNS = [
        { key: '機種名', label: '機種名' },
        { key: '台番号', label: '台番号' },
        { key: 'G数',    label: 'G数' },
        { key: '差枚',   label: '差枚' }
    ];

    // 開催日カードに出す機種名の上限
    var PREVIEW_LIMIT = 3;

    // ランキング設定
    var MACHINE_MIN_COUNT = 3;   // 機種ランキングの最低設置台数（これ未満は除外）
    var TOP_N_UNITS = 20;        // 差枚TOP（台単位）
    var TOP_N_MACHINES = 5;      // 機種ランキングTOP

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

    // その開催日の全台レコード（ホール全台）。未ロードなら null
    function getDayRecords(dateStr) {
        var key = dateToCacheKey(dateStr);
        return (typeof dataCache !== 'undefined' && dataCache[key]) || null;
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

    // ===================
    // その日の全台ランキング集計
    //   topUnits  : 差枚TOP20（全台、差枚降順）
    //   topAvg    : 機種 平均差枚 TOP5（3台以上の機種のみ）
    //   topTotal  : 機種 合計差枚 TOP5（3台以上の機種のみ）
    // ===================
    function buildDayRanking(records) {
        if (!records || !records.length) return null;

        // --- 差枚TOP20（その日の全台、差枚降順） ---
        var topUnits = records.slice().sort(function(a, b) {
            return (parseInt(b['差枚'], 10) || 0) - (parseInt(a['差枚'], 10) || 0);
        }).slice(0, TOP_N_UNITS);

        // --- 機種別集計 ---
        var byMachine = {};
        records.forEach(function(r) {
            var name = r['機種名'];
            if (!name) return;
            if (!byMachine[name]) byMachine[name] = { name: name, count: 0, total: 0 };
            byMachine[name].count += 1;
            byMachine[name].total += parseInt(r['差枚'], 10) || 0;
        });

        // 3台以上のみ対象に平均を算出
        var machines = [];
        for (var n in byMachine) {
            if (!byMachine.hasOwnProperty(n)) continue;
            var m = byMachine[n];
            if (m.count < MACHINE_MIN_COUNT) continue;
            m.avg = Math.round(m.total / m.count);
            machines.push(m);
        }

        var topAvg = machines.slice().sort(function(a, b) {
            return b.avg - a.avg;
        }).slice(0, TOP_N_MACHINES);

        var topTotal = machines.slice().sort(function(a, b) {
            return b.total - a.total;
        }).slice(0, TOP_N_MACHINES);

        return { topUnits: topUnits, topAvg: topAvg, topTotal: topTotal };
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
    // 全体マトリクス（3取材を1枚に統合）
    //   縦: 機種名 / 横: 開催日（全取材を日付昇順で「通し」に並べる）
    //   各開催日（列）に取材カラーを付与。セルは target=濃(●) / candidate=薄(○)
    //   events.json の target_machines / candidate_machines から組むので
    //   日別データのロード状況に依存しない（未来日も描ける）
    // ===================
    function buildOverviewMatrix(allEvents) {
        var keys = ['tenun', 'ougi', 'zombie'];

        // 1) 取材ごとの開催日イベントを集める（date + promoKey を持たせる）
        var dayEvents = [];
        keys.forEach(function(k) {
            filterEventsFor(allEvents, k).forEach(function(ev) {
                dayEvents.push({ promo: k, ev: ev });
            });
        });
        if (!dayEvents.length) {
            return '<p class="promo-empty">登録された開催日がありません。</p>';
        }

        // 2) 横軸（列）= 全取材を「日付昇順」で通しに並べる
        //    同日に複数取材があれば keys の順で安定させる
        var columns = dayEvents.slice().sort(function(a, b) {
            if (a.ev.date !== b.ev.date) return a.ev.date < b.ev.date ? -1 : 1;
            return keys.indexOf(a.promo) - keys.indexOf(b.promo);
        });

        // 3) matrix[機種名][列index] = 'target' | 'candidate'
        //    取材別ピック回数も集計
        var matrix = {};     // { 機種名: { colIndex: type } }
        var order  = [];     // 機種出現順
        var promoCount = {}; // { 機種名: { tenun:{t,c}, ougi:{...}, zombie:{...} } }

        columns.forEach(function(col, ci) {
            function mark(names, type) {
                (names || []).forEach(function(n) {
                    if (!n) return;
                    if (!matrix[n]) {
                        matrix[n] = {};
                        order.push(n);
                        promoCount[n] = {
                            tenun:  { t: 0, c: 0 },
                            ougi:   { t: 0, c: 0 },
                            zombie: { t: 0, c: 0 }
                        };
                    }
                    // target は candidate より優先（上書きしない）
                    if (matrix[n][ci] !== 'target') matrix[n][ci] = type;
                    if (type === 'target') promoCount[n][col.promo].t++;
                    else                   promoCount[n][col.promo].c++;
                });
            }
            mark(col.ev.target_machines, 'target');
            mark(col.ev.candidate_machines, 'candidate');
        });

        if (!order.length) return '';

        // 4) 並び順: 全取材合計の target 回数が多い順 → 全件数
        function totalCount(name, onlyTarget) {
            var pc = promoCount[name], c = 0;
            keys.forEach(function(k) { c += pc[k].t + (onlyTarget ? 0 : pc[k].c); });
            return c;
        }
        function totalTarget(name) {
            var pc = promoCount[name], c = 0;
            keys.forEach(function(k) { c += pc[k].t; });
            return c;
        }
        order.sort(function(a, b) {
            return totalTarget(b) - totalTarget(a) || totalCount(b) - totalCount(a);
        });

        // 5) HTML 組み立て
        var html = '<div class="promo-matrix-section promo-overview-section">';
        html += '<h3 class="promo-matrix-title">全体マトリクス（3取材一覧）</h3>';

        // 凡例（取材カラー）
        html += '<div class="promo-matrix-legend promo-overview-legend">';
        keys.forEach(function(k) {
            html += '<span class="promo-legend-item">'
                 +  '<i class="promo-legend-swatch" style="background:'
                 +  PROMO_COLORS[k].accent + '"></i>'
                 +  escapeHtml(PROMO_LABELS[k]) + '</span>';
        });
        html += '<span class="promo-legend-note">●=対象 / ○=候補</span>';
        html += '</div>';

        html += '<div class="table-wrapper"><table class="promo-matrix-table promo-overview-table"><thead>';

        // 1段ヘッダー: 機種名 / 回数 / 各開催日（日付に取材カラー）
        html += '<tr>';
        html += '<th class="promo-matrix-machine">機種名</th>';
        html += '<th class="promo-matrix-count">回数</th>';
        columns.forEach(function(col) {
            var color = PROMO_COLORS[col.promo].accent;
            var label = col.ev.date.replace(/^\d{4}_/, '').replace(/_/g, '/'); // MM/DD
            html += '<th class="promo-matrix-day promo-overview-day"'
                 +  ' style="color:' + color
                 +  ';border-bottom:3px solid ' + color + '"'
                 +  ' title="' + escapeHtml(PROMO_LABELS[col.promo]) + '">'
                 +  label + '</th>';
        });
        html += '</tr></thead><tbody>';

        // 本体
        order.forEach(function(name) {
            html += '<tr>';
            html += '<td class="promo-matrix-machine">' + escapeHtml(name) + '</td>';

            // 回数セル: 取材別の内訳を色付きで
            html += '<td class="promo-matrix-count promo-overview-count">';
            keys.forEach(function(k) {
                var pc = promoCount[name][k];
                if (pc.t || pc.c) {
                    html += '<span class="promo-overview-countitem" style="color:'
                         +  PROMO_COLORS[k].accent + '">' + pc.t
                         +  (pc.c ? '(+' + pc.c + ')' : '') + '</span>';
                }
            });
            html += '</td>';

            // 各列セル
            columns.forEach(function(col, ci) {
                var type = matrix[name][ci];
                if (!type) {
                    html += '<td class="promo-matrix-cell"></td>';
                    return;
                }
                var color = PROMO_COLORS[col.promo].accent;
                if (type === 'target') {
                    html += '<td class="promo-matrix-cell promo-cell-on"'
                         +  ' style="background:' + color + ';color:#fff">●</td>';
                } else {
                    html += '<td class="promo-matrix-cell promo-cell-cand"'
                         +  ' style="background:' + hexToRgba(color, 0.18)
                         +  ';color:' + color + '">○</td>';
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table></div></div>';
        return html;
    }

    // hex(#rrggbb) → rgba 文字列（candidate の薄塗り用）
    function hexToRgba(hex, alpha) {
        var h = hex.replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var r = parseInt(h.substr(0, 2), 16);
        var g = parseInt(h.substr(2, 2), 16);
        var b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    // ハブ用: events を取得して全体マトリクスを描く
    //   描画先は promotion ページ内の .promo-overview-mount
    function renderOverview() {
        var container = document.getElementById('promotion');
        if (!container) return;
        var mount = container.querySelector('.promo-overview-mount');
        if (!mount) return;

        getAllEvents().then(function(allEvents) {
            mount.innerHTML = buildOverviewMatrix(allEvents);
        });
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

    // ===================
    // その日の全台ランキング描画
    // ===================
    function buildRankingSection(ranking) {
        if (!ranking) return '';
        var html = '<div class="promo-ranking-section">';
        html += '<h3 class="promo-matrix-title">その日の全台ランキング</h3>';

        // 差枚TOP20（全台）
        if (ranking.topUnits.length) {
            html += '<h4 class="promo-group-title">差枚 TOP' + ranking.topUnits.length + '（全台）</h4>';
            html += rankTableUnits(ranking.topUnits);
        }

        // 機種ランキング（3台以上）を横並び
        html += '<div class="promo-rank-machines">';
        html += machineRankBlock('機種 平均差枚 TOP5（3台以上）', ranking.topAvg, 'avg');
        html += machineRankBlock('機種 合計差枚 TOP5（3台以上）', ranking.topTotal, 'total');
        html += '</div>';

        html += '</div>';
        return html;
    }

    // 差枚TOP20テーブル（順位付き）
    function rankTableUnits(rows) {
        var t = '<div class="table-wrapper"><table class="promo-table promo-rank-table"><thead><tr>';
        t += '<th>順位</th>';
        COLUMNS.forEach(function(c) { t += '<th>' + c.label + '</th>'; });
        t += '</tr></thead><tbody>';
        rows.forEach(function(r, i) {
            t += '<tr><td class="promo-rank-no">' + (i + 1) + '</td>';
            COLUMNS.forEach(function(c) {
                var v = (r[c.key] != null ? r[c.key] : '-');
                var cls = '';
                if (c.key === '差枚') {
                    var n = parseInt(r[c.key], 10) || 0;
                    cls = n > 0 ? ' class="plus"' : (n < 0 ? ' class="minus"' : ' class="zero"');
                    if (n > 0) v = '+' + v;
                }
                t += '<td' + cls + '>' + escapeHtml(String(v)) + '</td>';
            });
            t += '</tr>';
        });
        return t + '</tbody></table></div>';
    }

    // 機種ランキング（avg or total を主値に表示）
    function machineRankBlock(title, rows, valueKey) {
        if (!rows || !rows.length) {
            return '<div class="promo-rank-machine-block">'
                 + '<h4 class="promo-group-title">' + escapeHtml(title) + '</h4>'
                 + '<p class="promo-empty">対象機種（3台以上）がありません。</p></div>';
        }
        var t = '<div class="promo-rank-machine-block">';
        t += '<h4 class="promo-group-title">' + escapeHtml(title) + '</h4>';
        t += '<div class="table-wrapper"><table class="promo-table promo-rank-table"><thead><tr>';
        t += '<th>順位</th><th>機種名</th><th>台数</th><th>'
           + (valueKey === 'avg' ? '平均差枚' : '合計差枚') + '</th></tr></thead><tbody>';
        rows.forEach(function(m, i) {
            var val = m[valueKey];
            var cls = val > 0 ? ' class="plus"' : (val < 0 ? ' class="minus"' : ' class="zero"');
            var str = (val > 0 ? '+' : '') + val.toLocaleString();
            t += '<tr>'
               + '<td class="promo-rank-no">' + (i + 1) + '</td>'
               + '<td>' + escapeHtml(m.name) + '</td>'
               + '<td>' + m.count + '</td>'
               + '<td' + cls + '>' + str + '</td>'
               + '</tr>';
        });
        return t + '</tbody></table></div></div>';
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

        // その日の全台ランキング（差枚TOP20 / 機種平均TOP5 / 機種合計TOP5）
        //   母集団はその日のホール全台。groups が取れている＝データはロード済み
        var dayRecords = getDayRecords(dateStr);
        if (dayRecords && dayRecords.length) {
            html += buildRankingSection(buildDayRanking(dayRecords));
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

    return {
        render: render,
        renderOverview: renderOverview,
        PROMO_NAMES: PROMO_NAMES,
        PROMO_COLORS: PROMO_COLORS,
        PROMO_LABELS: PROMO_LABELS
    };
})();
window.Promotion = Promotion;
