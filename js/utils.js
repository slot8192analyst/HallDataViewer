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
