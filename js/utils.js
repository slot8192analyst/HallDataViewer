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
// 検索可能セレクトボックス
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

    // オプションを描画
    function renderOptions(filter = '') {
        const filterLower = filter.toLowerCase();
        let html = '';
        let hasResults = false;

        // デフォルトオプション（プレースホルダー）
        const defaultSelected = selectedValue === '' ? 'selected' : '';
        html += `<div class="searchable-select-option ${defaultSelected}" data-value="">${placeholder}</div>`;

        currentOptions.forEach(opt => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : opt;

            // 空の値はスキップ（既にデフォルトで追加済み）
            if (value === '') return;

            // フィルタリング
            if (filterLower && !label.toLowerCase().includes(filterLower)) {
                return;
            }

            hasResults = true;
            const selectedClass = value === selectedValue ? 'selected' : '';
            html += `<div class="searchable-select-option ${selectedClass}" data-value="${value}">${label}</div>`;
        });

        // 検索結果がない場合
        if (filterLower && !hasResults) {
            html += `<div class="searchable-select-no-results">該当する項目がありません</div>`;
        }

        optionsContainer.innerHTML = html;

        // オプションクリックイベント
        optionsContainer.querySelectorAll('.searchable-select-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedValue = opt.dataset.value;
                displayText.textContent = opt.textContent;
                closeDropdown();
                if (onChange) onChange(selectedValue);
            });
        });
    }

    // ドロップダウンを開く
    function openDropdown() {
        // 他の開いているドロップダウンを閉じる
        document.querySelectorAll('.searchable-select-dropdown.open').forEach(dd => {
            dd.classList.remove('open');
        });
        document.querySelectorAll('.searchable-select-display.open').forEach(d => {
            d.classList.remove('open');
        });

        isOpen = true;
        dropdown.classList.add('open');
        display.classList.add('open');
        searchInput.value = '';
        renderOptions();

        // 少し遅延させてフォーカス
        setTimeout(() => {
            searchInput.focus();
        }, 10);
    }

    // ドロップダウンを閉じる
    function closeDropdown() {
        isOpen = false;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

    // 表示エリアクリック
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    // 検索入力
    searchInput.addEventListener('input', (e) => {
        renderOptions(e.target.value);
    });

    // 検索欄クリック時の伝播を止める
    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ドロップダウン内クリック時の伝播を止める
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
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter') {
            // 最初の選択肢を選択
            const firstOption = optionsContainer.querySelector('.searchable-select-option:not(.selected)');
            if (firstOption) {
                firstOption.click();
            }
        }
    });

    // Escキーでも閉じる（display要素にフォーカス時）
    display.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        }
    });

    // 初期描画
    renderOptions();

    // 値を取得/設定するメソッドを返す
    return {
        getValue: () => selectedValue,
        setValue: (value) => {
            selectedValue = value;
            const opt = currentOptions.find(o => (typeof o === 'object' ? o.value : o) === value);
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
        },
        close: () => {
            closeDropdown();
        }
    };
}

