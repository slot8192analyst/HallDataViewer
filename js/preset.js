// ===================
// 機種フィルタープリセット管理
// ===================

var MachinePreset = (function() {
    var STORAGE_KEY = 'machineFilterPresets';

    // ========== ストレージ ==========

    function loadUserPresets() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('プリセット読み込みエラー:', e);
            return [];
        }
    }

    // 旧 saveUserPresets は、書き込み側（ユーザープリセットCRUD）の削除に伴い
    // 呼び出し元が無くなったため削除。localStorage への書き込みは現状発生しない。

    // ========== 固定プリセット ==========

    function getBuiltinPresets() {
        if (SITE_CONFIG && Array.isArray(SITE_CONFIG.machinePresets)) {
            return SITE_CONFIG.machinePresets.map(function(p) {
                return {
                    id: p.id,
                    name: p.name,
                    matchMode: p.matchMode || 'partial',
                    keywords: p.keywords || [],
                    machines: p.machines || [],
                    excludeKeywords: p.excludeKeywords || [],
                    excludeMachines: p.excludeMachines || [],   // 完全一致で除外
                    minCount: p.minCount || 0,
                    maxCount: p.maxCount || 0,                   // 台数上限
                    type: 'builtin'
                };
            });
        }
        return [];
    }

    // ========== 全プリセット取得 ==========

    function getAll() {
        var builtins = getBuiltinPresets();
        var users = loadUserPresets().map(function(p) {
            p.type = 'user';
            return p;
        });
        return builtins.concat(users);
    }

    // ========== マッチング ==========

    /**
     * プリセットに該当する機種名リストを返す
     * @param {Object} preset - プリセット定義
     * @param {Array} availableMachines - 文字列配列またはオブジェクト配列
     * @param {Array} [machineOptions] - { value, label, count } のオプション配列（台数情報用）
     * @returns {Array} マッチした機種名（文字列の配列）
     */
    function resolve(preset, availableMachines, machineOptions) {
        if (!preset || !Array.isArray(availableMachines)) return [];

        // 機種名リストを文字列配列に正規化
        var nameList = availableMachines.map(function(m) {
            if (typeof m === 'object' && m !== null) {
                return m.value || m.label || m.name || '';
            }
            return String(m);
        });

        // 台数マップを構築（machineOptions優先、なければavailableMachinesから）
        var countMap = {};
        if (machineOptions && Array.isArray(machineOptions)) {
            machineOptions.forEach(function(opt) {
                var name = typeof opt === 'object' ? (opt.value || opt.label || '') : '';
                var count = typeof opt === 'object' ? (opt.count || 0) : 0;
                if (name) countMap[name] = count;
            });
        } else {
            availableMachines.forEach(function(m) {
                if (typeof m === 'object' && m !== null) {
                    var name = m.value || m.label || m.name || '';
                    if (name) countMap[name] = m.count || 0;
                }
            });
        }

        var matched;

        // exclude モード
        if (preset.matchMode === 'exclude') {
            matched = resolveExclude(preset, nameList);
        } else {
            matched = resolveInclude(preset, nameList);
        }

        // minCount / maxCount フィルター（選択中の日の台数で判定）
        if ((preset.minCount && preset.minCount > 0) ||
            (preset.maxCount && preset.maxCount > 0)) {
            var minC = preset.minCount || 0;
            var maxC = preset.maxCount || Infinity;
            matched = matched.filter(function(name) {
                var c = countMap[name] || 0;
                return c >= minC && c <= maxC;
            });
        }

        return matched;
    }

    /**
     * partial / exact のマッチング
     */
    function resolveInclude(preset, nameList) {
        var matched = new Set();

        // exact: machines配列に完全一致
        if (preset.machines && preset.machines.length > 0) {
            var machineSet = new Set(preset.machines);
            nameList.forEach(function(name) {
                if (machineSet.has(name)) {
                    matched.add(name);
                }
            });
        }

        // partial: keywordsに部分一致
        if (preset.keywords && preset.keywords.length > 0) {
            nameList.forEach(function(name) {
                if (matched.has(name)) return;
                var mLower = name.toLowerCase();
                var hit = preset.keywords.some(function(kw) {
                    return mLower.indexOf(kw.toLowerCase()) !== -1;
                });
                if (hit) {
                    matched.add(name);
                }
            });
        }

        return Array.from(matched);
    }

    /**
     * 除外方式のマッチング
     */
    function resolveExclude(preset, nameList) {
        var excludeKws = preset.excludeKeywords || [];
        var excludeMachines = preset.excludeMachines || [];   // 完全一致除外リスト

        // ベースとなる機種リストを決定
        var baseList;
        if (preset.keywords && preset.keywords.length > 0) {
            baseList = nameList.filter(function(name) {
                var mLower = name.toLowerCase();
                return preset.keywords.some(function(kw) {
                    return mLower.indexOf(kw.toLowerCase()) !== -1;
                });
            });
        } else {
            baseList = nameList.slice();
        }

        // 完全一致除外（excludeMachines）
        if (excludeMachines.length > 0) {
            var exactSet = new Set(excludeMachines);
            baseList = baseList.filter(function(name) {
                return !exactSet.has(name);
            });
        }

        // 部分一致除外（excludeKeywords）
        if (excludeKws.length === 0) return baseList;
        return baseList.filter(function(name) {
            var mLower = name.toLowerCase();
            return !excludeKws.some(function(ekw) {
                return mLower.indexOf(ekw.toLowerCase()) !== -1;
            });
        });
    }

    // 旧・ユーザープリセットCRUD（addUserPreset / removeUserPreset /
    // renameUserPreset / updateUserPresetMachines）は、機種フィルターの
    // 💾保存・⚙️管理ボタン廃止に伴い呼び出し元が無くなったため削除。
    // 保存済みプリセットの読み出し（getUserPresets）のみ継続利用する。

    // ========== 公開API ==========

    return {
        getAll: getAll,
        getBuiltinPresets: getBuiltinPresets,
        getUserPresets: loadUserPresets,
        resolve: resolve
    };
})();
