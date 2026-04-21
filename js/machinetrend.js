// ===================
// 機種別累積差枚グラフ タブ
// ===================

const MachineTrend = (() => {
    // ---- 状態 ----
    let chartInstance = null;
    let selectedMachines = [];   // 選択中の機種名リスト
    let periodStart = null;      // 'data/YYYY_MM_DD.csv' 形式
    let periodEnd   = null;
    let machineMultiSelect = null;

    // グラフ用カラーパレット（20色）
    const COLORS = [
        '#f87171','#fb923c','#fbbf24','#a3e635','#34d399',
        '#22d3ee','#60a5fa','#818cf8','#c084fc','#f472b6',
        '#4ade80','#38bdf8','#e879f9','#facc15','#fb7185',
        '#2dd4bf','#a78bfa','#ff8fab','#90e0ef','#b5e48c',
    ];

    // ---- ユーティリティ ----

    /** CSV_FILES から利用可能な全機種リストを返す */
    function getAvailableMachines() {
        return Array.from(allMachines).sort((a, b) => a.localeCompare(b, 'ja'));
    }

    /** 期間内のファイルリストを昇順で返す */
    function getFilesInPeriod(start, end) {
        const sorted = sortFilesByDate(CSV_FILES, false); // 昇順
        return sorted.filter(f => {
            const p = parseDateFromFilename(f);
            if (!p) return false;
            const n = p.year * 10000 + p.month * 100 + p.day;
            const ps = parseDateFromFilename(start);
            const pe = parseDateFromFilename(end);
            if (!ps || !pe) return false;
            const ns = ps.year * 10000 + ps.month * 100 + ps.day;
            const ne = pe.year * 10000 + pe.month * 100 + pe.day;
            return n >= ns && n <= ne;
        });
    }

    /**
     * 指定した機種・ファイルリストの日別差枚合計を計算
     * @returns {Object} { file -> totalSa }
     */
    async function calcDailySaByMachine(machineName, files) {
        const result = {};
        for (const file of files) {
            const data = await loadCSV(file);
            if (!data) continue;
            const rows = data.filter(r => r['機種名'] === machineName);
            if (rows.length === 0) continue;
            const total = rows.reduce((s, r) => s + (parseInt(String(r['差枚']).replace(/,/g, '')) || 0), 0);
            result[file] = total;
        }
        return result;
    }

    // ---- UI 構築 ----

    function renderUI() {
        const tab = document.getElementById('machinetrend');
        if (!tab) return;

        tab.innerHTML = `
        <div class="mt-container">
            <!-- コントロールパネル -->
            <div class="mt-control-panel">
                <div class="mt-control-row">
                    <!-- 機種選択 -->
                    <div class="mt-control-group mt-machine-group">
                        <label class="mt-label">📋 機種選択</label>
                        <div id="mtMachineFilter" class="mt-machine-filter"></div>
                    </div>

                    <!-- 期間選択 -->
                    <div class="mt-control-group mt-period-group">
                        <label class="mt-label">📅 期間</label>
                        <div class="mt-period-row">
                            <select id="mtPeriodStart" class="mt-select mt-date-select"></select>
                            <span class="mt-period-sep">〜</span>
                            <select id="mtPeriodEnd" class="mt-select mt-date-select"></select>
                        </div>
                        <div class="mt-quick-btns">
                            <button class="mt-quick-btn" data-days="7">直近7日</button>
                            <button class="mt-quick-btn" data-days="14">直近14日</button>
                            <button class="mt-quick-btn" data-days="30">直近30日</button>
                            <button class="mt-quick-btn" data-days="60">直近60日</button>
                            <button class="mt-quick-btn" data-days="90">直近90日</button>
                            <button class="mt-quick-btn mt-quick-all" data-days="all">全期間</button>
                        </div>
                    </div>

                    <!-- 実行ボタン -->
                    <div class="mt-control-group mt-run-group">
                        <button id="mtRunBtn" class="mt-run-btn">📈 グラフ表示</button>
                        <button id="mtClearBtn" class="mt-clear-btn">🗑 クリア</button>
                    </div>
                </div>
            </div>

            <!-- グラフエリア -->
            <div class="mt-chart-section">
                <div id="mtChartWrapper" class="mt-chart-wrapper">
                    <div id="mtPlaceholder" class="mt-placeholder">
                        <span class="mt-placeholder-icon">📊</span>
                        <span>機種を選択して「グラフ表示」を押してください</span>
                    </div>
                    <canvas id="mtChart" style="display:none;"></canvas>
                </div>
            </div>

            <!-- サマリーエリア -->
            <div id="mtSummary" class="mt-summary" style="display:none;"></div>
        </div>
        `;

        populateDateSelects();
        initMachineFilter();
        bindEvents();
    }

    /** 期間セレクトボックスを日付データで埋める */
    function populateDateSelects() {
        const sorted = sortFilesByDate(CSV_FILES, true); // 降順（新しい順）
        const startSel = document.getElementById('mtPeriodStart');
        const endSel   = document.getElementById('mtPeriodEnd');
        if (!startSel || !endSel) return;

        const makeOption = (f) => {
            const p = parseDateFromFilename(f);
            if (!p) return '';
            const label = `${p.year}/${String(p.month).padStart(2,'0')}/${String(p.day).padStart(2,'0')}`;
            return `<option value="${f}">${label}</option>`;
        };

        const opts = sorted.map(makeOption).join('');
        endSel.innerHTML   = opts;  // 終了＝最新日
        startSel.innerHTML = opts;

        // デフォルト：直近30日
        applyQuickPeriod(30);
    }

    /** 機種マルチセレクトを初期化 */
    function initMachineFilter() {
        const machines = getAvailableMachines();
        const options = machines.map(m => ({ value: m, label: m }));

        if (machineMultiSelect) {
            machineMultiSelect.updateOptions(options);
        } else {
            machineMultiSelect = initMultiSelectMachineFilter(
                'mtMachineFilter',
                options,
                '機種を選択（複数可）',
                (vals) => { selectedMachines = vals; }
            );
        }
        selectedMachines = machineMultiSelect ? machineMultiSelect.getSelectedValues() : [];
    }

    /** クイック期間適用 */
    function applyQuickPeriod(days) {
        const sorted = sortFilesByDate(CSV_FILES, true);
        if (sorted.length === 0) return;
        const endSel   = document.getElementById('mtPeriodEnd');
        const startSel = document.getElementById('mtPeriodStart');
        if (!endSel || !startSel) return;

        endSel.selectedIndex = 0; // 最新日

        if (days === 'all') {
            startSel.selectedIndex = startSel.options.length - 1;
        } else {
            const idx = Math.min(days - 1, sorted.length - 1);
            startSel.value = sorted[idx] || sorted[sorted.length - 1];
        }

        // ボタンの active 状態更新
        document.querySelectorAll('.mt-quick-btn').forEach(btn => {
            btn.classList.toggle('active',
                btn.dataset.days === String(days));
        });
    }

    /** イベントバインド */
    function bindEvents() {
        // クイック選択ボタン
        document.querySelectorAll('.mt-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const v = btn.dataset.days;
                applyQuickPeriod(v === 'all' ? 'all' : parseInt(v));
            });
        });

        // 実行
        document.getElementById('mtRunBtn')?.addEventListener('click', runChart);

        // クリア
        document.getElementById('mtClearBtn')?.addEventListener('click', clearChart);
    }

    // ---- グラフ描画 ----

    async function runChart() {
        const startSel = document.getElementById('mtPeriodStart');
        const endSel   = document.getElementById('mtPeriodEnd');
        if (!startSel || !endSel) return;

        periodStart = startSel.value;
        periodEnd   = endSel.value;
        selectedMachines = machineMultiSelect ? machineMultiSelect.getSelectedValues() : [];

        if (selectedMachines.length === 0) {
            showMtToast('機種を1つ以上選択してください');
            return;
        }
        if (!periodStart || !periodEnd) {
            showMtToast('期間を選択してください');
            return;
        }

        // 日付の前後チェック
        const ps = parseDateFromFilename(periodStart);
        const pe = parseDateFromFilename(periodEnd);
        if (ps && pe) {
            const ns = ps.year*10000+ps.month*100+ps.day;
            const ne = pe.year*10000+pe.month*100+pe.day;
            if (ns > ne) {
                showMtToast('開始日が終了日より後になっています');
                return;
            }
        }

        setLoading(true);

        const files = getFilesInPeriod(periodStart, periodEnd);
        if (files.length === 0) {
            setLoading(false);
            showMtToast('選択期間にデータがありません');
            return;
        }

        // 各機種のデータを並列取得
        const machineDataList = await Promise.all(
            selectedMachines.map(async (machine, i) => {
                const dailySa = await calcDailySaByMachine(machine, files);
                return { machine, dailySa, color: COLORS[i % COLORS.length] };
            })
        );

        drawChart(files, machineDataList);
        renderSummary(files, machineDataList);
        setLoading(false);
    }

    function drawChart(files, machineDataList) {
        const canvas = document.getElementById('mtChart');
        const placeholder = document.getElementById('mtPlaceholder');
        if (!canvas) return;

        // 既存チャート破棄
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        canvas.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';

        const labels = files.map(f => {
            const p = parseDateFromFilename(f);
            return p ? `${p.month}/${p.day}` : f;
        });

        const datasets = machineDataList.map(({ machine, dailySa, color }) => {
            // 累積差枚の計算
            let cumulative = 0;
            const data = files.map(f => {
                if (dailySa[f] !== undefined) {
                    cumulative += dailySa[f];
                    return cumulative;
                }
                return null; // その日データなし
            });

            return {
                label: machine,
                data,
                borderColor: color,
                backgroundColor: color + '18',
                borderWidth: 2,
                pointRadius: files.length <= 30 ? 4 : files.length <= 60 ? 2 : 1,
                pointHoverRadius: 6,
                pointBackgroundColor: color,
                pointBorderColor: '#1e1e2e',
                pointBorderWidth: 1,
                tension: 0.15,
                fill: false,
                spanGaps: true
            };
        });

        // Y軸ゼロ線を強調する plugin
        const zeroLinePlugin = {
            id: 'zeroLine',
            afterDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const y = scales.y.getPixelForValue(0);
                if (y >= chartArea.top && y <= chartArea.bottom) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([6, 3]);
                    ctx.moveTo(chartArea.left, y);
                    ctx.lineTo(chartArea.right, y);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        };

        chartInstance = new Chart(canvas, {
            type: 'line',
            data: { labels, datasets },
            plugins: [zeroLinePlugin],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#eee',
                            font: { size: 11 },
                            boxWidth: 14,
                            padding: 12,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(20,20,40,0.95)',
                        titleColor: '#fff',
                        bodyColor: '#eee',
                        borderColor: '#444',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label(ctx) {
                                const val = ctx.parsed.y;
                                if (val === null) return `${ctx.dataset.label}: -`;
                                const sign = val >= 0 ? '+' : '';
                                return `${ctx.dataset.label}: ${sign}${Math.round(val).toLocaleString()}枚`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: '機種別 期間累積差枚グラフ',
                        color: '#ccc',
                        font: { size: 14, weight: 'bold' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: {
                            color: '#aaa',
                            font: { size: 10 },
                            maxTicksLimit: 20,
                            maxRotation: 45
                        }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.08)' },
                        ticks: {
                            color: '#aaa',
                            font: { size: 11 },
                            callback(val) {
                                const abs = Math.abs(val);
                                if (abs >= 1000000) return (val/1000000).toFixed(1)+'M';
                                if (abs >= 1000) return (val/1000).toFixed(0)+'k';
                                return val.toLocaleString();
                            }
                        },
                        title: {
                            display: true,
                            text: '累積差枚（枚）',
                            color: '#888',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });
    }

    /** サマリーカードを描画 */
    function renderSummary(files, machineDataList) {
        const container = document.getElementById('mtSummary');
        if (!container) return;
        container.style.display = 'block';

        const periodText = (() => {
            const ps = parseDateFromFilename(periodStart);
            const pe = parseDateFromFilename(periodEnd);
            if (!ps || !pe) return '';
            const fmt = p => `${p.year}/${String(p.month).padStart(2,'0')}/${String(p.day).padStart(2,'0')}`;
            return `${fmt(ps)} 〜 ${fmt(pe)}（${files.length}日間）`;
        })();

        const cards = machineDataList.map(({ machine, dailySa, color }) => {
            const values = Object.values(dailySa);
            if (values.length === 0) {
                return `
                <div class="mt-summary-card" style="--card-color:${color}">
                    <div class="mt-card-machine">${machine}</div>
                    <div class="mt-card-nodata">データなし</div>
                </div>`;
            }

            const totalSa   = values.reduce((s, v) => s + v, 0);
            const avgDaySa  = totalSa / values.length;
            const maxDaySa  = Math.max(...values);
            const minDaySa  = Math.min(...values);
            const plusDays  = values.filter(v => v > 0).length;
            const winRate   = ((plusDays / values.length) * 100).toFixed(1);
            const saClass   = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
            const sign      = v => v >= 0 ? '+' : '';

            return `
            <div class="mt-summary-card" style="--card-color:${color}">
                <div class="mt-card-machine">${machine}</div>
                <div class="mt-card-main ${saClass}">${sign(totalSa)}${Math.round(totalSa).toLocaleString()}枚</div>
                <div class="mt-card-label">期間累積差枚</div>
                <div class="mt-card-stats">
                    <div class="mt-card-stat">
                        <span class="mt-stat-label">日平均</span>
                        <span class="mt-stat-value ${avgDaySa > 0 ? 'plus' : avgDaySa < 0 ? 'minus' : ''}">${sign(avgDaySa)}${Math.round(avgDaySa).toLocaleString()}</span>
                    </div>
                    <div class="mt-card-stat">
                        <span class="mt-stat-label">最高日</span>
                        <span class="mt-stat-value plus">${sign(maxDaySa)}${Math.round(maxDaySa).toLocaleString()}</span>
                    </div>
                    <div class="mt-card-stat">
                        <span class="mt-stat-label">最低日</span>
                        <span class="mt-stat-value ${minDaySa < 0 ? 'minus' : ''}">${sign(minDaySa)}${Math.round(minDaySa).toLocaleString()}</span>
                    </div>
                    <div class="mt-card-stat">
                        <span class="mt-stat-label">勝率</span>
                        <span class="mt-stat-value">${winRate}%（${plusDays}/${values.length}日）</span>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = `
        <div class="mt-summary-header">
            <span class="mt-summary-period">📅 ${periodText}</span>
        </div>
        <div class="mt-summary-cards">${cards}</div>
        `;
    }

    function clearChart() {
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
        const canvas = document.getElementById('mtChart');
        const placeholder = document.getElementById('mtPlaceholder');
        if (canvas) canvas.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';

        const summary = document.getElementById('mtSummary');
        if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }

        if (machineMultiSelect) machineMultiSelect.reset();
        selectedMachines = [];
    }

    function setLoading(on) {
        const btn = document.getElementById('mtRunBtn');
        const wrapper = document.getElementById('mtChartWrapper');
        if (btn) {
            btn.disabled = on;
            btn.textContent = on ? '⏳ 読み込み中...' : '📈 グラフ表示';
        }
        if (wrapper) wrapper.classList.toggle('loading', on);
    }

    function showMtToast(msg) {
        if (typeof showCopyToast === 'function') {
            showCopyToast(msg, true);
        } else {
            alert(msg);
        }
    }

    // ---- 公開API ----
    return {
        init() {
            renderUI();
        },
        refresh() {
            // データ追加読み込み後の機種リスト更新
            if (machineMultiSelect) {
                const machines = getAvailableMachines();
                machineMultiSelect.updateOptions(machines.map(m => ({ value: m, label: m })));
            }
            populateDateSelects();
        }
    };
})();
