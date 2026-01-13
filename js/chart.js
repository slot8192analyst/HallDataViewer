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
        valueType = 'total'
    } = options;

    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    if (results.length === 0 || targetFiles.length === 0) {
        return;
    }

    const chartDisplayType = document.getElementById('chartDisplayType')?.value || 'cumulative';
    
    // 勝率モードの場合は常に日別表示
    const effectiveDisplayType = valueType === 'winrate' ? 'daily' : chartDisplayType;

    let displayData = [];
    
    // ソート基準を決定
    let sortKey;
    switch (valueType) {
        case 'avg':
            sortKey = 'avg';
            break;
        case 'winrate':
            sortKey = 'winRate';
            break;
        default:
            sortKey = 'total';
    }
    
    const sortedResults = [...results].sort((a, b) => {
        const aVal = parseFloat(a[sortKey]) || 0;
        const bVal = parseFloat(b[sortKey]) || 0;
        return bVal - aVal;
    });
    
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

    const labels = targetFiles.map(file => formatDateShort(file));

    const datasets = displayData.map((item, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length];
        
        let rawData;
        switch (valueType) {
            case 'avg':
                rawData = targetFiles.map(file => {
                    const value = item.dailyAvg ? item.dailyAvg[file] : null;
                    return value !== undefined ? value : null;
                });
                break;
                
            case 'winrate':
                rawData = targetFiles.map(file => {
                    const value = item.dailyWinRate ? item.dailyWinRate[file] : null;
                    return value !== undefined ? value : null;
                });
                break;
                
            default:
                rawData = targetFiles.map(file => {
                    const value = item.dates[file];
                    return value !== undefined ? value : null;
                });
        }

        let chartData;
        if (effectiveDisplayType === 'daily') {
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
            tension: 0,
            fill: false,
            spanGaps: true
        };
    });

    // Y軸設定
    let yAxisTitle;
    let yAxisConfig = {
        grid: {
            color: '#333',
            drawBorder: false
        },
        ticks: {
            color: '#aaa',
            font: { size: 11 },
            callback: function(value) {
                return value.toLocaleString();
            }
        },
        title: {
            display: true,
            color: '#888',
            font: { size: 12 }
        }
    };

    switch (valueType) {
        case 'winrate':
            yAxisTitle = '勝率 (%)';
            yAxisConfig.min = 0;
            yAxisConfig.max = 100;
            yAxisConfig.ticks.callback = function(value) {
                return value + '%';
            };
            break;
        case 'avg':
            yAxisTitle = effectiveDisplayType === 'daily' ? '日別平均差枚' : '累積平均差枚';
            break;
        default:
            yAxisTitle = effectiveDisplayType === 'daily' ? '日別差枚' : '累積差枚';
    }
    
    yAxisConfig.title.text = yAxisTitle;

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
                        font: { size: 11 },
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
                            
                            if (valueType === 'winrate') {
                                return `${context.dataset.label}: ${value.toFixed(1)}%`;
                            } else {
                                const sign = value >= 0 ? '+' : '';
                                return `${context.dataset.label}: ${sign}${value.toLocaleString()}枚`;
                            }
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
                        font: { size: 11 }
                    }
                },
                y: yAxisConfig
            }
        }
    });
}

function updateTrendChart() {
    if (typeof getTrendDisplayData === 'function') {
        const { results, targetFiles, mode } = getTrendDisplayData();
        
        const showTop = document.getElementById('chartShowTop')?.checked ?? true;
        const showBottom = document.getElementById('chartShowBottom')?.checked ?? false;
        const displayCount = parseInt(document.getElementById('chartDisplayCount')?.value || '5');
        
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

function setupChartEventListeners() {
    document.getElementById('chartShowTop')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartShowBottom')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartDisplayCount')?.addEventListener('change', updateTrendChart);
    document.getElementById('chartDisplayType')?.addEventListener('change', updateTrendChart);
}

document.addEventListener('DOMContentLoaded', () => {
    setupChartEventListeners();
});
