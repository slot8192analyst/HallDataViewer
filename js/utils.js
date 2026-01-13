// ===================
// 名前空間とグローバル状態管理
// ===================

const HallData = window.HallData || {
    // データストア
    store: {
        files: [],
        cache: {},
        headers: [],
        machines: new Set(),
        events: null,
        positions: null,
        loadingState: {
            initialLoadComplete: false,
            fullLoadComplete: false,
            totalFiles: 0,
            loadedFiles: 0
        }
    },
    
    // 各タブの状態
    state: {
        daily: {
            dateIndex: 0,
            visibleColumns: [],
            allColumns: [],
            filterPanelOpen: false,
            positionFilter: ''
        },
        trend: {
            selectedDates: [],
            showTotal: true,
            showAvg: true,
            showPrevTotal: false,
            showChart: true,
            viewMode: 'unit',
            valueType: 'total',
            positionFilter: '',
            filterLogic: 'or',
            activeFilters: {
                dayOfWeek: [],
                suffix: [],
                special: [],
                events: [],
                dateRange: { start: null, end: null }
            }
        },
        stats: {
            mode: 'daily',
            subTab: 'machine',
            positionFilter: ''
        },
        calendar: {
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1
        }
    },
    
    // UIコンポーネント参照
    components: {
        daily: {
            machineFilter: null
        },
        trend: {
            machineFilter: null
        },
        stats: {
            eventFilter: null,
            mediaFilter: null,
            performerFilter: null,
            machineFilter: null,
            dailyMachineFilter: null
        },
        calendar: {
            eventFilter: null,
            mediaFilter: null,
            performerFilter: null
        }
    }
};

window.HallData = HallData;

// ===================
// 統一ソート関数
// ===================

HallData.sort = {
    /**
     * 日本語文字列の比較（50音順）
     */
    compareJapanese: function(a, b) {
        return (a || '').localeCompare(b || '', 'ja');
    },
    
    /**
     * 台番号から数値を抽出
     */
    extractUnitNumber: function(unitStr) {
        const numOnly = (unitStr || '').replace(/\D/g, '');
        return numOnly ? parseInt(numOnly, 10) : 0;
    },
    
    /**
     * 総差枚でソート
     */
    byTotalSa: function(desc) {
        return function(a, b) {
            var valA = a.totalSa !== undefined ? a.totalSa : (a.total !== undefined ? a.total : 0);
            var valB = b.totalSa !== undefined ? b.totalSa : (b.total !== undefined ? b.total : 0);
            return desc ? valB - valA : valA - valB;
        };
    },
    
    /**
     * 平均差枚でソート
     */
    byAvgSa: function(desc) {
        return function(a, b) {
            var valA = a.avgSa !== undefined ? a.avgSa : (a.avg !== undefined ? a.avg : 0);
            var valB = b.avgSa !== undefined ? b.avgSa : (b.avg !== undefined ? b.avg : 0);
            return desc ? valB - valA : valA - valB;
        };
    },
    
    /**
     * 台数/出現回数でソート
     */
    byCount: function(desc) {
        return function(a, b) {
            var valA = a.count || 0;
            var valB = b.count || 0;
            return desc ? valB - valA : valA - valB;
        };
    },
    
    /**
     * 勝率でソート
     */
    byWinRate: function(desc) {
        return function(a, b) {
            var valA = parseFloat(a.winRate) || 0;
            var valB = parseFloat(b.winRate) || 0;
            return desc ? valB - valA : valA - valB;
        };
    },
    
    /**
     * 機種名でソート（50音順）
     */
    byMachineName: function(desc) {
        var self = this;
        return function(a, b) {
            var nameA = a.machine || a['機種名'] || '';
            var nameB = b.machine || b['機種名'] || '';
            var result = self.compareJapanese(nameA, nameB);
            return desc ? -result : result;
        };
    },
    
    /**
     * 台番号でソート
     */
    byUnitNumber: function(desc) {
        var self = this;
        return function(a, b) {
            var numA = self.extractUnitNumber(a.num || a['台番号'] || '');
            var numB = self.extractUnitNumber(b.num || b['台番号'] || '');
            return desc ? numB - numA : numA - numB;
        };
    },
    
    /**
     * 機種名 → 台番号の複合ソート
     */
    byMachineThenUnit: function(machineDesc, unitDesc) {
        var self = this;
        return function(a, b) {
            var nameA = a.machine || a['機種名'] || '';
            var nameB = b.machine || b['機種名'] || '';
            var nameCompare = self.compareJapanese(nameA, nameB);
            
            if (nameCompare !== 0) {
                return machineDesc ? -nameCompare : nameCompare;
            }
            
            var numA = self.extractUnitNumber(a.num || a['台番号'] || '');
            var numB = self.extractUnitNumber(b.num || b['台番号'] || '');
            return unitDesc ? numB - numA : numA - numB;
        };
    },
    
    /**
     * 台番号 → 機種名の複合ソート
     */
    byUnitThenMachine: function(unitDesc, machineDesc) {
        var self = this;
        return function(a, b) {
            var numA = self.extractUnitNumber(a.num || a['台番号'] || '');
            var numB = self.extractUnitNumber(b.num || b['台番号'] || '');
            
            if (numA !== numB) {
                return unitDesc ? numB - numA : numA - numB;
            }
            
            var nameA = a.machine || a['機種名'] || '';
            var nameB = b.machine || b['機種名'] || '';
            var nameCompare = self.compareJapanese(nameA, nameB);
            return machineDesc ? -nameCompare : nameCompare;
        };
    },
    
    /**
     * 最新日の差枚でソート（トレンド用）
     */
    byLatestSa: function(latestFile, desc) {
        return function(a, b) {
            var valA = (a.dates && a.dates[latestFile]) || 0;
            var valB = (b.dates && b.dates[latestFile]) || 0;
            return desc ? valB - valA : valA - valB;
        };
    },
    
    /**
     * ソートキー文字列から適切なソート関数を取得
     */
    getFunction: function(sortKey, options) {
        var self = this;
        options = options || {};
        
        switch (sortKey) {
            case 'total_desc':
            case 'sa_desc':
                return self.byTotalSa(true);
            case 'total_asc':
            case 'sa_asc':
                return self.byTotalSa(false);
            
            case 'avg_desc':
                return self.byAvgSa(true);
            case 'avg_asc':
                return self.byAvgSa(false);
            
            case 'count_desc':
                return self.byCount(true);
            case 'count_asc':
                return self.byCount(false);
            
            case 'winrate_desc':
                return self.byWinRate(true);
            case 'winrate_asc':
                return self.byWinRate(false);
            
            case 'machine_asc':
                return self.byMachineThenUnit(false, false);
            case 'machine_desc':
                return self.byMachineThenUnit(true, false);
            
            case 'unit_asc':
                return self.byUnitThenMachine(false, false);
            case 'unit_desc':
                return self.byUnitThenMachine(true, false);
            
            case 'latest_desc':
                return self.byLatestSa(options.latestFile, true);
            case 'latest_asc':
                return self.byLatestSa(options.latestFile, false);
            
            case 'game_desc':
                return function(a, b) {
                    var valA = parseInt(String(a['G数'] || 0).replace(/,/g, '')) || 0;
                    var valB = parseInt(String(b['G数'] || 0).replace(/,/g, '')) || 0;
                    return valB - valA;
                };
            case 'game_asc':
                return function(a, b) {
                    var valA = parseInt(String(a['G数'] || 0).replace(/,/g, '')) || 0;
                    var valB = parseInt(String(b['G数'] || 0).replace(/,/g, '')) || 0;
                    return valA - valB;
                };
            
            case 'rate_desc':
                return function(a, b) {
                    var rateA = a['機械割'] !== null && a['機械割'] !== undefined ? a['機械割'] : -Infinity;
                    var rateB = b['機械割'] !== null && b['機械割'] !== undefined ? b['機械割'] : -Infinity;
                    return rateB - rateA;
                };
            case 'rate_asc':
                return function(a, b) {
                    var rateA = a['機械割'] !== null && a['機械割'] !== undefined ? a['機械割'] : Infinity;
                    var rateB = b['機械割'] !== null && b['機械割'] !== undefined ? b['機械割'] : Infinity;
                    return rateA - rateB;
                };
            
            default:
                return self.byTotalSa(true);
        }
    },
    
    /**
     * 配列をソートして返す（非破壊的）
     */
    apply: function(data, sortKey, options) {
        if (!Array.isArray(data) || data.length === 0) {
            return data;
        }
        var sortFunc = this.getFunction(sortKey, options);
        return data.slice().sort(sortFunc);
    }
};

