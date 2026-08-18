# CODEMAP — 軽量コード地図（自動生成・手編集禁止）

生成: 2026-08-19 03:43 JST / `python3 tools/gen_codemap.py`

## 使い方（AIも人間もまずここを読む）

このファイルは**サマリだけ**（約2,500トークン）。詳細索引は Markdown に書かず
`.codemap/index.tsv` に置いてある。**読まずに grep する**のが正しい使い方。

```bash
tools/find.sh renderDailyTable   # 関数/CSS/idの定義位置を1行で返す
tools/find.sh 'バッジ'            # セクション見出しの部分一致もOK
tools/peek.sh dates 2026_08      # データの中身をトークン0で確認
```

引いた行番号を使って **範囲読み** する:
`Read('js/daily.js', offset=1420, limit=80)`

---

## 1. 読み込みコスト表（丸ごと読むと何トークン消えるか）

| ファイル | 行 | tok | 判定 |
|---|--:|--:|:--:|
| `js/daily.js` | 2530 | ~33,986 | ⛔全読み禁止 |
| `js/analysis.js` | 2050 | ~33,193 | ⛔全読み禁止 |
| `js/utils.js` | 2630 | ~29,988 | ⛔全読み禁止 |
| `js/aim.js` | 1851 | ~25,956 | ⛔全読み禁止 |
| `ARCHITECTURE.md` | 411 | ~16,249 | ⚠️部分のみ |
| `css/components.css` | 1703 | ~13,068 | ⚠️部分のみ |
| `js/calendar.js` | 973 | ~12,113 | ⚠️部分のみ |
| `js/promotion.js` | 789 | ~11,231 | ⚠️部分のみ |
| `js/hstag.js` | 849 | ~10,729 | ⚠️部分のみ |
| `js/machinebadge.js` | 698 | ~10,596 | ⚠️部分のみ |
| `css/style.css` | 1332 | ~10,569 | ⚠️部分のみ |
| `css/daily.css` | 1239 | ~10,216 | ⚠️部分のみ |
| `js/island.js` | 688 | ~8,209 | ⚠️部分のみ |
| `css/analysis.css` | 909 | ~7,753 | ✅ |
| `css/calendar.css` | 1027 | ~6,836 | ✅ |
| `js/data.js` | 590 | ~6,827 | ✅ |
| `events.json` | 668 | ~6,567 | ✅ |
| `css/aim.css` | 558 | ~5,995 | ✅ |
| `js/memo.js` | 419 | ~5,455 | ✅ |
| `partials/analysis.html` | 342 | ~5,059 | ✅ |
| `DESIGN.md` | 329 | ~4,614 | ✅ |
| `CODEMAP.md` | 221 | ~4,442 | ✅ |
| `js/daily-state.js` | 355 | ~4,366 | ✅ |
| `js/router.js` | 291 | ~3,591 | ✅ |
| `css/island.css` | 577 | ~3,556 | ✅ |
| `js/board.js` | 229 | ~3,415 | ✅ |
| `css/machinebadge.css` | 402 | ~3,345 | ✅ |
| `css/promotion.css` | 363 | ~3,265 | ✅ |
| `index.html` | 191 | ~3,164 | ✅ |
| `partials/daily.html` | 186 | ~2,789 | ✅ |
| `js/preset.js` | 202 | ~2,428 | ✅ |
| `js/chart.js` | 190 | ~2,358 | ✅ |
| `js/floating-nav.js` | 208 | ~2,346 | ✅ |
| `css/memo.css` | 172 | ~2,071 | ✅ |
| `partials/aim.html` | 105 | ~2,039 | ✅ |
| `js/config.js` | 166 | ~1,935 | ✅ |
| `css/theme.css` | 122 | ~1,337 | ✅ |
| `js/app.js` | 121 | ~1,313 | ✅ |
| `js/bottomsheet.js` | 97 | ~1,179 | ✅ |
| `partials/calendar.html` | 59 | ~995 | ✅ |
| `partials/island.html` | 67 | ~854 | ✅ |
| `partials/promotion/promotion.html` | 33 | ~650 | ✅ |
| `partials/promotion/zombie.html` | 12 | ~247 | ✅ |
| `partials/promotion/tenun.html` | 12 | ~246 | ✅ |
| `partials/promotion/ougi.html` | 12 | ~246 | ✅ |
| `files.json` | 24 | ~173 | ✅ |

