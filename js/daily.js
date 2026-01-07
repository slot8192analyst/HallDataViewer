// ===================
// 日別データタブ
// ===================

// 表示する列の状態を管理
let visibleColumns = [];
let allColumns = [];
let filterPanelOpen = false;
let dailyMachineFilterSelect = null;

// 機械割を計算する関数
// 計算式: ((G数 * 3) + 差枚) / (G数 * 3) * 100
function calculateMechanicalRate(games, saMai) {
    const g = parseInt(games) || 0;
    const sa = parseInt(saMai) || 0;
    
    if (g <= 0) return null; // G数が0以下の場合は計算不可
    
    const totalIn = g * 3; // 総投入枚数（3枚掛け前提）
    const totalOut = totalIn + sa; // 総払出枚数
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

// 日別機種フィルターを初期化
function initDailyMachineFilter() {
    const machineOptions = [{ value: '', label: '全機種' }];
    const sortedMachines = [...allMachines].sort();
    sortedMachines.forEach(machine => {
        machineOptions.push({ value: machine, label: machine });
    });

    if (dailyMachineFilterSelect) {
        dailyMachineFilterSelect.updateOptions(machineOptions);
    } else {
        dailyMachineFilterSelect = initSearchableSelect(
            'dailyMachineFilterContainer',
            machineOptions,
            '全機種',
            () => filterAndRender()
        );
    }
}

// 列選択チェックボックスを生成
function initColumnSelector() {
    if (headers.length === 0) return;

    // 機械割列をヘッダーに追加（まだ存在しない場合）
    allColumns = [...headers];
    if (!allColumns.includes('機械割')) {
        // 差枚の後に機械割を挿入
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

// イベントが有効かどうかをチェック（日別用）- イベント情報のみ
function isDailyValidEvent(event) {
    if (!event) return false;
    
    const hasValidType = event.type && event.type.trim() !== '';
    const hasValidMedia = event.media && event.media.trim() !== '';
    
    let hasValidName = false;
    if (Array.isArray(event.name)) {
        hasValidName = event.name.some(n => n && n.trim() !== '');
    } else if (event.name) {
        hasValidName = event.name.trim() !== '';
    }
    
    return hasValidType || hasValidMedia || hasValidName;
}

// イベントまたは演者が存在するかチェック
function hasEventOrPerformers(event) {
    if (!event) return false;
    
    const hasEvent = isDailyValidEvent(event);
    const hasPerformers = event.performers && event.performers.length > 0;
    
    return hasEvent || hasPerformers;
}

// イベントの表示名を取得
function getEventDisplayName(event) {
    if (!event) return '';
    
    const typeInfo = getEventTypeInfo(event.type);
    const icon = typeInfo ? typeInfo.icon : '';
    
    let eventName = '';
    if (Array.isArray(event.name)) {
        eventName = event.name.filter(n => n && n.trim() !== '').join(', ');
    } else if (event.name && event.name.trim() !== '') {
        eventName = event.name;
    }
    
    if (!eventName && event.media) {
        eventName = event.media;
    }
    
    if (!eventName && typeInfo) {
        eventName = typeInfo.name;
    }
    
    return { icon, name: eventName, typeInfo, event };
}

// 日別用のイベントバッジ表示
function renderDailyEventBadges(events) {
    if (!events || events.length === 0) return '';

    const relevantEvents = events.filter(event => hasEventOrPerformers(event));
    
    if (relevantEvents.length === 0) return '';

    let html = '<div class="daily-event-badges">';
    
    relevantEvents.forEach(event => {
        if (isDailyValidEvent(event)) {
            const { icon, name, typeInfo } = getEventDisplayName(event);
            const color = typeInfo ? typeInfo.color : '#888';
            
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
        if (isDailyValidEvent(event)) {
            const { icon, name } = getEventDisplayName(event);
            if (name) {
                displayItems.push(`${icon}${name}`);
            }
        }
        
        if (!isDailyValidEvent(event) && event.performers && event.performers.length > 0) {
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
        const dateKey = getDailyDateKeyFromFile(file);
        const formattedDate = formatDate(file);
        const dayOfWeek = getDayOfWeekName(getDayOfWeek(file));
        
        const events = getEventsForDate(dateKey);
        const eventText = getEventTextForSelect(events);
        
        const label = `${formattedDate}（${dayOfWeek}）${eventText}`;
        const selected = index === currentDateIndex ? 'selected' : '';
        
        return `<option value="${file}" ${selected}>${label}</option>`;
    }).join('');
}

// 日付ラベルの更新（イベント情報を含む）
async function updateDateNavWithEvents() {
    await loadEventData();
    
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    
    if (!currentFile) return;
    
    const dateLabel = document.getElementById('currentDateLabel');
    if (dateLabel) {
        const formattedDate = formatDate(currentFile);
        const dayOfWeek = getDayOfWeekName(getDayOfWeek(currentFile));
        dateLabel.textContent = `${formattedDate}（${dayOfWeek}）`;
    }
    
    const dateKey = getDailyDateKeyFromFile(currentFile);
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
    
    const prevBtn = document.getElementById('prevDate');
    const nextBtn = document.getElementById('nextDate');
    
    if (prevBtn) {
        prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentDateIndex <= 0;
    }
    
    const dateSelect = document.getElementById('dateSelect');
    if (dateSelect && dateSelect.value !== currentFile) {
        dateSelect.value = currentFile;
    }
}

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

    // 機種フィルターの初期化（初回のみ）
    if (!dailyMachineFilterSelect) {
        initDailyMachineFilter();
    }

    data = [...data];

    // 機種フィルター
    const machineFilter = dailyMachineFilterSelect ? dailyMachineFilterSelect.getValue() : '';
    if (machineFilter) {
        data = data.filter(row => row['機種名'] === machineFilter);
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
            data = data.filter(row => (parseInt(row['差枚']) || 0) >= val);
        } else if (saFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['差枚']) || 0) <= val);
        }
    }

    // G数フィルター
    const gameFilterType = document.getElementById('gameFilterType')?.value;
    const gameFilterValue = document.getElementById('gameFilterValue')?.value;
    if (gameFilterType && gameFilterValue) {
        const val = parseInt(gameFilterValue);
        if (gameFilterType === 'gte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) >= val);
        } else if (gameFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) <= val);
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
                data.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
                break;
            case 'sa_asc':
                data.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
                break;
            case 'game_desc':
                data.sort((a, b) => (parseInt(b['G数']) || 0) - (parseInt(a['G数']) || 0));
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

            // 機械割列の処理
            if (h === '機械割') {
                const rate = val;
                const rateClass = getMechanicalRateClass(rate);
                const rateText = formatMechanicalRate(rate);
                return `<td class="${rateClass}">${rateText}</td>`;
            }

            if (h === '差枚') {
                const numVal = parseInt(val) || 0;
                const cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return `<td class="${cls}">${numVal >= 0 ? '+' : ''}${numVal.toLocaleString()}</td>`;
            }

            if (h === 'G数') {
                const numVal = parseInt(val) || 0;
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
            const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
            const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
            const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;
            const winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
            const saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

            // 全体の機械割を計算
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

function setupDailyEventListeners() {
    document.getElementById('prevDate')?.addEventListener('click', () => {
        const sortedFiles = sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex < sortedFiles.length - 1) {
            currentDateIndex++;
            filterAndRender();
        }
    });

    document.getElementById('nextDate')?.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
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
    
    // 機械割フィルターのイベントリスナー
    document.getElementById('rateFilterType')?.addEventListener('change', filterAndRender);
    document.getElementById('rateFilterValue')?.addEventListener('input', filterAndRender);

    document.getElementById('selectAllColumns')?.addEventListener('click', selectAllColumns);
    document.getElementById('deselectAllColumns')?.addEventListener('click', deselectAllColumns);

    document.getElementById('filterToggle')?.addEventListener('click', toggleFilterPanel);

    restoreFilterPanelState();
    
    initDateSelectWithEvents();
}
