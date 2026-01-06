// ===================
// 差枚トレンドタブ（最適化版）
// ===================

// トレンドデータのキャッシュ
let trendDataCache = null;
let trendLastParams = null;

function populateTrendDateList() {
    const container = document.getElementById('trendDateList');
    if (!container) return;

    const sortedFiles = sortFilesByDate(CSV_FILES, true);

    // DocumentFragmentを使用して一括挿入
    const fragment = document.createDocumentFragment();

    sortedFiles.forEach(file => {
        const dayOfWeek = getDayOfWeek(file);
        const dayName = getDayOfWeekName(dayOfWeek);
        let dayClass = '';
        if (dayOfWeek === 0) dayClass = 'sunday';
        if (dayOfWeek === 6) dayClass = 'saturday';

        const item = document.createElement('div');
        item.className = 'date-checkbox-item';
        item.innerHTML = `
            <input type="checkbox" id="trend-date-${file}" value="${file}" checked>
            <label for="trend-date-${file}">${formatDate(file)}</label>
            <span class="day-of-week ${dayClass}">(${dayName})</span>
        `;
        fragment.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

function getSelectedTrendDates() {
    const checkboxes = document.querySelectorAll('#trendDateList input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

function openTrendCalendarModal() {
    const modal = document.getElementById('trendCalendarModal');
    if (modal) {
        populateTrendDateList();
        modal.classList.add('active');
    }
}

function closeTrendCalendarModal() {
    const modal = document.getElementById('trendCalendarModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// パラメータが変更されたかチェック
function getTrendParams() {
    const daysSelect = document.getElementById('trendDays');
    return {
        days: daysSelect?.value || '7',
        machine: document.getElementById('trendMachineFilter')?.value || '',
        sortBy: document.getElementById('trendSortBy')?.value || 'total_desc',
        customDates: daysSelect?.value === 'custom' ? selectedTrendDates.join(',') : ''
    };
}

function paramsChanged(newParams) {
    if (!trendLastParams) return true;
    return JSON.stringify(newParams) !== JSON.stringify(trendLastParams);
}

async function loadTrendData() {
    const daysSelect = document.getElementById('trendDays');
    const machineFilter = document.getElementById('trendMachineFilter')?.value || '';
    const sortBy = document.getElementById('trendSortBy')?.value || 'total_desc';

    // ローディング表示
    const summaryEl = document.getElementById('trendSummary');
    summaryEl.innerHTML = '<p>読み込み中...</p>';

    let targetFiles = [];

    if (daysSelect && daysSelect.value === 'custom' && selectedTrendDates.length > 0) {
        targetFiles = sortFilesByDate(selectedTrendDates, false);
    } else {
        const days = parseInt(daysSelect?.value) || 7;
        const sortedFilesDesc = sortFilesByDate(CSV_FILES, true);
        targetFiles = sortedFilesDesc.slice(0, days);
        targetFiles = sortFilesByDate(targetFiles, false);
    }

    if (targetFiles.length === 0) {
        summaryEl.innerHTML = '<p>表示する日付を選択してください</p>';
        return;
    }

    // データ収集（キャッシュ済みデータを使用）
    const machineData = {};
    
    for (const file of targetFiles) {
        const data = dataCache[file]; // 既にloadAllCSVでキャッシュ済み
        if (!data) continue;
        
        for (const row of data) {
            const machine = row['機種名'];
            const num = row['台番号'];
            if (machineFilter && machine !== machineFilter) continue;

            const key = `${machine}_${num}`;
            if (!machineData[key]) {
                machineData[key] = { machine, num, dates: {} };
            }
            machineData[key].dates[file] = parseInt(row['差枚']) || 0;
        }
    }

    // 結果を配列に変換して集計
    let results = Object.values(machineData);
    
    // 合計・平均を一度に計算
    for (const item of results) {
        const values = Object.values(item.dates);
        item.total = values.reduce((a, b) => a + b, 0);
        item.avg = values.length > 0 ? Math.round(item.total / values.length) : 0;
    }

    // ソート
    const latestFile = targetFiles[targetFiles.length - 1];
    switch (sortBy) {
        case 'total_desc': results.sort((a, b) => b.total - a.total); break;
        case 'total_asc': results.sort((a, b) => a.total - b.total); break;
        case 'avg_desc': results.sort((a, b) => b.avg - a.avg); break;
        case 'latest_desc':
            results.sort((a, b) => (b.dates[latestFile] || 0) - (a.dates[latestFile] || 0));
            break;
    }

    // サマリー更新
    const totalSa = results.reduce((sum, r) => sum + r.total, 0);
    const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    summaryEl.innerHTML = `
        表示: ${results.length}台 | 期間: ${targetFiles.length}日間 |
        合計差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span>
    `;

    // テーブル描画（最適化）
    renderTrendTables(results, targetFiles);
}

function renderTrendTables(results, targetFiles) {
    // 固定列テーブル
    const fixedThead = document.querySelector('#trend-fixed-table thead');
    const fixedTbody = document.querySelector('#trend-fixed-table tbody');

    // スクロール列テーブル
    const scrollThead = document.querySelector('#trend-scroll-table thead');
    const scrollTbody = document.querySelector('#trend-scroll-table tbody');

    // ヘッダー生成
    fixedThead.innerHTML = '<tr><th>機種名</th><th>台番号</th></tr>';

    const scrollHeaderCells = targetFiles.map(file => `<th>${formatDateShort(file)}</th>`).join('');
    scrollThead.innerHTML = `<tr>${scrollHeaderCells}<th>合計</th><th>平均</th></tr>`;

    // ボディ生成（文字列連結を最小化）
    const fixedRows = [];
    const scrollRows = [];

    for (const row of results) {
        // 固定列
        fixedRows.push(`<tr><td>${row.machine}</td><td>${row.num}</td></tr>`);

        // スクロール列
        const dateCells = [];
        for (const file of targetFiles) {
            const val = row.dates[file];
            if (val !== undefined) {
                const cls = val > 0 ? 'plus' : val < 0 ? 'minus' : '';
                dateCells.push(`<td class="${cls}">${val >= 0 ? '+' : ''}${val.toLocaleString()}</td>`);
            } else {
                dateCells.push('<td>-</td>');
            }
        }

        const totalCls = row.total > 0 ? 'plus' : row.total < 0 ? 'minus' : '';
        const avgCls = row.avg > 0 ? 'plus' : row.avg < 0 ? 'minus' : '';

        dateCells.push(`<td class="${totalCls}">${row.total >= 0 ? '+' : ''}${row.total.toLocaleString()}</td>`);
        dateCells.push(`<td class="${avgCls}">${row.avg >= 0 ? '+' : ''}${row.avg.toLocaleString()}</td>`);

        scrollRows.push(`<tr>${dateCells.join('')}</tr>`);
    }

    // 一括DOM更新
    fixedTbody.innerHTML = fixedRows.join('');
    scrollTbody.innerHTML = scrollRows.join('');

    // 行の高さ同期（requestAnimationFrameで最適化）
    requestAnimationFrame(() => {
        syncRowHeights();
    });
}

function syncRowHeights() {
    const fixedRows = document.querySelectorAll('#trend-fixed-table tbody tr');
    const scrollRows = document.querySelectorAll('#trend-scroll-table tbody tr');

    if (fixedRows.length === 0 || scrollRows.length === 0) return;

    // バッチ処理で読み取りと書き込みを分離（リフロー最小化）
    const heights = [];

    // 読み取りフェーズ
    for (let i = 0; i < fixedRows.length; i++) {
        if (scrollRows[i]) {
            heights.push(Math.max(fixedRows[i].offsetHeight, scrollRows[i].offsetHeight));
        }
    }

    // 書き込みフェーズ
    for (let i = 0; i < heights.length; i++) {
        fixedRows[i].style.height = heights[i] + 'px';
        scrollRows[i].style.height = heights[i] + 'px';
    }

    // ヘッダーも同様に
    const fixedHeader = document.querySelector('#trend-fixed-table thead tr');
    const scrollHeader = document.querySelector('#trend-scroll-table thead tr');
    if (fixedHeader && scrollHeader) {
        const maxHeight = Math.max(fixedHeader.offsetHeight, scrollHeader.offsetHeight);
        fixedHeader.style.height = maxHeight + 'px';
        scrollHeader.style.height = maxHeight + 'px';
    }
}

// デバウンス付きリサイズハンドラ
let resizeTimeout = null;
function handleResize() {
    if (resizeTimeout) {
        clearTimeout(resizeTimeout);
    }
    resizeTimeout = setTimeout(() => {
        syncRowHeights();
    }, 100);
}

function setupTrendEventListeners() {
    document.getElementById('trendDays')?.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            selectedTrendDates = [];
        }
        loadTrendData();
    });
    document.getElementById('trendMachineFilter')?.addEventListener('change', loadTrendData);
    document.getElementById('trendSortBy')?.addEventListener('change', loadTrendData);
    document.getElementById('loadTrend')?.addEventListener('click', loadTrendData);

    document.getElementById('openTrendCalendar')?.addEventListener('click', openTrendCalendarModal);
    document.getElementById('closeTrendCalendar')?.addEventListener('click', closeTrendCalendarModal);

    document.getElementById('trendCalendarModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'trendCalendarModal') {
            closeTrendCalendarModal();
        }
    });

    document.getElementById('selectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    document.getElementById('deselectAllDates')?.addEventListener('click', () => {
        document.querySelectorAll('#trendDateList input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    document.getElementById('applyTrendDates')?.addEventListener('click', () => {
        selectedTrendDates = getSelectedTrendDates();
        document.getElementById('trendDays').value = 'custom';
        closeTrendCalendarModal();
        loadTrendData();
    });

    // デバウンス付きリサイズ
    window.addEventListener('resize', handleResize);
}
