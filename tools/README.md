# tools/ — クレジット節約ツール

「ちょっとした改修で数千クレジット消える」問題を解決するための道具です。

## 何が問題だったのか

このリポジトリは合計 **約68MB のデータJSON** と **2,000〜2,600行級のJSファイル4本** を含みます。

| 対象 | 全文読み込み時の概算トークン |
|---|--:|
| `data/*.json` 全体 | 約 2,300 万 |
| `data/2026_08.json` 1本 | 約 68 万 |
| `js/daily.js` | 約 3.4 万 |
| `js/utils.js` | 約 3.0 万 |
| `ARCHITECTURE.md` | 約 1.6 万 |

AIが状況把握のために `js/daily.js` と `js/utils.js` を読み、
さらに会話が長引いて毎ターン再課金されると、
**小さな修正1件でも数千クレジット**に達します。

## 解決方針

**「読む」を「引く」に置き換える。**

ソースを丸ごとコンテキストに載せる代わりに、
シンボルの位置を索引から引き、必要な80行だけを読みます。

---

## スクリプト一覧

### `gen_codemap.py` — 索引生成

```bash
python3 tools/gen_codemap.py
```

2つの生成物を出します。

| 生成物 | 用途 | サイズ |
|---|---|--:|
| `CODEMAP.md` | AIが**毎回読む**軽量サマリ | 約4,400tok |
| `.codemap/index.tsv` | **読まずに grep する**全シンボル索引 | 2,700件 |

索引を Markdown に全部書くと、それ自体が1万トークン超になって本末転倒です。
そのため詳細は TSV に分離し、`find.sh` で引く設計にしています。

**コードを変更したら必ず再実行してください**（数秒・トークン消費0）。

---

### `find.sh` — シンボルの位置を引く

```bash
tools/find.sh renderDailyTable              # 関数
tools/find.sh HallData.utils.getUnitStatus  # 名前空間付きも可
tools/find.sh '#dailyTable'                 # HTML の id
tools/find.sh '.badge-tako'                 # CSS セレクタ
tools/find.sh バッジ                         # セクション見出しの部分一致
tools/find.sh -e getUnitStatus              # 完全一致のみ
```

出力:

```
func    HallData.utils.getUnitStatus       js/utils.js:2285
func    getUnitStatus                      js/utils.js:2285
```

1件に絞れたときは読み方まで提示します。

```
→ 周辺だけ読む: Read('js/utils.js', offset=2275, limit=80)
→ CLIで見る  : sed -n '2275,2355p' js/utils.js
```

索引に無い場合はソースの grep に自動フォールバックしますが、
**件数と先頭20件だけ**を出してトークンを抑えます。

---

### `peek.sh` — 巨大データをトークン0で覗く

`data/*.json` は絶対に `Read` してはいけません。確認はこれ経由で。

```bash
tools/peek.sh dates    2026_08        # 日付キー一覧
tools/peek.sh fields   2026_08        # フィールド名一覧
tools/peek.sh sample   2026_08        # 1レコードのサンプル
tools/peek.sh machines 2026_08        # 機種名一覧（重複除去）
tools/peek.sh count    2026_08_16     # その日の台数
tools/peek.sh unit     2026_08_16 881 # 特定台のレコード
tools/peek.sh top      2026_08_16 10  # 差枚トップ10
tools/peek.sh history  881            # 台番号の状態変化履歴
tools/peek.sh files                   # 全データファイルのサイズとトークン量
tools/peek.sh jq       2026_08 '<任意のjq式>'
```

> **jq の注意**: 日本語キーはドット記法が使えません。
> `.機種名` はエラーになるので `.["機種名"]` と書いてください。

---

## 推奨ワークフロー

```
1. CLAUDE.md を読む                              約2,500tok
2. CODEMAP.md を読む                             約4,400tok
3. tools/find.sh <対象>                          約50tok
4. Read(file, offset=行-10, limit=80)            約1,000tok
5. Edit で部分置換（Write で全体上書きしない）      約500tok
6. python3 tools/gen_codemap.py                  0tok
7. git commit
                                        合計 約8,500tok
```

従来（巨大ファイルを数本読む）と比べて **5〜10分の1** になります。

2回目以降のセッションは 1〜2 が不要になる場面もあり、さらに安くなります。

---

## セッション運用が実は一番効く

会話が長くなると、**過去のやり取り全体が毎ターン再課金**されます。
ツールで単発の読み込みを削っても、1つの会話で10機能触れば累積で膨らみます。

- **1セッション = 1機能**を守る
- 機能が終わったらコミットして**新しい会話を始める**
- 「ついでにあれも」を我慢する方が、結果的に安い

---

## メンテナンス

- `CODEMAP.md` と `.codemap/index.tsv` は**自動生成物**。手で編集しないこと。
- 新しい JS/CSS ファイルを追加したら `gen_codemap.py` を再実行するだけで索引に入ります。
- 抽出パターンを増やしたい場合は `gen_codemap.py` の `RE_FUNCS` を編集してください。
