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
        displayCount = 5
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

    // 表示するデータを選択
    let displayData = [];
    
    // 合計差枚でソート済みの結果から選択
    const sortedByTotal = [...results].sort((a, b) => b.total - a.total);
    
    if (showTop) {
        displayData = displayData.concat(sortedByTotal.slice(0, displayCount));
    }
    
    if (showBottom) {
        const bottomData = sortedByTotal.slice(-displayCount).reverse();
        // 重複を避ける
        bottomData.forEach(item => {
            if (!displayData.find(d => d.machine === item.machine && d.num === item.num)) {
                displayData.push(item);
            }
        });
    }

    if (displayData.length === 0) {
        displayData = sortedByTotal.slice(0, displayCount);
    }

    // 日付ラベルを作成
    const labels = targetFiles.map(file => formatDateShort(file));

    // データセットを作成
    const datasets = displayData.map((item, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length];
        
        // 各日付のデータを取得
        const data = targetFiles.map(file => {
            const value = item.dates[file];
            return value !== undefined ? value : null;
        });

        // 累積差枚を計算
        let cumulative = 0;
        const cumulativeData = data.map(val => {
            if (val !== null) {
                cumulative += val;
                return cumulative;
            }
            return null;
        });

        return {
            label: `${item.machine} ${item.num}`,
            data: cumulativeData,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            tension: 0.3,
            fill: false,
            spanGaps: true
        };
    });

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
                        text: '累積差枚',
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
    // 現在のトレンドデータを使用して再描画
    if (typeof getTrendDisplayData === 'function') {
        const { results, targetFiles } = getTrendDisplayData();
        
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
        renderTrendChart(results, targetFiles, {
            showTop,
            showBottom,
            displayCount
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
}

// DOMContentLoaded後に実行
document.addEventListener('DOMContentLoaded', () => {
    setupChartEventListeners();
});
