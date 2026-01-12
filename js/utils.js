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
        case 'total_desc':
            return (a, b) => b.totalSa - a.totalSa;
        case 'total_asc':
            return (a, b) => a.totalSa - b.totalSa;
        case 'avg_desc':
            return (a, b) => b.avgSa - a.avgSa;
        case 'avg_asc':
            return (a, b) => a.avgSa - b.avgSa;
        case 'count_desc':
            return (a, b) => b.count - a.count;
        case 'winrate_desc':
            return (a, b) => parseFloat(b.winRate) - parseFloat(a.winRate);
        case 'winrate_asc':
            return (a, b) => parseFloat(a.winRate) - parseFloat(b.winRate);
        default:
            return (a, b) => b.totalSa - a.totalSa;
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

// ===================
// 検索可能セレクトボックス（コンボボックス）
// ===================
function initSearchableSelect(containerId, options, placeholder, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.className = 'searchable-select';
    container.innerHTML = `
        <div class="searchable-select-display" tabindex="0">
            <span class="searchable-select-text">${placeholder}</span>
            <span class="searchable-select-arrow">▼</span>
        </div>
        <div class="searchable-select-dropdown">
            <input type="text" class="searchable-select-search" placeholder="検索...">
            <div class="searchable-select-options"></div>
        </div>
    `;

    const display = container.querySelector('.searchable-select-display');
    const displayText = container.querySelector('.searchable-select-text');
    const dropdown = container.querySelector('.searchable-select-dropdown');
    const searchInput = container.querySelector('.searchable-select-search');
    const optionsContainer = container.querySelector('.searchable-select-options');

    let selectedValue = '';
    let isOpen = false;
    let currentOptions = options;
    let highlightedIndex = -1;

    // オプションを描画
    function renderOptions(filter = '') {
        const filterLower = filter.toLowerCase().trim();
        let html = '';
        let visibleOptions = [];

        currentOptions.forEach((opt) => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;
            const disabled = typeof opt === 'object' && opt.disabled;

            // 区切り線の場合
            if (disabled) {
                if (!filterLower) {
                    html += `<div class="searchable-select-separator">${label}</div>`;
                }
                return;
            }

            // フィルタリング
            if (filterLower && !label.toLowerCase().includes(filterLower)) {
                return;
            }

            visibleOptions.push({ value, label });
            const selectedClass = value === selectedValue ? 'selected' : '';
            const highlightClass = visibleOptions.length - 1 === highlightedIndex ? 'highlighted' : '';
            html += `<div class="searchable-select-option ${selectedClass} ${highlightClass}" data-value="${value}" data-index="${visibleOptions.length - 1}">${label}</div>`;
        });

        if (filterLower && visibleOptions.length === 0) {
            html = `<div class="searchable-select-no-results">該当する項目がありません</div>`;
        }

        optionsContainer.innerHTML = html;

        // オプションクリックイベント
        optionsContainer.querySelectorAll('.searchable-select-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                selectOption(opt.dataset.value, opt.textContent);
            });

            opt.addEventListener('mouseenter', () => {
                highlightedIndex = parseInt(opt.dataset.index);
                updateHighlight();
            });
        });

        return visibleOptions;
    }

    // オプションを選択
    function selectOption(value, label) {
        selectedValue = value;
        displayText.textContent = label;
        closeDropdown();
        if (onChange) onChange(selectedValue);
    }

    // ハイライト更新
    function updateHighlight() {
        optionsContainer.querySelectorAll('.searchable-select-option').forEach((opt) => {
            if (parseInt(opt.dataset.index) === highlightedIndex) {
                opt.classList.add('highlighted');
                opt.scrollIntoView({ block: 'nearest' });
            } else {
                opt.classList.remove('highlighted');
            }
        });
    }

    // ドロップダウンを開く
    function openDropdown() {
        // 他のドロップダウンを閉じる
        document.querySelectorAll('.searchable-select-dropdown.open').forEach(dd => {
            if (dd !== dropdown) {
                dd.classList.remove('open');
            }
        });
        document.querySelectorAll('.searchable-select-display.open').forEach(d => {
            if (d !== display) {
                d.classList.remove('open');
            }
        });

        isOpen = true;
        highlightedIndex = -1;
        dropdown.classList.add('open');
        display.classList.add('open');
        searchInput.value = '';
        renderOptions();

        // 選択済み項目にスクロール
        setTimeout(() => {
            const selectedOpt = optionsContainer.querySelector('.searchable-select-option.selected');
            if (selectedOpt) {
                selectedOpt.scrollIntoView({ block: 'center' });
            }
            searchInput.focus();
        }, 10);
    }

    // ドロップダウンを閉じる
    function closeDropdown() {
        isOpen = false;
        highlightedIndex = -1;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

    // イベントリスナー
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    searchInput.addEventListener('input', (e) => {
        highlightedIndex = -1;
        renderOptions(e.target.value);
    });

    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // 外側クリックで閉じる
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && isOpen) {
            closeDropdown();
        }
    });

    // キーボード操作
    searchInput.addEventListener('keydown', (e) => {
        const visibleOpts = optionsContainer.querySelectorAll('.searchable-select-option');
        const maxIndex = visibleOpts.length - 1;

        if (e.key === 'Escape') {
            closeDropdown();
            display.focus();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (highlightedIndex < maxIndex) {
                highlightedIndex++;
                updateHighlight();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (highlightedIndex > 0) {
                highlightedIndex--;
                updateHighlight();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && highlightedIndex <= maxIndex) {
                const opt = visibleOpts[highlightedIndex];
                if (opt) {
                    selectOption(opt.dataset.value, opt.textContent);
                }
            } else if (visibleOpts.length > 0) {
                selectOption(visibleOpts[0].dataset.value, visibleOpts[0].textContent);
            }
        } else if (e.key === 'Tab') {
            closeDropdown();
        }
    });

    display.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                openDropdown();
            }
        }
    });

    // 初期描画
    renderOptions();

    // APIを返す
    return {
        getValue: () => selectedValue,
        setValue: (value) => {
            selectedValue = value;
            const opt = currentOptions.find(o => {
                const v = typeof o === 'object' ? o.value : o;
                return v === value;
            });
            if (opt) {
                displayText.textContent = typeof opt === 'object' ? opt.label : opt;
            } else {
                displayText.textContent = placeholder;
            }
        },
        updateOptions: (newOptions) => {
            currentOptions = newOptions;
            if (isOpen) {
                renderOptions(searchInput.value);
            }
        },
        reset: () => {
            selectedValue = '';
            displayText.textContent = placeholder;
            if (onChange) onChange('');
        },
        close: () => {
            closeDropdown();
        },
        open: () => {
            openDropdown();
        }
    };
}

