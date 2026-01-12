// ===================
// グローバル変数
// ===================
let CSV_FILES = [];
let dataCache = {};
let headers = [];
let currentDateIndex = 0;
let allMachines = new Set();
let selectedTrendDates = [];
let statsMode = 'daily';
let statsSubTab = 'machine';
let calendarYear, calendarMonth;

// ===================
// データ読み込み
// ===================

/**
 * files.jsonを読み込み
 */
async function loadFilesList() {
    try {
        const response = await fetch('files.json');
        const filesData = await response.json();
        return filesData.monthly || [];
    } catch (e) {
        console.error('files.json の読み込みに失敗:', e);
        return [];
    }
}

/**
 * 月別JSONファイルを読み込んでキャッシュに展開
 */
async function loadMonthlyJSON(filepath) {
    try {
        const response = await fetch(filepath);
        if (!response.ok) {
            console.warn(`月別JSON読み込み失敗: ${filepath}`);
            return false;
        }
        
        const monthlyData = await response.json();
        
        // 各日付のデータをキャッシュに展開
        for (const [dateKey, records] of Object.entries(monthlyData)) {
            const filename = `data/${dateKey}.csv`; // 仮想的なファイル名（互換性のため）
            
            // ヘッダーを設定（初回のみ）
            if (headers.length === 0 && records.length > 0) {
                headers = Object.keys(records[0]);
            }
            
            // キャッシュに格納
            dataCache[filename] = records;
            
            // CSV_FILESリストに追加（重複チェック）
            if (!CSV_FILES.includes(filename)) {
                CSV_FILES.push(filename);
            }
            
            // 機種名を収集
            records.forEach(row => {
                if (row['機種名']) {
                    allMachines.add(row['機種名']);
                }
            });
        }
        
        console.log(`月別JSON読み込み完了: ${filepath} (${Object.keys(monthlyData).length}日分)`);
        return true;
        
    } catch (e) {
        console.error(`月別JSON読み込みエラー: ${filepath}`, e);
        return false;
    }
}

/**
 * キャッシュからデータを取得（互換性のため残す）
 */
async function loadCSV(filename) {
    if (dataCache[filename]) {
        return dataCache[filename];
    }
    return null;
}

/**
 * 全データを読み込み
 */
async function loadAllData() {
    const monthlyFiles = await loadFilesList();
    
    console.log('データ読み込み開始...');
    console.log(`  月別JSON: ${monthlyFiles.length}ファイル`);
    
    const startTime = performance.now();
    
    // 月別JSONを読み込み
    for (const monthlyFile of monthlyFiles) {
        await loadMonthlyJSON(monthlyFile);
    }
    
    // 日付順にソート（降順）
    CSV_FILES = sortFilesByDate(CSV_FILES, true);
    
    const endTime = performance.now();
    console.log(`データ読み込み完了: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    console.log(`  総日数: ${CSV_FILES.length}日`);
    console.log(`  機種数: ${allMachines.size}機種`);
}

/**
 * 後方互換性のための関数
 */
async function loadAllCSV() {
    await loadAllData();
}

// ===================
// UI初期化
// ===================
function populateDateSelectors() {
    const selectors = ['dateSelect', 'statsDateSelect', 'statsPeriodStart', 'statsPeriodEnd'];
    const sortedFiles = sortFilesByDate(CSV_FILES, true);

    selectors.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = sortedFiles.map(f =>
                `<option value="${f}">${formatDate(f)}</option>`
            ).join('');
        }
    });

    if (sortedFiles.length > 0) {
        currentDateIndex = 0;
        const periodEnd = document.getElementById('statsPeriodEnd');
        if (periodEnd) periodEnd.value = sortedFiles[0];

        const periodStart = document.getElementById('statsPeriodStart');
        if (periodStart) {
            const startIdx = Math.min(6, sortedFiles.length - 1);
            periodStart.value = sortedFiles[startIdx];
        }
    }
}

function populateMachineFilters() {
    const sortedMachines = [...allMachines].sort();

    const statsMachineSelect = document.getElementById('statsMachineSelect');
    if (statsMachineSelect) {
        const currentValue = statsMachineSelect.value;
        statsMachineSelect.innerHTML = '<option value="">全機種</option>' +
            sortedMachines.map(m => `<option value="${m}">${m}</option>`).join('');
        if (currentValue) statsMachineSelect.value = currentValue;
    }

    if (typeof initDailyMachineFilter === 'function') {
        initDailyMachineFilter();
    }
    if (typeof initTrendMachineFilter === 'function') {
        initTrendMachineFilter();
    }
    if (typeof updateStatsMachineFilter === 'function') {
        updateStatsMachineFilter();
    }
}

function updateDateNav() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];

    const label = document.getElementById('currentDateLabel');
    if (label && currentFile) {
        label.textContent = formatDate(currentFile);
    }

    const dateSelect = document.getElementById('dateSelect');
    if (dateSelect && currentFile) {
        dateSelect.value = currentFile;
    }

    const prevBtn = document.getElementById('prevDate');
    const nextBtn = document.getElementById('nextDate');
    if (prevBtn) prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
    if (nextBtn) nextBtn.disabled = currentDateIndex <= 0;
}