**⛔ `data/*.json`（23ファイル）+ `unit_history.json` = 67.4MB / 概算 23,570,378 トークン**

→ この中身を開くと1回で月間クレジットが消える。**絶対に Read しない。**
　 集計は `jq` / `tools/peek.sh` を使う（トークン0）。スキーマは §3 にある。

---

## 2. js/ の構成（関数の位置は `tools/find.sh` で引く）

**`js/aim.js`** 1851行/~25,956tok ⛔ 関数108個
　L1 狙い台ページ（AimSheet） / L89 状態 / L154 ストレージ（ローカル） / L184 クラウド（D1 / Workers） / L310 基準日の解決 / データロード / L358 プリセット振り分け（共通） / L430 作成: データ構築 / L481 区分振り分け（共通） / L546 作成: 描画 / L632 凹み判定（バッジ）設定：ボトムシート / L674 機種除外パネル / L818 ドラッグ統合 / L1003 カードのタップメニュー / L1080 ドロップ確定 …他8件

**`js/analysis.js`** 2050行/~33,193tok ⛔ 関数122個 — 公開 `window.trendDisplayData`
　L1 データトレンドタブ（パフォーマンス最適化版） / L25 パフォーマンス: キャッシュ管理 / L51 データ列の設定 / L137 位置フィルター / L163 日付イベント情報 / L191 日付フィルター関連 / L283 フィルターパネル / L373 日付選択モーダル / L415 機種フィルター / L431 列表示・グラフ設定 / L469 メインデータ読み込み（3段階キャッシュ） / L576 Stage 1: 生データ収集 / L634 Stage 2: 集計 / L741 フィルター・ソート …他12件

**`js/app.js`** 121行/~1,313tok 関数4個
　L1 メイン初期化・タブ切り替え

**`js/board.js`** 229行/~3,415tok 関数16個 — 公開 `window.Board`
　L1 取材掲示板モジュール（board.js）

**`js/bottomsheet.js`** 97行/~1,179tok 関数9個
　L1 ボトムシート（ハーフモーダル）共通モジュール

**`js/calendar.js`** 973行/~12,113tok ⚠️ 関数29個
　L1 カレンダータブ / L7 カレンダーから日別データへ遷移 / L364 週間おすすめ機種の処理 / L435 カレンダー描画 / L597 スマホ用リスト表示 / L783 月間累積差枚推移グラフ

**`js/chart.js`** 190行/~2,358tok 関数10個
　L1 グラフ描画モジュール

**`js/config.js`** 166行/~1,935tok 関数0個
　L1 非AT機種リスト / L3 ジャグラー系・ハナハナ沖スロ系・アクロス系の機種一覧。 / L35 サイト設定 / L57 機種フィルタープリセット（固定） / L59 matchMode: / L147 設定を適用

**`js/daily-state.js`** 355行/~4,366tok 関数19個
　L1 日別タブ 状態管理モジュール

**`js/daily.js`** 2530行/~33,986tok ⛔ 関数89個
　L1 日別データタブ / L19 数値フィルター（グループAND/OR方式） / L348 プレビュー更新 / L436 日別タブ状態管理 / L450 機械割計算 / L482 汎用モーダル開閉 / L496 機種フィルター / L540 列選択 / L627 機種内バッジ設定（モーダル内） / L800 表示列（統合グループ対応） / L915 日付ナビゲーション / L1000 タグカウント表示 / L1017 テーブル スケルトン / スピナー / L1053 メインフィルター＆描画 …他8件

