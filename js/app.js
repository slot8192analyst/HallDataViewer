// ===================
// メイン初期化・タブ切り替え
// ===================
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
    try {
        const response = await fetch('files.json');
        CSV_FILES = await response.json();
    } catch (e) {
        console.error('files.json の読み込みに失敗しました:', e);
        document.getElementById('summary').innerHTML = 'files.json の読み込みに失敗しました';
        return;
    }

    if (CSV_FILES.length === 0) {
        document.getElementById('summary').innerHTML = 'CSVファイルがありません';
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

    await loadAllCSV();
    populateDateSelectors();
    populateMachineFilters();

    // 各タブのイベントリスナーを設定
    setupTabEventListeners();
    setupDailyEventListeners();
    setupTrendEventListeners();
    setupStatsEventListeners();
    setupCalendarEventListeners();

    filterAndRender();
}

document.addEventListener('DOMContentLoaded', init);