// ===================
// 共通コピー・ダウンロード機能
// ===================

// テーブルからデータを取得する汎用関数
function getTableData(tableElement) {
    if (!tableElement) return { headers: [], rows: [] };

    const thead = tableElement.querySelector('thead');
    const tbody = tableElement.querySelector('tbody');

    // ヘッダー取得
    const headers = [];
    if (thead) {
        const headerCells = thead.querySelectorAll('th');
        headerCells.forEach(cell => {
            headers.push(cell.textContent.trim());
        });
    }

    // 行データ取得
    const rows = [];
    if (tbody) {
        const bodyRows = tbody.querySelectorAll('tr');
        bodyRows.forEach(row => {
            const rowData = [];
            const cells = row.querySelectorAll('td');
            cells.forEach(cell => {
                let value = cell.textContent.trim();
                // +記号とカンマを除去して数値として扱う
                let numStr = value.replace(/[+,]/g, '').replace('%', '');
                const num = parseFloat(numStr);
                if (!isNaN(num) && value !== '-') {
                    value = numStr;
                }
                rowData.push(value);
            });
            if (rowData.length > 0) {
                rows.push(rowData);
            }
        });
    }

    return { headers, rows };
}

// 複数テーブルのデータを結合（トレンド用）
function getMergedTableData(fixedTable, scrollTable) {
    const fixedData = getTableData(fixedTable);
    const scrollData = getTableData(scrollTable);

    const headers = [...fixedData.headers, ...scrollData.headers];
    const rows = [];

    const maxRows = Math.max(fixedData.rows.length, scrollData.rows.length);
    for (let i = 0; i < maxRows; i++) {
        const fixedRow = fixedData.rows[i] || [];
        const scrollRow = scrollData.rows[i] || [];
        rows.push([...fixedRow, ...scrollRow]);
    }

    return { headers, rows };
}

// タブ区切り形式に変換（スプレッドシート用）
function convertToTSV(headers, rows) {
    const lines = [];
    lines.push(headers.join('\t'));
    rows.forEach(row => {
        lines.push(row.join('\t'));
    });
    return lines.join('\n');
}

// CSV形式に変換
function convertToCSV(headers, rows) {
    const lines = [];
    
    const escapeCSV = (value) => {
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };
    
    lines.push(headers.map(escapeCSV).join(','));
    rows.forEach(row => {
        lines.push(row.map(escapeCSV).join(','));
    });
    
    return lines.join('\n');
}

