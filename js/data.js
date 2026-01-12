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

// 読み込み状態管理
let loadingState = {
    initialLoadComplete: false,
    fullLoadComplete: false,
    totalFiles: 0,
    loadedFiles: 0
};

// ===================
// ローディング制御
// ===================

function updateLoadingProgress(loaded, total, status) {
    const progressBar = document.getElementById('loadingProgressBar');
    const statusEl = document.getElementById('loadingStatus');
    
    if (progressBar) {
        const percent = total > 0 ? (loaded / total) * 100 : 0;
        progressBar.style.width = `${percent}%`;
    }
    
    if (statusEl && status) {
        statusEl.textContent = status;
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

function showBackgroundLoadingIndicator(loaded, total) {
    let indicator = document.getElementById('background-loading-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'background-loading-indicator';
        indicator.className = 'background-loading-indicator';
        indicator.innerHTML = `
            <div class="mini-spinner"></div>
            <div class="loading-info">
                <div class="loading-title">過去データを読み込み中...</div>
                <div class="loading-detail" id="bg-loading-detail">${loaded}/${total} 完了</div>
            </div>
        `;
        document.body.appendChild(indicator);
    } else {
        const detail = document.getElementById('bg-loading-detail');
        if (detail) {
            detail.textContent = `${loaded}/${total} 完了`;
        }
    }
}

function hideBackgroundLoadingIndicator() {
    const indicator = document.getElementById('background-loading-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
        setTimeout(() => {
            indicator.remove();
        }, 300);
    }
}

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
            return { success: false, days: 0 };
        }
        
        const monthlyData = await response.json();
        let daysLoaded = 0;
        
        // 各日付のデータをキャッシュに展開
        for (const [dateKey, records] of Object.entries(monthlyData)) {
            const filename = `data/${dateKey}.csv`;
            
            if (headers.length === 0 && records.length > 0) {
                headers = Object.keys(records[0]);
            }
            
            dataCache[filename] = records;
            
            if (!CSV_FILES.includes(filename)) {
                CSV_FILES.push(filename);
            }
            
            records.forEach(row => {
                if (row['機種名']) {
                    allMachines.add(row['機種名']);
                }
            });
            
            daysLoaded++;
        }
        
        console.log(`月別JSON読み込み完了: ${filepath} (${daysLoaded}日分)`);
        return { success: true, days: daysLoaded };
        
    } catch (e) {
        console.error(`月別JSON読み込みエラー: ${filepath}`, e);
        return { success: false, days: 0 };
    }
}

/**
 * 複数のJSONファイルを並列で読み込み
 */
async function loadMultipleJSONParallel(filepaths, onProgress) {
    const results = [];
    let completed = 0;
    
    // 並列数を制限（同時に3ファイルまで）
    const concurrency = 3;
    
    for (let i = 0; i < filepaths.length; i += concurrency) {
        const batch = filepaths.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(filepath => loadMonthlyJSON(filepath))
        );
        
        results.push(...batchResults);
        completed += batch.length;
        
        if (onProgress) {
            onProgress(completed, filepaths.length);
        }
    }
    
    return results;
}

/**
 * キャッシュからデータを取得
 */
async function loadCSV(filename) {
    if (dataCache[filename]) {
        return dataCache[filename];
    }
    return null;
}

/**
 * 初期データ読み込み（最新月のみ）
 */
