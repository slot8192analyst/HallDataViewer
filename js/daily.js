// ===================
// 日別データタブ
// ===================

// 表示する列の状態を管理
var visibleColumns = [];
var allColumns = [];
var filterPanelOpen = false;
var dailyMachineFilterSelect = null;
var selectedPositionFilter = '';

// 状態の同期
function syncDailyState() {
    HallData.state.daily.visibleColumns = visibleColumns;
    HallData.state.daily.allColumns = allColumns;
    HallData.state.daily.filterPanelOpen = filterPanelOpen;
    HallData.state.daily.positionFilter = selectedPositionFilter;
}

function loadDailyState() {
    if (HallData.state.daily.visibleColumns.length > 0) {
        visibleColumns = HallData.state.daily.visibleColumns;
    }
    if (HallData.state.daily.allColumns.length > 0) {
        allColumns = HallData.state.daily.allColumns;
    }
    filterPanelOpen = HallData.state.daily.filterPanelOpen;
    selectedPositionFilter = HallData.state.daily.positionFilter || '';
}

// 機械割を計算する関数
function calculateMechanicalRate(games, saMai) {
    const gStr = String(games).replace(/,/g, '');
    const saStr = String(saMai).replace(/,/g, '');
    
    const g = parseInt(gStr) || 0;
    const sa = parseInt(saStr) || 0;
    
    if (g <= 0) return null;
    
    const totalIn = g * 3;
    const totalOut = totalIn + sa;
    const rate = (totalOut / totalIn) * 100;
    
    return rate;
}

// 機械割を文字列でフォーマット
function formatMechanicalRate(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
        return '-';
    }
    return rate.toFixed(2) + '%';
}

// 機械割のCSSクラスを取得
function getMechanicalRateClass(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) {
        return '';
    }
    if (rate >= 100) {
        return 'plus';
    } else {
        return 'minus';
    }
}

// データに機械割列を追加
function addMechanicalRateToData(data) {
    return data.map(row => {
        const rate = calculateMechanicalRate(row['G数'], row['差枚']);
        return {
            ...row,
            '機械割': rate
        };
    });
}

// フィルターパネルのトグル
function toggleFilterPanel() {
    const content = document.getElementById('filterContent');
    const toggle = document.getElementById('filterToggle');
    const icon = toggle?.querySelector('.toggle-icon');

    if (!content || !toggle) return;

    filterPanelOpen = !filterPanelOpen;

    if (filterPanelOpen) {
        content.classList.add('open');
        toggle.classList.add('open');
        if (icon) icon.textContent = '▲';
    } else {
        content.classList.remove('open');
        toggle.classList.remove('open');
        if (icon) icon.textContent = '▼';
    }

    localStorage.setItem('filterPanelOpen', filterPanelOpen);
}

// フィルターパネルの初期状態を復元
function restoreFilterPanelState() {
    const saved = localStorage.getItem('filterPanelOpen');
    if (saved === 'true') {
        filterPanelOpen = false;
        toggleFilterPanel();
    }
}

// 日別機種フィルターを初期化（複数選択対応）- 修正版
function initDailyMachineFilter() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    
    // 現在の日付のデータから機種オプションを取得（台数順→50音順）
    const machineOptions = getMachineOptionsForDate(currentFile);

    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    } else {
        dailyMachineFilterSelect = initMultiSelectMachineFilter(
            'dailyMachineFilterContainer',
            machineOptions,
            '全機種',
            () => filterAndRender()
        );
    }
}

// 日付変更時に機種フィルターの台数を更新 - 修正版
function updateDailyMachineFilterCounts() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    
    // 現在の日付のデータから機種オプションを取得（台数順→50音順）
    const machineOptions = getMachineOptionsForDate(currentFile);

    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    }
}

