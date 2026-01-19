// ===================
// カレンダータブ
// ===================

let calendarEventFilter = null;
let calendarMediaFilter = null;
let calendarPerformerFilter = null;


// ===================
// カレンダーから日別データへ遷移
// ===================

/**
 * カレンダーの日付クリックで日別データタブに遷移
 * @param {string} dateKey - 日付キー（YYYY_MM_DD形式）
 */
function navigateToDailyData(dateKey) {
    const filename = `data/${dateKey}.csv`;
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const fileIndex = sortedFiles.indexOf(filename);
    
    if (fileIndex === -1) {
        showCopyToast('この日のデータはありません', true);
        return;
    }
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const dailyTabBtn = document.querySelector('.tab-btn[data-tab="daily"]');
    const dailyTabContent = document.getElementById('daily');
    
    if (dailyTabBtn && dailyTabContent) {
        dailyTabBtn.classList.add('active');
        dailyTabContent.classList.add('active');
        
        currentDateIndex = fileIndex;
        
        initDateSelectWithEvents();
        filterAndRender();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// カレンダーフィルター用の複数選択コンポーネント初期化
function initCalendarMultiSelect(containerId, options, placeholder, onChange) {
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
                <input type="text" class="multi-select-search" placeholder="検索...">
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

    function renderOptions(filter = '') {
        const filterLower = filter.toLowerCase().trim();
        let html = '';

        currentOptions.forEach((opt) => {
            const value = opt.value;
            const label = opt.label;
            const icon = opt.icon || '';

            if (filterLower && !label.toLowerCase().includes(filterLower)) {
                return;
            }

            const checked = selectedValues.has(value) ? 'checked' : '';
            html += `
                <div class="multi-select-option" data-value="${value}">
                    <input type="checkbox" ${checked}>
                    <span class="option-label">${icon ? icon + ' ' : ''}${label}</span>
                </div>
            `;
        });

        if (filterLower && html === '') {
            html = `<div class="multi-select-no-results">該当する項目がありません</div>`;
        }

        optionsContainer.innerHTML = html;

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

    function updateDisplay() {
        const count = selectedValues.size;
        const total = currentOptions.length;

        if (count === 0) {
            displayText.textContent = placeholder;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        } else if (count === total) {
            displayText.textContent = 'すべて選択';
            displayCount.textContent = `(${count}件)`;
            displayCount.style.display = 'inline';
        } else if (count === 1) {
            const selectedOpt = currentOptions.find(o => selectedValues.has(o.value));
            displayText.textContent = selectedOpt ? selectedOpt.label : `${count}件選択`;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        } else {
            displayText.textContent = `${count}件選択中`;
            displayCount.textContent = '';
            displayCount.style.display = 'none';
        }
    }

    function getSelectedValues() {
        return Array.from(selectedValues);
    }

    function openDropdown() {
        document.querySelectorAll('.multi-select-dropdown.open').forEach(dd => {
            if (dd !== dropdown) dd.classList.remove('open');
        });
        document.querySelectorAll('.multi-select-display.open').forEach(d => {
            if (d !== display) d.classList.remove('open');
        });

        isOpen = true;
        dropdown.classList.add('open');
        display.classList.add('open');
        searchInput.value = '';
        renderOptions();
        setTimeout(() => searchInput.focus(), 10);
    }

    function closeDropdown() {
        isOpen = false;
        dropdown.classList.remove('open');
        display.classList.remove('open');
    }

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

    function deselectAll() {
        const filter = searchInput.value.toLowerCase().trim();
        if (filter) {
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

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        isOpen ? closeDropdown() : openDropdown();
    });

    searchInput.addEventListener('input', (e) => renderOptions(e.target.value));
    searchInput.addEventListener('click', (e) => e.stopPropagation());
    dropdown.addEventListener('click', (e) => e.stopPropagation());
    selectAllBtn.addEventListener('click', (e) => { e.stopPropagation(); selectAll(); });
    deselectAllBtn.addEventListener('click', (e) => { e.stopPropagation(); deselectAll(); });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && isOpen) closeDropdown();
    });

    display.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
        else if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            if (!isOpen) openDropdown();
        }
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeDropdown(); display.focus(); }
    });

    renderOptions();
    updateDisplay();

    return {
        getSelectedValues,
        setSelectedValues: (values) => {
            selectedValues = new Set(values);
            renderOptions(searchInput?.value || '');
            updateDisplay();
        },
        updateOptions: (newOptions) => {
            currentOptions = newOptions;
            const validValues = new Set(newOptions.map(o => o.value));
            selectedValues = new Set([...selectedValues].filter(v => validValues.has(v)));
            if (isOpen) renderOptions(searchInput.value);
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
        close: closeDropdown,
        open: openDropdown
    };
}

