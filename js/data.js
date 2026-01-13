// ===================
// データ読み込み・管理
// ===================

// HallData.store への参照（utils.js で定義済み）
// 後方互換性のためのエイリアス
var CSV_FILES = [];
var dataCache = {};
var headers = [];
var allMachines = new Set();

// 各タブで使用するグローバル状態（後方互換性）
var currentDateIndex = 0;
var selectedTrendDates = [];
var statsMode = 'daily';
var statsSubTab = 'machine';
var calendarYear = new Date().getFullYear();
var calendarMonth = new Date().getMonth() + 1;

// ストアとの同期を保つためのプロキシ関数
function syncToStore() {
    HallData.store.files = CSV_FILES;
    HallData.store.cache = dataCache;
    HallData.store.headers = headers;
    HallData.store.machines = allMachines;
}

function syncFromStore() {
    CSV_FILES = HallData.store.files;
    dataCache = HallData.store.cache;
    headers = HallData.store.headers;
    allMachines = HallData.store.machines;
}

// 読み込み状態管理
var loadingState = HallData.store.loadingState;

// ===================
// ローディング制御
// ===================

function updateLoadingProgress(loaded, total, status) {
    var progressBar = document.getElementById('loadingProgressBar');
    var statusEl = document.getElementById('loadingStatus');
    
    if (progressBar) {
        var percent = total > 0 ? (loaded / total) * 100 : 0;
        progressBar.style.width = percent + '%';
    }
    
    if (statusEl && status) {
        statusEl.textContent = status;
    }
}

