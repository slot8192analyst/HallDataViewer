// ===================
// カレンダータブ（演者対応版）
// ===================

let eventData = null;
let calendarEventFilter = null;
let calendarMediaFilter = null;
let calendarPerformerFilter = null;

// イベントデータを読み込み
async function loadEventData() {
    if (eventData) return eventData;

    try {
        const response = await fetch('events.json');
        if (response.ok) {
            eventData = await response.json();
        } else {
            eventData = { events: [], mediaTypes: [], eventTypes: [], performers: [] };
        }
    } catch (e) {
        console.log('events.json not found, using empty events');
        eventData = { events: [], mediaTypes: [], eventTypes: [], performers: [] };
    }
    return eventData;
}

// 日付のイベントを取得
function getEventsForDate(dateKey) {
    if (!eventData || !eventData.events) return [];
    return eventData.events.filter(e => e.date === dateKey);
}

// イベントタイプの情報を取得
function getEventTypeInfo(typeId) {
    if (!eventData || !eventData.eventTypes) return null;
    return eventData.eventTypes.find(t => t.id === typeId);
}

// 全CSVファイルからイベント名を収集
function getAllEventNames() {
    if (!eventData || !eventData.events) return [];
    
    const eventNames = new Set();
    
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
    
    return [...eventNames].sort();
}

