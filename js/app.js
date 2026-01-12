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
    
    // 初期データ読み込み（最新月のみ）
    const success = await loadInitialData();
    
    if (!success || CSV_FILES.length === 0) {
        hideLoadingScreen();
        document.getElementById('summary').innerHTML = 'データの読み込みに失敗しました';
        return;
    }

    // カレンダーの初期年月を設定
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

    // UI初期化
    populateDateSelectors();
    populateMachineFilters();

    // 各タブのイベントリスナーを設定
    setupTabEventListeners();
    setupDailyEventListeners();
    setupTrendEventListeners();
    setupStatsEventListeners();
    setupCalendarEventListeners();

    // フィルターパネルのトグルを設定
    setupFilterPanelToggle('trendFilterToggle', 'trendFilterContent');

    // 初期表示
    updateLoadingProgress(100, 100, '表示準備中...');
    
    await filterAndRender();
    
    // ローディング画面を非表示
    hideLoadingScreen();
    
    console.log('初期表示完了');
    
    // バックグラウンドで残りのデータを読み込み
    setTimeout(() => {
        loadRemainingDataInBackground();
    }, 500);
}

document.addEventListener('DOMContentLoaded', init);
