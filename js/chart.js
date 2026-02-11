// ===================
// グラフ描画モジュール
// ===================

let trendChartInstance = null;

const CHART_COLORS = [
    '#4ade80', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa',
    '#fb923c', '#2dd4bf', '#f87171', '#818cf8', '#34d399',
    '#e879f9', '#38bdf8', '#facc15', '#fb7185', '#a3e635',
    '#22d3ee', '#c084fc', '#fca5a5', '#86efac', '#93c5fd',
];

function renderTrendChart(results, targetFiles, options = {}) {
    const {
        showTop = true,
        showBottom = false,
        displayCount = 5,
        mode = 'unit',
        config = null
    } = options;

    const colConfig = config || getCurrentColumnConfig();
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    if (results.length === 0 || targetFiles.length === 0) return;

    const chartDisplayType = document.getElementById('chartDisplayType')?.value || 'cumulative';
    // 確率系・レート系は累積が意味をなさないので日別固定
    const effectiveDisplayType = (!colConfig.canSum) ? 'daily' : chartDisplayType;

    // ソートして上位/下位を取得
    const sortKey = 'total';
    const sortedResults = [...results].sort((a, b) => {
        const aVal = (a[sortKey] !== null && a[sortKey] !== undefined) ? a[sortKey] : -Infinity;
        const bVal = (b[sortKey] !== null && b[sortKey] !== undefined) ? b[sortKey] : -Infinity;
        // 確率系は逆ソート（小さい方が良い）
        if (colConfig.isInverse) return aVal - bVal;
        return bVal - aVal;
    });

    let displayData = [];
    if (showTop) displayData = displayData.concat(sortedResults.slice(0, displayCount));
    if (showBottom) {
        sortedResults.slice(-displayCount).reverse().forEach(item => {
            const key = mode === 'machine' ? item.machine : `${item.machine}_${item.num}`;
            const exists = displayData.find(d => {
                const dKey = mode === 'machine' ? d.machine : `${d.machine}_${d.num}`;
                return dKey === key;
            });
            if (!exists) displayData.push(item);
        });
    }
    if (displayData.length === 0) displayData = sortedResults.slice(0, displayCount);

    const labels = targetFiles.map(file => formatDateShort(file));

    const datasets = displayData.map((item, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length];

        const rawData = targetFiles.map(file => {
            const val = item.dates[file];
            return (val !== undefined && val !== null) ? val : null;
        });

        let chartData;
        if (effectiveDisplayType === 'daily' || !colConfig.canSum) {
            chartData = rawData;
        } else {
            let cumulative = 0;
            chartData = rawData.map(val => {
                if (val !== null) {
                    cumulative += val;
                    return cumulative;
                }
                return null;
            });
        }

        const label = mode === 'machine' ? item.machine : `${item.machine} ${item.num}`;

        return {
            label,
            data: chartData,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            tension: 0,
            fill: false,
            spanGaps: true
        };
    });

    // Y軸設定
    let yAxisConfig = {
        grid: { color: '#333', drawBorder: false },
        ticks: { color: '#aaa', font: { size: 11 } },
        title: { display: true, color: '#888', font: { size: 12 } }
    };

    if (colConfig.isInverse) {
        // 確率系はY軸を反転（小さい方が上）
        yAxisConfig.reverse = true;
        yAxisConfig.title.text = colConfig.chartLabel + '（小さいほど良い）';
        yAxisConfig.ticks.callback = function(value) { return '1/' + value.toFixed(0); };
    } else if (colConfig.isRate) {
        yAxisConfig.title.text = colConfig.chartLabel;
        yAxisConfig.ticks.callback = function(value) { return value.toFixed(1) + '%'; };
    } else {
        const prefix = effectiveDisplayType === 'daily' ? '日別' : '累積';
        yAxisConfig.title.text = prefix + colConfig.chartLabel;
        yAxisConfig.ticks.callback = function(value) { return value.toLocaleString(); };
    }

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#eee', font: { size: 11 }, boxWidth: 12, padding: 10, usePointStyle: true }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 50, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#eee',
                    borderColor: '#444',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            if (value === null) return `${context.dataset.label}: -`;
                            return `${context.dataset.label}: ${colConfig.format(value)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#333', drawBorder: false },
                    ticks: { color: '#aaa', font: { size: 11 } }
                },
                y: yAxisConfig
            }
        }
    });
}

function updateTrendChart() {
    if (typeof getTrendDisplayData === 'function') {
        const { results, targetFiles, mode, config } = getTrendDisplayData();
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
        renderTrendChart(results, targetFiles, { showTop, showBottom, displayCount, mode, config });
    }
}

function setupChartEventListeners() {
    // chart.js独自のリスナーは trend.js 側で統合管理
}

document.addEventListener('DOMContentLoaded', () => {
    setupChartEventListeners();
});
