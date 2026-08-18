# AI 作業ルール（クレジット節約が最優先事項）

このリポジトリは**巨大データを含む静的サイト**です。
何も考えずにファイルを読むと、1回の小改修で数千クレジットが消えます。
**作業開始前に必ずこのファイルと `CODEMAP.md` を読み、以下のルールに従ってください。**

---

## 0. 最初にやること（この順番厳守）

```
1. CLAUDE.md（このファイル）を読む            … 約1,200tok
2. CODEMAP.md を読む                          … 約4,400tok
3. tools/find.sh <対象> で修正箇所の行番号を引く … 約50tok
4. Read(file, offset=行-10, limit=80) で周辺だけ読む … 約1,000tok
5. Edit で該当箇所のみ置換                    … 約500tok
6. python3 tools/gen_codemap.py で索引更新     … 0tok
7. git commit
```

**ARCHITECTURE.md（約16,000tok）は最初に読まないでください。**
仕様の背景がどうしても必要なときだけ、章を絞って読むこと:

```bash
grep -n '^## ' ARCHITECTURE.md      # 章の一覧と行番号（安い）
sed -n '120,180p' ARCHITECTURE.md   # 必要な章だけ
```

---

## 1. 絶対に読み込んではいけないファイル

| ファイル | サイズ | 全読みした場合 |
|---|--:|--:|
| `data/*.json`（20ファイル） | 約68MB | **約2,300万トークン** |
| `unit_history.json` | 311KB | 約104,000トークン |

`Read`・`cat`・`head -c 大きい値` すべて禁止です。
**中身の確認は必ず `tools/peek.sh` を使ってください（トークン消費0）。**

```bash
tools/peek.sh dates    2026_08        # 日付キー一覧
tools/peek.sh fields   2026_08        # フィールド名一覧
tools/peek.sh sample   2026_08        # 1レコードのサンプル
tools/peek.sh machines 2026_08        # 機種名一覧
tools/peek.sh count    2026_08_16     # その日の台数
tools/peek.sh unit     2026_08_16 881 # 特定台のレコード
tools/peek.sh top      2026_08_16 10  # 差枚トップ10
tools/peek.sh history  881            # 台番号の履歴
tools/peek.sh jq       2026_08 '<任意のjq式>'
```

### データスキーマ（これを把握していれば中身を開く理由はない）

```
data/YYYY_MM.json = {
  "YYYY_MM_DD": [   // 日付キー → その日の全台レコード配列
    { "機種名", "台番号", "G数", "差枚", "BB", "RB", "ART",
      "合成確率", "BB確率", "RB確率", "ART確率" },
    ...
  ], ...
}
```

- **全フィールドが文字列**。数値も `"9668"`、確率は `"1/123.9"` 形式。
- `jq` で日本語キーを扱うときは**ブラケット記法**を使う（`.機種名` はエラー）:
  `jq '.["2026_08_16"][0]["機種名"]' data/2026_08.json`

---

## 2. 巨大な JS ファイルの扱い

以下は**全文読み込み禁止**です。`tools/find.sh` で位置を引き、範囲読みしてください。

| ファイル | 行数 | 全読みコスト |
|---|--:|--:|
| `js/daily.js` | 2,568 | 約34,000tok |
| `js/analysis.js` | 2,050 | 約33,000tok |
| `js/utils.js` | 2,630 | 約30,000tok |
| `js/aim.js` | 1,851 | 約26,000tok |

```bash
# 関数・CSSセレクタ・HTMLのid をまとめて引ける
tools/find.sh renderDailyTable
tools/find.sh HallData.utils.getUnitStatus
tools/find.sh '#dailyTable'
tools/find.sh '.badge-tako'
tools/find.sh バッジ          # セクション見出しの部分一致
```

出力例:
```
func    HallData.utils.getUnitStatus       js/utils.js:2285
→ 周辺だけ読む: Read('js/utils.js', offset=2275, limit=80)
```

---

## 3. 書き込みのルール

- **`Write` でのファイル全体上書きは禁止**（既存ファイルに対して）。
  出力トークンも課金対象なので、2,500行のファイルを書き直すと入力+出力で6万tok超。