// initColumnSelector 関数を修正（位置関係列を追加）
function initColumnSelector() {
    if (headers.length === 0) return;

    allColumns = [...headers];
    
    // 機械割列を追加
    if (!allColumns.includes('機械割')) {
        const saIndex = allColumns.indexOf('差枚');
        if (saIndex !== -1) {
            allColumns.splice(saIndex + 1, 0, '機械割');
        } else {
            allColumns.push('機械割');
        }
    }
    
    // 位置関係列を追加（台番号の後）
    if (!allColumns.includes('位置')) {
        const unitIndex = allColumns.indexOf('台番号');
        if (unitIndex !== -1) {
            allColumns.splice(unitIndex + 1, 0, '位置');
        } else {
            allColumns.push('位置');
        }
    }

    const savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
        try {
            const parsed = JSON.parse(savedColumns);
            visibleColumns = parsed.filter(col => allColumns.includes(col));
            if (visibleColumns.length === 0) {
                visibleColumns = [...allColumns];
            }
        } catch (e) {
            visibleColumns = [...allColumns];
        }
    } else {
        visibleColumns = [...allColumns];
    }

    renderColumnCheckboxes();
}

// 位置フィルターのHTML生成
function renderPositionFilter() {
    const positionTags = getAllPositionTags();
    
    let html = '<div class="position-filter">';
    html += `<button class="position-filter-btn ${selectedPositionFilter === '' ? 'active' : ''}" data-position="" style="background: ${selectedPositionFilter === '' ? 'var(--primary-color)' : ''}">全て</button>`;
    
    positionTags.forEach(tag => {
        const isActive = selectedPositionFilter === tag.value;
        const bgColor = isActive ? tag.color : '';
        html += `<button class="position-filter-btn ${isActive ? 'active' : ''}" data-position="${tag.value}" style="${isActive ? `background: ${tag.color}; border-color: ${tag.color};` : `border-color: ${tag.color}40;`}">${tag.icon} ${tag.label}</button>`;
    });
    
    html += '</div>';
    return html;
}

// フィルターパネル内に位置フィルターを追加
function renderPositionFilterSection() {
    const filterContent = document.getElementById('filterContent');
    if (!filterContent) return;
    
    // 既存の位置フィルターセクションを削除
    const existingSection = filterContent.querySelector('.position-filter-section');
    if (existingSection) {
        existingSection.remove();
    }
    
    // 新しいセクションを追加
    const section = document.createElement('div');
    section.className = 'filter-section position-filter-section';
    section.innerHTML = `
        <h5>📍 位置フィルター</h5>
        ${renderPositionFilter()}
    `;
    
    // 最初のフィルターセクションの前に挿入
    const firstSection = filterContent.querySelector('.filter-section');
    if (firstSection) {
        firstSection.before(section);
    } else {
        filterContent.prepend(section);
    }
    
    // イベントリスナーを設定
    section.querySelectorAll('.position-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedPositionFilter = btn.dataset.position;
            renderPositionFilterSection(); // 再描画してアクティブ状態を更新
            filterAndRender();
        });
    });
}

function renderColumnCheckboxes() {
    const container = document.getElementById('columnCheckboxes');
    if (!container) return;

    container.innerHTML = allColumns.map(col => {
        const checked = visibleColumns.includes(col) ? 'checked' : '';
        const id = `col-${col.replace(/[^a-zA-Z0-9]/g, '_')}`;
        return `
            <label class="column-checkbox-item">
                <input type="checkbox" id="${id}" value="${col}" ${checked}>
                <span>${col}</span>
            </label>
        `;
    }).join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            updateVisibleColumns();
            filterAndRender();
        });
    });
}

function updateVisibleColumns() {
    const checkboxes = document.querySelectorAll('#columnCheckboxes input[type="checkbox"]:checked');
    visibleColumns = Array.from(checkboxes).map(cb => cb.value);

    if (visibleColumns.length === 0 && allColumns.length > 0) {
        visibleColumns = [allColumns[0]];
        const firstCheckbox = document.querySelector('#columnCheckboxes input[type="checkbox"]');
        if (firstCheckbox) firstCheckbox.checked = true;
    }

    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

function selectAllColumns() {
    visibleColumns = [...allColumns];
    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = true;
    });
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    filterAndRender();
}

function deselectAllColumns() {
    const essentialColumns = ['機種名', '台番号'].filter(col => allColumns.includes(col));
    visibleColumns = essentialColumns.length > 0 ? essentialColumns : [allColumns[0]];

    document.querySelectorAll('#columnCheckboxes input[type="checkbox"]').forEach(cb => {
        cb.checked = visibleColumns.includes(cb.value);
    });
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
    filterAndRender();
}

