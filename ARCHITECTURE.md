# ホールデータまとめ — 設計書 (ARCHITECTURE)

> **このドキュメントの目的**
> パチンコ店（ホール）のスロットデータを可視化する**静的Webサイト**の全体設計をまとめたもの。
> コードを編集する前にこのファイルだけを読めば、「どのファイルに何が書いてあるか」「どこを直せばよいか」が分かることを目指す。
> AI / 人間どちらも対象読者。**機能を追加・変更したらこのファイルも更新すること。**

最終更新: 2026-07-15（台の状態変化履歴機能を追加。converter/build_unit_history.py が data/*.json をスキャンして unit_history.json を生成し、日別タブに「状態」列（新台/増台/減台/移動バッジ・複数同時表示対応・新台期間90日で自動消滅）と「設置日数」列、テーブル下部に「最近撤去された台」セクションを追加。ヘルパーは utils.js の HallData.utils.getUnitStatus / getUnitAge / getMachineAge / getUnitDisplayStatus / getUnitDisplayStatuses。/ 2026-07-13 bottomsheet.js を追加（バッジ設定を共通ボトムシート化）。機種内バッジのロジックを改修：1台設置機種はバッジ非付与に変更、未ロード日の検知と警告表示、集計に使った日の可視化（集計内訳）を追加、集計期間を数値入力から選択式（1〜15日・iOSネイティブホイール）に変更。バッジ設定UIを DESIGN.md（DevFocus Dark）準拠に刷新。）

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| 種別 | 完全な**静的サイト**（ビルド不要・フロントはサーバー不要、ブラウザだけで動作） |
| 言語 | バニラ JavaScript (ES5寄り / モジュールバンドラなし) + HTML + CSS |
| 外部ライブラリ | [Chart.js](https://cdn.jsdelivr.net/npm/chart.js)（解析タブ・カレンダーのグラフ）、[html2canvas](https://cdn.jsdelivr.net/npm/html2canvas@1.4.1)（狙い台シートの画像出力）。いずれも CDN 読み込み |
| フォント | [Google Fonts: Inter](https://fonts.google.com/specimen/Inter)（CDN読み込み、400/500/600/700）|
| データ | `data/YYYY_MM.json`（月別の台データ）を `fetch` で読み込み。**実データはすべて JSON**（CSVファイルは存在しない） |
| 状態保存 | `localStorage` + URLクエリパラメータ（タグ・フィルター・選択日など）。狙い台シートは追加で **Cloudflare D1**（作成者ごとに端末間共有） |
| バックエンド | 基本は不要（静的サイト）。狙い台シートの共有のみ **Cloudflare Workers + D1**（`/api/aim`）、取材掲示板のみ **Cloudflare Workers + D1**（`/api/board`）を利用 |
| データ変換 | `converter/convert_csv_to_json.py`（HTML/CSV → 月別JSON、Python） |
| デザインシステム | `DESIGN.md`（DevFocus Dark）に準拠。カラー変数は `css/theme.css` で一元管理 |

### 動作の流れ（ざっくり）
1. ブラウザで `index.html` を開く（http配信が必須。`file://` ではパーシャルの fetch が失敗する）
2. `js/config.js` でホール名・テーマを設定
3. `js/app.js` の `init()` が起動 → `files.json` を見て最新2か月分のJSONを先読み → 最後に `Router.start()` を呼ぶ
4. 残りの月は**バックグラウンドで遅延ロード**（`loadRemainingDataInBackground`）
5. 起動直後は**ホーム（ターミナル）ページ**を表示。ホームのカード（または各ページの「← ホーム」ボタン）で画面遷移する。遷移はURLハッシュ（`#daily` 等）で表現され、リロードしても同じページが開く
6. 各ページのHTMLは初回アクセス時に `partials/*.html` から fetch されて挿入される（2回目以降はDOMを残したまま表示切替。状態も維持）
7. 日別ページでは、各台の「メモ」列セルをタップすると小さなメモ入力モーダル（SeatMemo.openEditor）が開き、「誰が座っていたか」「設定」をその場で記録・共有できる（旧・独立メモタブは廃止）
8. 日別ページの日付リストには、追加済み最新データの**翌日（仮想日）**が先頭に並ぶ。仮想日は差枚等が空・台番号と機種名のみ（最新実データ日を流用）で、稼働中でも当日のメモを先取りで打てる。後日その日の実データが入ると、同じ日付キーで保存されたメモがそのまま引き継がれる
9. 日別ページからは「狙い台作成」モーダルを開き、💀凹み台を区分けして1枚画像出力・クラウド共有ができる（`aim.js`）
10. 取材ページ（tenun/ougi/zombie）および取材ハブ（promotion）では、各ページに**取材掲示板**（`board.js`）が表示され、投稿・編集・削除が可能。`board.js` は `aim.js` と同じ作成者名（`localStorage('aimSheetAuthor')`）を共用する

---

## 2. ディレクトリ構成

```
webapp/
├── index.html                  … ガワ（ローディング・ホーム・各ページの空コンテナ）。各ページ実体は partials/ にある
├── files.json                  … 読み込む月別JSONのリスト（新しい月→古い月の順）
├── events.json                 … イベント/取材/新台情報（カレンダー・日付セレクタで使用）
├── unit_history.json           … 台の状態変化履歴（build_unit_history.py が生成）。新台/増台/減台/移動/撤去の履歴と台番号ごとの機種変遷
├── prompt.txt / README.md      … メモ書き
├── DESIGN.md                   … デザインシステム仕様（DevFocus Dark テーマ）
│
├── config-sample 相当 → js/config.js … ★サイト設定（ホール名・テーマ・機種プリセット）
│
├── css/                        … 機能ごとに分割されたスタイル（§5参照）
│   ├── theme.css               … CSS変数（色）。DESIGN.md の DevFocus Dark に準拠。テーマ切替の起点
│   ├── style.css               … 全体レイアウト・タブ・ローディング・フォント(Inter)・角丸(8px)
│   ├── components.css          … 共通部品（テーブル/モーダル/ボタン/トースト）最大
│   ├── daily.css / analysis.css / calendar.css / island.css
│   ├── machinebadge.css / aim.css
│   ├── memo.css                … 着席メモのバッジ／メモ列セル／メモ入力モーダルのスタイル
│   ├── promotion.css           … 取材ページ（カード・マトリクス・詳細テーブル・掲示板）のスタイル
│   └── tagmatch.css            … （※index.htmlで未読み込み・無効）
│
├── data/
│   ├── YYYY_MM.json            … ★本体データ。月単位。{ "YYYY_MM_DD": [ {台レコード}, ... ] }
│   ├── position.csv            … 台番号ごとの位置タグ（角/角2/角3/円卓 …）
│   ├── island-config.json      … 島図（フロアレイアウト）の台番号配置
│   └── machine-short-names.json … 機種名 → 短縮名（島図・バッジ表示用）
│
├── js/                         … アプリ本体（§4で各ファイル詳述）
│   ├── config.js  utils.js  data.js  chart.js
│   ├── preset.js  hstag.js  machinebadge.js  bottomsheet.js
│   ├── daily-state.js  daily.js  aim.js  memo.js  analysis.js
│   ├── calendar.js  island.js
│   ├── promotion.js            … 取材ページ共通モジュール（一覧・詳細・機種マトリクス・全体マトリクス）
│   ├── board.js                … 取材掲示板モジュール（投稿・編集・削除・Cloudflare D1連携）
│   ├── router.js  app.js
│   └── tagmatch.js             … （※index.htmlで未読み込み・無効）
│
├── partials/                   … 各ページのHTML断片（初回アクセス時に router.js が fetch して挿入）
│   ├── daily.html              … 日別データページの中身
│   ├── analysis.html           … 解析ページの中身
│   ├── calendar.html           … カレンダーページの中身
│   ├── island.html             … ヒートマップ（島図）ページの中身
│   ├── aim.html                … 狙い台作成ページの中身
│   └── promotion/              … 取材（promotion）ページ群
│       ├── promotion.html      … 取材ハブ（全体マトリクス＋3取材への入口）
│       ├── tenun.html          … 取材「天運総撃」
│       ├── ougi.html           … 取材「奥義の矢」
│       └── zombie.html         … 取材「ゾンビ狩り」
│
├── converter/
|   └── convert_csv_to_json.py  … HTML/CSV → 月別JSON 変換スクリプト（更新時に使う）
└── history-maker/
    └──  build_unit_history.py   … data/*.json をスキャンして unit_history.json を生成（独立実行専用。convert_csv_to_json.py からは呼ばない）
```

> **注**: `prompt.txt` のディレクトリ図は古い（`stats.js` 等、現存しないファイル名が残っている）。正は本ファイル。

---

## 3. データモデル

### 3.1 台レコード（`data/YYYY_MM.json` 内の1要素）
全フィールドは**文字列**で保存される（数値処理側でパースする）。

```json
{
  "機種名":   "ネオアイムジャグラーEX",
  "台番号":   "881",
  "G数":      "7682",
  "差枚":     "1651",
  "BB":       "32",
  "RB":       "29",
  "ART":      "0",
  "合成確率": "1/125.9",
  "BB確率":   "1/240.1",
  "RB確率":   "1/264.9",
  "ART確率":  "1/0.0"
}
```

### 3.2 月別ファイルの構造
```json
{
  "2026_06_01": [ {台レコード}, {台レコード}, ... ],   // 1日 ≒ 400台
  "2026_06_02": [ ... ],
  ...
}
```
- 日付キーは `YYYY_MM_DD`（アンダースコア区切り）
- メモリ展開時は内部で `data/YYYY_MM_DD.csv` という**疑似ファイル名**をキーにキャッシュ（歴史的経緯。実ファイルではない）

### 3.3 補助データ
| ファイル | 形式 | 内容 |
|----------|------|------|
| `events.json` | `{ "events": [ {date, type, media, name, note, target_machines, candidate_machines, report_url} ] }` | 取材・新台・周年など。`type`例: `dmm` / `new_machine` / `anniversary`。取材イベントは `target_machines`（対象機種）・`candidate_machines`（候補機種）・`report_url`（レポートURL）も持つ |
| `position.csv` | CSV（先頭にBOM） | `台番号,角,角2,角3,円卓` の0/1フラグ。角台などの位置タグ |
| `island-config.json` | `{ areas, islands[].rows[].units[] }` | 島図の物理レイアウト。`null`=台なし（通路） |
| `machine-short-names.json` | `{ "正式名": "短縮名" }` | 表示幅の狭い場所用の機種名短縮辞書 |

---

## 4. JavaScript モジュール詳細

読み込み順序（`index.html` 末尾）＝依存関係の順序：
`config → utils → data → chart → preset → hstag → machinebadge → bottomsheet → daily-state → daily → aim → memo → analysis → calendar → island → promotion → board → router → app`

> `tagmatch.js` は `index.html` から読み込まれていない（タブUIも無いため事実上無効）。`compare.js` / `trend.js` は存在しない（廃止／改称済み）。
> `router.js` は全ページJSの後・`app.js` の直前に読み込む。`app.js` の `init()` 末尾で `Router.start()` を呼ぶことで初期表示が確定する。

### グローバル名前空間
- `window.HallData`（`utils.js` で定義）… データストアと各タブ状態の集約オブジェクト
  - `HallData.store`: `files / cache / headers / machines / events / positions / unitHistory / loadingState`
  - `HallData.utils`: 台の状態変化履歴ヘルパー群（`getUnitStatus / getUnitAge / getMachineAge / getUnitDisplayStatus / getUnitDisplayStatuses / getNewPeriodDays / setNewPeriodDays`）

  - `HallData.state`: 各タブ（daily / trend …）の表示状態
- 後方互換のため `CSV_FILES` `dataCache` `headers` `allMachines` 等のグローバル変数も併存し、`syncToStore()` / `syncFromStore()`（`data.js`）で同期する。

---

| ファイル | 行数目安 | 役割 | 主な公開関数 / オブジェクト |
|----------|---------|------|------------------------------|
| **config.js** | ~166 | サイト設定。**編集の入口**（ホール名・テーマ・色・機種プリセット）。非AT機種リスト `NON_AT_MACHINES` を冒頭に定義 | `SITE_CONFIG`, `NON_AT_MACHINES` |
| **utils.js** | ~2500 | 共通基盤。**最重要・最大**。データストア定義、日付処理、ソート、テーブル描画、CSV/コピー、検索付きセレクト、イベント/位置データ処理。機種フィルター部品 `initMultiSelectMachineFilter` を生成。**台の状態変化履歴ヘルパー**（`HallData.utils.*`。unit_history.json を参照。未ロード時は例外を投げず null を返す） | `HallData`, `sortFilesByDate`, `formatDate`, `parseDateFromFilename`, `renderTable`, `convertToCSV`, `copyToClipboard`, `downloadAsCSV`, `initMultiSelectMachineFilter`, `loadEventData`, `getEventsForDate`, `loadPositionData`, `getPositionTags`, `HallData.utils.getUnitStatus/getUnitAge/getMachineAge/getUnitDisplayStatus/getUnitDisplayStatuses` |
| **data.js** | ~460 | データ読み込み・キャッシュ・ローディング進捗・日付/機種セレクタ生成。`loadUnitHistory` で unit_history.json を初期ロードに並行読み込み（失敗時は unitHistory=null で既存フロー継続） | `loadInitialData`, `loadRemainingDataInBackground`, `loadMonthlyJSON`, `loadCSV`, `loadUnitHistory`, `populateDateSelectors`, `populateMachineFilters`, `updateDateNav` |
| **chart.js** | ~190 | Chart.js ラッパ。解析タブ・カレンダーのトレンドグラフ描画 | `renderTrendChart`, `CHART_COLORS` |
| **preset.js** | ~282 | 機種フィルタープリセット（固定＋ユーザー定義）管理。判定方式は partial / exact / exclude。除外は `excludeKeywords`（部分一致）と `excludeMachines`（完全一致）の2系統。台数フィルタは `minCount`（下限）/ `maxCount`（上限）で、**選択中の日の設置台数**で判定（`resolve` の第3引数 `machineOptions` の `count` を参照） | `MachinePreset`（IIFE） |
| **hstag.js** | ~849 | **汎用タグ判定エンジン**。条件（差枚/G数/機械割…）でAND/ORグループ判定。日別タブ等で共用 | `TagEngine`（IIFE） |
| **machinebadge.js** | ~520 | 機種内順位バッジ（🐙タコだし／💀死に台）。直近N日累積で順位付け。**設置台数別ロジック**: 3台以上=機種内で順位付け、2台=💀のみ1位付与（🐙なし）、1台設置機種=**バッジ非付与**（比較不能のため。旧・横断グループ方式は廃止）。**未ロード日検知**: 集計窓に含まれるがデータ未ロードの日を `missingFiles` として記録し、バッジのツールチップとボトムシートで警告表示。**集計内訳の可視化**: `renderWindowInfo` で「計算に使った日／除外日／未ロード日」を一覧描画。集計期間は選択式（1〜15日）。設定UIは共通ボトムシートに表示 | `MachineBadge`（IIFE。主要: `assignBadges`, `assignBadgesForTrend`, `renderBadgeHtml/Inner`, `renderSettingsHtml`, `setupSettingsEvents`, `getLastWindowInfo`, `renderWindowInfo`） |
| **bottomsheet.js** | ~90 | **ボトムシート（ハーフモーダル）共通モジュール**。画面下部からスライドインする軽量シート。既存 `.app-modal` とは別系統で、DOM を動的生成する（partials に依存しない）。バッジ設定（日別・凹み推移・狙い台）の表示に共用。DESIGN.md 準拠（`--bg-elevated`・角丸8px・`--transition-normal`・44pxタップターゲット） | `BottomSheet`（IIFE: `create(id, {title})` → `setContent / open / close / isOpen / onOpen`、`get(id)`） |
| **daily-state.js** | ~327 | **日別タブの状態管理**。localStorage + URL と双方向同期。`setState`で再描画をバッチ | `DailyState`（`get/setState/init/applyDefaultDate`） |
| **daily.js** | ~2400 | **日別データページ**本体。テーブル描画、数値フィルター、タグ、表示列、バッジ、末尾統計、一括タグ付け、狙い台モーダル起動。**台の状態変化列**（「状態」＝new/add/remove/move バッジ複数対応、「設置日数」＝機種のnew日起点）と**撤去台セクション**（renderWithdrawnTable）を描画。バッジ設定はボトムシート（ensureDailyBadgeSheet）で表示 | `filterAndRender`, `setupDailyEventListeners`, `initDailyMachineFilter`, `dailyFilterGroups`, `renderWithdrawnTable`, `renderUnitStatusBadges` |
| **aim.js** | ~971 | **狙い台シート（AimSheet）**。日別タブのモーダルから起動。PC=HTML5 Drag&Drop／スマホ=長押しドラッグ＋タップメニューで凹み台を「最優先／優先／その他」ゾーンに区分け。💀🥇💀🥈💀🥉表記、機種除外（プリセット一括）、html2canvasで1枚画像出力。保存は localStorage（自動）＋**Cloudflare D1**（作成者ごとに upsert・他人のシート読込／削除）。Worker URL は `AIM_API_URL` 定数。凹み判定（バッジ）設定はボトムシート（ensureAimBadgeSheet） | `AimSheet`（IIFE） |
| **memo.js** | ~300 | **着席メモ**。日別タブのメモ列セルタップで起動する小モーダル（SeatMemo.openEditor）。記録者/日付/台/設定をその場で記録・共有 | `SeatMemo`（IIFE） |
| **analysis.js** | ~1218 | **解析タブ**（旧データトレンド。ファイル名のみ analysis に改称、内部の関数・変数名は trend 由来のまま）。期間集計（台別/機種別、合計/平均）、Chart.jsグラフ、3段キャッシュ最適化。凹み推移タブのバッジ設定はボトムシート（ensureKubiBadgeSheet） | `loadTrendData`, `setupTrendEventListeners`, `initTrendMachineFilter`, `trendCache`, `activeTrendFilters` |
| **calendar.js** | ~885 | **カレンダータブ**。月間集計、イベント表示、累積差枚推移グラフ、日別タブへ遷移 | `renderCalendar`, `setupCalendarEventListeners`, `navigateToDailyData` |
| **island.js** | ~688 | **ヒートマップ（島図）タブ**。`island-config.json`でレイアウト描画、表示モード切替 | `IslandMap`（`init/render`） |
| **promotion.js** | ~789 | **取材ページ共通モジュール**。取材ごとの開催日一覧（カード形式）・詳細（対象機種テーブル＋その日の全台ランキング）・対象機種マトリクス（縦:機種 × 横:開催日）・全体マトリクス（3取材一覧）を描画。`events.json` の `target_machines` / `candidate_machines` を参照。未来日（まだデータなし）は案内のみ表示。取材名定義 `PROMO_NAMES`・カラー定義 `PROMO_COLORS` を保持 | `Promotion`（IIFE: `render`, `renderOverview`, `PROMO_NAMES`, `PROMO_COLORS`, `PROMO_LABELS`） |
| **board.js** | ~229 | **取材掲示板モジュール**。取材各ページ（tenun/ougi/zombie）および取材ハブ（hub）の `.promo-memo[data-promo="キー"]` をプレースホルダにして投稿・編集・削除を管理。**Cloudflare Workers + D1**（`BOARD_API_URL = /api/board`）に連携。作成者名は `aim.js` と共用（`localStorage('aimSheetAuthor')`） | `Board`（IIFE: `render`） |
| **app.js** | ~110 | **エントリポイント**。`init()` で全データ初期化後、最後に `Router.start()` を呼ぶ。日別/解析の機種フィルターは起動時に初期化しない（各ページ初回表示時に初期化される）。`populateMachineFilters` は実質空 | `init`, `setupFilterPanelToggle`, `populateMachineFilters` |
| **router.js** | ~130 | **ハッシュルーター**。`#home/#daily/...` でページ切替。`[data-nav]` のクリックをイベント委譲で遷移。`data-partial` を持つページは初回表示時に `partials/*.html` を fetch して挿入。各ページの `init`（初回1回・DOM挿入後）/ `onShow`（表示のたび）を呼ぶ。`DEFAULT_PAGE='home'` | `Router`（`start/navigate/show`、デバッグ用 `_state`） |

---

## 5. CSS 構成

| ファイル | 役割 |
|----------|------|
| `theme.css` | CSS変数（`--primary-color`, `--hall-accent` 等）。DESIGN.md（DevFocus Dark）に準拠。`data-theme="light"` 切替の起点 |
| `style.css` | 全体レイアウト、`<h1>`、`.tabs`、ローディング画面。フォント Inter・角丸 8px（`--radius-sm/md/lg`）を統一定義 |
| `components.css` | **共通部品（最大）**: テーブル `.table-wrapper`、モーダル `.app-modal`、ボタン、トースト、検索セレクト、チップ |
| `daily.css` | 日別タブ固有（フィルターバー、各モーダル） |
| `analysis.css` | 解析タブ（グラフ、固定列テーブル、機種サマリーカード）。旧 trend.css |
| `calendar.css` | カレンダー（グリッド、凡例、月間推移グラフ） |
| `island.css` | 島図（マップ、ヒートマップセル、台詳細モーダル） |
| `machinebadge.css` | 機種内バッジの見た目。加えて**バッジ設定ボトムシート**（`.bottom-sheet` 系）と設定UI・集計内訳（`.mb-window-*`）のスタイルを内包。DESIGN.md（DevFocus Dark）準拠に刷新済み（色変数化・角丸8px・44pxタップターゲット・独自ライトメディアクエリ廃止） |
| `aim.css` | 狙い台シート（ゾーンボード、チップ、画像出力レイアウト、クラウド操作UI） |
| `memo.css` | 着席メモのバッジ／メモ列セル／メモ入力モーダル |
| `promotion.css` | 取材ページ全体（取材カラー変数・開催日カード・対象機種マトリクス・詳細テーブル・取材掲示板）|
| `tagmatch.css` | タグマッチタブ（※index.html未読み込み・無効） |

`config.js` の `customColors` は実行時に CSS変数へ上書き注入される（`theme.css`の変数が初期値）。

---

## 6. タブ別 機能マップ

画面は **ホーム（ターミナル）ページ**を起点に、URLハッシュで各ページへ遷移する（`#home / #daily / #analysis / #calendar / #island / #aim / #promotion / #tenun / #ougi / #zombie`）。従来の上部タブバーは廃止。各ページ実体は `partials/*.html`。下表の「id」はハッシュ名かつ `.tab-content` の要素id。

| ページ表示名 | id（ハッシュ名） | 主担当JS | できること |
|------|---------|----------|-----------|
| ホーム | `home` | router.js | 各ページへのランチャー（カード選択）。起動直後の初期画面 |
| 日別データ | `daily` | daily.js / daily-state.js / aim.js | 1日分の全台テーブル。検索・ソート・数値フィルター・タグ・表示列・機種内バッジ・台番号末尾統計・CSV/コピー。「狙い台作成」モーダル（aim.js） |
| 狙い台作成 | `aim` | aim.js | 凹み台（💀）を「最優先/優先/その他」ゾーンに区分け、1枚画像出力・クラウド共有 |
| 解析 | `analysis` | analysis.js | 期間内の推移（台別/機種別、合計/平均）、Chart.jsグラフ。旧「データトレンド」 |
| カレンダー | `calendar` | calendar.js | 月カレンダーに日別サマリー＋イベント、月間累積差枚推移グラフ |
| ヒートマップ | `island` | island.js | フロア島図上に差枚/機械割/G数/タグを色分け表示 |
| 取材ハブ | `promotion` | promotion.js / board.js | 3取材（天運総撃・奥義の矢・ゾンビ狩り）への入口。全体マトリクス（3取材一覧）＋掲示板（hub） |
| 天運総撃 | `tenun` | promotion.js / board.js | 取材「天運総撃」の開催日一覧・詳細・機種マトリクス・掲示板 |
| 奥義の矢 | `ougi` | promotion.js / board.js | 取材「奥義の矢」の開催日一覧・詳細・機種マトリクス・掲示板 |
| ゾンビ狩り | `zombie` | promotion.js / board.js | 取材「ゾンビ狩り」の開催日一覧・詳細・機種マトリクス・掲示板 |

> **注**: 旧「メモ」タブ（`#memo`）は廃止済み（日別タブのインラインメモに統合）。

---

## 7. 横断的な仕組み（重要概念）

### タグエンジン（`hstag.js` / `TagEngine`）
- ユーザーが「差枚≧1000 かつ G数≧5000」のような**条件グループ**を定義
- グループ内＝AND、グループ同士＝OR で台を判定
- 定義は `localStorage('customTagDefinitions')` に保存
- 主に日別タブで利用

### 機種フィルタープリセット（`preset.js` / `MachinePreset`）
- 日別・解析の各タブ共通の機種フィルター部品（`utils.js` の `initMultiSelectMachineFilter`）から、プリセット選択 → 適用で利用。狙い台シート（`aim.js`）の機種除外でも同じプリセット定義を参照
- 固定プリセットは `config.js` の `SITE_CONFIG.machinePresets` で定義
- 判定方式 `matchMode`: `partial`（部分一致）/ `exact`（`machines` 完全一致）/ `exclude`（除外方式）
- 除外方式の補助: `excludeKeywords`（部分一致除外）/ `excludeMachines`（完全一致除外）
- 台数で絞る: `minCount`（下限）/ `maxCount`（上限）。**選択中の日**の設置台数で判定
- ユーザープリセットの保存・管理UI（💾⚙️）は廃止済み。`MachinePreset.add/remove/rename/updateMachines` のロジックは後方互換のため残置（未使用）

### 機種内バッジ（`machinebadge.js` / `MachineBadge`）
- その日を含む**直近N日間の累積差枚（or G数）**で同一機種内の順位を算出
- 🐙=上位（タコだし）、💀=下位（死に台）。表示順位 `[1,2,3]` をカスタム可
- **設置台数別ロジック**（日別タブ `assignBadges`。設置台数の判定は「基準日の設置台数」）:
  - 3台以上 … 機種内で 🐙💀 を通常どおり順位付け
  - 2台 … 💀（死に台）1位のみ付与。🐙 は付けない（2台同値ならバッジなし）
  - 1台 … **バッジを付けない**（単独では比較不能のため。旧・1台設置機種の横断グループ方式は廃止）
  - 解析タブ（`assignBadgesForTrend`）はこのロジック非対象（選択期間合計での機種内順位のまま）
- **未ロード日の扱い**: 集計窓（`windowFiles`）に含まれるが `dataCache` 未ロードの日は集計から欠落する。この日を `missingFiles` として記録し、バッジのツールチップに「⚠未ロードN日ぶん欠落」、設定シートに警告一覧を表示する。時間を置いて再計算すると反映される
- **集計内訳の可視化**: 直近の計算で使った窓情報を `_lastWindowInfo` に保持。`renderWindowInfo(idPrefix)` で「計算に使った日（範囲・チップ）／除外日／未ロード日」を設定シート内に描画する。`getLastWindowInfo()` で内訳を取得可能
- **集計期間**は選択式（1〜15日、`MIN_DAYS`〜`MAX_DAYS`）。iOS Safari では `<select>` がネイティブホイールになる
- 設定は `localStorage`。設定変更後は**手動で再計算ボタン**が必要（日別タブ）
- **設定UIはボトムシート**（`BottomSheet`）で表示。日別＝`ensureDailyBadgeSheet`、凹み推移＝`ensureKubiBadgeSheet`、狙い台＝`ensureAimBadgeSheet`。いずれも `MachineBadge.renderSettingsHtml(idPrefix)` を共用（接頭辞: `dailyMb` / `kubiMb` / `aimMb`）

### 台の状態変化履歴（`converter/build_unit_history.py` → `unit_history.json` / `HallData.utils.*`）
- **生成**: `converter/build_unit_history.py` を単体実行（`python build_unit_history.py`）すると、`data/*.json` を年月・日付の古い順にスキャンして `unit_history.json`（プロジェクトルート直下）を生成する。全再生成方式。convert_csv_to_json.py からは独立
- **メモリ効率**: 処理中の1か月分＋直前1日分のスナップショットのみ保持。月境界は直前スナップショットで接続され、月初日が誤って全 new にならない
- **出力構造**: `machine_history`（機種軸。events に new/add/remove/move/withdraw を date 付きで記録。`units`＝当日全体、`prev_units`＝前日全体）と `unit_history`（台番号軸。機種が変化した節目の日だけ `{date, machine}` を記録）
- **イベント判定**: new＝機種が前日に無い / add＝台数増 / remove＝台数減 / move＝台数同じで台番号Set変化。台数変化と入れ替わりが同時なら add/remove と move を**別イベントとして両方 push**（純粋増減＝部分集合のときは move を立てない）。withdraw＝前日にあった機種が当日消滅
- **date 表記**: unit_history.json 内の date は素の `YYYY_MM_DD`（dataCache キーの疑似CSV名とは別系統。JS 側は `normalizeDateKey` で吸収）
- **読み込み**: `data.js` の `loadUnitHistory` が初期ロード時に `loadPositionData` と並行で読み、`HallData.store.unitHistory` に格納。失敗・不在時は `null`（既存機能に影響なし）
- **JSヘルパー**（`utils.js` / `HallData.utils`。unitHistory が null なら全て null を返す）:
  - `getUnitStatus(unitNo, targetDate)` … targetDate 時点で有効な機種の最新イベント1件 `{type, machine, date}`
  - `getUnitDisplayStatuses(unitNo, targetDate)` … 最新イベント日の全 type を配列で返す（add+move 同時など複数対応。表示順 new→add→move→remove→withdraw）。**新台期間フィルタ**適用
  - `getUnitAge(unitNo, targetDate)` … 台番号がその機種になった節目の日からの経過日数
  - `getMachineAge(unitNo, targetDate)` … 機種の new イベント日を起点にした経過日数（増台で後から入った台も同じ機種なら同日数。90日超でもカウント継続）
  - `getNewPeriodDays / setNewPeriodDays` … 新台期間（`localStorage('unitNewPeriodDays')`、デフォルト90日）
- **新台期間の扱い**（日別タブ「状態」列）: new は機種設置日（getMachineAge）基準、add/move/remove はそのイベント発生日基準で、経過が新台期間（デフォルト90日、ちょうどまで表示）を超えるとバッジが消える。withdraw は状態列には出さず下部セクション専用。設置日数（「設置日数」列）は期間フィルタの影響を受けず数え続ける
- **日別タブUI**: 「状態」列（複数バッジ `renderUnitStatusBadges`）、「設置日数」列、テーブル下部「最近撤去された台」セクション（`renderWithdrawnTable`。machine_history の withdraw を表示日以前・新しい順に最大50件）。列は `initColumnSelector` で追加、CSSは `css/daily.css` の `.unit-status-badge` 系


### 狙い台シート（`aim.js` / `AimSheet`）
- 日別タブの「狙い台作成」モーダルから起動、またはホームから直接 `#aim` へ遷移可能。凹み台（💀）を「最優先 / 優先 / その他」の3ゾーンに区分けし、1枚画像（html2canvas）として出力
- 操作: PC=HTML5 Drag&Drop、スマホ=長押しドラッグ＋タップメニューの両対応
- 保存: `localStorage('aimSheetState')` に自動保存。加えて **Cloudflare Workers + D1**（`AIM_API_URL` = `/api/aim`）に作成者名（`localStorage('aimSheetAuthor')`）ごとに upsert 保存

### 取材ページ（`promotion.js` / `Promotion` ＋ `board.js` / `Board`）
- `events.json` の取材イベント（`name` が取材名と一致するもの）を元に開催日一覧・詳細を構築
- 開催日詳細では `target_machines` / `candidate_machines` を参照し、その日のデータが未ロードの場合は `loadMonthlyJSON` を呼んで再描画
- **全体マトリクス**（`buildOverviewMatrix`）: 3取材の機種を横断的に一覧表示。取材ハブ（`promotion.html`）の `.promo-overview-mount` に描画
- **対象機種マトリクス**（`buildMachineMatrix`）: 各取材ページの開催日一覧の下部に機種×日付のマトリクスを描画
- **取材掲示板**（`Board.render(boardKey)`）: 取材各ページ・ハブに配置した `.promo-memo[data-promo="キー"]` を起点に投稿フォーム＋一覧を動的に組む。Worker URL は `BOARD_API_URL`（`board.js` 冒頭にハードコード）
- 取材カラー（天運総撃=赤・奥義の矢=青・ゾンビ狩り=緑）は `PROMO_COLORS` と `promotion.css` の `[data-promo="..."]` 変数で一元管理

### ボトムシート（`bottomsheet.js` / `BottomSheet`）
- 画面下部からスライドインするハーフモーダル。既存の `.app-modal`（`components.css`）とは別系統で、`BottomSheet.create(id, {title})` 呼び出し時に `document.body` へ DOM を動的生成する（partials 側のHTMLに依存しない）
- 現状の用途は**バッジ設定**（日別 / 凹み推移 / 狙い台の3箇所）。各タブは初回に `ensure〇〇BadgeSheet()` でシートを1つ生成し、`MachineBadge.renderSettingsHtml` を流し込む
- 閉じる操作は ×ボタン / オーバーレイ空白タップ / ハンドルタップ / Esc。表示制御は `.open` クラスの付け外しで行い、実際のスライドは `machinebadge.css` の `.bottom-sheet` トランジションが担う
- スタイルは `machinebadge.css` に同梱（本来は独立CSSが理想だが、主用途がバッジ設定のため集約）

### 画面遷移（ルーティング）（`router.js` / `Router`）
- ホーム（`#home`）起点のハッシュルーター。タブバーは持たない
- ページ定義テーブル `PAGES` に各ページの `tabId`・`init`（初回1回）・`onShow`（表示のたび）を登録
- `[data-nav="ページ名"]` 属性のクリックを **document レベルのイベント委譲**で捕捉して遷移
- `data-partial="partials/xxx.html"` を持つページは初回表示時に fetch して中身を挿入
- 取材サブページ（tenun/ougi/zombie）は `data-param` 属性でパラメータ（開催日）を受け取り、`Promotion.render(promoKey, param)` に渡す
- デバッグ: `Router._state()` で各ページの `initialized` / `loaded` 状況を確認できる

### 状態の永続化
- **日別タブ**: `DailyState`（`daily-state.js`）が `localStorage('dailyTabState')` とURLクエリに保存
- **タグ定義 / プリセット / バッジ設定 / 表示列**: それぞれ専用の `localStorage` キー
- **狙い台シート / 取材掲示板の作成者名**: `localStorage('aimSheetAuthor')`（board.js と aim.js で共用）
- **狙い台シート**: `localStorage('aimSheetState')` + Cloudflare D1
- **新台期間（状態バッジ）**: `localStorage('unitNewPeriodDays')`（デフォルト90日）

### パフォーマンス最適化
- 起動時は**最新2か月のみ**ロードし即表示 → 残りはバックグラウンドで並列ロード（`data.js`、同時3並列）
- 解析タブは3段キャッシュ（`trendCache`: rawData → aggregated → finalResults）で再計算を回避
- 取材ページは対象日が未ロードの場合のみ `loadMonthlyJSON` を呼んで遅延ロード

---

## 8. データ更新フロー（運用）

1. 日別のHTML/CSVデータを用意
2. `converter/convert_csv_to_json.py` を実行 → `data/YYYY_MM.json` を生成/追記し、`files.json` を更新
3. 新しい月を追加した場合は `files.json` の `monthly` 配列**先頭**に追記（新しい順）
4. イベントは `events.json` を手動編集（取材は `target_machines` / `candidate_machines` / `report_url` / `note` も設定可）
5. レイアウト変更時は `island-config.json` / `position.csv` を編集
6. 台の状態変化履歴を更新する場合は `converter/build_unit_history.py` を単体実行 → ルート直下の `unit_history.json` を再生成（全再生成方式。data/*.json の追加後に実行する）

---

## 9. 編集時の早見表（「○○を直したい」逆引き）

| やりたいこと | 触るファイル |
|--------------|--------------|
| ホール名・テーマ色・機種プリセットを変える | `js/config.js`（`SITE_CONFIG`） |
| 機種フィルターのプリセット内容を変える | `js/config.js`（`SITE_CONFIG.machinePresets` / `NON_AT_MACHINES`） |
| プリセットの判定ロジック（台数上限・完全一致除外など） | `js/preset.js`（`MachinePreset.resolve` / `resolveExclude`） |
| 機種フィルターUIのボタン構成・見た目 | `js/utils.js`（`initMultiSelectMachineFilter`）+ `css/components.css`（`.preset-row` 等） |
| バッジの台数別ロジック | `js/machinebadge.js`（`assignBadges`） |
| テーブルの列・並び・見た目（日別） | `js/daily.js` + `css/daily.css` / `css/components.css` |
| 日付ソートや日付フォーマット | `js/utils.js`（`sortFilesByDate` / `formatDate`） |
| 新しい月データを追加 | `data/` に JSON 配置 → `files.json` を更新 |
| 台の状態変化履歴を再生成 | `converter/build_unit_history.py` を単体実行 → `unit_history.json` を再生成 |
| 「状態」「設置日数」列・撤去台セクションの見た目/挙動 | `js/daily.js`（`renderTableWithColumns` の該当分岐 / `renderWithdrawnTable`）+ `css/daily.css`（`.unit-status-badge` 系） |
| 状態バッジの判定ロジック・新台期間 | `js/utils.js`（`HallData.utils.getUnitDisplayStatuses` / `getMachineAge` / `getNewPeriodDays`）。イベント判定は `converter/build_unit_history.py` の `diff_and_emit_events` |
| 解析タブのグラフ表示 | `js/chart.js` + `js/analysis.js` |
| 狙い台シートの振る舞い（ゾーン・画像出力・クラウド保存） | `js/aim.js`（`AimSheet`）+ `css/aim.css`。Worker URL は `AIM_API_URL` |
| タグの判定条件・UI | `js/hstag.js`（`TagEngine`） |
| バッジ（🐙💀）のロジック | `js/machinebadge.js` |
| 島図のレイアウト | `data/island-config.json` + `js/island.js` |
| 初期化順（データ読込）| `js/app.js`（`init`） |
| ページ遷移・ルーティング・初回初期化タイミング | `js/router.js`（`PAGES` テーブル） |
| ページを追加する（新しい画面） | `partials/新ページ.html` 作成 → `index.html` に空コンテナ追加 → `js/router.js` の `PAGES` に登録 → ホームに `data-nav` カード追加 |
| 各ページのHTMLを直す | `partials/該当.html`（index.html ではない） |
| 共通ボタン/モーダル/トーストの見た目 | `css/components.css` |
| 色（CSS変数） | `css/theme.css`（DESIGN.md に準拠） |
| デザインシステムの仕様確認・更新 | `DESIGN.md` |
| 取材ページの開催日・対象機種を追加 | `events.json`（`target_machines` / `candidate_machines` / `report_url` / `note` を設定） |
| 取材ページのカラー・見た目 | `css/promotion.css`（`[data-promo="..."]` 変数 / `.promo-*` クラス） |
| 取材掲示板のAPI接続先を変える | `js/board.js`（`BOARD_API_URL` 定数） |
| 取材の対象機種マトリクスのロジック | `js/promotion.js`（`buildMachineMatrix` / `buildOverviewMatrix`） |

---

## 10. 既知の注意点 / 技術的負債

- `dataCache` のキーは `data/YYYY_MM_DD.csv` という**疑似CSVファイル名**（実体はJSON）。`loadCSV()` は実際にはキャッシュ参照のみ。日付URLでは `.csv` を省く（`daily-state.js` の `stripDateFileExt/restoreDateFileExt` で変換、内部キーは従来どおり `.csv` 付き）
- グローバル変数（`CSV_FILES` 等）と `HallData.store` が**二重管理**。`syncToStore/syncFromStore` で都度同期している。
- `tagmatch.js` / `tagmatch.css` はファイルとしては残るが、`index.html` から読み込まれておらずタブUIも無い（事実上無効）。
- `compare.js` / `compare.css` / `trend.js` / `trend.css` は**存在しない**（廃止・リネーム済み）。
- 解析タブ（`analysis.js`）は**ファイル名のみ改称**されており、内部の関数・変数名（`loadTrendData` / `setupTrendEventListeners` / `trendCache` / `activeTrendFilters` など）は依然 trend 由来の名前のまま。
- `prompt.txt` のファイル一覧は古い。正は本 `ARCHITECTURE.md`。
- 全データを文字列で保持しているため、数値比較・ソート時は各所でパースしている。
- 機種フィルターの💾保存・⚙️管理ボタンは廃止したが、`preset.js` の `add/remove/rename/updateMachines` と `components.css` の `.preset-save-btn` `.preset-manage-btn` `.preset-manage-panel` 系スタイルは未使用のまま残置している。
- プリセットの `exact` / `excludeMachines` はデータの `機種名` と**完全一致**が前提。表記ゆれがあるとマッチしないため、機種追加時は実データと突き合わせて都度修正する運用。
- バッジの台数別ロジックは日別タブ（`assignBadges`）のみ。解析タブ（`assignBadgesForTrend`）は従来の機種内順位のまま二系統が併存している。
- 狙い台シート・取材掲示板のクラウド保存はそれぞれ `aim.js` の `AIM_API_URL`、`board.js` の `BOARD_API_URL` にハードコードされた Cloudflare Worker URL に依存。Worker/D1 未デプロイ時は localStorage 保存のみ動作し、クラウド操作は失敗する。
- **パーシャルの fetch は http 配信が前提**。`file://` で index.html を直接開くと CORS で各ページが読み込めず空表示になる。ローカル確認は `python -m http.server` 等を使う。
- 各ページのDOMは**初回表示まで存在しない**。起動時に特定ページのDOMへ触る処理を書くと `null` 参照で落ちる。DOM依存の初期化は必ず router の各ページ `init`/`onShow` 側に置く。
- `partials/*.html` は**外側の `<div id="...">` ラッパーを含めない**（中身のみ）。ラッパーは index.html 側の空コンテナが持つ。
- `index.html` は要素IDの一覧の正ではなくなった。日別/解析/カレンダー/島図の各要素IDは対応する `partials/*.html` を参照すること（ホームとローディングのみ index.html に直接ある）。
- `board.js` の `startEdit` 内のキャンセル処理に `null` 参照の可能性がある（`list.closest('.promo-memo')` の戻り値を `loadPosts` に渡している箇所）。現状は `reloadByBoard` で回避しているが、将来の改修時に注意。
- ボトムシートのスタイルは `machinebadge.css` に同梱している（`.bottom-sheet` 系）。バッジ以外の用途でボトムシートを使う場合は、独立CSS（例: `bottomsheet.css`）への切り出しを検討すること。
- 機種内バッジの「1台設置機種はバッジ非付与」への変更に伴い、旧・横断グループ方式のロジック（`singleUnitItems` 集約）は `assignBadges` から削除済み。`assignBadgesForTrend`（解析の集計タブ）は従来どおり機種内順位のみで、台数別ロジック・1台非付与・未ロード検知は非対象。
- 旧バッジ設定モーダル（`partials/daily.html` の `#badgeModal`、`partials/analysis.html` の `#kubiBadgeModal`、`partials/aim.html` の `#aimBadgePanel`）はボトムシート化により未使用。HTMLは残置しているが開かれない（掃除は任意）。
- `unit_history.json` の `date` は素の `YYYY_MM_DD`。`dataCache` キーの疑似CSV名（`data/..._..._....csv`）とは別系統だが、JS ヘルパーは `normalizeDateKey` で吸収するため混在しても問題ない。
- 台の状態変化履歴は**全再生成方式**。`data/*.json` を追加・修正したら `converter/build_unit_history.py` を再実行しないと `unit_history.json` は古いまま（増分ビルドはしない）。
- 「状態」列の move 単独表示は正常。台数を変えずに島ごと丸移動した場合は add が発生しないため move のみになる（add+move の2バッジは「台数増＋台番号入れ替わり」が同時に起きた台でのみ出る）。
- `utils.js` の `UNIT_STATUS_ORDER` が二重定義になっている場合がある（動作影響なし）。気になれば片方を削除する。
- 解析タブ・島図・カレンダーは台の状態変化履歴を未使用（現状は日別タブのみ）。将来これらに展開する場合も `HallData.utils.*` をそのまま呼べる。

---

## 11. AI への作業依頼テンプレ（このファイルの使い方）

> 編集を依頼するときは、このファイルと**該当する1〜2個のJSファイルだけ**を読ませれば足りる。
>
> 例:「日別タブのソートに新しい項目を追加したい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/daily.js`（必要なら `index.html` の `#sortBy`）
>
> 例:「機種プリセットを増やしたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/config.js`（+ `js/preset.js`）
>
> 例:「狙い台シートのゾーンや画像レイアウトを変えたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/aim.js`（+ `css/aim.css`）
>
> 例:「解析タブの集計ロジック/グラフを変えたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/analysis.js`（+ `js/chart.js`）
>
> 例:「取材ページの開催日や対象機種を変えたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `events.json`
>
> 例:「取材掲示板の見た目・機能を変えたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/board.js`（+ `css/promotion.css`）
>
> 例:「デザイン・色・フォントを変えたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `DESIGN.md` + `css/theme.css`（+ `css/style.css`）