// ===================
// 後方互換性のためのエイリアス
// ===================

function compareJapanese(a, b) {
    return HallData.sort.compareJapanese(a, b);
}

function extractUnitNumber(unitStr) {
    return HallData.sort.extractUnitNumber(unitStr);
}

function getSortFunction(sortBy) {
    return HallData.sort.getFunction(sortBy);
}

function sortByMachineName(data, key, ascending) {
    if (!Array.isArray(data)) return data;
    var sortKey = ascending ? 'machine_asc' : 'machine_desc';
    return HallData.sort.apply(data, sortKey);
}

function sortByUnitNumber(data, key, ascending) {
    if (!Array.isArray(data)) return data;
    return data.slice().sort(function(a, b) {
        var numA = HallData.sort.extractUnitNumber(a[key] || a.num || '');
        var numB = HallData.sort.extractUnitNumber(b[key] || b.num || '');
        if (numA !== numB) {
            return ascending ? numA - numB : numB - numA;
        }
        var nameA = a['機種名'] || a.machine || '';
        var nameB = b['機種名'] || b.machine || '';
        return HallData.sort.compareJapanese(nameA, nameB);
    });
}

function sortByMachineThenUnit(data, machineKey, unitKey, machineAsc, unitAsc) {
    if (!Array.isArray(data)) return data;
    return data.slice().sort(function(a, b) {
        var nameA = a[machineKey] || a.machine || '';
        var nameB = b[machineKey] || b.machine || '';
        var nameCompare = HallData.sort.compareJapanese(nameA, nameB);
        
        if (nameCompare !== 0) {
            return machineAsc ? nameCompare : -nameCompare;
        }
        
        var numA = HallData.sort.extractUnitNumber(a[unitKey] || a.num || '');
        var numB = HallData.sort.extractUnitNumber(b[unitKey] || b.num || '');
        return unitAsc ? numA - numB : numB - numA;
    });
}

// ===================
// ユーティリティ関数
// ===================

function formatDate(filename) {
    var match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return match[1] + '/' + match[2] + '/' + match[3];
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function formatDateShort(filename) {
    var match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return match[2] + '/' + match[3];
    }
    return filename.replace('.csv', '').replace('data/', '');
}

function parseDateFromFilename(filename) {
    var match = filename.match(/(\d{4})_(\d{2})_(\d{2})/);
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
    var parsed = parseDateFromFilename(filename);
    if (parsed) {
        return parsed.year * 10000 + parsed.month * 100 + parsed.day;
    }
    return 0;
}

function sortFilesByDate(files, descending) {
    if (descending === undefined) descending = false;
    return files.slice().sort(function(a, b) {
        var dateA = getDateNumber(a);
        var dateB = getDateNumber(b);
        return descending ? dateB - dateA : dateA - dateB;
    });
}

function getDayOfWeek(filename) {
    var parsed = parseDateFromFilename(filename);
    if (parsed) {
        var date = new Date(parsed.year, parsed.month - 1, parsed.day);
        return date.getDay();
    }
    return -1;
}

function getDayOfWeekName(dayNum) {
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[dayNum] || '';
}

function getDateSuffix(filename) {
    var parsed = parseDateFromFilename(filename);
    if (parsed) {
        return parsed.day % 10;
    }
    return -1;
}

// ===================
// テーブル描画
// ===================