// アクティブなフィルター数を表示
function updateFilterBadge() {
    const toggle = document.getElementById('filterToggle');
    if (!toggle) return;

    let activeCount = 0;

    if (document.getElementById('saFilterType')?.value && document.getElementById('saFilterValue')?.value) {
        activeCount++;
    }
    if (document.getElementById('gameFilterType')?.value && document.getElementById('gameFilterValue')?.value) {
        activeCount++;
    }
    if (document.getElementById('rateFilterType')?.value && document.getElementById('rateFilterValue')?.value) {
        activeCount++;
    }
    if (document.getElementById('unitSuffixFilter')?.value) {
        activeCount++;
    }

    const hiddenColumns = allColumns.length - visibleColumns.length;

    const existingBadge = toggle.querySelector('.filter-badge');
    if (existingBadge) {
        existingBadge.remove();
    }

    if (activeCount > 0 || hiddenColumns > 0) {
        const badge = document.createElement('span');
        badge.className = 'filter-badge';

        let badgeText = [];
        if (activeCount > 0) badgeText.push(`${activeCount}件`);
        if (hiddenColumns > 0) badgeText.push(`${hiddenColumns}列非表示`);

        badge.textContent = badgeText.join(' / ');
        toggle.querySelector('h4').appendChild(badge);
    }
}

// 日付セレクトボックスにイベント情報を含めて初期化
async function initDateSelectWithEvents() {
    await loadEventData();
    
    const dateSelect = document.getElementById('dateSelect');
    if (!dateSelect) return;
    
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    
    dateSelect.innerHTML = sortedFiles.map((file, index) => {
        return createDateSelectOption(file, index === currentDateIndex);
    }).join('');
}


// 日付ラベルの更新（イベント情報を含む）
async function updateDateNavWithEvents() {
    await loadEventData();
    
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    
    if (!currentFile) return;
    
    // 日付ラベル更新
    const dateLabel = document.getElementById('currentDateLabel');
    if (dateLabel) {
        const formattedDate = formatDate(currentFile);
        const dayOfWeek = getDayOfWeekName(getDayOfWeek(currentFile));
        dateLabel.textContent = `${formattedDate}（${dayOfWeek}）`;
    }
    
    // イベントバッジを表示
    const dateKey = getDateKeyFromFilename(currentFile);
    const events = getEventsForDate(dateKey);
    
    let eventContainer = document.getElementById('dailyEventInfo');
    if (!eventContainer) {
        const dateNav = document.querySelector('#daily .date-nav');
        if (dateNav) {
            eventContainer = document.createElement('div');
            eventContainer.id = 'dailyEventInfo';
            eventContainer.className = 'daily-event-info';
            dateNav.after(eventContainer);
        }
    }
    
    if (eventContainer) {
        const eventHtml = renderDailyEventBadges(events);
        eventContainer.innerHTML = eventHtml;
    }
    
    // ナビゲーションボタンの状態更新
    const prevBtn = document.getElementById('prevDate');
    const nextBtn = document.getElementById('nextDate');
    
    if (prevBtn) {
        prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentDateIndex <= 0;
    }
    
    // セレクトボックスの選択状態を同期
    const dateSelect = document.getElementById('dateSelect');
    if (dateSelect && dateSelect.value !== currentFile) {
        dateSelect.value = currentFile;
    }
}

// renderDailyEventBadges を以下のように修正（noteの表示を追加）
function renderDailyEventBadges(events) {
    if (!events || events.length === 0) return '';

    const relevantEvents = events.filter(event => hasEventOrPerformers(event));
    
    if (relevantEvents.length === 0) return '';

    let html = '<div class="daily-event-badges">';
    
    relevantEvents.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name, color } = getEventDisplayName(event);
            
            if (name) {
                // noteがある場合はツールチップとして表示
                const tooltip = event.note ? ` title="${event.note}"` : '';
                html += `
                    <span class="daily-event-badge" style="background: ${color}20; border-color: ${color};"${tooltip}>
                        ${icon} ${name}
                    </span>
                `;
            }
        }

        if (event.performers && event.performers.length > 0) {
            html += `
                <span class="daily-event-badge performer-badge">
                    🎤 ${event.performers.join(', ')}
                </span>
            `;
        }
    });
    
    html += '</div>';
    return html;
}