async function loadInitialData() {
    const monthlyFiles = await loadFilesList();
    
    if (monthlyFiles.length === 0) {
        console.warn('読み込むファイルがありません');
        return false;
    }
    
    loadingState.totalFiles = monthlyFiles.length;
    
    console.log('初期データ読み込み開始...');
    console.log(`  月別JSON: ${monthlyFiles.length}ファイル`);
    
    updateLoadingProgress(0, 100, '最新データを読み込み中...');
    
    const startTime = performance.now();
    
    // 最新月（最大2ヶ月分）を読み込み
    const initialFiles = monthlyFiles.slice(0, 2);
    let loaded = 0;
    
    for (const file of initialFiles) {
        await loadMonthlyJSON(file);
        loaded++;
        const progress = (loaded / initialFiles.length) * 100;
        updateLoadingProgress(progress, 100, `${file.split('/').pop()} 読み込み完了`);
    }
    
    // 日付順にソート
    CSV_FILES = sortFilesByDate(CSV_FILES, true);
    
    const endTime = performance.now();
    console.log(`初期データ読み込み完了: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    console.log(`  読み込み日数: ${CSV_FILES.length}日`);
    console.log(`  機種数: ${allMachines.size}機種`);
    
    loadingState.initialLoadComplete = true;
    loadingState.loadedFiles = initialFiles.length;
    
    return true;
}

/**
 * 残りのデータをバックグラウンドで読み込み
 */
async function loadRemainingDataInBackground() {
    const monthlyFiles = await loadFilesList();
    
    // 最初の2ファイルは既に読み込み済み
    const remainingFiles = monthlyFiles.slice(2);
    
    if (remainingFiles.length === 0) {
        loadingState.fullLoadComplete = true;
        console.log('全データ読み込み済み');
        return;
    }
    
    console.log(`バックグラウンド読み込み開始: ${remainingFiles.length}ファイル`);
    
    showBackgroundLoadingIndicator(0, remainingFiles.length);
    
    const startTime = performance.now();
    
    // 並列で読み込み
    await loadMultipleJSONParallel(remainingFiles, (loaded, total) => {
        loadingState.loadedFiles = 2 + loaded;
        showBackgroundLoadingIndicator(loaded, total);
    });
    
    // 日付順にソート
    CSV_FILES = sortFilesByDate(CSV_FILES, true);
    
    const endTime = performance.now();
    console.log(`バックグラウンド読み込み完了: ${((endTime - startTime) / 1000).toFixed(2)}秒`);
    console.log(`  総日数: ${CSV_FILES.length}日`);
    console.log(`  機種数: ${allMachines.size}機種`);
    
    loadingState.fullLoadComplete = true;
    
    hideBackgroundLoadingIndicator();
    
    // UIを更新
    refreshUIAfterBackgroundLoad();
}

/**
 * バックグラウンド読み込み完了後のUI更新
 */
function refreshUIAfterBackgroundLoad() {
    // 日付セレクターを更新
    populateDateSelectors();
    
    // 機種フィルターを更新
    populateMachineFilters();
    
    // 現在のタブに応じて更新
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const tabName = activeTab.dataset.tab;
        
        if (tabName === 'trend') {
            // トレンドタブの機種フィルターを更新
            if (typeof initTrendMachineFilter === 'function') {
                initTrendMachineFilter();
            }
        } else if (tabName === 'stats') {
            // 統計タブのフィルターを更新
            if (typeof updateStatsMachineFilter === 'function') {
                updateStatsMachineFilter();
            }
        } else if (tabName === 'calendar') {
            // カレンダーを再描画
            if (typeof renderCalendar === 'function') {
                renderCalendar();
            }
        }
    }
    
    console.log('UI更新完了（バックグラウンド読み込み後）');
}

/**
 * 全データを読み込み（後方互換性）
 */
async function loadAllData() {
    await loadInitialData();
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
            const currentValue = select.value;
            select.innerHTML = sortedFiles.map(f =>
                `<option value="${f}">${formatDate(f)}</option>`
            ).join('');
            
            // 以前の選択値を維持
            if (currentValue && sortedFiles.includes(currentValue)) {
                select.value = currentValue;
            }
        }
    });

    if (sortedFiles.length > 0) {
        const periodEnd = document.getElementById('statsPeriodEnd');
        if (periodEnd && !periodEnd.value) {
            periodEnd.value = sortedFiles[0];
        }

        const periodStart = document.getElementById('statsPeriodStart');
        if (periodStart && !periodStart.value) {
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
