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
async function loadCSV(filename) {
    if (dataCache[filename]) {
        return dataCache[filename];
    }

    try {
        const response = await fetch(filename);
        if (!response.ok) return null;

        const text = await response.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return null;

        if (headers.length === 0) {
            headers = lines[0].split(',').map(h => h.trim());
        }

        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] || '';
            });
            data.push(row);

            if (row['機種名']) {
                allMachines.add(row['機種名']);
            }
        }

        dataCache[filename] = data;
        return data;
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
        return null;
    }
}

async function loadAllCSV() {
    for (const file of CSV_FILES) {
        await loadCSV(file);
    }
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
    const selectors = ['trendMachineFilter', 'statsMachineSelect', 'statsPeriodMachineSelect'];

    selectors.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">全機種</option>' +
                sortedMachines.map(m => `<option value="${m}">${m}</option>`).join('');
            if (currentValue) select.value = currentValue;
        }
    });
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