// クリップボードにコピー（汎用）
async function copyToClipboard(data, buttonElement) {
    const { headers, rows } = data;
    
    if (rows.length === 0) {
        showCopyToast('コピーするデータがありません', true);
        return;
    }
    
    const tsv = convertToTSV(headers, rows);
    
    try {
        await navigator.clipboard.writeText(tsv);
        showCopyToast(`${rows.length}行のデータをコピーしました`);
        
        if (buttonElement) {
            buttonElement.classList.add('copied');
            setTimeout(() => {
                buttonElement.classList.remove('copied');
            }, 2000);
        }
    } catch (err) {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = tsv;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            
            showCopyToast(`${rows.length}行のデータをコピーしました`);
            
            if (buttonElement) {
                buttonElement.classList.add('copied');
                setTimeout(() => {
                    buttonElement.classList.remove('copied');
                }, 2000);
            }
        } catch (fallbackErr) {
            showCopyToast('コピーに失敗しました', true);
            console.error('Copy failed:', fallbackErr);
        }
    }
}

// CSVファイルをダウンロード（汎用）
function downloadAsCSV(data, filename) {
    const { headers, rows } = data;
    
    if (rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    const csv = convertToCSV(headers, rows);
    
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showCopyToast(`${filename} をダウンロードしました`);
}

// トースト通知を表示
function showCopyToast(message, isError = false) {
    const existingToast = document.querySelector('.copy-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'copy-toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// ===================
// 複数選択可能な機種フィルター
// ===================

function initMultiSelectMachineFilter(containerId, options, placeholder, onChange) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.className = 'multi-select-filter';
    container.innerHTML = `
        <div class="multi-select-display" tabindex="0">
            <span class="multi-select-text">${placeholder}</span>
            <span class="multi-select-count"></span>
            <span class="multi-select-arrow">▼</span>
        </div>
        <div class="multi-select-dropdown">
            <div class="multi-select-controls">
                <input type="text" class="multi-select-search" placeholder="機種名で検索...">
                <div class="multi-select-buttons">
                    <button type="button" class="multi-select-btn select-all">全選択</button>
                    <button type="button" class="multi-select-btn deselect-all">全解除</button>
                </div>
            </div>
            <div class="multi-select-options"></div>
        </div>
    `;

    const display = container.querySelector('.multi-select-display');
    const displayText = container.querySelector('.multi-select-text');
    const displayCount = container.querySelector('.multi-select-count');
    const dropdown = container.querySelector('.multi-select-dropdown');
    const searchInput = container.querySelector('.multi-select-search');
    const optionsContainer = container.querySelector('.multi-select-options');
    const selectAllBtn = container.querySelector('.select-all');
    const deselectAllBtn = container.querySelector('.deselect-all');

    let selectedValues = new Set();
    let isOpen = false;
    let currentOptions = options;

    // renderOptions 関数内のHTML生成部分を修正
    function renderOptions(filter = '') {
        const filterLower = filter.toLowerCase().trim();
        let html = '';

        currentOptions.forEach((opt) => {
            const value = opt.value;
            const label = opt.label;
            const count = opt.count || 0;

            // フィルタリング
            if (filterLower && !label.toLowerCase().includes(filterLower)) {
                return;
            }

            const checked = selectedValues.has(value) ? 'checked' : '';
            // value属性をエスケープして安全にする
            const escapedValue = value.replace(/"/g, '&quot;');
            const escapedLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            html += `
                <div class="multi-select-option" data-value="${escapedValue}">
                    <input type="checkbox" ${checked}>
                    <span class="option-label">${escapedLabel}</span>
                    <span class="option-count">${count}台</span>
                </div>
            `;
        });

        if (filterLower && html === '') {
            html = `<div class="multi-select-no-results">該当する機種がありません</div>`;
        }

        optionsContainer.innerHTML = html;

        // イベントリスナーを修正（divクリックで動作するように）
        optionsContainer.querySelectorAll('.multi-select-option').forEach(opt => {
            const checkbox = opt.querySelector('input[type="checkbox"]');
            const value = opt.dataset.value;

            opt.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    checkbox.checked = !checkbox.checked;
                }
                if (checkbox.checked) {
                    selectedValues.add(value);
                } else {
                    selectedValues.delete(value);
                }
                updateDisplay();
                if (onChange) onChange(getSelectedValues());
            });
        });
    }

    // 表示を更新
    function updateDisplay() {
        const count = selectedValues.size;
        const total = currentOptions.length;

        if (count === 0) {
            displayText.textContent = placeholder;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        } else if (count === total) {
            displayText.textContent = '全機種';
            displayCount.textContent = `(${count}機種)`;
            displayCount.style.display = 'inline';
        } else if (count <= 2) {
            const names = Array.from(selectedValues).slice(0, 2);
            displayText.textContent = names.join(', ');
            displayCount.textContent = count > 2 ? `他${count - 2}機種` : '';
            displayCount.style.display = count > 2 ? 'inline' : 'none';
        } else {
            displayText.textContent = `${count}機種選択中`;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        }
    }

    // 選択された値を取得
    function getSelectedValues() {
        return Array.from(selectedValues);
    }

    // ドロップダウンを開く
    function openDropdown() {
        document.querySelectorAll('.multi-select-dropdown.open').forEach(dd => {
            if (dd !== dropdown) {
                dd.classList.remove('open');
            }
        });
        document.querySelectorAll('.multi-select-display.open').forEach(d => {
            if (d !== display) {
                d.classList.remove('open');
            }
        });

        isOpen = true;
        dropdown.classList.add('open');
        display.classList.add('open');
        searchInput.value = '';
        renderOptions();
        setTimeout(() => searchInput.focus(), 10);
    }

    // ドロップダウンを閉じる
    function closeDropdown() {
        isOpen = false;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

    // 全選択
    function selectAll() {
        const filter = searchInput.value.toLowerCase().trim();
        currentOptions.forEach(opt => {
            if (!filter || opt.label.toLowerCase().includes(filter)) {
                selectedValues.add(opt.value);
            }
        });
        renderOptions(searchInput.value);
        updateDisplay();
        if (onChange) onChange(getSelectedValues());
    }

    // 全解除
    function deselectAll() {
        const filter = searchInput.value.toLowerCase().trim();
        if (filter) {
            // 検索結果のみ解除
            currentOptions.forEach(opt => {
                if (opt.label.toLowerCase().includes(filter)) {
                    selectedValues.delete(opt.value);
                }
            });
        } else {
            selectedValues.clear();
        }
        renderOptions(searchInput.value);
        updateDisplay();
        if (onChange) onChange(getSelectedValues());
    }

    // イベントリスナー
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    searchInput.addEventListener('input', (e) => {
        renderOptions(e.target.value);
    });

    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    selectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectAll();
    });

    deselectAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deselectAll();
    });

    // 外側クリックで閉じる
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && isOpen) {
            closeDropdown();
        }
    });

    // キーボード操作
    display.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                openDropdown();
            }
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
            display.focus();
        }
    });

    // 初期描画
    renderOptions();
    updateDisplay();

    // APIを返す
    return {
        getSelectedValues: () => getSelectedValues(),
        setSelectedValues: (values) => {
            selectedValues = new Set(values);
            renderOptions(searchInput?.value || '');
            updateDisplay();
        },
        updateOptions: (newOptions) => {
            currentOptions = newOptions;
            // 存在しない機種は選択から除外
            const validValues = new Set(newOptions.map(o => o.value));
            selectedValues = new Set([...selectedValues].filter(v => validValues.has(v)));
            if (isOpen) {
                renderOptions(searchInput.value);
            }
            updateDisplay();
        },
        reset: () => {
            selectedValues.clear();
            renderOptions(searchInput?.value || '');
            updateDisplay();
            if (onChange) onChange([]);
        },
        selectAll: () => {
            currentOptions.forEach(opt => selectedValues.add(opt.value));
            renderOptions(searchInput?.value || '');
            updateDisplay();
            if (onChange) onChange(getSelectedValues());
        },
        close: () => closeDropdown(),
        open: () => openDropdown()
    };
}

