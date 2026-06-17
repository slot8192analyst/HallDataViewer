// ===================
// 非AT機種リスト
// ===================
// ジャグラー系・ハナハナ沖スロ系・アクロス系の機種一覧。
// 主力/サブ/バラエティ判定時に「完全一致で除外」する対象。
var NON_AT_MACHINES = [
    // ジャグラー系
    "ネオアイムジャグラーEX",
    "ゴーゴージャグラー3",
    "マイジャグラーV",
    "ファンキージャグラー2",
    "ジャグラーガールズ",
    // ハナハナ沖スロ系
    "スマート沖スロ ニューキングハナハナV",
    "沖ドキ!BLACK",
    "沖ドキ!DUO アンコール",
    // アクロス・BT系
    "スマスロ ハナビ",
    "スマスロ サンダーV",
    "ヱヴァンゲリヲン ～約束の扉～",
    "アレックス ブライト",
    "クレアの秘宝伝 ～はじまりの扉と太陽の石～ ボーナストリガーver.",
    "ディスクアップ ULTRAREMIX",
    "ディスクアップ2",
    "交響詩篇エウレカセブン HI-EVOLUTION ZERO TYPE‐ART",
    "不二子BT",
    "A‐SLOT+ 異世界かるてっと",
    "SHAKE BONUS TRIGGER",
    "バーサスリヴァイズ",
    "マジカルハロウィン ボーナストリガー",
    "新ハナビ",
    "戦国†恋姫",
];

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
    //   "exact"    = 完全一致（machines配列の機種名と完全一致のみ）
    //   "exclude"  = 除外方式（全機種を対象に、下記の除外条件で絞り込む）
    // 除外方式の補助:
    //   excludeKeywords  = 部分一致で除外
    //   excludeMachines  = 完全一致で除外
    // 台数フィルタ（選択中の日の設置台数で判定）:
    //   minCount = 下限（この台数以上）
    //   maxCount = 上限（この台数以下）
    machinePresets: [
        {
            id: "at_main",
            name: "主力AT機種(6台以上)",
            matchMode: "exclude",
            keywords: [],
            excludeMachines: NON_AT_MACHINES,
            minCount: 6,
        },
        {
            id: "jug_hana_oki",
            name: "ジャグ・ハナ・沖スロ",
            matchMode: "exact",
            keywords: [],
            machines: [
                "ネオアイムジャグラーEX",
                "ゴーゴージャグラー3",
                "マイジャグラーV",
                "ファンキージャグラー2",
                "ジャグラーガールズ",
                "スマート沖スロ ニューキングハナハナV",
                "沖ドキ!BLACK",
                "沖ドキ!DUO アンコール",
            ],
        },
        {
            id: "at_sub",
            name: "サブAT機種(3〜5台)",
            matchMode: "exclude",
            keywords: [],
            excludeMachines: NON_AT_MACHINES,
            minCount: 3,
            maxCount: 5,
        },
        {
            id: "variety",
            name: "バラエティ(2台以下)",
            matchMode: "exclude",
            keywords: [],
            excludeMachines: NON_AT_MACHINES,
            maxCount: 2,
        },
        {
            id: "acros",
            name: "アクロス系",
            matchMode: "exact",
            keywords: [],
            machines: [
                "スマスロ ハナビ",
                "スマスロ サンダーV",
                "ヱヴァンゲリヲン ～約束の扉～",
                "アレックス ブライト",
                "クレアの秘宝伝 ～はじまりの扉と太陽の石～ ボーナストリガーver.",
                "ディスクアップ ULTRAREMIX",
                "ディスクアップ2",
                "交響詩篇エウレカセブン HI-EVOLUTION ZERO TYPE‐ART",
                "不二子BT",
                "A‐SLOT+ 異世界かるてっと",
                "SHAKE BONUS TRIGGER",
                "バーサスリヴァイズ",
                "マジカルハロウィン ボーナストリガー",
                "新ハナビ",
                "戦国†恋姫",
            ],
        },
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