function hideLoadingScreen() {
    var loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

function showBackgroundLoadingIndicator(loaded, total) {
    var indicator = document.getElementById('background-loading-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'background-loading-indicator';
        indicator.className = 'background-loading-indicator';
        indicator.innerHTML = 
            '<div class="mini-spinner"></div>' +
            '<div class="loading-info">' +
                '<div class="loading-title">過去データを読み込み中...</div>' +
                '<div class="loading-detail" id="bg-loading-detail">' + loaded + '/' + total + ' 完了</div>' +
            '</div>';
        document.body.appendChild(indicator);
    } else {
        var detail = document.getElementById('bg-loading-detail');
        if (detail) {
            detail.textContent = loaded + '/' + total + ' 完了';
        }
    }
}

function hideBackgroundLoadingIndicator() {
    var indicator = document.getElementById('background-loading-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
        setTimeout(function() {
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
function loadFilesList() {
    return fetch('files.json')
        .then(function(response) {
            return response.json();
        })
        .then(function(filesData) {
            return filesData.monthly || [];
        })
        .catch(function(e) {
            console.error('files.json の読み込みに失敗:', e);
            return [];
        });
}

/**
 * 月別JSONファイルを読み込んでキャッシュに展開
 */
function loadMonthlyJSON(filepath) {
    return fetch(filepath)
        .then(function(response) {
            if (!response.ok) {
                console.warn('月別JSON読み込み失敗: ' + filepath);
                return { success: false, days: 0 };
            }
            return response.json().then(function(monthlyData) {
                var daysLoaded = 0;
                
                // 各日付のデータをキャッシュに展開
                Object.entries(monthlyData).forEach(function(entry) {
                    var dateKey = entry[0];
                    var records = entry[1];
                    var filename = 'data/' + dateKey + '.csv';
                    
                    if (headers.length === 0 && records.length > 0) {
                        headers = Object.keys(records[0]);
                    }
                    
                    dataCache[filename] = records;
                    
                    if (CSV_FILES.indexOf(filename) === -1) {
                        CSV_FILES.push(filename);
                    }
                    
                    records.forEach(function(row) {
                        if (row['機種名']) {
                            allMachines.add(row['機種名']);
                        }
                    });
                    
                    daysLoaded++;
                });
                
                // ストアと同期
                syncToStore();
                
                console.log('月別JSON読み込み完了: ' + filepath + ' (' + daysLoaded + '日分)');
                return { success: true, days: daysLoaded };
            });
        })
        .catch(function(e) {
            console.error('月別JSON読み込みエラー: ' + filepath, e);
            return { success: false, days: 0 };
        });
}

/**
 * 複数のJSONファイルを並列で読み込み
 */
function loadMultipleJSONParallel(filepaths, onProgress) {
    var results = [];
    var completed = 0;
    var concurrency = 3;
    
    function loadBatch(startIndex) {
        if (startIndex >= filepaths.length) {
            return Promise.resolve(results);
        }
        
        var batch = filepaths.slice(startIndex, startIndex + concurrency);
        var batchPromises = batch.map(function(filepath) {
            return loadMonthlyJSON(filepath);
        });
        
        return Promise.all(batchPromises).then(function(batchResults) {
            results = results.concat(batchResults);
            completed += batch.length;
            
            if (onProgress) {
                onProgress(completed, filepaths.length);
            }
            
            return loadBatch(startIndex + concurrency);
        });
    }
    
    return loadBatch(0);
}

/**
 * キャッシュからデータを取得
 */
function loadCSV(filename) {
    if (dataCache[filename]) {
        return Promise.resolve(dataCache[filename]);
    }
    return Promise.resolve(null);
}

/**
 * 初期データ読み込み（最新月のみ）
 */
function loadInitialData() {
    return loadFilesList().then(function(monthlyFiles) {
        if (monthlyFiles.length === 0) {
            console.warn('読み込むファイルがありません');
            return false;
        }
        
        loadingState.totalFiles = monthlyFiles.length;
        
        console.log('初期データ読み込み開始...');
        console.log('  月別JSON: ' + monthlyFiles.length + 'ファイル');
        
        updateLoadingProgress(0, 100, '最新データを読み込み中...');
        
        var startTime = performance.now();
        
        // 位置データを先に読み込み
        updateLoadingProgress(5, 100, '位置データを読み込み中...');
        
        return loadPositionData().then(function() {
            // 最新月（最大2ヶ月分）を読み込み
            var initialFiles = monthlyFiles.slice(0, 2);
            var loaded = 0;
            
            function loadNext(index) {
                if (index >= initialFiles.length) {
                    return Promise.resolve();
                }
                
                var file = initialFiles[index];
                return loadMonthlyJSON(file).then(function() {
                    loaded++;
                    var progress = 10 + (loaded / initialFiles.length) * 90;
                    updateLoadingProgress(progress, 100, file.split('/').pop() + ' 読み込み完了');
                    return loadNext(index + 1);
                });
            }
            
            return loadNext(0).then(function() {
                // 日付順にソート
                CSV_FILES = sortFilesByDate(CSV_FILES, true);
                syncToStore();
                
                var endTime = performance.now();
                console.log('初期データ読み込み完了: ' + ((endTime - startTime) / 1000).toFixed(2) + '秒');
                console.log('  読み込み日数: ' + CSV_FILES.length + '日');
                console.log('  機種数: ' + allMachines.size + '機種');
                
                loadingState.initialLoadComplete = true;
                loadingState.loadedFiles = initialFiles.length;
                
                return true;
            });
        });
    });
}

/**
 * 残りのデータをバックグラウンドで読み込み
 */
function loadRemainingDataInBackground() {
    return loadFilesList().then(function(monthlyFiles) {
        // 最初の2ファイルは既に読み込み済み
        var remainingFiles = monthlyFiles.slice(2);
        
        if (remainingFiles.length === 0) {
            loadingState.fullLoadComplete = true;
            console.log('全データ読み込み済み');
            return;
        }
        
        console.log('バックグラウンド読み込み開始: ' + remainingFiles.length + 'ファイル');
        
        showBackgroundLoadingIndicator(0, remainingFiles.length);
        
        var startTime = performance.now();
        
        // 並列で読み込み
        return loadMultipleJSONParallel(remainingFiles, function(loaded, total) {
            loadingState.loadedFiles = 2 + loaded;
            showBackgroundLoadingIndicator(loaded, total);
        }).then(function() {
            // 日付順にソート
            CSV_FILES = sortFilesByDate(CSV_FILES, true);
            syncToStore();
            
            var endTime = performance.now();
            console.log('バックグラウンド読み込み完了: ' + ((endTime - startTime) / 1000).toFixed(2) + '秒');
            console.log('  総日数: ' + CSV_FILES.length + '日');
            console.log('  機種数: ' + allMachines.size + '機種');
            
            loadingState.fullLoadComplete = true;
            
            hideBackgroundLoadingIndicator();
            
            // UIを更新
            refreshUIAfterBackgroundLoad();
        });
    });
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
    var activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        var tabName = activeTab.dataset.tab;
        
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
function loadAllData() {
    return loadInitialData();
}

/**
 * 後方互換性のための関数
 */
function loadAllCSV() {
    return loadAllData();
}

// UI初期化（イベント情報付き）
function populateDateSelectors() {
    return loadEventData().then(function() {
        var sortedFiles = sortFilesByDate(CSV_FILES, true);

        // 日別データタブの日付セレクター
        var dateSelect = document.getElementById('dateSelect');
        if (dateSelect) {
            var currentValue = dateSelect.value;
            dateSelect.innerHTML = sortedFiles.map(function(f, index) {
                var isSelected = currentValue ? f === currentValue : index === 0;
                return createDateSelectOption(f, isSelected);
            }).join('');
        }

        // 統計タブの日付セレクター
        var statsDateSelect = document.getElementById('statsDateSelect');
        if (statsDateSelect) {
            var currentStatsValue = statsDateSelect.value;
            statsDateSelect.innerHTML = sortedFiles.map(function(f, index) {
                var isSelected = currentStatsValue ? f === currentStatsValue : index === 0;
                return createDateSelectOption(f, isSelected);
            }).join('');
        }

        // 期間セレクター
        var periodStart = document.getElementById('statsPeriodStart');
        var periodEnd = document.getElementById('statsPeriodEnd');
        
        if (periodEnd) {
            var currentEndValue = periodEnd.value;
            periodEnd.innerHTML = sortedFiles.map(function(f, index) {
                var isSelected = currentEndValue ? f === currentEndValue : index === 0;
                return createDateSelectOption(f, isSelected);
            }).join('');
        }

        if (periodStart) {
            var currentStartValue = periodStart.value;
            var startIdx = Math.min(6, sortedFiles.length - 1);
            periodStart.innerHTML = sortedFiles.map(function(f, index) {
                var isSelected = currentStartValue ? f === currentStartValue : index === startIdx;
                return createDateSelectOption(f, isSelected);
            }).join('');
        }
    });
}

function populateMachineFilters() {
    var sortedMachines = Array.from(allMachines).sort();

    var statsMachineSelect = document.getElementById('statsMachineSelect');
    if (statsMachineSelect) {
        var currentValue = statsMachineSelect.value;
        statsMachineSelect.innerHTML = '<option value="">全機種</option>' +
            sortedMachines.map(function(m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
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
    var sortedFiles = sortFilesByDate(CSV_FILES, true);
    var currentFile = sortedFiles[currentDateIndex];

    var label = document.getElementById('currentDateLabel');
    if (label && currentFile) {
        label.textContent = formatDate(currentFile);
    }

    var dateSelect = document.getElementById('dateSelect');
    if (dateSelect && currentFile) {
        dateSelect.value = currentFile;
    }

    var prevBtn = document.getElementById('prevDate');
    var nextBtn = document.getElementById('nextDate');
    if (prevBtn) prevBtn.disabled = currentDateIndex >= sortedFiles.length - 1;
    if (nextBtn) nextBtn.disabled = currentDateIndex <= 0;
}