// カレンダーフィルターを描画
function renderCalendarFilters() {
    const container = document.getElementById('calendarFilter');
    if (!container) return;

    container.innerHTML = `
        <div class="calendar-filters">
            <div class="filter-group">
                <label>イベント:</label>
                <div id="calendarEventFilter"></div>
            </div>
            <div class="filter-group">
                <label>メディア:</label>
                <div id="calendarMediaFilter"></div>
            </div>
            <div class="filter-group">
                <label>演者:</label>
                <div id="calendarPerformerFilter"></div>
            </div>
            <button id="calendarFilterReset" class="btn-small">リセット</button>
        </div>
    `;

    const eventOptions = [];
    
    if (eventData && eventData.eventTypes) {
        eventData.eventTypes.forEach(type => {
            eventOptions.push({ value: `type:${type.id}`, label: type.name, icon: type.icon });
        });
    }
    
    const allEventNamesList = getAllEventNames();
    allEventNamesList.forEach(name => {
        eventOptions.push({ value: `name:${name}`, label: name, icon: '📌' });
    });
    
    calendarEventFilter = initCalendarMultiSelect('calendarEventFilter', eventOptions, '全イベント', () => renderCalendar());

    const mediaOptions = [];
    if (eventData && eventData.mediaTypes) {
        eventData.mediaTypes.forEach(media => {
            mediaOptions.push({ value: media, label: media });
        });
    }
    calendarMediaFilter = initCalendarMultiSelect('calendarMediaFilter', mediaOptions, '全メディア', () => renderCalendar());

    const performerOptions = [];
    if (eventData && eventData.performers) {
        eventData.performers.forEach(performer => {
            performerOptions.push({ value: performer, label: performer, icon: '🎤' });
        });
    }
    calendarPerformerFilter = initCalendarMultiSelect('calendarPerformerFilter', performerOptions, '全演者', () => renderCalendar());

    document.getElementById('calendarFilterReset')?.addEventListener('click', () => {
        if (calendarEventFilter) calendarEventFilter.reset();
        if (calendarMediaFilter) calendarMediaFilter.reset();
        if (calendarPerformerFilter) calendarPerformerFilter.reset();
        renderCalendar();
    });
}

// イベントが指定された名前を持つかチェック
function eventHasName(event, targetName) {
    if (!event) return false;
    if (Array.isArray(event.name)) {
        return event.name.some(n => n === targetName);
    }
    return event.name === targetName;
}