// 機種ごとの台数を取得
function getMachineCountsFromData(data) {
    const counts = {};
    data.forEach(row => {
        const machine = row['機種名'];
        if (machine) {
            counts[machine] = (counts[machine] || 0) + 1;
        }
    });
    return counts;
}

// 全データから機種ごとの台数を取得
function getAllMachineCountsFromCache() {
    const counts = {};
    Object.values(dataCache).forEach(data => {
        if (Array.isArray(data)) {
            data.forEach(row => {
                const machine = row['機種名'];
                if (machine) {
                    if (!counts[machine]) {
                        counts[machine] = { total: 0, dates: new Set() };
                    }
                    counts[machine].total++;
                }
            });
        }
    });

    // 平均台数を計算
    const result = {};
    Object.entries(counts).forEach(([machine, data]) => {
        result[machine] = Math.round(data.total / Object.keys(dataCache).length);
    });
    return result;
}

// ===================
// ソート用ユーティリティ関数
// ===================

// 日本語文字列の比較（50音順）
function compareJapanese(a, b) {
    return a.localeCompare(b, 'ja');
}

// 台番号から数値を抽出
function extractUnitNumber(unitStr) {
    const numOnly = (unitStr || '').replace(/\D/g, '');
    return numOnly ? parseInt(numOnly, 10) : 0;
}