// filterAndRender 関数を修正（位置フィルターを追加）
async function filterAndRender() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;

    let data = await loadCSV(currentFile);
    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    // 機械割列を追加
    data = addMechanicalRateToData(data);

    // 列選択の初期化（初回のみ）
    if (allColumns.length === 0 && headers.length > 0) {
        initColumnSelector();
    }

    // 位置フィルターセクションを描画
    renderPositionFilterSection();

    // 機種フィルターの初期化/更新
    if (!dailyMachineFilterSelect) {
        initDailyMachineFilter();
    } else {
        updateDailyMachineFilterCounts();
    }

    data = [...data];

    // 位置フィルター
    if (selectedPositionFilter) {
        data = filterByPositionTag(data, selectedPositionFilter, '台番号');
    }

    // 機種フィルター（複数選択対応）
    const selectedMachines = dailyMachineFilterSelect ? dailyMachineFilterSelect.getSelectedValues() : [];
    if (selectedMachines.length > 0) {
        data = data.filter(row => selectedMachines.includes(row['機種名']));
    }

    // 台番号検索
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    if (searchTerm) {
        data = data.filter(row =>
            (row['台番号'] || '').toLowerCase().includes(searchTerm)
        );
    }

    const sortBy = document.getElementById('sortBy')?.value || '';

    // 差枚フィルター
    const saFilterType = document.getElementById('saFilterType')?.value;
    const saFilterValue = document.getElementById('saFilterValue')?.value;
    if (saFilterType && saFilterValue) {
        const val = parseInt(saFilterValue);
        if (saFilterType === 'gte') {
            data = data.filter(row => (parseInt(String(row['差枚']).replace(/,/g, '')) || 0) >= val);
        } else if (saFilterType === 'lte') {
            data = data.filter(row => (parseInt(String(row['差枚']).replace(/,/g, '')) || 0) <= val);
        }
    }

    // G数フィルター
    const gameFilterType = document.getElementById('gameFilterType')?.value;
    const gameFilterValue = document.getElementById('gameFilterValue')?.value;
    if (gameFilterType && gameFilterValue) {
        const val = parseInt(gameFilterValue);
        if (gameFilterType === 'gte') {
            data = data.filter(row => (parseInt(String(row['G数']).replace(/,/g, '')) || 0) >= val);
        } else if (gameFilterType === 'lte') {
            data = data.filter(row => (parseInt(String(row['G数']).replace(/,/g, '')) || 0) <= val);
        }
    }

    // 機械割フィルター
    const rateFilterType = document.getElementById('rateFilterType')?.value;
    const rateFilterValue = document.getElementById('rateFilterValue')?.value;
    if (rateFilterType && rateFilterValue) {
        const val = parseFloat(rateFilterValue);
        if (rateFilterType === 'gte') {
            data = data.filter(row => {
                const rate = row['機械割'];
                return rate !== null && rate >= val;
            });
        } else if (rateFilterType === 'lte') {
            data = data.filter(row => {
                const rate = row['機械割'];
                return rate !== null && rate <= val;
            });
        }
    }

    // 台番号末尾フィルター
    const unitSuffixFilter = document.getElementById('unitSuffixFilter')?.value;
    if (unitSuffixFilter !== '' && unitSuffixFilter !== undefined) {
        data = data.filter(row => {
            const unitNum = row['台番号'] || '';
            const numOnly = unitNum.replace(/\D/g, '');
            if (numOnly.length === 0) return false;
            const lastDigit = parseInt(numOnly.slice(-1));
            return lastDigit === parseInt(unitSuffixFilter);
        });
    }

    // ソート
    if (sortBy) {
        switch (sortBy) {
            case 'sa_desc':
                data.sort((a, b) => (parseInt(String(b['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(a['差枚']).replace(/,/g, '')) || 0));
                break;
            case 'sa_asc':
                data.sort((a, b) => (parseInt(String(a['差枚']).replace(/,/g, '')) || 0) - (parseInt(String(b['差枚']).replace(/,/g, '')) || 0));
                break;
            case 'game_desc':
                data.sort((a, b) => (parseInt(String(b['G数']).replace(/,/g, '')) || 0) - (parseInt(String(a['G数']).replace(/,/g, '')) || 0));
                break;
            case 'rate_desc':
                data.sort((a, b) => {
                    const rateA = a['機械割'] ?? -Infinity;
                    const rateB = b['機械割'] ?? -Infinity;
                    return rateB - rateA;
                });
                break;
            case 'rate_asc':
                data.sort((a, b) => {
                    const rateA = a['機械割'] ?? Infinity;
                    const rateB = b['機械割'] ?? Infinity;
                    return rateA - rateB;
                });
                break;
            case 'machine_asc':
                data = sortByMachineThenUnit(data, '機種名', '台番号', true, true);
                break;
            case 'machine_desc':
                data = sortByMachineThenUnit(data, '機種名', '台番号', false, true);
                break;
            case 'unit_asc':
                data = sortByUnitNumber(data, '台番号', true);
                break;
            case 'unit_desc':
                data = sortByUnitNumber(data, '台番号', false);
                break;
        }
    }

    renderTableWithColumns(data, 'data-table', 'summary', visibleColumns);
    await updateDateNavWithEvents();
    updateFilterBadge();
}


// renderTableWithColumns 関数を修正（位置列を追加）
function renderTableWithColumns(data, tableId, summaryId, columns) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const displayColumns = columns.length > 0 ? columns : allColumns;

    thead.innerHTML = '<tr>' + displayColumns.map(h => `<th>${h}</th>`).join('') + '</tr>';

    tbody.innerHTML = data.map(row => {
        return '<tr>' + displayColumns.map(h => {
            const val = row[h];

            // 位置列の処理
            if (h === '位置') {
                const unitNum = row['台番号'];
                const tagsHtml = renderPositionTags(unitNum, { compact: true });
                return `<td>${tagsHtml || '-'}</td>`;
            }

            if (h === '機械割') {
                const rate = val;
                const rateClass = getMechanicalRateClass(rate);
                const rateText = formatMechanicalRate(rate);
                return `<td class="${rateClass}">${rateText}</td>`;
            }

            if (h === '差枚') {
                const numVal = parseInt(String(val).replace(/,/g, '')) || 0;
                const cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return `<td class="${cls}">${numVal >= 0 ? '+' : ''}${numVal.toLocaleString()}</td>`;
            }

            if (h === 'G数') {
                const numVal = parseInt(String(val).replace(/,/g, '')) || 0;
                return `<td>${numVal.toLocaleString()}</td>`;
            }

            const strVal = val || '';
            if (/^-?\d+$/.test(strVal)) {
                return `<td>${parseInt(strVal).toLocaleString()}</td>`;
            }

            return `<td>${strVal}</td>`;
        }).join('') + '</tr>';
    }).join('');

    if (summaryId) {
        const summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            const totalSa = data.reduce((sum, r) => sum + (parseInt(String(r['差枚']).replace(/,/g, '')) || 0), 0);
            const totalGames = data.reduce((sum, r) => sum + (parseInt(String(r['G数']).replace(/,/g, '')) || 0), 0);
            const plusCount = data.filter(r => (parseInt(String(r['差枚']).replace(/,/g, '')) || 0) > 0).length;
            const winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
            const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

            const avgRate = calculateMechanicalRate(totalGames, totalSa);
            const avgRateText = formatMechanicalRate(avgRate);
            const avgRateClass = getMechanicalRateClass(avgRate);

            // 位置フィルター情報を表示
            let positionInfo = '';
            if (selectedPositionFilter) {
                const tagInfo = POSITION_TAGS[selectedPositionFilter];
                if (tagInfo) {
                    positionInfo = ` | 位置: <span style="color: ${tagInfo.color}">${tagInfo.icon} ${tagInfo.label}</span>`;
                }
            }

            summaryEl.innerHTML = `
                表示: ${data.length}台${positionInfo} |
                総G数: ${totalGames.toLocaleString()} |
                総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span> |
                機械割: <span class="${avgRateClass}">${avgRateText}</span> |
                勝率: ${winRate}%
            `;
        }
    }
}

// getDisplayedTableData 関数を修正（位置列のエクスポート対応）
function getDisplayedTableData() {
    const table = document.getElementById('data-table');
    if (!table) return { headers: [], rows: [] };

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    const headers = [];
    const headerCells = thead.querySelectorAll('th');
    headerCells.forEach(cell => {
        headers.push(cell.textContent.trim());
    });

    const rows = [];
    const bodyRows = tbody.querySelectorAll('tr');
    bodyRows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            let value = cell.textContent.trim();
            
            const headerName = headers[index];
            
            // 位置列の場合はタグテキストを取得
            if (headerName === '位置') {
                // アイコンを除去してテキストのみ取得
                value = value.replace(/[🔲🔳⬜⭕🔷🔶]/g, '').trim();
                rowData.push(value);
                return;
            }
            
            if (value.includes('/')) {
                rowData.push(value);
                return;
            }
            
            if (headerName && headerName.includes('機械割') && value.includes('%')) {
                let numStr = value.replace('%', '');
                const num = parseFloat(numStr);
                if (!isNaN(num)) {
                    value = num.toString();
                }
                rowData.push(value);
                return;
            }
            
            if (['G数', '差枚', 'BB', 'RB', 'ART'].some(h => headerName && headerName.includes(h))) {
                let numStr = value.replace(/[+,]/g, '');
                const num = parseFloat(numStr);
                if (!isNaN(num)) {
                    value = num.toString();
                }
            }
            
            rowData.push(value);
        });
        rows.push(rowData);
    });

    return { headers, rows };
}