// 日付がフィルター条件に一致するか
function dateMatchesCalendarFilter(dateKey) {
    const events = getEventsForDate(dateKey);

    const selectedEvents = calendarEventFilter ? calendarEventFilter.getSelectedValues() : [];
    const selectedMedia = calendarMediaFilter ? calendarMediaFilter.getSelectedValues() : [];
    const selectedPerformers = calendarPerformerFilter ? calendarPerformerFilter.getSelectedValues() : [];

    if (selectedEvents.length === 0 && selectedMedia.length === 0 && selectedPerformers.length === 0) {
        return true;
    }

    if (events.length === 0) return false;

    let matchesEvent = selectedEvents.length === 0;
    let matchesMedia = selectedMedia.length === 0;
    let matchesPerformer = selectedPerformers.length === 0;

    events.forEach(event => {
        if (selectedEvents.length > 0 && !matchesEvent) {
            for (const filter of selectedEvents) {
                if (filter.startsWith('type:')) {
                    if (event.type === filter.replace('type:', '')) {
                        matchesEvent = true;
                        break;
                    }
                } else if (filter.startsWith('name:')) {
                    if (eventHasName(event, filter.replace('name:', ''))) {
                        matchesEvent = true;
                        break;
                    }
                }
            }
        }

        if (selectedMedia.length > 0 && !matchesMedia) {
            if (selectedMedia.includes(event.media)) matchesMedia = true;
        }

        if (selectedPerformers.length > 0 && !matchesPerformer) {
            if (event.performers && event.performers.some(p => selectedPerformers.includes(p))) {
                matchesPerformer = true;
            }
        }
    });

    return matchesEvent && matchesMedia && matchesPerformer;
}


// ===================
// 週間おすすめ機種の処理
// ===================

/**
 * 日付文字列をDateオブジェクトに変換
 * @param {string} dateStr - YYYY_MM_DD形式
 * @returns {Date}
 */
