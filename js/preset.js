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

    function saveUserPresets(presets) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
        } catch (e) {
            console.warn('プリセット保存エラー:', e);
        }
    }

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
                    minCount: p.minCount || 0,
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

        // minCount フィルター
        if (preset.minCount && preset.minCount > 0) {
            var minCount = preset.minCount;
            matched = matched.filter(function(name) {
                return (countMap[name] || 0) >= minCount;
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

        if (excludeKws.length === 0) return baseList;

        // excludeKeywordsで除外
        return baseList.filter(function(name) {
            var mLower = name.toLowerCase();
            return !excludeKws.some(function(ekw) {
                return mLower.indexOf(ekw.toLowerCase()) !== -1;
            });
        });
    }

    // ========== ユーザープリセットCRUD ==========

    function addUserPreset(name, machines) {
        if (!name || !machines || machines.length === 0) return null;

        var presets = loadUserPresets();
        var id = 'user_' + Date.now();

        var newPreset = {
            id: id,
            name: name,
            matchMode: 'exact',
            keywords: [],
            machines: machines.slice(),
            excludeKeywords: [],
            minCount: 0,
            type: 'user'
        };

        presets.push(newPreset);
        saveUserPresets(presets);

        return newPreset;
    }

    function removeUserPreset(id) {
        var presets = loadUserPresets();
        var filtered = presets.filter(function(p) { return p.id !== id; });

        if (filtered.length !== presets.length) {
            saveUserPresets(filtered);
            return true;
        }
        return false;
    }

    function renameUserPreset(id, newName) {
        if (!newName) return false;

        var presets = loadUserPresets();
        var found = false;

        presets.forEach(function(p) {
            if (p.id === id) {
                p.name = newName;
                found = true;
            }
        });

        if (found) {
            saveUserPresets(presets);
        }
        return found;
    }

    function updateUserPresetMachines(id, machines) {
        if (!machines) return false;

        var presets = loadUserPresets();
        var found = false;

        presets.forEach(function(p) {
            if (p.id === id) {
                p.machines = machines.slice();
                found = true;
            }
        });

        if (found) {
            saveUserPresets(presets);
        }
        return found;
    }

    // ========== 公開API ==========

    return {
        getAll: getAll,
        getBuiltinPresets: getBuiltinPresets,
        getUserPresets: loadUserPresets,
        resolve: resolve,
        add: addUserPreset,
        remove: removeUserPreset,
        rename: renameUserPreset,
        updateMachines: updateUserPresetMachines
    };
})();
