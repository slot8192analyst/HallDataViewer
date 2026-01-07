// ===================
// 日別データタブ
// ===================

// 表示する列の状態を管理
let visibleColumns = [];
let allColumns = [];
let filterPanelOpen = false;

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
    
    // 状態をlocalStorageに保存
    localStorage.setItem('filterPanelOpen', filterPanelOpen);
}

// フィルターパネルの初期状態を復元
function restoreFilterPanelState() {
    const saved = localStorage.getItem('filterPanelOpen');
    if (saved === 'true') {
        filterPanelOpen = false; // toggleで反転するので逆に設定
        toggleFilterPanel();
    }
}

// 列選択チェックボックスを生成
function initColumnSelector() {
    if (headers.length === 0) return;
    
    allColumns = [...headers];
    
    // localStorageから復元
    const savedColumns = localStorage.getItem('visibleColumns');
    if (savedColumns) {
        try {
            const parsed = JSON.parse(savedColumns);
            // 保存された列が現在のヘッダーに存在するかチェック
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
    
    // チェックボックスのイベントリスナー
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
    
    // 最低1列は表示
    if (visibleColumns.length === 0 && allColumns.length > 0) {
        visibleColumns = [allColumns[0]];
        const firstCheckbox = document.querySelector('#columnCheckboxes input[type="checkbox"]');
        if (firstCheckbox) firstCheckbox.checked = true;
    }
    
    // localStorageに保存
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
    // 機種名と台番号は最低限残す
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
    if (document.getElementById('unitSuffixFilter')?.value) {
        activeCount++;
    }
    
    const hiddenColumns = allColumns.length - visibleColumns.length;
    
    // 既存のバッジを削除
    const existingBadge = toggle.querySelector('.filter-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    // アクティブなフィルターがある場合はバッジを表示
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

async function filterAndRender() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;

    let data = await loadCSV(currentFile);
    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    // 列選択の初期化（初回のみ）
    if (allColumns.length === 0 && headers.length > 0) {
        initColumnSelector();
    }

    data = [...data];

    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('sortBy')?.value || '';

    // 検索フィルター
    if (searchTerm) {
        data = data.filter(row =>
            (row['機種名'] || '').toLowerCase().includes(searchTerm) ||
            (row['台番号'] || '').toLowerCase().includes(searchTerm)
        );
    }

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
        }
    }

    renderTableWithColumns(data, 'data-table', 'summary', visibleColumns);
    updateDateNav();
    updateFilterBadge();
}

// 選択された列のみ表示するテーブル描画
function renderTableWithColumns(data, tableId, summaryId, columns) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    // 表示する列（visibleColumnsが空なら全列表示）
    const displayColumns = columns.length > 0 ? columns : headers;

    // ヘッダー作成
    thead.innerHTML = '<tr>' + displayColumns.map(h => `<th>${h}</th>`).join('') + '</tr>';

    // ボディ作成
    tbody.innerHTML = data.map(row => {
        return '<tr>' + displayColumns.map(h => {
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
            
            // 数値っぽい列はカンマ区切り
            if (/^-?\d+$/.test(val)) {
                return `<td>${parseInt(val).toLocaleString()}</td>`;
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
        document.getElementById('unitSuffixFilter').value = '';
        filterAndRender();
    });

    document.getElementById('unitSuffixFilter')?.addEventListener('change', filterAndRender);

    // 列選択ボタン
    document.getElementById('selectAllColumns')?.addEventListener('click', selectAllColumns);
    document.getElementById('deselectAllColumns')?.addEventListener('click', deselectAllColumns);

    // フィルターパネルのトグル
    document.getElementById('filterToggle')?.addEventListener('click', toggleFilterPanel);
    
    // 初期状態を復元
    restoreFilterPanelState();
}