// 機種名でソート（50音順）
function sortByMachineName(data, key = '機種名', ascending = true) {
    return [...data].sort((a, b) => {
        const nameA = a[key] || a.machine || '';
        const nameB = b[key] || b.machine || '';
        const result = compareJapanese(nameA, nameB);
        return ascending ? result : -result;
    });
}

// 台番号でソート
function sortByUnitNumber(data, key = '台番号', ascending = true) {
    return [...data].sort((a, b) => {
        const numA = extractUnitNumber(a[key] || a.num || '');
        const numB = extractUnitNumber(b[key] || b.num || '');
        
        // 台番号が同じ場合は機種名でソート
        if (numA === numB) {
            const nameA = a['機種名'] || a.machine || '';
            const nameB = b['機種名'] || b.machine || '';
            return compareJapanese(nameA, nameB);
        }
        
        return ascending ? numA - numB : numB - numA;
    });
}

// 機種名→台番号の複合ソート
function sortByMachineThenUnit(data, machineKey = '機種名', unitKey = '台番号', machineAsc = true, unitAsc = true) {
    return [...data].sort((a, b) => {
        const nameA = a[machineKey] || a.machine || '';
        const nameB = b[machineKey] || b.machine || '';
        const nameCompare = compareJapanese(nameA, nameB);
        
        if (nameCompare !== 0) {
            return machineAsc ? nameCompare : -nameCompare;
        }
        
        // 機種名が同じ場合は台番号でソート
        const numA = extractUnitNumber(a[unitKey] || a.num || '');
        const numB = extractUnitNumber(b[unitKey] || b.num || '');
        return unitAsc ? numA - numB : numB - numA;
    });
}

// getSortFunction を拡張
function getSortFunction(sortBy) {
    switch (sortBy) {
        case 'total_desc':
            return (a, b) => b.totalSa - a.totalSa;
        case 'total_asc':
            return (a, b) => a.totalSa - b.totalSa;
        case 'avg_desc':
            return (a, b) => b.avgSa - a.avgSa;
        case 'avg_asc':
            return (a, b) => a.avgSa - b.avgSa;
        case 'count_desc':
            return (a, b) => b.count - a.count;
        case 'winrate_desc':
            return (a, b) => parseFloat(b.winRate) - parseFloat(a.winRate);
        case 'winrate_asc':
            return (a, b) => parseFloat(a.winRate) - parseFloat(b.winRate);
        case 'machine_asc':
            return (a, b) => compareJapanese(a.machine || '', b.machine || '');
        case 'machine_desc':
            return (a, b) => compareJapanese(b.machine || '', a.machine || '');
        case 'unit_asc':
            return (a, b) => {
                const numA = extractUnitNumber(a.num || '');
                const numB = extractUnitNumber(b.num || '');
                if (numA === numB) {
                    return compareJapanese(a.machine || '', b.machine || '');
                }
                return numA - numB;
            };
        case 'unit_desc':
            return (a, b) => {
                const numA = extractUnitNumber(a.num || '');
                const numB = extractUnitNumber(b.num || '');
                if (numA === numB) {
                    return compareJapanese(a.machine || '', b.machine || '');
                }
                return numB - numA;
            };
        default:
            return (a, b) => b.totalSa - a.totalSa;
    }
}

// ===================
// イベント関連（共通）
// ===================

let eventData = null;

/**
 * イベントデータを読み込み
 */
async function loadEventData() {
    if (eventData) return eventData;

    try {
        const response = await fetch('events.json');
        if (response.ok) {
            eventData = await response.json();
        } else {
            eventData = { events: [], recurringEvents: [], mediaTypes: [], eventTypes: [], performers: [] };
        }
    } catch (e) {
        console.log('events.json not found, using empty events');
        eventData = { events: [], recurringEvents: [], mediaTypes: [], eventTypes: [], performers: [] };
    }
    return eventData;
}

/**
 * 日付キーをパース（YYYY_MM_DD → {year, month, day}）
 */
function parseDateKeyToComponents(dateKey) {
    const match = dateKey.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3])
        };
    }
    return null;
}

