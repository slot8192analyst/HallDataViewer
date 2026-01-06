// ===================
// 日別データタブ
// ===================
async function filterAndRender() {
    const sortedFiles = sortFilesByDate(CSV_FILES, true);
    const currentFile = sortedFiles[currentDateIndex];
    if (!currentFile) return;

    let data = await loadCSV(currentFile);
    if (!data) {
        document.getElementById('summary').innerHTML = 'データがありません';
        return;
    }

    data = [...data];

    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('sortBy')?.value || '';

    // 検索フィルター
    if (searchTerm) {
        data = data.filter(row =>
            (row['機種名'] || '').toLowerCase().includes(searchTerm) ||
            (row['台番号'] || '').toLowerCase().includes(searchTerm)
        );
    }

    // 差枚フィルター
    const saFilterType = document.getElementById('saFilterType')?.value;
    const saFilterValue = document.getElementById('saFilterValue')?.value;
    if (saFilterType && saFilterValue) {
        const val = parseInt(saFilterValue);
        if (saFilterType === 'gte') {
            data = data.filter(row => (parseInt(row['差枚']) || 0) >= val);
        } else if (saFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['差枚']) || 0) <= val);
        }
    }

    // G数フィルター
    const gameFilterType = document.getElementById('gameFilterType')?.value;
    const gameFilterValue = document.getElementById('gameFilterValue')?.value;
    if (gameFilterType && gameFilterValue) {
        const val = parseInt(gameFilterValue);
        if (gameFilterType === 'gte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) >= val);
        } else if (gameFilterType === 'lte') {
            data = data.filter(row => (parseInt(row['G数']) || 0) <= val);
        }
    }

    // 台番号末尾フィルター
    const unitSuffixFilter = document.getElementById('unitSuffixFilter')?.value;
    if (unitSuffixFilter !== '' && unitSuffixFilter !== undefined) {
        data = data.filter(row => {
            const unitNum = row['台番号'] || '';
            // 台番号から数字のみを抽出して末尾を取得
            const numOnly = unitNum.replace(/\D/g, '');
            if (numOnly.length === 0) return false;
            const lastDigit = parseInt(numOnly.slice(-1));
            return lastDigit === parseInt(unitSuffixFilter);
        });
    }

    // ソート
    if (sortBy) {
        switch (sortBy) {
            case 'sa_desc':
                data.sort((a, b) => (parseInt(b['差枚']) || 0) - (parseInt(a['差枚']) || 0));
                break;
            case 'sa_asc':
                data.sort((a, b) => (parseInt(a['差枚']) || 0) - (parseInt(b['差枚']) || 0));
                break;
            case 'game_desc':
                data.sort((a, b) => (parseInt(b['G数']) || 0) - (parseInt(a['G数']) || 0));
                break;
        }
    }

    renderTable(data, 'data-table', 'summary');
    updateDateNav();
}

function setupDailyEventListeners() {
    document.getElementById('prevDate')?.addEventListener('click', () => {
        const sortedFiles = sortFilesByDate(CSV_FILES, true);
        if (currentDateIndex < sortedFiles.length - 1) {
            currentDateIndex++;
            filterAndRender();
        }
    });

    document.getElementById('nextDate')?.addEventListener('click', () => {
        if (currentDateIndex > 0) {
            currentDateIndex--;
            filterAndRender();
        }
    });

    document.getElementById('dateSelect')?.addEventListener('change', (e) => {
        const sortedFiles = sortFilesByDate(CSV_FILES, true);
        currentDateIndex = sortedFiles.indexOf(e.target.value);
        filterAndRender();
    });

    document.getElementById('search')?.addEventListener('input', filterAndRender);
    document.getElementById('sortBy')?.addEventListener('change', filterAndRender);
    document.getElementById('applyFilter')?.addEventListener('click', filterAndRender);
    document.getElementById('resetFilter')?.addEventListener('click', () => {
        document.getElementById('saFilterType').value = '';
        document.getElementById('saFilterValue').value = '';
        document.getElementById('gameFilterType').value = '';
        document.getElementById('gameFilterValue').value = '';
        document.getElementById('unitSuffixFilter').value = '';
        filterAndRender();
    });

    // 台番号末尾フィルターの変更時も即時反映
    document.getElementById('unitSuffixFilter')?.addEventListener('change', filterAndRender);
}
