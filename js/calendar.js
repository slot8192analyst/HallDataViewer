// ===================
// カレンダータブ（演者対応版）
// ===================

let eventData = null;
let eventFilter = '';
let mediaFilter = '';
let performerFilter = '';

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

    // 取材名またはメディア名があるイベントのみ表示
    const displayableEvents = events.filter(event => {
        return event.name || event.media;
    });

    if (displayableEvents.length === 0) return '';

    return displayableEvents.map(event => {
        const typeInfo = getEventTypeInfo(event.type);
        const icon = typeInfo ? typeInfo.icon : '📌';
        const color = typeInfo ? typeInfo.color : '#888';

        // 取材名（name）を優先表示、なければメディア名
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
        </div>
    `;

    // イベントタイプフィルター（イベント名も含む）
    const eventOptions = [
        { value: '', label: 'すべて' },
        { value: 'has_event', label: 'イベント/演者あり' }
    ];
    
    // イベントタイプを追加
    if (eventData && eventData.eventTypes) {
        eventData.eventTypes.forEach(type => {
            eventOptions.push({ value: `type:${type.id}`, label: `${type.icon} ${type.name}` });
        });
    }
    
    // イベント名を追加
    const allEventNames = getAllEventNames();
    if (allEventNames.length > 0) {
        eventOptions.push({ value: '', label: '──────────', disabled: true });
        allEventNames.forEach(name => {
            eventOptions.push({ value: `name:${name}`, label: `📌 ${name}` });
        });
    }
    
    initSearchableSelect('calendarEventFilter', eventOptions, 'すべて', (value) => {
        eventFilter = value;
        renderCalendar();
    });

    // メディアフィルター
    const mediaOptions = [{ value: '', label: '全メディア' }];
    if (eventData && eventData.mediaTypes) {
        eventData.mediaTypes.forEach(media => {
            mediaOptions.push({ value: media, label: media });
        });
    }
    initSearchableSelect('calendarMediaFilter', mediaOptions, '全メディア', (value) => {
        mediaFilter = value;
        renderCalendar();
    });

    // 演者フィルター
    const performerOptions = [{ value: '', label: '全演者' }];
    if (eventData && eventData.performers) {
        eventData.performers.forEach(performer => {
            performerOptions.push({ value: performer, label: `🎤 ${performer}` });
        });
    }
    initSearchableSelect('calendarPerformerFilter', performerOptions, '全演者', (value) => {
        performerFilter = value;
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

    // イベントフィルター
    if (eventFilter) {
        if (eventFilter === 'has_event') {
            // イベントまたは演者がある日
            if (!events.some(e => hasCalendarEventOrPerformers(e))) return false;
        } else if (eventFilter.startsWith('type:')) {
            const typeId = eventFilter.replace('type:', '');
            if (!events.some(e => e.type === typeId)) return false;
        } else if (eventFilter.startsWith('name:')) {
            // イベント名でフィルタ
            const eventName = eventFilter.replace('name:', '');
            if (!events.some(e => eventHasName(e, eventName))) return false;
        }
    }

    // メディアフィルター
    if (mediaFilter) {
        if (!events.some(e => e.media === mediaFilter)) return false;
    }

    // 演者フィルター
    if (performerFilter) {
        if (!events.some(e => e.performers && e.performers.includes(performerFilter))) return false;
    }

    return true;
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

        // 表示可能なイベント（有効なイベントまたは演者がいるもの）
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

        // イベントまたは演者がある場合はバッジ表示
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
        // イベント情報がある場合はイベントバッジを表示
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

        // 演者情報がある場合は演者バッジを表示
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
