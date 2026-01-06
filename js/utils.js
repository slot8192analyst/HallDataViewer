// ===================
// ユーティリティ関数
// ===================
function formatDate(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return `${match[1]}/${match[2]}/${match[3]}`;
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function formatDateShort(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return `${match[2]}/${match[3]}`;
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function parseDateFromFilename(filename) {
    const match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3])
        };
    }
    return null;
}

function getDateNumber(filename) {
    const parsed = parseDateFromFilename(filename);
    if (parsed) {
        return parsed.year * 10000 + parsed.month * 100 + parsed.day;
    }
    return 0;
}

function sortFilesByDate(files, descending = false) {
    return [...files].sort((a, b) => {
        const dateA = getDateNumber(a);
        const dateB = getDateNumber(b);
        return descending ? dateB - dateA : dateA - dateB;
    });
}

function getDayOfWeek(filename) {
    const parsed = parseDateFromFilename(filename);
    if (parsed) {
        const date = new Date(parsed.year, parsed.month - 1, parsed.day);
        return date.getDay();
    }
    return -1;
}

function getDayOfWeekName(dayNum) {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayNum] || '';
}

function getDateSuffix(filename) {
    const parsed = parseDateFromFilename(filename);
    if (parsed) {
        return parsed.day % 10;
    }
    return -1;
}

function getSortFunction(sortBy) {
    switch (sortBy) {
        case 'total_desc': return (a, b) => b.totalSa - a.totalSa;
        case 'total_asc': return (a, b) => a.totalSa - b.totalSa;
        case 'avg_desc': return (a, b) => b.avgSa - a.avgSa;
        case 'avg_asc': return (a, b) => a.avgSa - b.avgSa;
        case 'count_desc': return (a, b) => b.count - a.count;
        case 'winrate_desc': return (a, b) => parseFloat(b.winRate) - parseFloat(a.winRate);
        case 'winrate_asc': return (a, b) => parseFloat(a.winRate) - parseFloat(b.winRate);
        default: return (a, b) => b.totalSa - a.totalSa;
    }
}

// ===================
// テーブル描画
// ===================
function renderTable(data, tableId, summaryId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    // ヘッダー作成
    if (headers.length > 0) {
        thead.innerHTML = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    }

    // ボディ作成
    tbody.innerHTML = data.map(row => {
        return '<tr>' + headers.map(h => {
            const val = row[h] || '';
            // 差枚の場合は色分け
            if (h === '差枚') {
                const numVal = parseInt(val) || 0;
                const cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return `<td class="${cls}">${numVal >= 0 ? '+' : ''}${numVal.toLocaleString()}</td>`;
            }
            // G数の場合はカンマ区切り
            if (h === 'G数') {
                const numVal = parseInt(val) || 0;
                return `<td>${numVal.toLocaleString()}</td>`;
            }
            return `<td>${val}</td>`;
        }).join('') + '</tr>';
    }).join('');

    // サマリー更新
    if (summaryId) {
        const summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
            const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
            const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
            const winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
            const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

            summaryEl.innerHTML = `
                表示: ${data.length}台 |
                総G数: ${totalGames.toLocaleString()} |
                総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span> |
                勝率: ${winRate}%
            `;
        }
    }
}
