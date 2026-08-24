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
        viewMode: 'diff',
        selectedUnit: null,
        initialized: false
    };

    // ヒートマップの色設定（赤系統一・差枚モード用）
    var HEATMAP_COLORS = {
        positive: [
            '#5a3a3a', '#6a3030', '#7a2828', '#8a2020',
            '#aa1818', '#cc1010', '#ee0808', '#ff0000'
        ],
        negative: [
            '#3a3232', '#322828', '#2a2020', '#221818',
            '#1a1212', '#140c0c', '#0e0808', '#080404'
        ],
        zero: '#2a2a2a'
    };

    // 凹みバッジ用の配色（死に台=暖色/タコだし=寒色、1〜3位を濃淡で表現）
    var BADGE_COLORS = {
        kubi: { 1: '#FF3B30', 2: '#FF8C42', 3: '#FFC98C' },
        tako: { 1: '#4A3AFF', 2: '#6C7CE0', 3: '#AAB8F0' }
    };

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

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
    // 凹みバッジ（🐙タコだし / 💀死に台）
    // 日別タブと同じ MachineBadge モジュール・localStorage設定を共有する
    // ===================

    async function ensureBadgeWindowLoaded(currentFile) {
        if (typeof getDateKeyFromFilename !== 'function' || typeof loadMonthlyJSON !== 'function') return;
        var dateKey = getDateKeyFromFilename(currentFile);
        if (!dateKey) return;
        var parts = dateKey.split('_');
        var y = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        if (isNaN(y) || isNaN(m)) return;

        // 集計期間が月をまたぐ場合に備えて、対象月＋前月をロードしておく
        var months = [y + '_' + pad2(m)];
        var prevM = m - 1, prevY = y;
        if (prevM < 1) { prevM = 12; prevY -= 1; }
        months.push(prevY + '_' + pad2(prevM));

        for (var i = 0; i < months.length; i++) {
            try {
                await loadMonthlyJSON('data/' + months[i] + '.json');
            } catch (e) {
                // 読み込めなくても、集計側で「未ロードで欠落」として警告表示される
            }
        }
    }

    async function computeIslandBadges() {
        if (typeof MachineBadge === 'undefined') return;

        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        if (!currentFile) return;

        await ensureBadgeWindowLoaded(currentFile);

        var rows = Object.keys(state.unitDataMap).map(function(k) {
            return state.unitDataMap[k];
        });
        if (rows.length === 0) return;

        var badged = MachineBadge.assignBadges(
            rows,
            currentFile,
            dataCache,
            MachineBadge.getTargetColumn(),
            {}
        );

        badged.forEach(function(row) {
            var unitNum = String(row['台番号']).replace(/\D/g, '');
            if (unitNum) {
                state.unitDataMap[unitNum] = row;
            }
        });
    }

    var _islandBadgeSheet = null;

    function ensureIslandBadgeSheet() {
        if (_islandBadgeSheet) return _islandBadgeSheet;
        if (typeof BottomSheet === 'undefined') return null;

        _islandBadgeSheet = BottomSheet.create('islandBadgeSheet', { title: '🐙💀 凹みバッジ設定' });
        _islandBadgeSheet.setContent(MachineBadge.renderSettingsHtml('islandMb'));

        MachineBadge.setupSettingsEvents('islandMb', function() {
            computeIslandBadges().then(function() {
                renderLegend();
                renderIslandMap();
            });
        });

        _islandBadgeSheet.onOpen(function() {
            MachineBadge.renderWindowInfo('islandMb');
        });

        return _islandBadgeSheet;
    }

    // ===================
    // 日付選択カレンダー（ボトムシート）
    // ===================

    var _islandDatePickerSheet = null;
    var _idpViewYear = null;
    var _idpViewMonth = null;

    function ensureIslandDatePickerSheet() {
        if (_islandDatePickerSheet) return _islandDatePickerSheet;
        if (typeof BottomSheet === 'undefined') return null;
        _islandDatePickerSheet = BottomSheet.create('islandDatePickerSheet', { title: '📅 日付を選択' });
        _islandDatePickerSheet.setContent('<div class="date-picker" id="islandDatePickerRoot"></div>');
        return _islandDatePickerSheet;
    }

    function getIslandDateIndex() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var map = {};
        sortedFiles.forEach(function(file) {
            var key = (typeof getDateKeyFromFilename === 'function') ? getDateKeyFromFilename(file) : null;
            if (key) map[key] = file;
        });
        return map;
    }

    function initIslandDatePickerView() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        var key = currentFile && typeof getDateKeyFromFilename === 'function'
            ? getDateKeyFromFilename(currentFile) : '';
        var m = key && key.match(/^(\d{4})_(\d{2})_(\d{2})$/);
        if (m) {
            _idpViewYear = parseInt(m[1]);
            _idpViewMonth = parseInt(m[2]);
        } else {
            var now = new Date();
            _idpViewYear = now.getFullYear();
            _idpViewMonth = now.getMonth() + 1;
        }
    }

    function renderIslandDatePicker() {
        var root = document.getElementById('islandDatePickerRoot');
        if (!root) return;

        var dateMap = getIslandDateIndex();
        var y = _idpViewYear, mo = _idpViewMonth;

        var allKeys = Object.keys(dateMap);
        var minKey = allKeys.length ? allKeys.reduce(function(a, b) { return a < b ? a : b; }) : null;
        var maxKey = allKeys.length ? allKeys.reduce(function(a, b) { return a > b ? a : b; }) : null;
        var curFirst = y + '_' + pad2(mo) + '_01';
        var curLast  = y + '_' + pad2(mo) + '_31';
        var prevDisabled = minKey && curFirst <= minKey;
        var nextDisabled = maxKey && curLast  >= maxKey;

        var sortedFiles = sortFilesByDate(CSV_FILES, true);
        var currentFile = sortedFiles[state.currentDateIndex];
        var currentKey = currentFile && typeof getDateKeyFromFilename === 'function'
            ? getDateKeyFromFilename(currentFile) : '';

        var weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
        var weekdaysHtml = weekdayNames.map(function(w, i) {
            var cls = i === 0 ? ' dow-sun' : (i === 6 ? ' dow-sat' : '');
            return '<div class="date-picker-weekday' + cls + '">' + w + '</div>';
        }).join('');

        var firstDow = new Date(y, mo - 1, 1).getDay();
        var daysInMonth = new Date(y, mo, 0).getDate();

        var cells = '';
        for (var i = 0; i < firstDow; i++) {
            cells += '<div class="date-picker-cell is-empty"></div>';
        }
        for (var d = 1; d <= daysInMonth; d++) {
            var key = y + '_' + pad2(mo) + '_' + pad2(d);
            var file = dateMap[key];
            var isCurrent = (key === currentKey);
            if (!file) {
                cells += '<div class="date-picker-cell no-data">' + d + '</div>';
            } else {
                var cls = 'date-picker-cell' + (isCurrent ? ' is-current' : '');
                cells += '<div class="' + cls + '" data-file="' + file + '">' + d + '</div>';
            }
        }

        root.innerHTML =
            '<div class="date-picker-header">'
            +   '<button class="date-picker-nav" id="islandDatePickerPrev"' + (prevDisabled ? ' disabled' : '') + '>◀</button>'
            +   '<span class="date-picker-month-label">' + y + '年 ' + mo + '月</span>'
            +   '<button class="date-picker-nav" id="islandDatePickerNext"' + (nextDisabled ? ' disabled' : '') + '>▶</button>'
            + '</div>'
            + '<div class="date-picker-weekdays">' + weekdaysHtml + '</div>'
            + '<div class="date-picker-grid">' + cells + '</div>';

        var prevBtnEl = document.getElementById('islandDatePickerPrev');
        if (prevBtnEl && !prevDisabled) {
            prevBtnEl.addEventListener('click', function() {
                _idpViewMonth--;
                if (_idpViewMonth < 1) { _idpViewMonth = 12; _idpViewYear--; }
                renderIslandDatePicker();
            });
        }
        var nextBtnEl = document.getElementById('islandDatePickerNext');
        if (nextBtnEl && !nextDisabled) {
            nextBtnEl.addEventListener('click', function() {
                _idpViewMonth++;
                if (_idpViewMonth > 12) { _idpViewMonth = 1; _idpViewYear++; }
                renderIslandDatePicker();
            });
        }

        root.querySelectorAll('.date-picker-cell[data-file]').forEach(function(cell) {
            cell.addEventListener('click', function() {
                var file = this.dataset.file;
                if (!file) return;
                var sortedFiles2 = sortFilesByDate(CSV_FILES, true);
                var idx = sortedFiles2.indexOf(file);
                if (idx !== -1) {
                    state.currentDateIndex = idx;
                    render();
                }
                if (_islandDatePickerSheet) _islandDatePickerSheet.close();
            });
        });
    }

    function openIslandDatePicker() {
        var sheet = ensureIslandDatePickerSheet();
        if (!sheet) return;
        initIslandDatePickerView();
        renderIslandDatePicker();
        sheet.open();
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
        if (state.viewMode === 'badge') {
            await computeIslandBadges();
        }
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

        if (state.viewMode === 'diff') {
            html = renderHeatmapLegend([
                { color: HEATMAP_COLORS.positive[7], label: '+3000↑' },
                { color: HEATMAP_COLORS.positive[4], label: '+1000' },
                { color: HEATMAP_COLORS.positive[1], label: '+1' },
                { color: HEATMAP_COLORS.zero, label: '±0' },
                { color: HEATMAP_COLORS.negative[1], label: '-1' },
                { color: HEATMAP_COLORS.negative[4], label: '-1000' },
                { color: HEATMAP_COLORS.negative[7], label: '-3000↓' }
            ]);
        } else if (state.viewMode === 'badge') {
            html = renderHeatmapLegend([
                { color: BADGE_COLORS.kubi[1], label: '死に台 1位（熱）' },
                { color: BADGE_COLORS.kubi[2], label: '死に台 2位' },
                { color: BADGE_COLORS.kubi[3], label: '死に台 3位' },
                { color: BADGE_COLORS.tako[1], label: 'タコだし 1位' },
                { color: BADGE_COLORS.tako[2], label: 'タコだし 2位' },
                { color: BADGE_COLORS.tako[3], label: 'タコだし 3位' }
            ]);
            html += '<span class="legend-hint">両方に該当する台は死に台側の色を優先表示／数値は累積差枚（設定は⚙️）</span>';
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
        container.classList.toggle('mode-badge', state.viewMode === 'badge');

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

    // ===================
    // インジケーター判定（🐙タコだし / 💀死に台）
    // 同一台が両方の条件に該当する場合（3台設置機種など）は
    // 死に台（凹み＝我々の間で「熱い」）側を優先して色をつける
    // ===================
    function getIndicatorInfo(badge) {
        if (!badge || typeof MachineBadge === 'undefined') return null;

        var kubiRanks = MachineBadge.getKubiRanks();
        var takoRanks = MachineBadge.getTakoRanks();

        var showKubi = badge.kubi !== null && badge.kubi !== undefined &&
            MachineBadge.isShowKubi() && kubiRanks.indexOf(badge.kubi) !== -1;
        var showTako = badge.tako !== null && badge.tako !== undefined &&
            MachineBadge.isShowTako() && takoRanks.indexOf(badge.tako) !== -1;

        // 優先順位: 死に台 > タコだし
        if (showKubi) return { type: 'kubi', rank: badge.kubi };
        if (showTako) return { type: 'tako', rank: badge.tako };
        return null;
    }

    function renderUnit(unitNum) {
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
            html += '<div class="unit-sub unit-sub-neutral">' + subText + '</div>';
        }
        html += '</div>';

        return html;
    }

    function getUnitStyle(data) {
        if (!data) return 'background: var(--bg-base); opacity: 0.4;';

        var bgColor = '';
        var textColor = '';

        switch (state.viewMode) {
            case 'diff':
                var diff = parseInt(String(data['差枚']).replace(/[+,]/g, '')) || 0;
                bgColor = getColorByValue(diff);
                textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                break;

            case 'badge':
                var info = getIndicatorInfo(data['_machineBadge']);
                if (info) {
                    bgColor = BADGE_COLORS[info.type][info.rank];
                    textColor = getBrightness(bgColor) > 100 ? '#000' : '#fff';
                } else {
                    bgColor = '#2a2a2a';
                    textColor = '#fff';
                }
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

            case 'badge':
                var badge = data['_machineBadge'];
                if (!badge || badge.cumVal === null || badge.cumVal === undefined) return '-';
                // 数値色は個別指定せず、getUnitStyleが決めた文字色（白/黒）を継承する
                return (badge.cumVal >= 0 ? '+' : '') + badge.cumVal.toLocaleString();

            default:
                return '';
        }
    }

    // ===================
    // 差枚モード用カラー計算
    // ===================

    function getColorByValue(value) {
        var thresholds = [200, 500, 1000, 1500, 2000, 2500, 3000];

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

            if (data['_machineBadge']) {
                html += renderDetailRow('凹みバッジ', MachineBadge.renderBadgeInner(data['_machineBadge']));
            }

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

    function switchViewMode(mode) {
        state.viewMode = mode;

        var settingsBtn = document.getElementById('islandBadgeSettingsBtn');
        if (settingsBtn) settingsBtn.hidden = (mode !== 'badge');

        if (mode === 'badge') {
            computeIslandBadges().then(function() {
                renderLegend();
                renderIslandMap();
            });
        } else {
            renderLegend();
            renderIslandMap();
        }
    }

    function setupEventListeners() {
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

        var dateTrigger = document.getElementById('islandDateTrigger');
        if (dateTrigger) {
            dateTrigger.addEventListener('click', openIslandDatePicker);
        }

        document.querySelectorAll('.island-mode-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.island-mode-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                this.classList.add('active');
                switchViewMode(this.dataset.mode);
            });
        });

        var badgeSettingsBtn = document.getElementById('islandBadgeSettingsBtn');
        if (badgeSettingsBtn) {
            badgeSettingsBtn.addEventListener('click', function() {
                var sheet = ensureIslandBadgeSheet();
                if (sheet) sheet.open();
            });
        }

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
            switchViewMode(mode);
        },
        getState: function() {
            return state;
        }
    };

})();