function parseDateKey(dateStr) {
    const parts = dateStr.split('_').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

/**
 * 指定した日のおすすめ情報を取得
 * @param {string} dateKey - YYYY_MM_DD形式
 * @returns {Array} おすすめ情報の配列
 */
function getRecommendationsForDate(dateKey) {
    if (!eventData || !eventData.weeklyRecommendations) {
        return [];
    }
    
    const targetDate = parseDateKey(dateKey);
    const result = [];
    
    eventData.weeklyRecommendations.forEach(rec => {
        const recStart = parseDateKey(rec.startDate);
        const recEnd = parseDateKey(rec.endDate);
        
        if (targetDate >= recStart && targetDate <= recEnd) {
            result.push({
                machines: rec.machines,
                color: rec.color || '#3b82f6',
                note: rec.note || ''
            });
        }
    });
    
    return result;
}

/**
 * 週間おすすめバッジのHTMLを生成
 * @param {Array} recommendations - おすすめ情報の配列
 * @returns {string} HTML文字列
 */
function renderWeeklyRecommendationBadges(recommendations) {
    if (!recommendations || recommendations.length === 0) {
        return '';
    }
    
    let html = '';
    
    recommendations.forEach(rec => {
        const machinesText = rec.machines.join(' / ');
        const titleText = rec.note ? `${rec.note}: ${machinesText}` : machinesText;
        
        html += `
            <div class="weekly-rec-badge" style="--rec-color: ${rec.color};" title="${titleText}">
                <span class="rec-icon">📌</span>
                <span class="rec-text">${machinesText}</span>
            </div>
        `;
    });
    
    return html;
}


// ===================
// カレンダー描画
// ===================

async function renderCalendar() {
    const container = document.getElementById('calendarDays');
    if (!container) return;

    await loadEventData();

    const filterContainer = document.getElementById('calendarFilter');
    if (filterContainer && !filterContainer.querySelector('.calendar-filters')) {
        renderCalendarFilters();
    }

    const year = calendarYear;
    const month = calendarMonth;

    document.getElementById('calendarMonth').textContent = `${year}年${month}月`;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const dateStats = {};
    
    let monthTotalSa = 0;
    let firstHalfSa = 0;
    let secondHalfSa = 0;
    let monthTotalGames = 0;
    let monthTotalCount = 0;
    let monthPlusCount = 0;
    let daysWithData = 0;
    
    for (const file of CSV_FILES) {
        const parsed = parseDateFromFilename(file);
        if (parsed && parsed.year === year && parsed.month === month) {
            const data = await loadCSV(file);
            if (data) {
                const totalGames = data.reduce((sum, r) => sum + (parseInt(String(r['G数']).replace(/,/g, '')) || 0), 0);
                const totalSa = data.reduce((sum, r) => sum + (parseInt(String(r['差枚']).replace(/,/g, '')) || 0), 0);
                const plusCount = data.filter(r => (parseInt(String(r['差枚']).replace(/,/g, '')) || 0) > 0).length;

                dateStats[parsed.day] = {
                    count: data.length,
                    avgSa: Math.round(totalSa / data.length),
                    avgGame: Math.round(totalGames / data.length),
                    winRate: ((plusCount / data.length) * 100).toFixed(1),
                    totalSa: totalSa
                };
                
                monthTotalSa += totalSa;
                monthTotalGames += totalGames;
                monthTotalCount += data.length;
                monthPlusCount += plusCount;
                daysWithData++;
                
                if (parsed.day <= 15) {
                    firstHalfSa += totalSa;
                } else {
                    secondHalfSa += totalSa;
                }
            }
        }
    }
    
    renderMonthSummary(monthTotalSa, firstHalfSa, secondHalfSa, monthTotalGames, monthTotalCount, monthPlusCount, daysWithData);

    let html = '';

    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const stats = dateStats[day];
        const dayOfWeek = (startDayOfWeek + day - 1) % 7;
        const dateKey = `${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}`;
        const events = getEventsForDate(dateKey);
        const displayableEvents = events.filter(e => hasEventOrPerformers(e));
        const matchesFilter = dateMatchesCalendarFilter(dateKey);
        const recommendations = getRecommendationsForDate(dateKey);

        let dayClass = 'calendar-day';
        if (dayOfWeek === 0) dayClass += ' sunday';
        if (dayOfWeek === 6) dayClass += ' saturday';
        if (stats) dayClass += ' has-data clickable';
        if (displayableEvents.length > 0) dayClass += ' has-event';
        if (!matchesFilter) dayClass += ' filtered-out';

        const clickHandler = stats ? `onclick="navigateToDailyData('${dateKey}')"` : '';
        const titleAttr = stats ? `title="クリックで日別データを表示"` : '';

        html += `<div class="${dayClass}" ${clickHandler} ${titleAttr}>`;
        html += `<div class="day-number">${day}</div>`;

        // イベントバッジ
        if (displayableEvents.length > 0) {
            html += `<div class="event-badges">${renderCalendarEventBadges(events)}</div>`;
        }
        
        // 週間おすすめバッジ
        if (recommendations.length > 0) {
            html += `<div class="weekly-rec-badges">${renderWeeklyRecommendationBadges(recommendations)}</div>`;
        }

        // 統計データ
        if (stats) {
            const avgSaClass = stats.avgSa > 0 ? 'plus' : stats.avgSa < 0 ? 'minus' : '';
            const totalSaClass = stats.totalSa > 0 ? 'plus' : stats.totalSa < 0 ? 'minus' : '';
            const avgSaWidth = Math.min(Math.abs(stats.avgSa) / 1000 * 100, 100);
            const avgGameWidth = Math.min(stats.avgGame / 8000 * 100, 100);
            const winRateWidth = Math.min(parseFloat(stats.winRate) / 75 * 100, 100);
            const totalSaWidth = Math.min(Math.abs(stats.totalSa) / 250000 * 100, 100);

            html += `
                <div class="histogram">
                    <div class="bar-row">
                        <span class="bar-label">差枚</span>
                        <div class="bar-track">
                            <div class="bar bar-avg-sa ${avgSaClass}" style="width: ${avgSaWidth}%"></div>
                        </div>
                        <span class="bar-value ${avgSaClass}">${stats.avgSa >= 0 ? '+' : ''}${stats.avgSa.toLocaleString()}</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">G数</span>
                        <div class="bar-track">
                            <div class="bar bar-avg-game" style="width: ${avgGameWidth}%"></div>
                        </div>
                        <span class="bar-value">${stats.avgGame.toLocaleString()}</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">勝率</span>
                        <div class="bar-track">
                            <div class="bar bar-win-rate" style="width: ${winRateWidth}%"></div>
                        </div>
                        <span class="bar-value">${stats.winRate}%</span>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">総差</span>
                        <div class="bar-track">
                            <div class="bar bar-total-sa ${totalSaClass}" style="width: ${totalSaWidth}%"></div>
                        </div>
                        <span class="bar-value ${totalSaClass}">${stats.totalSa >= 0 ? '+' : ''}${(stats.totalSa / 1000).toFixed(0)}k</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
    }

    container.innerHTML = html;
}

/**
 * 月間サマリーを表示
 */
function renderMonthSummary(totalSa, firstHalfSa, secondHalfSa, totalGames, totalCount, plusCount, daysWithData) {
    const existingSummary = document.getElementById('calendarMonthSummary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    const calendarHeader = document.querySelector('.calendar-header');
    if (!calendarHeader) return;
    
    const totalSaClass = totalSa > 0 ? 'plus' : totalSa < 0 ? 'minus' : '';
    const firstHalfClass = firstHalfSa > 0 ? 'plus' : firstHalfSa < 0 ? 'minus' : '';
    const secondHalfClass = secondHalfSa > 0 ? 'plus' : secondHalfSa < 0 ? 'minus' : '';
    
    const mechRate = totalGames > 0 ? calculateMechanicalRate(totalGames, totalSa) : null;
    const mechRateText = formatMechanicalRate(mechRate);
    const mechRateClass = getMechanicalRateClass(mechRate);
    
    const winRate = totalCount > 0 ? ((plusCount / totalCount) * 100).toFixed(1) : '0.0';
    
    const summaryHtml = `
        <div id="calendarMonthSummary" class="calendar-month-summary">
            <div class="month-summary-item main">
                <span class="summary-label">月間合計</span>
                <span class="summary-value ${totalSaClass}">${totalSa >= 0 ? '+' : ''}${totalSa.toLocaleString()}枚</span>
            </div>
            <div class="month-summary-divider"></div>
            <div class="month-summary-item">
                <span class="summary-label">上旬 (1〜15日)</span>
                <span class="summary-value ${firstHalfClass}">${firstHalfSa >= 0 ? '+' : ''}${firstHalfSa.toLocaleString()}</span>
            </div>
            <div class="month-summary-item">
                <span class="summary-label">下旬 (16日〜)</span>
                <span class="summary-value ${secondHalfClass}">${secondHalfSa >= 0 ? '+' : ''}${secondHalfSa.toLocaleString()}</span>
            </div>
            <div class="month-summary-divider"></div>
            <div class="month-summary-item">
                <span class="summary-label">機械割</span>
                <span class="summary-value ${mechRateClass}">${mechRateText}</span>
            </div>
            <div class="month-summary-item">
                <span class="summary-label">勝率</span>
                <span class="summary-value">${winRate}%</span>
            </div>
            <div class="month-summary-item">
                <span class="summary-label">データ</span>
                <span class="summary-value">${daysWithData}日</span>
            </div>
        </div>
    `;
    
    calendarHeader.insertAdjacentHTML('afterend', summaryHtml);
}

function changeCalendarMonth(delta) {
    calendarMonth += delta;
    if (calendarMonth > 12) {
        calendarMonth = 1;
        calendarYear++;
    } else if (calendarMonth < 1) {
        calendarMonth = 12;
        calendarYear--;
    }
    renderCalendar();
}

function setupCalendarEventListeners() {
    document.getElementById('prevMonth')?.addEventListener('click', () => changeCalendarMonth(-1));
    document.getElementById('nextMonth')?.addEventListener('click', () => changeCalendarMonth(1));
}