/**
 * 繰り返しイベントのルールに一致するかチェック
 */
function getRecurringEventsForDate(dateKey) {
    if (!eventData || !eventData.recurringEvents) return [];
    
    const parsed = parseDateKeyToComponents(dateKey);
    if (!parsed) return [];
    
    const { year, month, day } = parsed;
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const dateSuffix = day % 10;
    
    const matchedEvents = [];
    
    eventData.recurringEvents.forEach(rule => {
        let matches = false;
        
        switch (rule.rule) {
            case 'dateSuffix':
                if (rule.suffix && rule.suffix.includes(dateSuffix)) {
                    matches = true;
                }
                break;
                
            case 'dayOfWeek':
                if (rule.days && rule.days.includes(dayOfWeek)) {
                    matches = true;
                }
                break;
                
            case 'monthDay':
                if (rule.days && rule.days.includes(day)) {
                    matches = true;
                }
                break;
                
            case 'nthWeekday':
                const weekOfMonth = Math.ceil(day / 7);
                if (rule.week === weekOfMonth && rule.dayOfWeek === dayOfWeek) {
                    matches = true;
                }
                break;
        }
        
        if (matches && rule.excludeDates && rule.excludeDates.includes(dateKey)) {
            matches = false;
        }
        
        if (matches && rule.startDate) {
            if (dateKey < rule.startDate) {
                matches = false;
            }
        }
        if (matches && rule.endDate) {
            if (dateKey > rule.endDate) {
                matches = false;
            }
        }
        
        if (matches) {
            matchedEvents.push({
                type: rule.type || 'event',
                name: rule.name,
                icon: rule.icon,
                media: rule.media || '',
                isRecurring: true
            });
        }
    });
    
    return matchedEvents;
}

/**
 * 日付のイベントを取得（通常イベント + 繰り返しイベント）
 */
function getEventsForDate(dateKey) {
    if (!eventData) return [];
    
    const normalEvents = (eventData.events || []).filter(e => e.date === dateKey);
    const recurringEvents = getRecurringEventsForDate(dateKey);
    
    const normalEventNames = normalEvents.map(e => {
        if (Array.isArray(e.name)) {
            return e.name;
        }
        return [e.name];
    }).flat();
    
    const filteredRecurring = recurringEvents.filter(re => {
        return !normalEventNames.includes(re.name);
    });
    
    return [...normalEvents, ...filteredRecurring];
}

/**
 * イベントタイプの情報を取得
 */
function getEventTypeInfo(typeId) {
    if (!eventData || !eventData.eventTypes) return null;
    return eventData.eventTypes.find(t => t.id === typeId);
}

/**
 * 全イベント名を収集
 */
function getAllEventNames() {
    if (!eventData) return [];
    
    const eventNames = new Set();
    
    if (eventData.events) {
        eventData.events.forEach(event => {
            if (Array.isArray(event.name)) {
                event.name.forEach(n => {
                    if (n && n.trim() !== '') {
                        eventNames.add(n.trim());
                    }
                });
            } else if (event.name && event.name.trim() !== '') {
                eventNames.add(event.name.trim());
            }
        });
    }
    
    if (eventData.recurringEvents) {
        eventData.recurringEvents.forEach(rule => {
            if (rule.name && rule.name.trim() !== '') {
                eventNames.add(rule.name.trim());
            }
        });
    }
    
    return [...eventNames].sort();
}

/**
 * イベントが有効かどうかをチェック
 */
function isValidEvent(event) {
    if (!event) return false;
    
    if (event.isRecurring) return true;
    
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

/**
 * イベントまたは演者が存在するかチェック
 */
function hasEventOrPerformers(event) {
    if (!event) return false;
    
    const hasEvent = isValidEvent(event);
    const hasPerformers = event.performers && event.performers.length > 0;
    
    return hasEvent || hasPerformers;
}

/**
 * イベントの表示名を取得
 */
function getEventDisplayName(event) {
    if (!event) return { icon: '', name: '', typeInfo: null };
    
    let icon = event.icon || '';
    let color = '#8b5cf6';
    const typeInfo = getEventTypeInfo(event.type);
    
    if (!event.isRecurring && typeInfo) {
        icon = icon || typeInfo.icon;
        color = typeInfo.color;
    }
    
    if (!icon) icon = '📌';
    
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
    
    return { icon, name: eventName, typeInfo, color, event };
}

/**
 * イベントバッジのHTML生成（共通）
 */
function renderEventBadges(events) {
    if (!events || events.length === 0) return '';

    const displayableEvents = events.filter(event => hasEventOrPerformers(event));

    if (displayableEvents.length === 0) return '';

    let html = '';
    
    displayableEvents.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name, color } = getEventDisplayName(event);
            
            if (name) {
                html += `
                    <div class="event-badge" style="background: ${color}20; border-color: ${color};" title="${name}${event.media ? ' (' + event.media + ')' : ''}${event.note ? ' - ' + event.note : ''}">
                        <span class="event-icon">${icon}</span>
                        <span class="event-name">${name}</span>
                    </div>
                `;
            }
        }

        if (event.performers && event.performers.length > 0) {
            html += `<div class="event-performers">🎤 ${event.performers.join(', ')}</div>`;
        }
    });

    return html;
}

