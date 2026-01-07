// ===================
// サイト設定
// ===================
const SITE_CONFIG = {
    // ホール名（この3つを変更するだけ！）
    hallName: "オーギヤ磐田店",
    siteTitle: "オーギヤ磐田店 データまとめ",
    headerTitle: "📊 オーギヤ磐田店",

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