// イベントバッジのHTML生成
function renderEventBadges(events) {
    if (!events || events.length === 0) return '';

    const displayableEvents = events.filter(event => {
        return event.name || event.media;
    });

    if (displayableEvents.length === 0) return '';

    return displayableEvents.map(event => {
        const typeInfo = getEventTypeInfo(event.type);
        const icon = typeInfo ? typeInfo.icon : '📌';
        const color = typeInfo ? typeInfo.color : '#888';

        let displayName = '';
        if (Array.isArray(event.name)) {
            displayName = event.name.filter(n => n && n.trim() !== '').join(', ');
        } else if (event.name) {
            displayName = event.name;
        }
        if (!displayName) {
            displayName = event.media;
        }

        let performerHtml = '';
        if (event.performers && event.performers.length > 0) {
            performerHtml = `<div class="event-performers">🎤 ${event.performers.join(', ')}</div>`;
        }

        return `
            <div class="event-badge" style="background: ${color}20; border-color: ${color};" title="${displayName}${event.media ? ' (' + event.media + ')' : ''}${event.note ? ' - ' + event.note : ''}">
                <span class="event-icon">${icon}</span>
                <span class="event-name">${displayName}</span>
            </div>
            ${performerHtml}
        `;
    }).join('');
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
                <label class="multi-select-option">
                    <input type="checkbox" value="${value}" ${checked}>
                    <span class="option-label">${icon ? icon + ' ' : ''}${label}</span>
                </label>
            `;
        });

        if (filterLower && html === '') {
            html = `<div class="multi-select-no-results">該当する項目がありません</div>`;
        }

        optionsContainer.innerHTML = html;

        optionsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedValues.add(e.target.value);
                } else {
                    selectedValues.delete(e.target.value);
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

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target) && isOpen) {
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

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDropdown();
            display.focus();
        }
    });

    renderOptions();
    updateDisplay();

    return {
        getSelectedValues: () => getSelectedValues(),
        setSelectedValues: (values) => {
            selectedValues = new Set(values);
            renderOptions(searchInput?.value || '');
            updateDisplay();
        },
        updateOptions: (newOptions) => {
            currentOptions = newOptions;
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

    // イベントフィルター
    const eventOptions = [];
    
    // イベントタイプを追加
    if (eventData && eventData.eventTypes) {
        eventData.eventTypes.forEach(type => {
            eventOptions.push({ 
                value: `type:${type.id}`, 
                label: type.name,
                icon: type.icon
            });
        });
    }
    
    // イベント名を追加
    const allEventNames = getAllEventNames();
    allEventNames.forEach(name => {
        eventOptions.push({ 
            value: `name:${name}`, 
            label: name,
            icon: '📌'
        });
    });
    
    calendarEventFilter = initCalendarMultiSelect(
        'calendarEventFilter', 
        eventOptions, 
        '全イベント', 
        () => renderCalendar()
    );

    // メディアフィルター
    const mediaOptions = [];
    if (eventData && eventData.mediaTypes) {
        eventData.mediaTypes.forEach(media => {
            mediaOptions.push({ value: media, label: media });
        });
    }
    calendarMediaFilter = initCalendarMultiSelect(
        'calendarMediaFilter', 
        mediaOptions, 
        '全メディア', 
        () => renderCalendar()
    );

    // 演者フィルター
    const performerOptions = [];
    if (eventData && eventData.performers) {
        eventData.performers.forEach(performer => {
            performerOptions.push({ 
                value: performer, 
                label: performer,
                icon: '🎤'
            });
        });
    }
    calendarPerformerFilter = initCalendarMultiSelect(
        'calendarPerformerFilter', 
        performerOptions, 
        '全演者', 
        () => renderCalendar()
    );

    // リセットボタン
    document.getElementById('calendarFilterReset')?.addEventListener('click', () => {
        if (calendarEventFilter) calendarEventFilter.reset();
        if (calendarMediaFilter) calendarMediaFilter.reset();
        if (calendarPerformerFilter) calendarPerformerFilter.reset();
        renderCalendar();
    });
}

// イベントが有効かどうかをチェック
function isCalendarValidEvent(event) {
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
function hasCalendarEventOrPerformers(event) {
    if (!event) return false;
    
    const hasEvent = isCalendarValidEvent(event);
    const hasPerformers = event.performers && event.performers.length > 0;
    
    return hasEvent || hasPerformers;
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

    // フィルター値を取得
    const selectedEvents = calendarEventFilter ? calendarEventFilter.getSelectedValues() : [];
    const selectedMedia = calendarMediaFilter ? calendarMediaFilter.getSelectedValues() : [];
    const selectedPerformers = calendarPerformerFilter ? calendarPerformerFilter.getSelectedValues() : [];

    // フィルターが全て空なら全て表示
    if (selectedEvents.length === 0 && selectedMedia.length === 0 && selectedPerformers.length === 0) {
        return true;
    }

    // イベントがない日はフィルターが設定されていれば非表示
    if (events.length === 0) {
        return false;
    }

    let matchesEvent = selectedEvents.length === 0;
    let matchesMedia = selectedMedia.length === 0;
    let matchesPerformer = selectedPerformers.length === 0;

    events.forEach(event => {
        // イベントフィルターチェック
        if (selectedEvents.length > 0 && !matchesEvent) {
            for (const filter of selectedEvents) {
                if (filter.startsWith('type:')) {
                    const typeId = filter.replace('type:', '');
                    if (event.type === typeId) {
                        matchesEvent = true;
                        break;
                    }
                } else if (filter.startsWith('name:')) {
                    const eventName = filter.replace('name:', '');
                    if (eventHasName(event, eventName)) {
                        matchesEvent = true;
                        break;
                    }
                }
            }
        }

        // メディアフィルターチェック
        if (selectedMedia.length > 0 && !matchesMedia) {
            if (selectedMedia.includes(event.media)) {
                matchesMedia = true;
            }
        }

        // 演者フィルターチェック
        if (selectedPerformers.length > 0 && !matchesPerformer) {
            if (event.performers && event.performers.some(p => selectedPerformers.includes(p))) {
                matchesPerformer = true;
            }
        }
    });

    return matchesEvent && matchesMedia && matchesPerformer;
}

// カレンダー描画
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
    for (const file of CSV_FILES) {
        const parsed = parseDateFromFilename(file);
        if (parsed && parsed.year === year && parsed.month === month) {
            const data = await loadCSV(file);
            if (data) {
                const totalGames = data.reduce((sum, r) => sum + (parseInt(r['G数']) || 0), 0);
                const totalSa = data.reduce((sum, r) => sum + (parseInt(r['差枚']) || 0), 0);
                const plusCount = data.filter(r => (parseInt(r['差枚']) || 0) > 0).length;

                dateStats[parsed.day] = {
                    count: data.length,
                    avgSa: Math.round(totalSa / data.length),
                    avgGame: Math.round(totalGames / data.length),
                    winRate: ((plusCount / data.length) * 100).toFixed(1),
                    totalSa: totalSa
                };
            }
        }
    }

    let html = '';

    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const stats = dateStats[day];
        const dayOfWeek = (startDayOfWeek + day - 1) % 7;
        const dateKey = `${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}`;
        const events = getEventsForDate(dateKey);

        const displayableEvents = events.filter(e => hasCalendarEventOrPerformers(e));

        const matchesFilter = dateMatchesCalendarFilter(dateKey);

        let dayClass = 'calendar-day';
        if (dayOfWeek === 0) dayClass += ' sunday';
        if (dayOfWeek === 6) dayClass += ' saturday';
        if (stats) dayClass += ' has-data';
        if (displayableEvents.length > 0) dayClass += ' has-event';
        if (!matchesFilter) dayClass += ' filtered-out';

        html += `<div class="${dayClass}">`;
        html += `<div class="day-number">${day}</div>`;

        if (displayableEvents.length > 0) {
            html += `<div class="event-badges">${renderCalendarEventBadges(events)}</div>`;
        }

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

// カレンダー用のイベントバッジ表示（演者のみの場合も対応）
function renderCalendarEventBadges(events) {
    if (!events || events.length === 0) return '';

    const relevantEvents = events.filter(e => hasCalendarEventOrPerformers(e));
    
    if (relevantEvents.length === 0) return '';

    let html = '';
    
    relevantEvents.forEach(event => {
        if (isCalendarValidEvent(event)) {
            const typeInfo = getEventTypeInfo(event.type);
            const icon = typeInfo ? typeInfo.icon : '📌';
            const color = typeInfo ? typeInfo.color : '#888';

            let displayName = '';
            if (Array.isArray(event.name)) {
                displayName = event.name.filter(n => n && n.trim() !== '').join(', ');
            } else if (event.name && event.name.trim() !== '') {
                displayName = event.name;
            }
            if (!displayName && event.media) {
                displayName = event.media;
            }
            if (!displayName && typeInfo) {
                displayName = typeInfo.name;
            }

            if (displayName) {
                html += `
                    <div class="event-badge" style="background: ${color}20; border-color: ${color};" title="${displayName}${event.media ? ' (' + event.media + ')' : ''}${event.note ? ' - ' + event.note : ''}">
                        <span class="event-icon">${icon}</span>
                        <span class="event-name">${displayName}</span>
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
