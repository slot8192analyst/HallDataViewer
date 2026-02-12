// ===================
// サイト設定
// ===================
const SITE_CONFIG = {
    // ホール名（この3つを変更するだけ！）
    hallName: "OGIYA 磐田店",
    siteTitle: "OGIYA 磐田店 データまとめ",
    headerTitle: "📊 OGIYA 磐田店",

    // テーマ: "dark" または "light"
    theme: "dark",

    // カスタムカラー（必要な場合のみ変更）
    customColors: {
        primary: "#4a4a8a",
        accent: "#fbbf24",
    },

    // フッター（空欄で非表示）
    footerText: "",
    copyright: "",

    // ===================
    // 機種フィルタープリセット（固定）
    // ===================
    // matchMode:
    //   "partial"  = 部分一致（キーワードを含む機種すべて）
    //   "exact"    = 完全一致（リストの機種名と完全に一致するもののみ）
    //   "exclude"  = 除外方式（excludeKeywordsに部分一致する機種を除外して全機種を対象）
    machinePresets: [
        {
            id: "juggler",
            name: "ジャグラー系",
            matchMode: "partial",
            keywords: ["ジャグラー"],
        },
        {
            id: "at_main",
            name: "AT/ART主力機",
            matchMode: "exclude",
            keywords: [],
            excludeKeywords: [
                "ジャグラー",
                "ハナハナ",
                "ニューパルサー",
                "ディスクアップ",
                "バーサス",
                "ハナビ",
                "沖ドキ",
                "エヴァ",
            ],
            minCount:3,
        },
        // {
        //     id: "a_type",
        //     name: "Aタイプ",
        //     matchMode: "exact",
        //     keywords: [],
        //     machines: ["ハナハナホウオウ~天翔~", "グレートキングハナハナ"],
        // },
    ],
};

// ===================
// 設定を適用
// ===================
document.addEventListener('DOMContentLoaded', function() {
    document.title = SITE_CONFIG.siteTitle;

    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = SITE_CONFIG.headerTitle;

    if (SITE_CONFIG.theme === "light") {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    if (SITE_CONFIG.customColors.primary) {
        document.documentElement.style.setProperty('--primary-color', SITE_CONFIG.customColors.primary);
    }
    if (SITE_CONFIG.customColors.accent) {
        document.documentElement.style.setProperty('--hall-accent', SITE_CONFIG.customColors.accent);
    }
});
