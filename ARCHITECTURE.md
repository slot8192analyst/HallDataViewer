# ホールデータまとめ — 設計書 (ARCHITECTURE)

> **このドキュメントの目的**
> パチンコ店（ホール）のスロットデータを可視化する**静的Webサイト**の全体設計をまとめたもの。
> コードを編集する前にこのファイルだけを読めば、「どのファイルに何が書いてあるか」「どこを直せばよいか」が分かることを目指す。
> AI / 人間どちらも対象読者。**機能を追加・変更したらこのファイルも更新すること。**

最終更新: 2026-06-18（日別比較タブを削除／データトレンドタブを「解析」へ改称・ファイル名 trend→analysis にリネーム／タブを横幅均等割り付けに変更）

---

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| 種別 | 完全な**静的サイト**（ビルド不要・フロントはサーバー不要、ブラウザだけで動作） |
| 言語 | バニラ JavaScript (ES5寄り / モジュールバンドラなし) + HTML + CSS |
| 外部ライブラリ | [Chart.js](https://cdn.jsdelivr.net/npm/chart.js)（トレンドグラフ）、[html2canvas](https://cdn.jsdelivr.net/npm/html2canvas@1.4.1)（狙い台シートの画像出力）。いずれも CDN 読み込み |
| データ | `data/YYYY_MM.json`（月別の台データ）を `fetch` で読み込み。**実データはすべて JSON**（CSVファイルは存在しない） |
| 状態保存 | `localStorage` + URLクエリパラメータ（タグ・フィルター・選択日など）。狙い台シートは追加で **Cloudflare D1**（作成者ごとに端末間共有） |
| バックエンド | 基本は不要（静的サイト）。狙い台シートの共有のみ **Cloudflare Workers + D1**（`/api/aim`）を利用 |
| データ変換 | `converter/convert_csv_to_json.py`（HTML/CSV → 月別JSON、Python） |

### 動作の流れ（ざっくり）
1. ブラウザで `index.html` を開く
2. `js/config.js` でホール名・テーマを設定
3. `js/app.js` の `init()` が起動 → `files.json` を見て最新2か月分のJSONを先読み
4. 残りの月は**バックグラウンドで遅延ロード**（`loadRemainingDataInBackground`）
5. タブ（日別 / 比較 / トレンド / カレンダー / ヒートマップ）を切り替えて閲覧
6. 日別タブからは「狙い台作成」モーダルを開き、💀凹み台を区分けして1枚画像出力・クラウド共有ができる

---

## 2. ディレクトリ構成

```
webapp/
├── index.html                  … 全タブのHTML骨格（UIの正）。要素IDの一覧はここ
├── files.json                  … 読み込む月別JSONのリスト（新しい月→古い月の順）
├── events.json                 … イベント/取材/新台情報（カレンダー・日付セレクタで使用）
├── prompt.txt / README.md      … メモ書き
│
├── config-sample 相当 → js/config.js … ★サイト設定（ホール名・テーマ・機種プリセット）
│
├── css/                        … 機能ごとに分割されたスタイル（§5参照）
│   ├── theme.css               … CSS変数（色）。テーマ切替の起点
│   ├── style.css               … 全体レイアウト・タブ・ローディング
│   ├── components.css          … 共通部品（テーブル/モーダル/ボタン/トースト）最大
│   ├── daily.css / trend.css / compare.css / calendar.css / island.css
│   ├── machinebadge.css / tagmatch.css
│
├── data/
│   ├── YYYY_MM.json            … ★本体データ。月単位。{ "YYYY_MM_DD": [ {台レコード}, ... ] }
│   ├── position.csv            … 台番号ごとの位置タグ（角/角2/角3/円卓 …）
│   ├── island-config.json      … 島図（フロアレイアウト）の台番号配置
│   └── machine-short-names.json … 機種名 → 短縮名（島図・バッジ表示用）
│
├── js/                         … アプリ本体（§4で各ファイル詳述）
│   ├── config.js  utils.js  data.js  chart.js
│   ├── preset.js  hstag.js  machinebadge.js
│   ├── daily-state.js  daily.js  trend.js  compare.js
│   ├── calendar.js  island.js  tagmatch.js  app.js
│
└── converter/
    └── convert_csv_to_json.py  … HTML/CSV → 月別JSON 変換スクリプト（更新時に使う）
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
| `events.json` | `{ "events": [ {date, type, media, name, note} ] }` | 取材・新台・周年など。`type`例: `dmm` / `new_machine` / `anniversary` |
| `position.csv` | CSV（先頭にBOM） | `台番号,角,角2,角3,円卓` の0/1フラグ。角台などの位置タグ |
| `island-config.json` | `{ areas, islands[].rows[].units[] }` | 島図の物理レイアウト。`null`=台なし（通路） |
| `machine-short-names.json` | `{ "正式名": "短縮名" }` | 表示幅の狭い場所用の機種名短縮辞書 |

---

## 4. JavaScript モジュール詳細

読み込み順序（`index.html` 末尾）＝依存関係の順序：
`config → utils → data → chart → preset → hstag → machinebadge → daily-state → daily → trend → compare → calendar → island → app`

### グローバル名前空間
- `window.HallData`（`utils.js` で定義）… データストアと各タブ状態の集約オブジェクト
  - `HallData.store`: `files / cache / headers / machines / events / positions / loadingState`
  - `HallData.state`: 各タブ（daily / trend …）の表示状態
- 後方互換のため `CSV_FILES` `dataCache` `headers` `allMachines` 等のグローバル変数も併存し、`syncToStore()` / `syncFromStore()`（`data.js`）で同期する。

---

| ファイル | 行数目安 | 役割 | 主な公開関数 / オブジェクト |
|----------|---------|------|------------------------------|
| **config.js** | ~80 | サイト設定。**編集の入口**（ホール名・テーマ・色・機種プリセット） | `SITE_CONFIG` |
| **utils.js** | ~2300 | 共通基盤。**最重要・最大**。データストア定義、日付処理、ソート、テーブル描画、CSV/コピー、検索付きセレクト、イベント/位置データ処理。機種フィルター部品 `initMultiSelectMachineFilter` を生成（プリセット選択＋適用ボタンのみ。ユーザープリセット保存💾・管理⚙️ボタンは廃止） | `HallData`, `sortFilesByDate`, `formatDate`, `parseDateFromFilename`, `renderTable`, `convertToCSV`, `copyToClipboard`, `downloadAsCSV`, `initMultiSelectMachineFilter`, `loadEventData`, `getEventsForDate`, `loadPositionData`, `getPositionTags` |
| **data.js** | ~450 | データ読み込み・キャッシュ・ローディング進捗・日付/機種セレクタ生成 | `loadInitialData`, `loadRemainingDataInBackground`, `loadMonthlyJSON`, `loadCSV`, `populateDateSelectors`, `populateMachineFilters`, `updateDateNav` |
| **chart.js** | ~190 | Chart.js ラッパ。トレンドグラフ描画 | `renderTrendChart`, `CHART_COLORS` |
| **preset.js** | ~270 | 機種フィルタープリセット（固定＋ユーザー定義）管理。判定方式は partial / exact / exclude。除外は `excludeKeywords`（部分一致）と `excludeMachines`（完全一致）の2系統。台数フィルタは `minCount`（下限）/ `maxCount`（上限）で、**選択中の日の設置台数**で判定（`resolve` の第3引数 `machineOptions` の `count` を参照） | `MachinePreset`（IIFE） |
| **hstag.js** | ~850 | **汎用タグ判定エンジン**。条件（差枚/G数/機械割…）でAND/ORグループ判定。日別・比較・タグマッチで共用 | `TagEngine`（IIFE） |
| **machinebadge.js** | ~410 | 機種内順位バッジ（🐙タコだし／💀死に台）。直近N日累積で順位付け。**設置台数別ロジック**: 3台以上=機種内で順位付け、2台=💀のみ1位付与（🐙なし）、1台設置機種=全機種横断で1グループにまとめて順位付け（トレンドタブは対象外） | `MachineBadge`（IIFE） |
| **daily-state.js** | ~330 | **日別タブの状態管理**。localStorage + URL と双方向同期。`setState`で再描画をバッチ | `DailyState`（`get/setState/init/applyDefaultDate`） |
| **daily.js** | ~2100 | **日別データタブ**本体。テーブル描画、数値フィルター、タグ、表示列、バッジ、末尾統計、一括タグ付け | `filterAndRender`, `setupDailyEventListeners`, `initDailyMachineFilter`, `dailyFilterGroups` |
| **trend.js** | ~1200 | **データトレンドタブ**。期間集計（台別/機種別）、グラフ、3段キャッシュ最適化 | `loadTrendData`, `setupTrendEventListeners`, `initTrendMachineFilter`, `trendCache`, `activeTrendFilters` |
| **compare.js** | ~1700 | **日別比較タブ**。基準日 vs 複数比較日、差分計算、タグ分析 | `initCompareTab`, `renderCompare`, `setupCompareEventListeners` |
| **calendar.js** | ~880 | **カレンダータブ**。月間集計、イベント表示、累積差枚推移グラフ、日別タブへ遷移 | `renderCalendar`, `setupCalendarEventListeners`, `navigateToDailyData` |
| **island.js** | ~690 | **ヒートマップ（島図）タブ**。`island-config.json`でレイアウト描画、表示モード切替 | `IslandMap`（`init/render`） |
| **tagmatch.js** | ~1070 | タグマッチングタブ（※`index.html`にUIタブは現状未掲出。ロジックは存在） | `TagMatch`（IIFE） |
| **app.js** | ~140 | **エントリポイント**。`init()`で全初期化、タブ切替イベント、各タブの遅延初期化 | `init`, `setupTabEventListeners`, `setupFilterPanelToggle` |

---

## 5. CSS 構成

| ファイル | 役割 |
|----------|------|
| `theme.css` | CSS変数（`--primary-color`, `--hall-accent` 等）。`data-theme="light"` 切替の起点 |
| `style.css` | 全体レイアウト、`<h1>`、`.tabs`、ローディング画面 |
| `components.css` | **共通部品（最大）**: テーブル `.table-wrapper`、モーダル `.app-modal`、ボタン、トースト、検索セレクト、チップ |
| `daily.css` | 日別タブ固有（フィルターバー、各モーダル） |
| `trend.css` | トレンドタブ（グラフ、固定列テーブル、機種サマリーカード） |
| `compare.css` | 比較タブ（日付セレクタ、サマリーカード、分析） |
| `calendar.css` | カレンダー（グリッド、凡例、月間推移グラフ） |
| `island.css` | 島図（マップ、ヒートマップセル、台詳細モーダル） |
| `machinebadge.css` | 機種内バッジの見た目 |
| `tagmatch.css` | タグマッチタブ |

`config.js` の `customColors` は実行時に CSS変数へ上書き注入される（`theme.css`の変数が初期値）。

---

## 6. タブ別 機能マップ

| タブ | HTML id | 主担当JS | できること |
|------|---------|----------|-----------|
| 日別データ | `#daily` | daily.js / daily-state.js | 1日分の全台テーブル。検索・ソート・数値フィルター・タグ・表示列・機種内バッジ・台番号末尾統計・CSV/コピー |
| 日別比較 | `#compare` | compare.js | 基準日と複数比較日を横並び比較、差分、タグ分析 |
| データトレンド | `trend.js` `#trend` | 期間内の推移（台別/機種別、合計/平均）、Chart.jsグラフ |
| カレンダー | `#calendar` | calendar.js | 月カレンダーに日別サマリー＋イベント、月間累積差枚推移グラフ |
| ヒートマップ | `#island` | island.js | フロア島図上に差枚/機械割/G数/タグを色分け表示 |

---

## 7. 横断的な仕組み（重要概念）

### タグエンジン（`hstag.js` / `TagEngine`）
- ユーザーが「差枚≧1000 かつ G数≧5000」のような**条件グループ**を定義
- グループ内＝AND、グループ同士＝OR で台を判定
- 定義は `localStorage('customTagDefinitions')` に保存
- 日別・比較・タグマッチの各タブが同じエンジンを共用

### 機種フィルタープリセット（`preset.js` / `MachinePreset`）
- 日別・比較・トレンドの各タブ共通の機種フィルター部品（`utils.js` の `initMultiSelectMachineFilter`）から、プリセット選択 → 適用で利用
- 固定プリセットは `config.js` の `SITE_CONFIG.machinePresets` で定義
- 判定方式 `matchMode`: `partial`（部分一致）/ `exact`（`machines` 完全一致）/ `exclude`（除外方式）
- 除外方式の補助: `excludeKeywords`（部分一致除外）/ `excludeMachines`（完全一致除外）
- 台数で絞る: `minCount`（下限）/ `maxCount`（上限）。**選択中の日**の設置台数で判定
- 現状の固定プリセット（OGIYA磐田店）: 主力AT機種(6台以上) / ジャグ・ハナ・沖スロ / サブAT機種(3〜5台) / バラエティ(2台以下) / アクロス系
  - 主力/サブ/バラエティは `exclude` + `excludeMachines`（非AT機種を完全一致除外）+ 台数レンジで定義
  - 非AT機種リストは `config.js` 上部の `NON_AT_MACHINES` 定数に集約
- ユーザープリセットの保存・管理UI（💾⚙️）は廃止済み。`MachinePreset.add/remove/rename/updateMachines` のロジックは後方互換のため残置（未使用）

### 機種内バッジ（`machinebadge.js` / `MachineBadge`）
- その日を含む**直近N日間の累積差枚（or G数）**で同一機種内の順位を算出
- 🐙=上位（タコだし）、💀=下位（死に台）。表示順位 `[1,2,3]` をカスタム可
- **設置台数別ロジック**（日別タブ `assignBadges`）:
  - 3台以上 … 機種内で 🐙💀 を通常どおり順位付け
  - 2台 … 💀（死に台）1位のみ付与。🐙 は付けない（2台同値ならバッジなし）
  - 1台 … 単独では比較不可のため、「1台設置の機種」をすべてまとめた**横断グループ**で 🐙💀 を順位付け
  - トレンドタブ（`assignBadgesForTrend`）はこのロジック非対象（選択期間合計での機種内順位のまま）
- 設定は `localStorage`。設定変更後は**手動で再計算ボタン**が必要（フィルター変更では再計算しない）

### 状態の永続化
- **日別タブ**: `DailyState`（`daily-state.js`）が `localStorage('dailyTabState')` とURLクエリに保存。URL共有で同じビューを再現可能
- **タグ定義 / プリセット / バッジ設定 / 表示列**: それぞれ専用の `localStorage` キー

### パフォーマンス最適化
- 起動時は**最新2か月のみ**ロードし即表示 → 残りはバックグラウンドで並列ロード（`data.js`、同時3並列）
- トレンドタブは3段キャッシュ（`trendCache`: rawData → aggregated → finalResults）で再計算を回避

---

## 8. データ更新フロー（運用）

1. 日別のHTML/CSVデータを用意
2. `converter/convert_csv_to_json.py` を実行 → `data/YYYY_MM.json` を生成/追記し、`files.json` を更新
3. 新しい月を追加した場合は `files.json` の `monthly` 配列**先頭**に追記（新しい順）
4. イベントは `events.json` を手動編集
5. レイアウト変更時は `island-config.json` / `position.csv` を編集

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
| トレンドのグラフ表示 | `js/chart.js` + `js/trend.js` |
| タグの判定条件・UI | `js/hstag.js`（`TagEngine`） |
| バッジ（🐙💀）のロジック | `js/machinebadge.js` |
| 島図のレイアウト | `data/island-config.json` + `js/island.js` |
| 初期化順・タブ切替の挙動 | `js/app.js` |
| 共通ボタン/モーダル/トーストの見た目 | `css/components.css` |
| 色（CSS変数） | `css/theme.css` |

---

## 10. 既知の注意点 / 技術的負債

- `dataCache` のキーは `data/YYYY_MM_DD.csv` という**疑似CSVファイル名**（実体はJSON）。`loadCSV()` は実際にはキャッシュ参照のみ。
- グローバル変数（`CSV_FILES` 等）と `HallData.store` が**二重管理**。`syncToStore/syncFromStore` で都度同期している。
- `tagmatch.js` のロジックは存在するが、`index.html` に対応タブボタンが無い（無効化中の可能性）。
- `prompt.txt` のファイル一覧は古い。正は本 `ARCHITECTURE.md`。
- 全データを文字列で保持しているため、数値比較・ソート時は各所でパースしている。
- - 機種フィルターの💾保存・⚙️管理ボタンは廃止したが、`preset.js` の `add/remove/rename/updateMachines` と `components.css` の `.preset-save-btn` `.preset-manage-btn` `.preset-manage-panel` 系スタイルは未使用のまま残置している（復活させたくなったとき用）。
- プリセットの `exact` / `excludeMachines` はデータの `機種名` と**完全一致**が前提。表記ゆれ（全角スペース・波ダッシュ・ハイフン種別など）があるとマッチしないため、機種追加時は実データと突き合わせて都度修正する運用。
- バッジの台数別ロジックは日別タブ（`assignBadges`）のみ。トレンド（`assignBadgesForTrend`）は従来の機種内順位のまま二系統が併存している。

---

## 11. AI への作業依頼テンプレ（このファイルの使い方）

> 編集を依頼するときは、このファイルと**該当する1〜2個のJSファイルだけ**を読ませれば足りる。
>
> 例:「日別タブのソートに新しい項目を追加したい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/daily.js`（必要なら `index.html` の `#sortBy`）
>
> 例:「機種プリセットを増やしたい」
> → 読ませるファイル: `ARCHITECTURE.md` + `js/config.js`（+ `js/preset.js`）