**`js/data.js`** 590行/~6,827tok 関数30個
　L1 データ読み込み・管理 / L36 仮想翌日（稼働中メモ用） / L143 ローディング制御 / L200 データ読み込み

**`js/floating-nav.js`** 208行/~2,346tok 関数12個 — 公開 `window.FloatingNav`
　L1 floating-nav.js

**`js/hstag.js`** 849行/~10,729tok ⚠️ 関数41個
　L1 汎用タグ判定エンジン（複数タグ定義対応） / L7 定数 / L68 状態 / L78 ストレージ / L134 タグ定義CRUD / L180 グループ・条件操作 / L247 プリセット / L271 判定ロジック / L381 UI描画 / L548 UIイベント / L695 UI登録 / L708 初期化 / L714 公開API / L801 後方互換性のためのラッパー関数

**`js/island.js`** 688行/~8,209tok ⚠️ 関数26個
　L1 島図タブ / L44 初期化 / L87 日付セレクター / L140 データ取得 / L178 機種名の省略 / L190 描画 / L461 統一カラー計算 / L518 台詳細モーダル / L594 イベントリスナー / L671 公開API

**`js/machinebadge.js`** 698行/~10,596tok ⚠️ 関数31個
　L1 機種内バッジシステム / L21 設定 / L49 ストレージ / L93 日付・除外判定ヘルパ / L144 累積計算 / L235 コアランク計算 / L274 日別タブ用: 累積でバッジ付与 / L365 トレンドタブ用: aggregated結果に対してバッジ付与 / L399 HTML描画 / L443 設定UI / L649 ゲッター / L668 初期化 / L672 公開API

**`js/memo.js`** 419行/~5,455tok 関数28個
　L1 着席メモ（SeatMemo） / L32 ストレージ（ローカル） / L53 メモ操作（ローカル） / L86 バッジ生成（日別タブ・メモ列で共用） / L122 クラウド（D1 / Workers・任意） / L183 入力モーダル（動的生成） / L358 日付ラベル / L379 初期化 / L398 ヘルパ

**`js/preset.js`** 202行/~2,428tok 関数6個
　L1 機種フィルタープリセット管理 / L8 ストレージ / L25 固定プリセット / L47 全プリセット取得 / L58 マッチング / L194 公開API

**`js/promotion.js`** 789行/~11,231tok ⚠️ 関数32個 — 公開 `window.Promotion`
　L1 取材ページ共通モジュール（promotion.js） / L49 events 取得（ストア優先 → 無ければ自前 fetch してキャッシュ） / L88 日付・キャッシュ・データ抽出 / L141 集計ヘルパー / L174 その日の全台ランキング集計 / L245 描画エントリ（events を取得してから描く） / L261 開催日一覧（カード ＋ 対象機種マトリクス） / L351 対象機種マトリクス（縦:機種 × 横:開催日） / L435 全体マトリクス（3取材を1枚に統合） / L605 詳細ページ（テーブル＋サマリーバー） / L632 その日の全台ランキング描画 / L772 ユーティリティ

**`js/router.js`** 291行/~3,591tok 関数19個 — 公開 `window.Router`
　L1 ハッシュルーター（完全版 / パラメータ対応 #page/param） / L104 取材（promotion）

**`js/utils.js`** 2630行/~29,988tok ⛔ 関数128個 — 公開 `window.HallData`
　L1 名前空間とグローバル状態管理 / L74 統一ソート関数 / L318 後方互換性のためのエイリアス / L371 ユーティリティ関数 / L442 テーブル描画 / L491 検索可能セレクトボックス / L732 共通コピー・ダウンロード機能 / L920 複数選択可能な機種フィルター（プリセット対応版） / L976 プリセット機能 / L1059 機種リスト描画 / L1233 イベントリスナー / L1374 機種ごとの台数を取得 / L1415 イベント関連（共通） / L1645 イベントバッジ描画（統一版） …他5件

