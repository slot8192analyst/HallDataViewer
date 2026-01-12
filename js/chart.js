// ===================
// グラフ描画モジュール
// ===================

let trendChartInstance = null;

// カラーパレット（視認性の高い色）
const CHART_COLORS = [
    '#4ade80', // 緑
    '#60a5fa', // 青
    '#f472b6', // ピンク
    '#fbbf24', // 黄
    '#a78bfa', // 紫
    '#fb923c', // オレンジ
    '#2dd4bf', // シアン
    '#f87171', // 赤
    '#818cf8', // インディゴ
    '#34d399', // エメラルド
    '#e879f9', // フクシア
    '#38bdf8', // スカイ
    '#facc15', // アンバー
    '#fb7185', // ローズ
    '#a3e635', // ライム
    '#22d3ee', // シアン明
    '#c084fc', // バイオレット
    '#fca5a5', // 赤薄
    '#86efac', // 緑薄
    '#93c5fd', // 青薄
];

/**
 * トレンドチャートを描画
 * @param {Array} results - トレンドデータ
 * @param {Array} targetFiles - 日付ファイル配列
 * @param {Object} options - 表示オプション
 */
function renderTrendChart(results, targetFiles, options = {}) {
    const {
        showTop = true,
        showBottom = false,
        displayCount = 5,
        mode = 'unit',
        valueType = 'total'
    } = options;

    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    // 既存のチャートを破棄
    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    if (results.length === 0 || targetFiles.length === 0) {
        return;
    }

    // グラフ表示タイプを取得（累積 or 日別）
    const chartDisplayType = document.getElementById('chartDisplayType')?.value || 'cumulative';

    // 表示するデータを選択
    let displayData = [];
    
    // ソート基準を決定（機種別+平均モードの場合はavgでソート）
    const sortKey = (mode === 'machine' && valueType === 'avg') ? 'avg' : 'total';
    const sortedResults = [...results].sort((a, b) => b[sortKey] - a[sortKey]);
    
    if (showTop) {
        displayData = displayData.concat(sortedResults.slice(0, displayCount));
    }
    
    if (showBottom) {
        const bottomData = sortedResults.slice(-displayCount).reverse();
        bottomData.forEach(item => {
            const key = mode === 'machine' ? item.machine : `${item.machine}_${item.num}`;
            const exists = displayData.find(d => {
                const dKey = mode === 'machine' ? d.machine : `${d.machine}_${d.num}`;
                return dKey === key;
            });
            if (!exists) {
                displayData.push(item);
            }
        });
    }

    if (displayData.length === 0) {
        displayData = sortedResults.slice(0, displayCount);
    }

    // 日付ラベルを作成
    const labels = targetFiles.map(file => formatDateShort(file));

    // データセットを作成
    const datasets = displayData.map((item, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length];
        
        // 各日付のデータを取得
        let rawData;
        if (mode === 'machine' && valueType === 'avg') {
            // 機種別・平均差枚モード → dailyAvg を使用
            rawData = targetFiles.map(file => {
                const value = item.dailyAvg ? item.dailyAvg[file] : null;
                return value !== undefined ? value : null;
            });
        } else {
            // 台別 または 機種別・総差枚モード → dates を使用
            rawData = targetFiles.map(file => {
                const value = item.dates[file];
                return value !== undefined ? value : null;
            });
        }

        // 表示データを作成（累積 or 日別）
        let chartData;
        if (chartDisplayType === 'daily') {
            // 日別表示（そのままの値）
            chartData = rawData;
        } else {
            // 累積表示
            let cumulative = 0;
            chartData = rawData.map(val => {
                if (val !== null) {
                    cumulative += val;
                    return cumulative;
                }
                return null;
            });
        }

        // ラベル作成
        const label = mode === 'machine' ? item.machine : `${item.machine} ${item.num}`;

        return {
            label: label,
            data: chartData,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            tension: 0, // 直線
            fill: false,
            spanGaps: true
        };
    });

    // Y軸タイトルを決定
    let yAxisTitle;
    const isMachineAvg = (mode === 'machine' && valueType === 'avg');
    
    if (chartDisplayType === 'daily') {
        yAxisTitle = isMachineAvg ? '日別平均差枚' : '日別差枚';
    } else {
        yAxisTitle = isMachineAvg ? '累積平均差枚' : '累積差枚';
    }

    // チャートを作成
    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#eee',
                        font: {
                            size: 11
                        },
                        boxWidth: 12,
                        padding: 10,
                        usePointStyle: true
                    }
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
                            const sign = value >= 0 ? '+' : '';
                            return `${context.dataset.label}: ${sign}${value.toLocaleString()}枚`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#333',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#aaa',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: '#333',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#aaa',
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: yAxisTitle,
                        color: '#888',
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

/**
 * チャートを更新
 */
function updateTrendChart() {
    if (typeof getTrendDisplayData === 'function') {
        const { results, targetFiles, mode } = getTrendDisplayData();
        
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
        // 機種別モードの場合の値タイプを取得
        const valueType = document.getElementById('trendMachineValueType')?.value || 'total';
        
        renderTrendChart(results, targetFiles, {
            showTop,
            showBottom,
            displayCount,
            mode: mode || 'unit',
            valueType
        });
    }
}

/**
 * チャートコントロールのイベント設定
 */
function setupChartEventListeners() {
    document.getElementById('chartShowTop')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartShowBottom')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartDisplayCount')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartDisplayType')?.addEventListener('change', updateTrendChart);
}

// DOMContentLoaded後に実行
document.addEventListener('DOMContentLoaded', () => {
    setupChartEventListeners();
});