// ===================
// 日付セレクター用イベント表示（共通）
// ===================

/**
 * 日付セレクトボックス用のイベント表示テキストを生成（共通）
 * @param {string} dateKey - 日付キー（YYYY_MM_DD形式）
 * @returns {string} イベント表示テキスト
 */
function getEventTextForDateSelect(dateKey) {
    const events = getEventsForDate(dateKey);
    
    if (!events || events.length === 0) return '';
    
    const relevantEvents = events.filter(event => hasEventOrPerformers(event));
    if (relevantEvents.length === 0) return '';
    
    const displayItems = [];
    
    relevantEvents.forEach(event => {
        if (isValidEvent(event)) {
            const { icon, name } = getEventDisplayName(event);
            if (name) {
                // 長い名前は省略
                const shortName = name.length > 10 ? name.substring(0, 10) + '...' : name;
                displayItems.push(`${icon}${shortName}`);
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
    
    // 最大2項目まで表示
    if (displayItems.length <= 2) {
        return ' ' + displayItems.join(' ');
    } else {
        return ' ' + displayItems.slice(0, 2).join(' ') + '...';
    }
}

/**
 * ファイル名から日付キーを取得（共通）
 * @param {string} file - ファイル名（data/YYYY_MM_DD.csv形式）
 * @returns {string|null} 日付キー（YYYY_MM_DD形式）
 */
function getDateKeyFromFilename(file) {
    const match = file.match(/(\d{4}_\d{2}_\d{2})/);
    return match ? match[1] : null;
}

/**
 * イベント情報付きの日付セレクトオプションを生成
 * @param {string} file - ファイル名
 * @param {boolean} isSelected - 選択状態
 * @returns {string} option要素のHTML
 */
function createDateSelectOption(file, isSelected = false) {
    const dateKey = getDateKeyFromFilename(file);
    const formattedDate = formatDate(file);
    const dayOfWeek = getDayOfWeekName(getDayOfWeek(file));
    const eventText = dateKey ? getEventTextForDateSelect(dateKey) : '';
    
    const label = `${formattedDate}（${dayOfWeek}）${eventText}`;
    const selected = isSelected ? 'selected' : '';
    
    return `<option value="${file}" ${selected}>${label}</option>`;
}

/**
 * 日付セレクトボックスを更新（イベント情報付き）
 * @param {string} selectId - セレクト要素のID
 * @param {Array} files - ファイル名の配列
 * @param {string} selectedValue - 選択中の値
 */
async function updateDateSelectWithEvents(selectId, files, selectedValue = null) {
    await loadEventData();
    
    const select = document.getElementById(selectId);
    if (!select) return;
    
    const sortedFiles = sortFilesByDate(files, true);
    
    select.innerHTML = sortedFiles.map((file, index) => {
        const isSelected = selectedValue ? file === selectedValue : index === 0;
        return createDateSelectOption(file, isSelected);
    }).join('');
}

// utils.js の末尾に追加

// ===================
// 位置タグ関連
// ===================

// 位置タグのマスターデータ
const POSITION_TAGS = {
    '角': { label: '角', icon: '', color: '#ef4444', priority: 1 },
    '角2': { label: '角2', icon: '', color: '#f97316', priority: 2 },
    '角3': { label: '角3', icon: '', color: '#eab308', priority: 3 },
    '円卓': { label: '円卓', icon: '', color: '#22c55e', priority: 4 },
    '奇数': { label: '奇数', icon: '', color: '#3b82f6', priority: 10 },
    '偶数': { label: '偶数', icon: '', color: '#8b5cf6', priority: 11 }
};

// 位置データキャッシュ
let positionDataCache = null;

/**
 * 位置データCSVを読み込み
 * @returns {Promise<Object>} 台番号をキーとした位置データ
 */
async function loadPositionData() {
    if (positionDataCache) {
        return positionDataCache;
    }

    try {
        const response = await fetch('data/position.csv');
        if (!response.ok) {
            console.warn('position.csv not found');
            return {};
        }

        const text = await response.text();
        const lines = text.trim().split('\n');
        
        if (lines.length < 2) {
            return {};
        }

        // ヘッダー行をパース
        const headers = lines[0].split(',').map(h => h.trim());
        
        positionDataCache = {};

        // データ行をパース
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const unitNum = values[0];
            
            if (!unitNum) continue;

            const positionInfo = {
                tags: [],
                raw: {}
            };

            // 各位置フラグをチェック
            headers.forEach((header, idx) => {
                if (idx === 0) return; // 台番号はスキップ
                
                const value = parseInt(values[idx]) || 0;
                positionInfo.raw[header] = value;
                
                if (value === 1 && POSITION_TAGS[header]) {
                    positionInfo.tags.push(header);
                }
            });

            // タグを優先度順にソート
            positionInfo.tags.sort((a, b) => {
                const priorityA = POSITION_TAGS[a]?.priority || 99;
                const priorityB = POSITION_TAGS[b]?.priority || 99;
                return priorityA - priorityB;
            });

            positionDataCache[unitNum] = positionInfo;
        }

        console.log(`位置データ読み込み完了: ${Object.keys(positionDataCache).length}台`);
        return positionDataCache;

    } catch (e) {
        console.error('位置データ読み込みエラー:', e);
        return {};
    }
}

/**
 * 台番号から位置タグを取得
 * @param {string|number} unitNum 台番号
 * @returns {Array<string>} タグ名の配列
 */
function getPositionTags(unitNum) {
    if (!positionDataCache) return [];
    
    const key = String(unitNum);
    const info = positionDataCache[key];
    
    return info ? info.tags : [];
}

/**
 * 台番号から位置情報を取得（詳細）
 * @param {string|number} unitNum 台番号
 * @returns {Object|null} 位置情報オブジェクト
 */
function getPositionInfo(unitNum) {
    if (!positionDataCache) return null;
    
    const key = String(unitNum);
    return positionDataCache[key] || null;
}

/**
 * 位置タグのHTMLを生成
 * @param {string|number} unitNum 台番号
 * @param {Object} options オプション
 * @returns {string} HTMLタグ文字列
 */
function renderPositionTags(unitNum, options = {}) {
    const { compact = false, maxTags = 3 } = options;
    const tags = getPositionTags(unitNum);
    
    if (tags.length === 0) return '';

    const displayTags = tags.slice(0, maxTags);
    const remaining = tags.length - maxTags;

    let html = '<span class="position-tags">';
    
    displayTags.forEach(tagName => {
        const tagInfo = POSITION_TAGS[tagName];
        if (tagInfo) {
            // アイコンがある場合のみ表示
            const iconPart = tagInfo.icon ? `${tagInfo.icon} ` : '';
            if (compact) {
                html += `<span class="position-tag compact" style="background: ${tagInfo.color}20; border-color: ${tagInfo.color};" title="${tagInfo.label}">${iconPart}${tagInfo.label}</span>`;
            } else {
                html += `<span class="position-tag" style="background: ${tagInfo.color}20; border-color: ${tagInfo.color};">${iconPart}${tagInfo.label}</span>`;
            }
        }
    });

    if (remaining > 0) {
        html += `<span class="position-tag-more">+${remaining}</span>`;
    }

    html += '</span>';
    return html;
}


/**
 * 位置タグのテキスト表示（CSV出力用）
 * @param {string|number} unitNum 台番号
 * @returns {string} カンマ区切りのタグ文字列
 */
function getPositionTagsText(unitNum) {
    const tags = getPositionTags(unitNum);
    return tags.join(',');
}

/**
 * 特定の位置タグを持つ台をフィルタ
 * @param {Array} data データ配列
 * @param {string} tagName タグ名
 * @param {string} unitKey 台番号のキー名
 * @returns {Array} フィルタされたデータ
 */
function filterByPositionTag(data, tagName, unitKey = '台番号') {
    if (!tagName) return data;
    
    return data.filter(row => {
        const unitNum = row[unitKey];
        const tags = getPositionTags(unitNum);
        return tags.includes(tagName);
    });
}

/**
 * 全ての利用可能な位置タグを取得
 * @returns {Array<Object>} タグ情報の配列
 */
function getAllPositionTags() {
    return Object.entries(POSITION_TAGS).map(([key, info]) => ({
        value: key,
        label: info.label,
        icon: info.icon,
        color: info.color,
        priority: info.priority
    })).sort((a, b) => a.priority - b.priority);
}
