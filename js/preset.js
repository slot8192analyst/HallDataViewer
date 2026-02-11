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
     * @param {Array} availableMachines - 現在利用可能な機種名リスト
     * @returns {Array} マッチした機種名
     */
    function resolve(preset, availableMachines) {
        if (!preset || !Array.isArray(availableMachines)) return [];

        var matched = new Set();

        // exact: machines配列に完全一致
        if (preset.machines && preset.machines.length > 0) {
            var machineSet = new Set(preset.machines);
            availableMachines.forEach(function(m) {
                if (machineSet.has(m)) {
                    matched.add(m);
                }
            });
        }

        // partial: keywordsに部分一致
        if (preset.keywords && preset.keywords.length > 0) {
            availableMachines.forEach(function(m) {
                var mLower = m.toLowerCase();
                preset.keywords.forEach(function(kw) {
                    if (mLower.indexOf(kw.toLowerCase()) !== -1) {
                        matched.add(m);
                    }
                });
            });
        }

        // exactモードでmachinesのみの場合
        if (preset.matchMode === 'exact' && (!preset.keywords || preset.keywords.length === 0)) {
            // machinesだけで判定済み
        }

        return Array.from(matched);
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