// クリップボードにコピー
async function copyTableToClipboard() {
    const { headers, rows } = getDisplayedTableData();
    const btn = document.getElementById('copyTableBtn');
    await copyToClipboard({ headers, rows }, btn);
}

// CSVファイルをダウンロード
function downloadTableAsCSV() {
    const { headers, rows } = getDisplayedTableData();
    
    if (rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    const dateStr = currentFile ? currentFile.replace('.csv', '').replace('data/', '') : 'data';
    const filename = `${dateStr}_export.csv`;
    
    downloadAsCSV({ headers, rows }, filename);
}

// リセットフィルター関数を修正（位置フィルターもリセット）
function setupDailyEventListeners() {
    document.getElementById('prevDate')?.addEventListener('click', () => {
        const sortedFiles = sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex < sortedFiles.length - 1) {
            currentDateIndex++;
            initDateSelectWithEvents();
            filterAndRender();
        }
    });

    document.getElementById('nextDate')?.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            initDateSelectWithEvents();
            filterAndRender();
        }
    });

    document.getElementById('dateSelect')?.addEventListener('change', (e) => {
        const sortedFiles = sortFilesByDate(CSV_FILES, true);
        currentDateIndex = sortedFiles.indexOf(e.target.value);
        filterAndRender();
    });

    document.getElementById('search')?.addEventListener('input', filterAndRender);
    document.getElementById('sortBy')?.addEventListener('change', filterAndRender);
    document.getElementById('applyFilter')?.addEventListener('click', filterAndRender);

    document.getElementById('resetFilter')?.addEventListener('click', () => {
        document.getElementById('saFilterType').value = '';
        document.getElementById('saFilterValue').value = '';
        document.getElementById('gameFilterType').value = '';
        document.getElementById('gameFilterValue').value = '';
        document.getElementById('rateFilterType').value = '';
        document.getElementById('rateFilterValue').value = '';
        document.getElementById('unitSuffixFilter').value = '';
        selectedPositionFilter = ''; // 位置フィルターもリセット
        if (dailyMachineFilterSelect) {
            dailyMachineFilterSelect.reset();
        }
        filterAndRender();
    });

    document.getElementById('unitSuffixFilter')?.addEventListener('change', filterAndRender);
    document.getElementById('rateFilterType')?.addEventListener('change', filterAndRender);
    document.getElementById('rateFilterValue')?.addEventListener('input', filterAndRender);

    document.getElementById('selectAllColumns')?.addEventListener('click', selectAllColumns);
    document.getElementById('deselectAllColumns')?.addEventListener('click', deselectAllColumns);

    document.getElementById('filterToggle')?.addEventListener('click', toggleFilterPanel);

    document.getElementById('copyTableBtn')?.addEventListener('click', copyTableToClipboard);
    document.getElementById('downloadCsvBtn')?.addEventListener('click', downloadTableAsCSV);

    restoreFilterPanelState();
    initDateSelectWithEvents();
}