function renderTable(data, tableId, summaryId) {
    var table = document.getElementById(tableId);
    if (!table) return;

    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');

    if (headers.length > 0) {
        thead.innerHTML = '<tr>' + headers.map(function(h) { return '<th>' + h + '</th>'; }).join('') + '</tr>';
    }

    tbody.innerHTML = data.map(function(row) {
        return '<tr>' + headers.map(function(h) {
            var val = row[h] || '';
            if (h === '差枚') {
                var numVal = parseInt(val) || 0;
                var cls = numVal > 0 ? 'plus' : numVal < 0 ? 'minus' : '';
                return '<td class="' + cls + '">' + (numVal >= 0 ? '+' : '') + numVal.toLocaleString() + '</td>';
            }
            if (h === 'G数') {
                var gVal = parseInt(val) || 0;
                return '<td>' + gVal.toLocaleString() + '</td>';
            }
            return '<td>' + val + '</td>';
        }).join('') + '</tr>';
    }).join('');

    if (summaryId) {
        var summaryEl = document.getElementById(summaryId);
        if (summaryEl) {
            var totalSa = data.reduce(function(sum, r) { return sum + (parseInt(r['差枚']) || 0); }, 0);
            var totalGames = data.reduce(function(sum, r) { return sum + (parseInt(r['G数']) || 0); }, 0);
            var plusCount = data.filter(function(r) { return (parseInt(r['差枚']) || 0) > 0; }).length;
            var winRate = data.length > 0 ? ((plusCount / data.length) * 100).toFixed(1) : '0.0';
            var saClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';

            summaryEl.innerHTML = 
                '表示: ' + data.length + '台 | ' +
                '総G数: ' + totalGames.toLocaleString() + ' | ' +
                '総差枚: <span class="' + saClass + '">' + (totalSa >= 0 ? '+' : '') + totalSa.toLocaleString() + '</span> | ' +
                '勝率: ' + winRate + '%';
        }
    }
}

// ===================
// 検索可能セレクトボックス
// ===================

