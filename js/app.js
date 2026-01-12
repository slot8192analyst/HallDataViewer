// ===================
// メイン初期化・タブ切り替え
// ===================

// フィルターパネルのトグル（汎用関数）
function setupFilterPanelToggle(toggleId, contentId) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    
    if (!toggle || !content) return;
    
    toggle.addEventListener('click', () => {
        const icon = toggle.querySelector('.toggle-icon');
        const isOpen = content.classList.contains('open');

        if (isOpen) {
            content.classList.remove('open');
            toggle.classList.remove('open');
            if (icon) icon.textContent = '▼';
        } else {
            content.classList.add('open');
            toggle.classList.add('open');
            if (icon) icon.textContent = '▲';
        }
    });
}

function setupTabEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');

            if (btn.dataset.tab === 'calendar') {
                renderCalendar();
            } else if (btn.dataset.tab === 'trend') {
                loadTrendData();
            } else if (btn.dataset.tab === 'stats') {
                showStats();
            }
        });
    });
}

async function init() {
    console.log('アプリケーション初期化開始...');
    
    const success = await loadInitialData();
    
    if (!success || CSV_FILES.length === 0) {
        hideLoadingScreen();
        document.getElementById('summary').innerHTML = 'データの読み込みに失敗しました';
        return;
    }

    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const latestParsed = parseDateFromFilename(sortedFiles[0]);
    if (latestParsed) {
        calendarYear = latestParsed.year;
        calendarMonth = latestParsed.month;
    } else {
        const now = new Date();
        calendarYear = now.getFullYear();
        calendarMonth = now.getMonth() + 1;
    }

    // イベントデータを先に読み込む
    await loadEventData();

    populateDateSelectors();
    populateMachineFilters();

    setupTabEventListeners();
    setupDailyEventListeners();
    setupTrendEventListeners();
    setupStatsEventListeners();
    setupCalendarEventListeners();

    setupFilterPanelToggle('trendFilterToggle', 'trendFilterContent');

    updateLoadingProgress(100, 100, '表示準備中...');
    
    // 日付セレクトボックスをイベント付きで初期化
    await initDateSelectWithEvents();
    
    await filterAndRender();
    
    hideLoadingScreen();
    
    console.log('初期表示完了');
    
    setTimeout(() => {
        loadRemainingDataInBackground();
    }, 500);
}

document.addEventListener('DOMContentLoaded', init);