---

## 3. css/ 一覧（セレクタ位置は `tools/find.sh .クラス名`）

- `css/aim.css` 558行/~5,995tok （セレクタ156個）
- `css/analysis.css` 909行/~7,753tok （セレクタ174個）
- `css/calendar.css` 1027行/~6,836tok （セレクタ178個）
- `css/components.css` 1703行/~13,068tok （セレクタ233個）
- `css/daily.css` 1239行/~10,216tok （セレクタ199個）
- `css/island.css` 577行/~3,556tok （セレクタ77個）
- `css/machinebadge.css` 402行/~3,345tok （セレクタ59個）
- `css/memo.css` 172行/~2,071tok （セレクタ60個）
- `css/promotion.css` 363行/~3,265tok （セレクタ85個）
- `css/style.css` 1332行/~10,569tok （セレクタ136個）
- `css/theme.css` 122行/~1,337tok （セレクタ0個）

---

## 4. partials/ 一覧（id の位置は `tools/find.sh '#myId'`）

- `index.html` 191行/~3,164tok （id 19個）
- `partials/aim.html` 105行/~2,039tok （id 25個）
- `partials/analysis.html` 342行/~5,059tok （id 82個）
- `partials/calendar.html` 59行/~995tok （id 8個）
- `partials/daily.html` 186行/~2,789tok （id 52個）
- `partials/island.html` 67行/~854tok （id 11個）
- `partials/promotion/ougi.html` 12行/~246tok （id 0個）
- `partials/promotion/promotion.html` 33行/~650tok （id 0個）
- `partials/promotion/tenun.html` 12行/~246tok （id 0個）
- `partials/promotion/zombie.html` 12行/~247tok （id 0個）

---

## 5. データスキーマ（これを読めば data/*.json を開く必要はない）

取得元 `data/2026_08.json` の実レコード:

```
data/YYYY_MM.json = {
  "YYYY_MM_DD": [        // 日付キー → その日の全台レコード配列
    { "機種名", "台番号", "G数", "差枚", "BB", "RB", "ART", "合成確率", "BB確率", "RB確率", "ART確率" },
    ...
  ], ...
}
```

**全フィールドが文字列**。数値も `"9668"`、確率は `"1/123.9"` 形式。

### データ確認コマンド（トークン0）

```bash
tools/peek.sh dates 2026_08          # 日付キー一覧
tools/peek.sh sample 2026_08         # 1レコードのサンプル
tools/peek.sh machines 2026_08       # 機種名一覧
tools/peek.sh count 2026_08_16       # その日の台数
tools/peek.sh fields 2026_08         # フィールド名一覧
```

---

## 6. 改修フロー（この順序が最安）

| 手順 | コマンド | 概算tok |
|---|---|--:|
| 1. 地図を読む | `Read CODEMAP.md` | ~2,500 |
| 2. 位置を引く | `tools/find.sh 関数名` | ~50 |
| 3. 周辺だけ読む | `Read(f, offset=L-10, limit=80)` | ~1,000 |
| 4. 部分置換 | `Edit`（全体 `Write` 禁止） | ~500 |
| 5. 地図更新 | `python3 tools/gen_codemap.py` | 0 |
| 6. コミット | `git commit` | 0 |
| **合計** | | **~4,000** |

### 禁止事項（これが7,000クレジットの原因）

- `Read('js/utils.js')` など**全文読み** → 1回3万tok
- `Write` でファイル全体を上書き → 入力+出力で二重課金
- `data/*.json` `unit_history.json` を開く → 数十万tok
- `ARCHITECTURE.md` 全文読み → 1.6万tok。必要な章だけ `sed -n '80,140p'`
- `grep -r` を絞らずに実行 → ヒット行が全部コンテキストに乗る
- 1セッションで無関係な複数機能を触る → 文脈が累積して毎ターン再課金