- 必ず **`Edit`（部分置換）** を使う。
- 大量の類似修正は `Edit` の `replace_all` か、`python3 -` のワンライナーで機械的に処理する。
  スクリプト経由の書き換えはトークンを消費しません。

```bash
# 例: 機械的な一括置換はコードでやる（トークン0）
python3 - <<'PY'
p='js/daily.js'
s=open(p,encoding='utf-8').read()
s=s.replace('oldName(', 'newName(')
open(p,'w',encoding='utf-8').write(s)
PY
```

---

## 4. 検索のルール

- `grep -r` を裸で打たない。ヒット行が全部コンテキストに乗って課金されます。
- 必ず**除外と件数制限**を付ける:

```bash
grep -rn --include="*.js" --exclude-dir=data --exclude-dir=.git \
     -F "検索語" . | head -20
```

- ファイル名だけ知りたいときは `-l`、件数だけなら `-c` を使う。

---

## 5. セッション運用のルール

会話が長くなるほど、**過去のやり取り全体が毎ターン再課金されます**。
これが「ちょっとの改修で7,000クレジット」の主因です。

- **1セッション = 1機能**。無関係な改修を同じ会話で続けない。
- 機能が終わったら**コミットして新しい会話を始める**。
- 「ついでにあれも」を避ける。別セッションにする方が結果的に安い。
- 長い出力（ファイル全文の表示、大量のログ）を要求しない。

---

## 6. プロジェクト概要（最小限）

- **完全な静的サイト**。ビルド不要、バニラJS（ES5寄り）+ HTML + CSS。
- `index.html` がガワ、各ページ実体は `partials/*.html` を fetch して挿入。
- データは `data/YYYY_MM.json` を fetch。読み込む月は `files.json` で管理。
- 状態は `localStorage` + URLハッシュ。狙い台シートと掲示板のみ Cloudflare Workers + D1。
- 外部CDN: Chart.js, html2canvas, Google Fonts (Inter)。
- デザインは `DESIGN.md`（DevFocus Dark）準拠。色は `css/theme.css` に集約。
- 詳細な仕様背景は `ARCHITECTURE.md`（**必要な章だけ** `sed -n` で読む）。

### ファイル構成の要点

```
js/config.js       サイト設定（ホール名・テーマ・機種プリセット）
js/app.js          起動 init()
js/router.js       ページ遷移（URLハッシュ）
js/data.js         月別JSONのロード
js/utils.js        共通ユーティリティ（HallData.utils.*）★巨大
js/daily.js        日別データページ ★巨大
js/analysis.js     解析ページ ★巨大
js/aim.js          狙い台シート ★巨大
js/calendar.js     カレンダー
js/island.js       島図
js/machinebadge.js 機種内バッジ
js/preset.js       機種プリセット
js/memo.js         着席メモ
js/board.js        取材掲示板
js/promotion.js    取材ページ
```

---

## 7. 変更後に必ずやること

```bash
cd /home/user/webapp
python3 tools/gen_codemap.py     # 索引を最新化（数秒・トークン0）
git add -A && git commit -m "..."
```

`CODEMAP.md` と `.codemap/index.tsv` は自動生成物です。**手で編集しないこと。**

---

## 8. コスト早見表

| 操作 | 概算トークン | 判定 |
|---|--:|:--:|
| `CLAUDE.md` + `CODEMAP.md` を読む | 5,600 | ✅ 毎回OK |
| `tools/find.sh` で位置を引く | 50 | ✅ |
| `tools/peek.sh` でデータ確認 | 0〜200 | ✅ |
| 80行の範囲読み | 1,000 | ✅ |
| `js/daily.js` 全文読み | 34,000 | ⛔ |
| `ARCHITECTURE.md` 全文読み | 16,000 | ⚠️ 章を絞る |
| `data/2026_08.json` 全文読み | 688,000 | ⛔⛔⛔ |
| データ全ファイル読み | 23,000,000 | ⛔⛔⛔ |

**目標: 1回の小改修を 5,000〜10,000トークン以内で完了させる。**
