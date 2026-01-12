// ===================
// 日別データタブ
// ===================

// 表示する列の状態を管理
let visibleColumns = [];
let allColumns = [];
let filterPanelOpen = false;
let dailyMachineFilterSelect = null;

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

// 日別機種フィルターを初期化（複数選択対応）
function initDailyMachineFilter() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    
    const data = dataCache[currentFile] || [];
    const machineCounts = getMachineCountsFromData(data);
    
    const machineOptions = [];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({
            value: machine,
            label: machine,
            count: machineCounts[machine] || 0
        });
    });

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

// 日付変更時に機種フィルターの台数を更新
function updateDailyMachineFilterCounts() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    const data = dataCache[currentFile] || [];
    const machineCounts = getMachineCountsFromData(data);
    
    const machineOptions = [];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({
            value: machine,
            label: machine,
            count: machineCounts[machine] || 0
        });
    });

    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    }
}

// 列選択チェックボックスを生成
function initColumnSelector() {
    if (headers.length === 0) return;

    allColumns = [...headers];
    if (!allColumns.includes('機械割')) {
        const saIndex = allColumns.indexOf('差枚');
        if (saIndex !== -1) {
            allColumns.splice(saIndex + 1, 0, '機械割');
        } else {
            allColumns.push('機械割');
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

// ファイル名から日付キーを取得（日別用）
function getDailyDateKeyFromFile(file) {
    const match = file.match(/(\d{4}_\d{2}_\d{2})/);
    return match ? match[1] : null;
}

// 日別用のイベントバッジ表示
function renderDailyEventBadges(events) {
    if (!events || events.length === 0) return '';

    const relevantEvents = events.filter(event => hasEventOrPerformers(event));
    
    if (relevantEvents.length === 0) return '';

    let html = '<div class="daily-event-badges">';
    
    relevantEvents.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name, color } = getEventDisplayName(event);
            
            if (name) {
                html += `
                    <span class="daily-event-badge" style="background: ${color}20; border-color: ${color};">
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

// 日付セレクトボックス用のイベント表示テキストを生成
function getEventTextForSelect(events) {
    if (!events || events.length === 0) return '';
    
    const relevantEvents = events.filter(event => hasEventOrPerformers(event));
    if (relevantEvents.length === 0) return '';
    
    const displayItems = [];
    
    relevantEvents.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name } = getEventDisplayName(event);
            if (name) {
                displayItems.push(`${icon}${name}`);
            }
        }
        
        // 演者のみの場合
        if (!isValidEvent(event) && event.performers && event.performers.length > 0) {
            const performerText = event.performers.slice(0, 2).join(',');
            const suffix = event.performers.length > 2 ? '...' : '';
            displayItems.push(`🎤${performerText}${suffix}`);
        }
    });
    
    if (displayItems.length === 0) return '';
    
    if (displayItems.length <= 2) {
        return ' ' + displayItems.join(' / ');
    } else {
        return ' ' + displayItems.slice(0, 2).join(' / ') + '...';
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

// メインのフィルター＆レンダリング関数
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

    // 機種フィルターの初期化/更新
    if (!dailyMachineFilterSelect) {
        initDailyMachineFilter();
    } else {
        updateDailyMachineFilterCounts();
    }

    data = [...data];

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


// 選択された列のみ表示するテーブル描画
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

            summaryEl.innerHTML = `
                表示: ${data.length}台 |
                総G数: ${totalGames.toLocaleString()} |
                総差枚: <span class="${saClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}</span> |
                機械割: <span class="${avgRateClass}">${avgRateText}</span> |
                勝率: ${winRate}%
            `;
        }
    }
}

// 現在表示中のテーブルデータを取得
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
