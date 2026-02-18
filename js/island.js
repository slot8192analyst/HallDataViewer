// ===================
// 島図タブ
// ===================

var IslandMap = (function() {
    'use strict';
    
    // 状態管理
    var state = {
        config: null,
        unitDataMap: {},
        machineShortNames: {},
        currentDateIndex: 0,
        viewMode: 'machine',
        selectedUnit: null,
        initialized: false
    };
    
    // ヒートマップの色設定（赤系統一）
    var HEATMAP_COLORS = {
        positive: [
            '#5a3a3a',
            '#6a3030',
            '#7a2828',
            '#8a2020',
            '#aa1818',
            '#cc1010',
            '#ee0808',
            '#ff0000'
        ],
        negative: [
            '#3a3232',
            '#322828',
            '#2a2020',
            '#221818',
            '#1a1212',
            '#140c0c',
            '#0e0808',
            '#080404'
        ],
        zero: '#2a2a2a'
    };

    // ===================
    // 初期化
    // ===================
    
    async function init() {
        if (state.initialized) {
            await render();
            return;
        }
        
        await loadMachineShortNames();
        await loadIslandConfig();
        setupEventListeners();
        await initDateSelect();
        await render();
        
        state.initialized = true;
    }
    
    async function loadMachineShortNames() {
        try {
            var response = await fetch('data/machine-short-names.json');
            if (!response.ok) throw new Error('機種省略名の読み込みに失敗');
            state.machineShortNames = await response.json();
            console.log('機種省略名を読み込みました:', Object.keys(state.machineShortNames).length + '件');
        } catch (e) {
            console.warn('機種省略名の読み込みエラー:', e);
            state.machineShortNames = {};
        }
    }
    
    async function loadIslandConfig() {
        try {
            var response = await fetch('data/island-config.json');
            if (!response.ok) throw new Error('島図設定の読み込みに失敗');
            state.config = await response.json();
            console.log('島図設定を読み込みました:', state.config.islands.length + '島');
        } catch (e) {
            console.error('島図設定エラー:', e);
            state.config = { areas: [], islands: [] };
        }
    }
    
    // ===================
    // 日付セレクター
    // ===================
    
    async function initDateSelect() {
        var dateSelect = document.getElementById('islandDateSelect');
        if (!dateSelect) return;
        
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        
        // イベント情報を読み込み
        if (typeof loadEventData === 'function') {
            await loadEventData();
        }
        
        dateSelect.innerHTML = sortedFiles.map(function(file, index) {
            if (typeof createDateSelectOption === 'function') {
                return createDateSelectOption(file, index === state.currentDateIndex);
            }
            // createDateSelectOptionがない場合のフォールバック
            var dateStr = file.replace('data/', '').replace('.csv', '');
            var formatted = formatDateFromFilename(dateStr);
            var selected = index === state.currentDateIndex ? ' selected' : '';
            return '<option value="' + file + '"' + selected + '>' + formatted + '</option>';
        }).join('');
    }
    
    function formatDateFromFilename(dateStr) {
        // YYYYMMDD → YYYY/MM/DD (曜日)
        if (dateStr.length === 8) {
            var year = dateStr.substring(0, 4);
            var month = dateStr.substring(4, 6);
            var day = dateStr.substring(6, 8);
            var date = new Date(year, parseInt(month) - 1, parseInt(day));
            var dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            var dayOfWeek = dayNames[date.getDay()];
            return year + '/' + month + '/' + day + '（' + dayOfWeek + '）';
        }
        return dateStr;
    }
    
    function updateDateSelect() {
        var dateSelect = document.getElementById('islandDateSelect');
        if (!dateSelect) return;
        
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        
        if (currentFile && dateSelect.value !== currentFile) {
            dateSelect.value = currentFile;
        }
    }
    
    // ===================
    // データ取得
    // ===================
    
    async function loadUnitData() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        
        if (!currentFile) {
            state.unitDataMap = {};
            return;
        }
        
        var data = await loadCSV(currentFile);
        if (!data) {
            state.unitDataMap = {};
            return;
        }
        
        data = addMechanicalRateToData(data);
        
        if (typeof TagEngine !== 'undefined') {
            data = data.map(function(row) {
                var newRow = Object.assign({}, row);
                newRow['_matchedTags'] = TagEngine.evaluateAll(row);
                return newRow;
            });
        }
        
        state.unitDataMap = {};
        data.forEach(function(row) {
            var unitNum = String(row['台番号']).replace(/\D/g, '');
            if (unitNum) {
                state.unitDataMap[unitNum] = row;
            }
        });
    }
    
    // ===================
    // 機種名の省略
    // ===================
    
    function getShortMachineName(fullName) {
        if (!fullName) return '';
        if (state.machineShortNames[fullName]) {
            return state.machineShortNames[fullName];
        }
        return fullName.length > 5 ? fullName.substring(0, 5) : fullName;
    }
    
    // ===================
    // 描画
    // ===================
    
    async function render() {
        await loadUnitData();
        updateDateNav();
        updateDateSelect();
        renderLegend();
        renderIslandMap();
    }
    
    function updateDateNav() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        
        var label = document.getElementById('islandDateLabel');
        if (label && currentFile) {
            var formattedDate = formatDate(currentFile);
            var dayOfWeek = getDayOfWeekName(getDayOfWeek(currentFile));
            label.textContent = formattedDate + '（' + dayOfWeek + '）';
        }
        
        var prevBtn = document.getElementById('islandPrevDate');
        var nextBtn = document.getElementById('islandNextDate');
        if (prevBtn) prevBtn.disabled = state.currentDateIndex >= sortedFiles.length - 1;
        if (nextBtn) nextBtn.disabled = state.currentDateIndex <= 0;
    }
    
    function renderLegend() {
        var container = document.getElementById('islandLegendItems');
        if (!container) return;
        
        var html = '';
        
        if (state.viewMode === 'machine') {
            html = '<span class="legend-hint">台をクリックで詳細表示</span>';
        } else if (state.viewMode === 'diff') {
            html = renderHeatmapLegend([
                { color: HEATMAP_COLORS.positive[7], label: '+3000↑' },
                { color: HEATMAP_COLORS.positive[4], label: '+1000' },
                { color: HEATMAP_COLORS.positive[1], label: '+1' },
                { color: HEATMAP_COLORS.zero, label: '±0' },
                { color: HEATMAP_COLORS.negative[1], label: '-1' },
                { color: HEATMAP_COLORS.negative[4], label: '-1000' },
                { color: HEATMAP_COLORS.negative[7], label: '-3000↓' }
            ]);
        } else if (state.viewMode === 'rate') {
            html = renderHeatmapLegend([
                { color: HEATMAP_COLORS.positive[7], label: '115%↑' },
                { color: HEATMAP_COLORS.positive[4], label: '105%' },
                { color: HEATMAP_COLORS.zero, label: '100%' },
                { color: HEATMAP_COLORS.negative[4], label: '95%' },
                { color: HEATMAP_COLORS.negative[7], label: '85%↓' }
            ]);
        } else if (state.viewMode === 'games') {
            html = renderHeatmapLegend([
                { color: HEATMAP_COLORS.positive[7], label: '9000G↑' },
                { color: HEATMAP_COLORS.positive[5], label: '7000G' },
                { color: HEATMAP_COLORS.positive[3], label: '5000G' },
                { color: HEATMAP_COLORS.positive[1], label: '3000G' },
                { color: HEATMAP_COLORS.negative[4], label: '3000G未満' }
            ]);
        } else if (state.viewMode === 'tag') {
            if (typeof TagEngine !== 'undefined') {
                var tagDefs = TagEngine.getAll();
                tagDefs.forEach(function(tag) {
                    html += '<div class="legend-item">';
                    html += '<span class="legend-color" style="background:' + tag.color + '"></span>';
                    html += '<span class="legend-label">' + tag.icon + ' ' + tag.name + '</span>';
                    html += '</div>';
                });
                if (tagDefs.length === 0) {
                    html += '<span class="legend-hint">タグ未設定</span>';
                }
            }
        }
        
        container.innerHTML = html;
    }
    
    function renderHeatmapLegend(items) {
        var html = '';
        items.forEach(function(item) {
            html += '<div class="legend-item">';
            html += '<span class="legend-color" style="background:' + item.color + '"></span>';
            html += '<span class="legend-label">' + item.label + '</span>';
            html += '</div>';
        });
        return html;
    }
    
    function renderIslandMap() {
        var container = document.getElementById('islandMap');
        if (!container || !state.config) return;
        
        var html = '';
        
        // エリアごとにグループ化
        var areas = state.config.areas || [];
        
        if (areas.length > 0) {
            areas.forEach(function(area) {
                var areaIslands = state.config.islands.filter(function(island) {
                    return island.area === area.id;
                });
                
                if (areaIslands.length === 0) return;
                
                html += '<div class="island-area" data-area="' + area.id + '">';
                html += '<div class="island-area-title">' + area.name + '</div>';
                html += '<div class="island-list">';
                
                areaIslands.forEach(function(island) {
                    html += renderIsland(island);
                });
                
                html += '</div></div>';
            });
        } else {
            html += '<div class="island-list">';
            state.config.islands.forEach(function(island) {
                html += renderIsland(island);
            });
            html += '</div>';
        }
        
        container.innerHTML = html;
        
        // 台クリックイベント
        container.querySelectorAll('.island-unit').forEach(function(unitEl) {
            unitEl.addEventListener('click', function() {
                var unitNum = this.dataset.unit;
                if (unitNum) {
                    showUnitDetail(unitNum);
                }
            });
        });
    }
    
    function renderIsland(island) {
        var rowCount = island.rows.length;
        var typeClass = island.type === 'vertical' ? 'island-vertical' : '';
        var sizeClass = rowCount === 1 ? 'island-single' : 'island-double';
        
        var html = '<div class="island-block ' + typeClass + ' ' + sizeClass + '" data-island="' + island.id + '">';
        html += '<div class="island-rows">';
        
        island.rows.forEach(function(row) {
            html += renderIslandRow(row);
        });
        
        html += '</div></div>';
        
        return html;
    }
    
    function renderIslandRow(row) {
        var html = '<div class="island-row">';
        
        row.units.forEach(function(unitNum) {
            html += renderUnit(unitNum);
        });
        
        html += '</div>';
        return html;
    }
    
    function renderUnit(unitNum) {
        // null または 0 はスペーサー
        if (unitNum === null || unitNum === 0) {
            return '<div class="island-unit spacer"></div>';
        }
        
        var unitStr = String(unitNum);
        var data = state.unitDataMap[unitStr] || null;
        
        var style = getUnitStyle(data);
        var subText = getUnitSubText(data);
        var machineName = data ? getShortMachineName(data['機種名']) : '';
        var dataClass = data ? '' : ' no-data';
        
        var html = '<div class="island-unit' + dataClass + '" data-unit="' + unitStr + '" style="' + style + '">';
        html += '<div class="unit-number">' + unitStr + '</div>';
        html += '<div class="unit-machine">' + machineName + '</div>';
        if (subText) {
            html += '<div class="unit-sub">' + subText + '</div>';
        }
        html += '</div>';
        
        return html;
    }
    
    function getUnitStyle(data) {
        if (!data) return 'background: var(--bg-base); opacity: 0.4;';
        
        var bgColor = '';
        var textColor = '';
        
        switch (state.viewMode) {
            case 'machine':
                bgColor = '#3a3a3a';
                textColor = '#fff';
                break;
                
            case 'diff':
                var diff = parseInt(String(data['差枚']).replace(/[+,]/g, '')) || 0;
                bgColor = getColorByValue(diff, 'diff');
                textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                break;
                
            case 'rate':
                var rate = data['機械割'] || 100;
                bgColor = getColorByValue(rate - 100, 'rate');
                textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                break;
                
            case 'games':
                var games = parseInt(String(data['G数']).replace(/,/g, '')) || 0;
                bgColor = getColorByValue(games, 'games');
                textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                break;
                
            case 'tag':
                var tags = data['_matchedTags'] || [];
                if (tags.length > 0 && typeof TagEngine !== 'undefined') {
                    var firstTag = TagEngine.get(tags[0]);
                    bgColor = firstTag ? firstTag.color : '#3a3a3a';
                } else {
                    bgColor = '#2a2a2a';
                }
                textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                break;
                
            default:
                bgColor = '#3a3a3a';
                textColor = '#fff';
        }
        
        return 'background: ' + bgColor + '; color: ' + textColor + ';';
    }
    
    function getUnitSubText(data) {
        if (!data) return '';
        
        switch (state.viewMode) {
            case 'diff':
                var diff = parseInt(String(data['差枚']).replace(/[+,]/g, '')) || 0;
                return (diff >= 0 ? '+' : '') + diff.toLocaleString();
                
            case 'rate':
                var rate = data['機械割'];
                return rate ? rate.toFixed(1) + '%' : '-';
                
            case 'games':
                var games = parseInt(String(data['G数']).replace(/,/g, '')) || 0;
                return games.toLocaleString();
                
            case 'tag':
                var tags = data['_matchedTags'] || [];
                if (tags.length > 0 && typeof TagEngine !== 'undefined') {
                    var firstTag = TagEngine.get(tags[0]);
                    return firstTag ? firstTag.icon : '';
                }
                return '';
                
            default:
                return '';
        }
    }
    
    // ===================
    // 統一カラー計算
    // ===================
    
    function getColorByValue(value, type) {
        var thresholds;
        
        switch (type) {
            case 'diff':
                thresholds = [200, 500, 1000, 1500, 2000, 2500, 3000];
                break;
            case 'rate':
                thresholds = [1, 2, 3, 5, 7, 10, 15];
                break;
            case 'games':
                if (value < 3000) return HEATMAP_COLORS.negative[4];
                var gameThresholds = [3000, 4000, 5000, 6000, 7000, 8000, 9000];
                for (var g = gameThresholds.length - 1; g >= 0; g--) {
                    if (value >= gameThresholds[g]) {
                        return HEATMAP_COLORS.positive[g + 1];
                    }
                }
                return HEATMAP_COLORS.positive[0];
            default:
                thresholds = [200, 500, 1000, 1500, 2000, 2500, 3000];
        }

        if (value === 0) return HEATMAP_COLORS.zero;

        if (value > 0) {
            for (var i = thresholds.length - 1; i >= 0; i--) {
                if (value >= thresholds[i]) {
                    return HEATMAP_COLORS.positive[i + 1];
                }
            }
            return HEATMAP_COLORS.positive[0];
        } else {
            var absValue = Math.abs(value);
            for (var j = thresholds.length - 1; j >= 0; j--) {
                if (absValue >= thresholds[j]) {
                    return HEATMAP_COLORS.negative[j + 1];
                }
            }
            return HEATMAP_COLORS.negative[0];
        }
    }

    function getBrightness(hexColor) {
        if (!hexColor || hexColor.charAt(0) !== '#') return 50;
        var hex = hexColor.replace('#', '');
        if (hex.length !== 6) return 50;
        var r = parseInt(hex.substr(0, 2), 16);
        var g = parseInt(hex.substr(2, 2), 16);
        var b = parseInt(hex.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
    }
    
    // ===================
    // 台詳細モーダル
    // ===================
    
    function showUnitDetail(unitNum) {
        var data = state.unitDataMap[unitNum];
        var modal = document.getElementById('islandUnitModal');
        var title = document.getElementById('islandUnitModalTitle');
        var body = document.getElementById('islandUnitModalBody');
        
        if (!modal || !title || !body) return;
        
        title.textContent = '台番号: ' + unitNum;
        
        if (!data) {
            body.innerHTML = '<div class="unit-detail-empty">この台のデータはありません</div>';
        } else {
            var html = '<div class="unit-detail-grid">';
            
            html += renderDetailRow('機種名', data['機種名'] || '-');
            
            var diff = parseInt(String(data['差枚']).replace(/[+,]/g, '')) || 0;
            var diffClass = diff > 0 ? 'plus' : diff < 0 ? 'minus' : '';
            html += renderDetailRow('差枚', '<span class="' + diffClass + '">' + (diff >= 0 ? '+' : '') + diff.toLocaleString() + '枚</span>');
            
            var games = parseInt(String(data['G数']).replace(/,/g, '')) || 0;
            html += renderDetailRow('G数', games.toLocaleString() + ' G');
            
            var rate = data['機械割'];
            var rateClass = rate >= 100 ? 'plus' : 'minus';
            html += renderDetailRow('機械割', '<span class="' + rateClass + '">' + (rate ? rate.toFixed(2) + '%' : '-') + '</span>');
            
            html += renderDetailRow('BB', data['BB'] || '0');
            html += renderDetailRow('RB', data['RB'] || '0');
            html += renderDetailRow('ART', data['ART'] || '0');
            
            var tags = data['_matchedTags'] || [];
            if (tags.length > 0 && typeof TagEngine !== 'undefined') {
                var tagHtml = tags.map(function(tagId) {
                    var tag = TagEngine.get(tagId);
                    if (!tag) return '';
                    return '<span class="unit-detail-tag" style="background:' + tag.color + '20; border-color:' + tag.color + '; color:' + tag.color + ';">' + tag.icon + ' ' + tag.name + '</span>';
                }).join(' ');
                html += renderDetailRow('タグ', tagHtml);
            }
            
            if (typeof renderPositionTags === 'function') {
                var positionTags = renderPositionTags(unitNum, { compact: false });
                if (positionTags) {
                    html += renderDetailRow('位置', positionTags);
                }
            }
            
            html += '</div>';
            body.innerHTML = html;
        }
        
        modal.classList.add('active');
        state.selectedUnit = unitNum;
    }
    
    function renderDetailRow(label, value) {
        return '<div class="unit-detail-row">' +
               '<span class="unit-detail-label">' + label + '</span>' +
               '<span class="unit-detail-value">' + value + '</span>' +
               '</div>';
    }
    
    function hideUnitDetail() {
        var modal = document.getElementById('islandUnitModal');
        if (modal) {
            modal.classList.remove('active');
        }
        state.selectedUnit = null;
    }
    
    // ===================
    // イベントリスナー
    // ===================
    
    function setupEventListeners() {
        // 前日・翌日ボタン
        var prevBtn = document.getElementById('islandPrevDate');
        var nextBtn = document.getElementById('islandNextDate');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                var sortedFiles = sortFilesByDate(CSV_FILES, true);
                if (state.currentDateIndex < sortedFiles.length - 1) {
                    state.currentDateIndex++;
                    render();
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (state.currentDateIndex > 0) {
                    state.currentDateIndex--;
                    render();
                }
            });
        }
        
        // 日付セレクター
        var dateSelect = document.getElementById('islandDateSelect');
        if (dateSelect) {
            dateSelect.addEventListener('change', function(e) {
                var sortedFiles = sortFilesByDate(CSV_FILES, true);
                var newIndex = sortedFiles.indexOf(e.target.value);
                if (newIndex !== -1) {
                    state.currentDateIndex = newIndex;
                    render();
                }
            });
        }
        
        // 表示モード切り替え
        document.querySelectorAll('.island-mode-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.island-mode-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                state.viewMode = this.dataset.mode;
                renderLegend();
                renderIslandMap();
            });
        });
        
        // モーダル閉じる
        var closeBtn = document.getElementById('islandUnitModalClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideUnitDetail);
        }
        
        var modal = document.getElementById('islandUnitModal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) {
                    hideUnitDetail();
                }
            });
        }
        
        // ESCキーでモーダル閉じる
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                hideUnitDetail();
            }
        });
    }
    
    // ===================
    // 公開API
    // ===================
    
    return {
        init: init,
        render: render,
        setViewMode: function(mode) {
            state.viewMode = mode;
            renderLegend();
            renderIslandMap();
        },
        getState: function() {
            return state;
        }
    };
    
})();