function initSearchableSelect(containerId, options, placeholder, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    container.className = 'searchable-select';
    container.innerHTML = 
        '<div class="searchable-select-display" tabindex="0">' +
            '<span class="searchable-select-text">' + placeholder + '</span>' +
            '<span class="searchable-select-arrow">▼</span>' +
        '</div>' +
        '<div class="searchable-select-dropdown">' +
            '<input type="text" class="searchable-select-search" placeholder="検索...">' +
            '<div class="searchable-select-options"></div>' +
        '</div>';

    var display = container.querySelector('.searchable-select-display');
    var displayText = container.querySelector('.searchable-select-text');
    var dropdown = container.querySelector('.searchable-select-dropdown');
    var searchInput = container.querySelector('.searchable-select-search');
    var optionsContainer = container.querySelector('.searchable-select-options');

    var selectedValue = '';
    var isOpen = false;
    var currentOptions = options;
    var highlightedIndex = -1;

    function renderOptions(filter) {
        filter = filter || '';
        var filterLower = filter.toLowerCase().trim();
        var html = '';
        var visibleOptions = [];

        currentOptions.forEach(function(opt) {
            var value = typeof opt === 'object' ? opt.value : opt;
            var label = typeof opt === 'object' ? opt.label : opt;
            var disabled = typeof opt === 'object' && opt.disabled;

            if (disabled) {
                if (!filterLower) {
                    html += '<div class="searchable-select-separator">' + label + '</div>';
                }
                return;
            }

            if (filterLower && label.toLowerCase().indexOf(filterLower) === -1) {
                return;
            }

            visibleOptions.push({ value: value, label: label });
            var selectedClass = value === selectedValue ? 'selected' : '';
            var highlightClass = visibleOptions.length - 1 === highlightedIndex ? 'highlighted' : '';
            html += '<div class="searchable-select-option ' + selectedClass + ' ' + highlightClass + '" data-value="' + value + '" data-index="' + (visibleOptions.length - 1) + '">' + label + '</div>';
        });

        if (filterLower && visibleOptions.length === 0) {
            html = '<div class="searchable-select-no-results">該当する項目がありません</div>';
        }

        optionsContainer.innerHTML = html;

        optionsContainer.querySelectorAll('.searchable-select-option').forEach(function(opt) {
            opt.addEventListener('click', function(e) {
                e.stopPropagation();
                selectOption(opt.dataset.value, opt.textContent);
            });

            opt.addEventListener('mouseenter', function() {
                highlightedIndex = parseInt(opt.dataset.index);
                updateHighlight();
            });
        });

        return visibleOptions;
    }

    function selectOption(value, label) {
        selectedValue = value;
        displayText.textContent = label;
        closeDropdown();
        if (onChange) onChange(selectedValue);
    }

    function updateHighlight() {
        optionsContainer.querySelectorAll('.searchable-select-option').forEach(function(opt) {
            if (parseInt(opt.dataset.index) === highlightedIndex) {
                opt.classList.add('highlighted');
                opt.scrollIntoView({ block: 'nearest' });
            } else {
                opt.classList.remove('highlighted');
            }
        });
    }

    function openDropdown() {
        document.querySelectorAll('.searchable-select-dropdown.open').forEach(function(dd) {
            if (dd !== dropdown) {
                dd.classList.remove('open');
            }
        });
        document.querySelectorAll('.searchable-select-display.open').forEach(function(d) {
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

        setTimeout(function() {
            var selectedOpt = optionsContainer.querySelector('.searchable-select-option.selected');
            if (selectedOpt) {
                selectedOpt.scrollIntoView({ block: 'center' });
            }
            searchInput.focus();
        }, 10);
    }

    function closeDropdown() {
        isOpen = false;
        highlightedIndex = -1;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

    display.addEventListener('click', function(e) {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    searchInput.addEventListener('input', function(e) {
        highlightedIndex = -1;
        renderOptions(e.target.value);
    });

    searchInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    dropdown.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    document.addEventListener('click', function(e) {
        if (!container.contains(e.target) && isOpen) {
            closeDropdown();
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        var visibleOpts = optionsContainer.querySelectorAll('.searchable-select-option');
        var maxIndex = visibleOpts.length - 1;

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
                var opt = visibleOpts[highlightedIndex];
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

    display.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                openDropdown();
            }
        }
    });

    renderOptions();

    return {
        getValue: function() { return selectedValue; },
        setValue: function(value) {
            selectedValue = value;
            var opt = currentOptions.find(function(o) {
                var v = typeof o === 'object' ? o.value : o;
                return v === value;
            });
            if (opt) {
                displayText.textContent = typeof opt === 'object' ? opt.label : opt;
            } else {
                displayText.textContent = placeholder;
            }
        },
        updateOptions: function(newOptions) {
            currentOptions = newOptions;
            if (isOpen) {
                renderOptions(searchInput.value);
            }
        },
        reset: function() {
            selectedValue = '';
            displayText.textContent = placeholder;
            if (onChange) onChange('');
        },
        close: function() {
            closeDropdown();
        },
        open: function() {
            openDropdown();
        }
    };
}

// ===================
// 共通コピー・ダウンロード機能
// ===================

function getTableData(tableElement) {
    if (!tableElement) return { headers: [], rows: [] };

    var thead = tableElement.querySelector('thead');
    var tbody = tableElement.querySelector('tbody');

    var headers = [];
    if (thead) {
        var headerCells = thead.querySelectorAll('th');
        headerCells.forEach(function(cell) {
            headers.push(cell.textContent.trim());
        });
    }

    var rows = [];
    if (tbody) {
        var bodyRows = tbody.querySelectorAll('tr');
        bodyRows.forEach(function(row) {
            var rowData = [];
            var cells = row.querySelectorAll('td');
            cells.forEach(function(cell) {
                var value = cell.textContent.trim();
                var numStr = value.replace(/[+,]/g, '').replace('%', '');
                var num = parseFloat(numStr);
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

    return { headers: headers, rows: rows };
}

function getMergedTableData(fixedTable, scrollTable) {
    var fixedData = getTableData(fixedTable);
    var scrollData = getTableData(scrollTable);

    var headers = fixedData.headers.concat(scrollData.headers);
    var rows = [];

    var maxRows = Math.max(fixedData.rows.length, scrollData.rows.length);
    for (var i = 0; i < maxRows; i++) {
        var fixedRow = fixedData.rows[i] || [];
        var scrollRow = scrollData.rows[i] || [];
        rows.push(fixedRow.concat(scrollRow));
    }

    return { headers: headers, rows: rows };
}

function convertToTSV(headers, rows) {
    var lines = [];
    lines.push(headers.join('\t'));
    rows.forEach(function(row) {
        lines.push(row.join('\t'));
    });
    return lines.join('\n');
}

function convertToCSV(headers, rows) {
    var lines = [];
    
    var escapeCSV = function(value) {
        var str = String(value);
        if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };
    
    lines.push(headers.map(escapeCSV).join(','));
    rows.forEach(function(row) {
        lines.push(row.map(escapeCSV).join(','));
    });
    
    return lines.join('\n');
}

function copyToClipboard(data, buttonElement) {
    var headers = data.headers;
    var rows = data.rows;
    
    if (rows.length === 0) {
        showCopyToast('コピーするデータがありません', true);
        return;
    }
    
    var tsv = convertToTSV(headers, rows);
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tsv).then(function() {
            showCopyToast(rows.length + '行のデータをコピーしました');
            if (buttonElement) {
                buttonElement.classList.add('copied');
                setTimeout(function() {
                    buttonElement.classList.remove('copied');
                }, 2000);
            }
        }).catch(function() {
            fallbackCopy(tsv, rows.length, buttonElement);
        });
    } else {
        fallbackCopy(tsv, rows.length, buttonElement);
    }
}

function fallbackCopy(tsv, rowCount, buttonElement) {
    var textarea = document.createElement('textarea');
    textarea.value = tsv;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        showCopyToast(rowCount + '行のデータをコピーしました');
        if (buttonElement) {
            buttonElement.classList.add('copied');
            setTimeout(function() {
                buttonElement.classList.remove('copied');
            }, 2000);
        }
    } catch (err) {
        showCopyToast('コピーに失敗しました', true);
    }
    
    document.body.removeChild(textarea);
}

function downloadAsCSV(data, filename) {
    var headers = data.headers;
    var rows = data.rows;
    
    if (rows.length === 0) {
        showCopyToast('ダウンロードするデータがありません', true);
        return;
    }
    
    var csv = convertToCSV(headers, rows);
    
    var bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    var blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8' });
    
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showCopyToast(filename + ' をダウンロードしました');
}

function showCopyToast(message, isError) {
    var existingToast = document.querySelector('.copy-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    var toast = document.createElement('div');
    toast.className = 'copy-toast' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(function() {
        toast.classList.add('show');
    });
    
    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() {
            toast.remove();
        }, 300);
    }, 3000);
}

// ===================
// 複数選択可能な機種フィルター
// ===================

function initMultiSelectMachineFilter(containerId, options, placeholder, onChange) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    container.className = 'multi-select-filter';
    container.innerHTML = 
        '<div class="multi-select-display" tabindex="0">' +
            '<span class="multi-select-text">' + placeholder + '</span>' +
            '<span class="multi-select-count"></span>' +
            '<span class="multi-select-arrow">▼</span>' +
        '</div>' +
        '<div class="multi-select-dropdown">' +
            '<div class="multi-select-controls">' +
                '<input type="text" class="multi-select-search" placeholder="機種名で検索...">' +
                '<div class="multi-select-buttons">' +
                    '<button type="button" class="multi-select-btn select-all">全選択</button>' +
                    '<button type="button" class="multi-select-btn deselect-all">全解除</button>' +
                '</div>' +
                '<div class="multi-select-threshold">' +
                    '<input type="number" class="multi-select-threshold-input" placeholder="台数" min="1" value="">' +
                    '<span class="multi-select-threshold-label">台以上</span>' +
                    '<button type="button" class="multi-select-btn select-by-count">選択</button>' +
                '</div>' +
            '</div>' +
            '<div class="multi-select-options"></div>' +
        '</div>';

    var display = container.querySelector('.multi-select-display');
    var displayText = container.querySelector('.multi-select-text');
    var displayCount = container.querySelector('.multi-select-count');
    var dropdown = container.querySelector('.multi-select-dropdown');
    var searchInput = container.querySelector('.multi-select-search');
    var optionsContainer = container.querySelector('.multi-select-options');
    var selectAllBtn = container.querySelector('.select-all');
    var deselectAllBtn = container.querySelector('.deselect-all');
    var thresholdInput = container.querySelector('.multi-select-threshold-input');
    var selectByCountBtn = container.querySelector('.select-by-count');

    var selectedValues = new Set();
    var isOpen = false;
    var currentOptions = options;

    function renderOptions(filter) {
        filter = filter || '';
        var filterLower = filter.toLowerCase().trim();
        var html = '';

        currentOptions.forEach(function(opt) {
            var value = opt.value;
            var label = opt.label;
            var count = opt.count || 0;

            if (filterLower && label.toLowerCase().indexOf(filterLower) === -1) {
                return;
            }

            var checked = selectedValues.has(value) ? 'checked' : '';
            var escapedValue = value.replace(/"/g, '&quot;');
            var escapedLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            html += 
                '<div class="multi-select-option" data-value="' + escapedValue + '" data-count="' + count + '">' +
                    '<input type="checkbox" ' + checked + '>' +
                    '<span class="option-label">' + escapedLabel + '</span>' +
                    '<span class="option-count">' + count + '台</span>' +
                '</div>';
        });

        if (filterLower && html === '') {
            html = '<div class="multi-select-no-results">該当する機種がありません</div>';
        }

        optionsContainer.innerHTML = html;

        optionsContainer.querySelectorAll('.multi-select-option').forEach(function(opt) {
            var checkbox = opt.querySelector('input[type="checkbox"]');
            var value = opt.dataset.value;

            opt.addEventListener('click', function(e) {
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

    function updateDisplay() {
        var count = selectedValues.size;
        var total = currentOptions.length;

        if (count === 0) {
            displayText.textContent = placeholder;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        } else if (count === total) {
            displayText.textContent = '全機種';
            displayCount.textContent = '(' + count + '機種)';
            displayCount.style.display = 'inline';
        } else if (count <= 2) {
            var names = Array.from(selectedValues).slice(0, 2);
            displayText.textContent = names.join(', ');
            displayCount.textContent = count > 2 ? '他' + (count - 2) + '機種' : '';
            displayCount.style.display = count > 2 ? 'inline' : 'none';
        } else {
            displayText.textContent = count + '機種選択中';
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        }
    }

    function getSelectedValues() {
        return Array.from(selectedValues);
    }

    function openDropdown() {
        document.querySelectorAll('.multi-select-dropdown.open').forEach(function(dd) {
            if (dd !== dropdown) {
                dd.classList.remove('open');
            }
        });
        document.querySelectorAll('.multi-select-display.open').forEach(function(d) {
            if (d !== display) {
                d.classList.remove('open');
            }
        });

        isOpen = true;
        dropdown.classList.add('open');
        display.classList.add('open');
        searchInput.value = '';
        renderOptions();
        setTimeout(function() { searchInput.focus(); }, 10);
    }

    function closeDropdown() {
        isOpen = false;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

    function selectAll() {
        var filter = searchInput.value.toLowerCase().trim();
        currentOptions.forEach(function(opt) {
            if (!filter || opt.label.toLowerCase().indexOf(filter) !== -1) {
                selectedValues.add(opt.value);
            }
        });
        renderOptions(searchInput.value);
        updateDisplay();
        if (onChange) onChange(getSelectedValues());
    }

    function deselectAll() {
        var filter = searchInput.value.toLowerCase().trim();
        if (filter) {
            currentOptions.forEach(function(opt) {
                if (opt.label.toLowerCase().indexOf(filter) !== -1) {
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

    function selectByCount() {
        var threshold = parseInt(thresholdInput.value) || 0;
        if (threshold <= 0) {
            showCopyToast('台数を入力してください', true);
            return;
        }

        var selectedCount = 0;
        var deselectedCount = 0;

        currentOptions.forEach(function(opt) {
            var count = opt.count || 0;
            if (count >= threshold) {
                selectedValues.add(opt.value);
                selectedCount++;
            } else {
                if (selectedValues.has(opt.value)) {
                    selectedValues.delete(opt.value);
                    deselectedCount++;
                }
            }
        });

        renderOptions(searchInput.value);
        updateDisplay();
        if (onChange) onChange(getSelectedValues());

        if (selectedCount > 0) {
            var message = threshold + '台以上の' + selectedCount + '機種を選択';
            if (deselectedCount > 0) {
                message += '、' + deselectedCount + '機種の選択を解除しました';
            }
            showCopyToast(message);
        } else {
            showCopyToast(threshold + '台以上の機種がありません', true);
        }
    }

    display.addEventListener('click', function(e) {
        e.stopPropagation();
        if (isOpen) {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    searchInput.addEventListener('input', function(e) {
        renderOptions(e.target.value);
    });

    searchInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    dropdown.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    selectAllBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        selectAll();
    });

    deselectAllBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deselectAll();
    });

    selectByCountBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        selectByCount();
    });

    thresholdInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    thresholdInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            selectByCount();
        }
    });

    document.addEventListener('click', function(e) {
        if (!container.contains(e.target) && isOpen) {
            closeDropdown();
        }
    });

    display.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDropdown();
        } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) {
                openDropdown();
            }
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDropdown();
            display.focus();
        }
    });

    renderOptions();
    updateDisplay();

    return {
        getSelectedValues: getSelectedValues,
        setSelectedValues: function(values) {
            selectedValues = new Set(values);
            renderOptions(searchInput ? searchInput.value : '');
            updateDisplay();
        },
        updateOptions: function(newOptions) {
            currentOptions = newOptions;
            var validValues = new Set(newOptions.map(function(o) { return o.value; }));
            selectedValues = new Set(Array.from(selectedValues).filter(function(v) { return validValues.has(v); }));
            if (isOpen) {
                renderOptions(searchInput.value);
            }
            updateDisplay();
        },
        reset: function() {
            selectedValues.clear();
            if (thresholdInput) thresholdInput.value = '';
            renderOptions(searchInput ? searchInput.value : '');
            updateDisplay();
            if (onChange) onChange([]);
        },
        selectAll: function() {
            currentOptions.forEach(function(opt) { selectedValues.add(opt.value); });
            renderOptions(searchInput ? searchInput.value : '');
            updateDisplay();
            if (onChange) onChange(getSelectedValues());
        },
        selectByMinCount: function(minCount) {
            currentOptions.forEach(function(opt) {
                if ((opt.count || 0) >= minCount) {
                    selectedValues.add(opt.value);
                }
            });
            renderOptions(searchInput ? searchInput.value : '');
            updateDisplay();
            if (onChange) onChange(getSelectedValues());
        },
        close: closeDropdown,
        open: openDropdown
    };
}

// ===================
// 機種ごとの台数を取得
// ===================

function getMachineCountsFromData(data) {
    var counts = {};
    data.forEach(function(row) {
        var machine = row['機種名'];
        if (machine) {
            counts[machine] = (counts[machine] || 0) + 1;
        }
    });
    return counts;
}

function getAllMachineCountsFromCache() {
    var counts = {};
    Object.values(dataCache).forEach(function(data) {
        if (Array.isArray(data)) {
            data.forEach(function(row) {
                var machine = row['機種名'];
                if (machine) {
                    if (!counts[machine]) {
                        counts[machine] = { total: 0, dates: new Set() };
                    }
                    counts[machine].total++;
                }
            });
        }
    });

    var result = {};
    var cacheKeys = Object.keys(dataCache);
    Object.entries(counts).forEach(function(entry) {
        var machine = entry[0];
        var data = entry[1];
        result[machine] = Math.round(data.total / cacheKeys.length);
    });
    return result;
}

// ===================
// イベント関連（共通）
// ===================

var eventData = null;

function loadEventData() {
    if (eventData) return Promise.resolve(eventData);

    return fetch('events.json')
        .then(function(response) {
            if (response.ok) {
                return response.json();
            } else {
                return { events: [], recurringEvents: [], mediaTypes: [], eventTypes: [], performers: [] };
            }
        })
        .then(function(data) {
            eventData = data;
            return eventData;
        })
        .catch(function(e) {
            console.log('events.json not found, using empty events');
            eventData = { events: [], recurringEvents: [], mediaTypes: [], eventTypes: [], performers: [] };
            return eventData;
        });
}

function parseDateKeyToComponents(dateKey) {
    var match = dateKey.match(/(\d{4})_(\d{2})_(\d{2})/);
    if (match) {
        return {
            year: parseInt(match[1]),
            month: parseInt(match[2]),
            day: parseInt(match[3])
        };
    }
    return null;
}

function getRecurringEventsForDate(dateKey) {
    if (!eventData || !eventData.recurringEvents) return [];
    
    var parsed = parseDateKeyToComponents(dateKey);
    if (!parsed) return [];
    
    var year = parsed.year;
    var month = parsed.month;
    var day = parsed.day;
    var date = new Date(year, month - 1, day);
    var dayOfWeek = date.getDay();
    var dateSuffix = day % 10;
    
    var matchedEvents = [];
    
    eventData.recurringEvents.forEach(function(rule) {
        var matches = false;
        
        switch (rule.rule) {
            case 'dateSuffix':
                if (rule.suffix && rule.suffix.indexOf(dateSuffix) !== -1) {
                    matches = true;
                }
                break;
                
            case 'dayOfWeek':
                if (rule.days && rule.days.indexOf(dayOfWeek) !== -1) {
                    matches = true;
                }
                break;
                
            case 'monthDay':
                if (rule.days && rule.days.indexOf(day) !== -1) {
                    matches = true;
                }
                break;
                
            case 'nthWeekday':
                var weekOfMonth = Math.ceil(day / 7);
                if (rule.week === weekOfMonth && rule.dayOfWeek === dayOfWeek) {
                    matches = true;
                }
                break;
        }
        
        if (matches && rule.excludeDates && rule.excludeDates.indexOf(dateKey) !== -1) {
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

function getEventsForDate(dateKey) {
    if (!eventData) return [];
    
    var normalEvents = (eventData.events || []).filter(function(e) { return e.date === dateKey; });
    var recurringEvents = getRecurringEventsForDate(dateKey);
    
    var normalEventNames = [];
    normalEvents.forEach(function(e) {
        if (Array.isArray(e.name)) {
            normalEventNames = normalEventNames.concat(e.name);
        } else {
            normalEventNames.push(e.name);
        }
    });
    
    var filteredRecurring = recurringEvents.filter(function(re) {
        return normalEventNames.indexOf(re.name) === -1;
    });
    
    return normalEvents.concat(filteredRecurring);
}

function getEventTypeInfo(typeId) {
    if (!eventData || !eventData.eventTypes) return null;
    return eventData.eventTypes.find(function(t) { return t.id === typeId; });
}

function getAllEventNames() {
    if (!eventData) return [];
    
    var eventNames = new Set();
    
    if (eventData.events) {
        eventData.events.forEach(function(event) {
            if (Array.isArray(event.name)) {
                event.name.forEach(function(n) {
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
        eventData.recurringEvents.forEach(function(rule) {
            if (rule.name && rule.name.trim() !== '') {
                eventNames.add(rule.name.trim());
            }
        });
    }
    
    return Array.from(eventNames).sort();
}

function isValidEvent(event) {
    if (!event) return false;
    
    if (event.isRecurring) return true;
    
    var hasValidType = event.type && event.type.trim() !== '';
    var hasValidMedia = event.media && event.media.trim() !== '';
    
    var hasValidName = false;
    if (Array.isArray(event.name)) {
        hasValidName = event.name.some(function(n) { return n && n.trim() !== ''; });
    } else if (event.name) {
        hasValidName = event.name.trim() !== '';
    }
    
    return hasValidType || hasValidMedia || hasValidName;
}

function hasEventOrPerformers(event) {
    if (!event) return false;
    
    var hasEvent = isValidEvent(event);
    var hasPerformers = event.performers && event.performers.length > 0;
    
    return hasEvent || hasPerformers;
}

function getEventDisplayName(event) {
    if (!event) return { icon: '', name: '', typeInfo: null };
    
    var icon = event.icon || '';
    var color = '#8b5cf6';
    var typeInfo = getEventTypeInfo(event.type);
    
    if (!event.isRecurring && typeInfo) {
        icon = icon || typeInfo.icon;
        color = typeInfo.color;
    }
    
    if (!icon) icon = '📌';
    
    var eventName = '';
    if (Array.isArray(event.name)) {
        eventName = event.name.filter(function(n) { return n && n.trim() !== ''; }).join(', ');
    } else if (event.name && event.name.trim() !== '') {
        eventName = event.name;
    }
    
    if (!eventName && event.media) {
        eventName = event.media;
    }
    
    if (!eventName && typeInfo) {
        eventName = typeInfo.name;
    }
    
    return { icon: icon, name: eventName, typeInfo: typeInfo, color: color, event: event };
}

// ===================
// イベントバッジ描画（統一版）
// ===================

/**
 * イベントバッジを描画
 * @param {Array} events - イベント配列
 * @param {Object} options - オプション
 * @param {string} options.style - 'default' | 'calendar' | 'daily' | 'stats'
 * @param {boolean} options.showNote - noteを表示するか
 * @param {boolean} options.showPerformers - 演者を表示するか
 * @param {string} options.wrapperClass - ラッパーのクラス名
 * @returns {string} HTML文字列
 */
function renderEventBadges(events, options) {
    options = options || {};
    var style = options.style || 'default';
    var showNote = options.showNote !== false;
    var showPerformers = options.showPerformers !== false;
    var wrapperClass = options.wrapperClass || '';

    if (!events || events.length === 0) return '';

    var displayableEvents = events.filter(function(event) {
        return hasEventOrPerformers(event);
    });

    if (displayableEvents.length === 0) return '';

    var html = '';
    
    // スタイルに応じたラッパークラス
    var containerClass = '';
    switch (style) {
        case 'calendar':
            containerClass = 'event-badges';
            break;
        case 'daily':
            containerClass = 'daily-event-badges';
            break;
        case 'stats':
            containerClass = 'stats-event-badges';
            break;
        default:
            containerClass = 'event-badges';
    }
    
    if (wrapperClass) {
        containerClass += ' ' + wrapperClass;
    }

    html += '<div class="' + containerClass + '">';
    
    displayableEvents.forEach(function(event) {
        if (isValidEvent(event)) {
            var displayInfo = getEventDisplayName(event);
            
            if (displayInfo.name) {
                var badgeClass = style === 'stats' ? 'stats-event-badge' : 
                                 style === 'daily' ? 'daily-event-badge' : 
                                 'event-badge';
                
                var title = displayInfo.name;
                if (event.media) title += ' (' + event.media + ')';
                if (event.note && showNote) title += ' - ' + event.note;
                
                // カレンダースタイルの場合は短縮表示
                if (style === 'calendar') {
                    html += '<div class="event-badge" style="background: ' + displayInfo.color + '20; border-color: ' + displayInfo.color + ';" title="' + title + '">';
                    html += '<span class="event-icon">' + displayInfo.icon + '</span>';
                    html += '<span class="event-name">' + displayInfo.name + '</span>';
                    html += '</div>';
                } else {
                    html += '<span class="' + badgeClass + '" style="background: ' + displayInfo.color + '20; border-color: ' + displayInfo.color + ';" title="' + title + '">';
                    html += displayInfo.icon + ' ' + displayInfo.name;
                    html += '</span>';
                }
                
                // stats スタイルで note がある場合
                if (style === 'stats' && event.note && showNote) {
                    html += '<span class="stats-event-note" style="color: ' + displayInfo.color + ';">';
                    html += '📝 ' + event.note;
                    html += '</span>';
                }
            }
        }

        // 演者表示
        if (showPerformers && event.performers && event.performers.length > 0) {
            if (style === 'calendar') {
                html += '<div class="event-performers">🎤 ' + event.performers.join(', ') + '</div>';
            } else {
                var performerClass = style === 'stats' ? 'stats-event-badge performer-badge' :
                                     style === 'daily' ? 'daily-event-badge performer-badge' :
                                     'event-badge performer-badge';
                html += '<span class="' + performerClass + '">';
                html += '🎤 ' + event.performers.join(', ');
                html += '</span>';
            }
        }
    });
    
    html += '</div>';
    return html;
}

// 後方互換性のためのラッパー関数
function renderCalendarEventBadges(events) {
    return renderEventBadges(events, { style: 'calendar' });
}

function renderDailyEventBadges(events) {
    return renderEventBadges(events, { style: 'daily', showNote: true });
}

function renderStatsEventBadges(events) {
    return renderEventBadges(events, { style: 'stats', showNote: true });
}


// ===================
// 日付セレクター用イベント表示（共通）
// ===================

function getEventTextForDateSelect(dateKey) {
    var events = getEventsForDate(dateKey);
    
    if (!events || events.length === 0) return '';
    
    var relevantEvents = events.filter(function(event) { return hasEventOrPerformers(event); });
    if (relevantEvents.length === 0) return '';
    
    var displayItems = [];
    
    relevantEvents.forEach(function(event) {
        if (isValidEvent(event)) {
            var displayInfo = getEventDisplayName(event);
            if (displayInfo.name) {
                var shortName = displayInfo.name.length > 10 ? displayInfo.name.substring(0, 10) + '...' : displayInfo.name;
                displayItems.push(displayInfo.icon + shortName);
            }
        }
        
        if (!isValidEvent(event) && event.performers && event.performers.length > 0) {
            var performerText = event.performers.slice(0, 2).join(',');
            var suffix = event.performers.length > 2 ? '...' : '';
            displayItems.push('🎤' + performerText + suffix);
        }
    });
    
    if (displayItems.length === 0) return '';
    
    if (displayItems.length <= 2) {
        return ' ' + displayItems.join(' ');
    } else {
        return ' ' + displayItems.slice(0, 2).join(' ') + '...';
    }
}

function getDateKeyFromFilename(file) {
    var match = file.match(/(\d{4}_\d{2}_\d{2})/);
    return match ? match[1] : null;
}

function createDateSelectOption(file, isSelected) {
    var dateKey = getDateKeyFromFilename(file);
    var formattedDate = formatDate(file);
    var dayOfWeek = getDayOfWeekName(getDayOfWeek(file));
    var eventText = dateKey ? getEventTextForDateSelect(dateKey) : '';
    
    var label = formattedDate + '（' + dayOfWeek + '）' + eventText;
    var selected = isSelected ? 'selected' : '';
    
    return '<option value="' + file + '" ' + selected + '>' + label + '</option>';
}

function updateDateSelectWithEvents(selectId, files, selectedValue) {
    return loadEventData().then(function() {
        var select = document.getElementById(selectId);
        if (!select) return;
        
        var sortedFiles = sortFilesByDate(files, true);
        
        select.innerHTML = sortedFiles.map(function(file, index) {
            var isSelected = selectedValue ? file === selectedValue : index === 0;
            return createDateSelectOption(file, isSelected);
        }).join('');
    });
}

// ===================
// 位置タグ関連
// ===================

var POSITION_TAGS = {
    '角': { label: '角', icon: '', color: '#ef4444', priority: 1 },
    '角2': { label: '角2', icon: '', color: '#f97316', priority: 2 },
    '角3': { label: '角3', icon: '', color: '#eab308', priority: 3 },
    '円卓': { label: '円卓', icon: '', color: '#22c55e', priority: 4 },
    '奇数': { label: '奇数', icon: '', color: '#3b82f6', priority: 10 },
    '偶数': { label: '偶数', icon: '', color: '#8b5cf6', priority: 11 }
};

var positionDataCache = null;

function loadPositionData() {
    if (positionDataCache) {
        return Promise.resolve(positionDataCache);
    }

    return fetch('data/position.csv')
        .then(function(response) {
            if (!response.ok) {
                console.warn('position.csv not found');
                return '';
            }
            return response.text();
        })
        .then(function(text) {
            if (!text) return {};
            
            var lines = text.trim().split('\n');
            
            if (lines.length < 2) {
                return {};
            }

            var headers = lines[0].split(',').map(function(h) { return h.trim(); });
            
            positionDataCache = {};

            for (var i = 1; i < lines.length; i++) {
                var values = lines[i].split(',').map(function(v) { return v.trim(); });
                var unitNum = values[0];
                
                if (!unitNum) continue;

                var positionInfo = {
                    tags: [],
                    raw: {}
                };

                headers.forEach(function(header, idx) {
                    if (idx === 0) return;
                    
                    var value = parseInt(values[idx]) || 0;
                    positionInfo.raw[header] = value;
                    
                    if (value === 1 && POSITION_TAGS[header]) {
                        positionInfo.tags.push(header);
                    }
                });

                positionInfo.tags.sort(function(a, b) {
                    var priorityA = POSITION_TAGS[a] ? POSITION_TAGS[a].priority : 99;
                    var priorityB = POSITION_TAGS[b] ? POSITION_TAGS[b].priority : 99;
                    return priorityA - priorityB;
                });

                positionDataCache[unitNum] = positionInfo;
            }

            console.log('位置データ読み込み完了: ' + Object.keys(positionDataCache).length + '台');
            return positionDataCache;
        })
        .catch(function(e) {
            console.error('位置データ読み込みエラー:', e);
            return {};
        });
}

function getPositionTags(unitNum) {
    if (!positionDataCache) return [];
    
    var key = String(unitNum);
    var info = positionDataCache[key];
    
    return info ? info.tags : [];
}

function getPositionInfo(unitNum) {
    if (!positionDataCache) return null;
    
    var key = String(unitNum);
    return positionDataCache[key] || null;
}

function renderPositionTags(unitNum, options) {
    options = options || {};
    var compact = options.compact || false;
    var maxTags = options.maxTags || 3;
    var tags = getPositionTags(unitNum);
    
    if (tags.length === 0) return '';

    var displayTags = tags.slice(0, maxTags);
    var remaining = tags.length - maxTags;

    var html = '<span class="position-tags">';
    
    displayTags.forEach(function(tagName) {
        var tagInfo = POSITION_TAGS[tagName];
        if (tagInfo) {
            var iconPart = tagInfo.icon ? tagInfo.icon + ' ' : '';
            if (compact) {
                html += '<span class="position-tag compact" style="background: ' + tagInfo.color + '20; border-color: ' + tagInfo.color + ';" title="' + tagInfo.label + '">' + iconPart + tagInfo.label + '</span>';
            } else {
                html += '<span class="position-tag" style="background: ' + tagInfo.color + '20; border-color: ' + tagInfo.color + ';">' + iconPart + tagInfo.label + '</span>';
            }
        }
    });

    if (remaining > 0) {
        html += '<span class="position-tag-more">+' + remaining + '</span>';
    }

    html += '</span>';
    return html;
}

function getPositionTagsText(unitNum) {
    var tags = getPositionTags(unitNum);
    return tags.join(',');
}

function filterByPositionTag(data, tagName, unitKey) {
    unitKey = unitKey || '台番号';
    if (!tagName) return data;
    
    return data.filter(function(row) {
        var unitNum = row[unitKey];
        var tags = getPositionTags(unitNum);
        return tags.indexOf(tagName) !== -1;
    });
}

function getAllPositionTags() {
    return Object.entries(POSITION_TAGS).map(function(entry) {
        var key = entry[0];
        var info = entry[1];
        return {
            value: key,
            label: info.label,
            icon: info.icon,
            color: info.color,
            priority: info.priority
        };
    }).sort(function(a, b) { return a.priority - b.priority; });
}

// ===================
// 機種フィルター用ソート関数（台数順→50音順）
// ===================

function sortMachineOptionsByCount(machineOptions) {
    return machineOptions.slice().sort(function(a, b) {
        if (b.count !== a.count) {
            return b.count - a.count;
        }
        return HallData.sort.compareJapanese(a.label, b.label);
    });
}

function getMachineOptionsForDate(dateFile) {
    var data = dataCache[dateFile] || [];
    var machineCounts = getMachineCountsFromData(data);
    
    var machineOptions = [];
    Object.entries(machineCounts).forEach(function(entry) {
        var machine = entry[0];
        var count = entry[1];
        machineOptions.push({
            value: machine,
            label: machine,
            count: count
        });
    });
    
    return sortMachineOptionsByCount(machineOptions);
}

function getMachineOptionsForLatestDate(dateFiles) {
    if (!dateFiles || dateFiles.length === 0) {
        return [];
    }
    
    var sortedFiles = sortFilesByDate(dateFiles, true);
    var latestFile = sortedFiles[0];
    
    return getMachineOptionsForDate(latestFile);
}

function getMachineOptionsForPeriod(dateFiles) {
    if (!dateFiles || dateFiles.length === 0) {
        return [];
    }
    
    var sortedFiles = sortFilesByDate(dateFiles, true);
    var latestFile = sortedFiles[0];
    var latestData = dataCache[latestFile] || [];
    var latestMachineCounts = getMachineCountsFromData(latestData);
    
    var allMachinesInPeriod = new Set();
    dateFiles.forEach(function(file) {
        var data = dataCache[file] || [];
        data.forEach(function(row) {
            if (row['機種名']) {
                allMachinesInPeriod.add(row['機種名']);
            }
        });
    });
    
    var machineOptions = [];
    Object.entries(latestMachineCounts).forEach(function(entry) {
        var machine = entry[0];
        var count = entry[1];
        machineOptions.push({
            value: machine,
            label: machine,
            count: count
        });
    });
    
    return sortMachineOptionsByCount(machineOptions);
}

