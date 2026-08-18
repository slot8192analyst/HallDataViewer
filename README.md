# Hall-Data-Viewer

パチンコ店（ホール）のスロットデータを可視化する静的Webサイト。
バニラJS + HTML + CSS、ビルド不要。

## ドキュメント

| ファイル | 内容 |
|---|---|
| **`CLAUDE.md`** | **AI/開発者の作業ルール（クレジット節約が最優先）。まずこれを読む** |
| **`CODEMAP.md`** | コード地図（自動生成）。どのファイルの何行目に何があるか |
| `tools/README.md` | 節約ツールの使い方と設計意図 |
| `ARCHITECTURE.md` | 詳細設計（約16,000トークン。**必要な章だけ**読む） |
| `DESIGN.md` | デザインシステム（DevFocus Dark） |

## AIに改修を頼むときの前提

このリポジトリは **約68MB のデータJSON** と **2,000行級のJSファイル4本** を含みます。
AIが状況把握のために巨大ファイルを丸ごと読むと、
小さな修正1件でも数千クレジットを消費します。

そのため以下の索引ツールを用意しています。**AIには必ず `CLAUDE.md` を読ませてください。**

```bash
tools/check.sh                    # 節約体制の自己診断
python3 tools/gen_codemap.py      # 索引を更新（コード変更後に必ず実行）
tools/find.sh renderDailyTable    # シンボルの位置を引く（全文を読まない）
tools/peek.sh dates 2026_08       # 巨大データをトークン0で覗く
```

詳細は [`tools/README.md`](tools/README.md) を参照。

## ローカルで動かす

`file://` では partials の fetch が失敗するため、HTTP配信が必須です。

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## データ更新

```bash
# CSV/HTML → 月別JSON
python3 converter/convert_csv_to_json.py

# 台の状態変化履歴を再生成
python3 history-maker/build_unit_history.py
```
