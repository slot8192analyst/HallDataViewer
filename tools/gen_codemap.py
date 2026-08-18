#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CODEMAP 生成スクリプト（クレジット節約用）

生成物は2つ:

  1. CODEMAP.md        … 人/AIが最初に読む軽量サマリ（約2,500トークン）
                          ファイル一覧・コスト表・セクション見出し・データスキーマ・作業フロー

  2. .codemap/index.tsv … 全シンボル索引（読まずに grep する用）
                          形式: <種別>\t<シンボル>\t<ファイル>\t<行>
                          例:   func\trenderDailyTable\tjs/daily.js\t1433

  なぜ分けるか:
    索引を全部 Markdown に書くと、それ自体が9,000トークン以上になり本末転倒。
    TSV にして `grep` すれば、1シンボル引くコストは実質50トークン以下になる。

使い方:
  cd /home/user/webapp && python3 tools/gen_codemap.py

  # シンボルを引く（トークンほぼ0）
  tools/find.sh renderDailyTable
"""

import os
import re
import json
import subprocess
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_DIR = os.path.join(ROOT, ".codemap")

JS_DIR, CSS_DIR, PARTIALS_DIR, DATA_DIR = "js", "css", "partials", "data"

# ---------------------------------------------------------------------------
# 抽出パターン
# ---------------------------------------------------------------------------
RE_SECTION_BAR = re.compile(r"^\s*//\s*={3,}\s*$")
RE_SECTION_TITLE = re.compile(r"^\s*//\s*(?:={3,}\s*)?([^=/].*?)\s*(?:={3,})?\s*$")

RE_FUNCS = [
    # function foo(...)
    re.compile(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\("),
    # const foo = function(...) / const foo = (...) =>
    re.compile(r"^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?"
               r"(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)"),
    # HallData.utils.getUnitStatus = function(...)  ← 名前空間への代入
    # Foo.bar.baz = (...) => / = async function
    re.compile(r"^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\.([A-Za-z_$][\w$]*)\s*=\s*"
               r"(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)"),
    # window.Foo.bar = function / Foo.bar = function（2階層）
    re.compile(r"^\s*[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*=\s*"
               r"(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)"),
    # foo: function(...)
    re.compile(r"^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function\s*\("),
    # foo: (...) => {   （オブジェクト内アロー）
    re.compile(r"^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>"),
    # メソッド短縮形  foo(...) {
    re.compile(r"^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$"),
]

# 名前空間付きのフルネームも索引に入れる（HallData.utils.getUnitStatus で引けるように）
RE_NS_ASSIGN = re.compile(
    r"^\s*((?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*)\s*=\s*"
    r"(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)"
)

RE_WINDOW_EXPORT = re.compile(r"^\s*window\.([A-Za-z_$][\w$]*)\s*=")
RE_CSS_SECTION = re.compile(r"^\s*/\*+\s*(.+?)\s*\*+/\s*$")
RE_CSS_SELECTOR = re.compile(r"^([.#][A-Za-z][\w\-]*(?:[^{]*)?)\s*\{")
RE_HTML_ID = re.compile(r'id="([A-Za-z0-9_\-]+)"')

NOISE = {"if", "for", "while", "switch", "catch", "function", "return", "else", "try", "do"}


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def size_str(n):
    if n < 1024:
        return f"{n}B"
    if n < 1024 * 1024:
        return f"{n/1024:.0f}KB"
    return f"{n/1024/1024:.1f}MB"


def est(n):
    """UTF-8 日本語混在の概算トークン数"""
    return n // 3


def nlines(p):
    with open(p, encoding="utf-8", errors="replace") as f:
        return sum(1 for _ in f)


# ---------------------------------------------------------------------------
# 解析
# ---------------------------------------------------------------------------
def parse_js(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    sections, funcs, exports = [], [], []

    for idx, raw in enumerate(lines):
        i = idx + 1
        line = raw.rstrip("\n")

        m = RE_WINDOW_EXPORT.match(line)
        if m:
            exports.append(m.group(1))

        # // =====  の次行がタイトル
        if RE_SECTION_BAR.match(line):
            if idx + 1 < len(lines):
                nxt = lines[idx + 1].rstrip("\n")
                if not RE_SECTION_BAR.match(nxt):
                    mt = RE_SECTION_TITLE.match(nxt)
                    if mt:
                        t = mt.group(1).strip().strip("=").strip()
                        if t and len(t) < 60:
                            sections.append((i, t))
            continue

        # // ========== タイトル ==========
        if line.strip().startswith("//") and "=====" in line:
            t = line.strip().lstrip("/").strip().strip("=").strip()
            if t and len(t) < 60:
                sections.append((i, t))
            continue

        # 名前空間フルネーム（HallData.utils.getUnitStatus）も登録
        mns = RE_NS_ASSIGN.match(line)
        if mns:
            full = mns.group(1)
            if not full.startswith("window."):
                funcs.append((i, full))

        for pat in RE_FUNCS:
            m = pat.match(line)
            if m and m.group(1) not in NOISE:
                funcs.append((i, m.group(1)))
                break

    seen, uniq = set(), []
    for ln, t in sections:
        if t not in seen:
            seen.add(t)
            uniq.append((ln, t))

    # 関数の重複除去（同名・同行の二重登録を防ぐ）+ 行番号順
    fseen, ufuncs = set(), []
    for ln, name in sorted(funcs):
        key = (ln, name)
        if key not in fseen:
            fseen.add(key)
            ufuncs.append((ln, name))
    funcs = ufuncs

    return {"sections": uniq, "funcs": funcs, "exports": sorted(set(exports)),
            "nlines": len(lines), "nbytes": os.path.getsize(path)}


def parse_css(path):
    sections, selectors = [], []
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, raw in enumerate(f, 1):
            line = raw.rstrip("\n")
            m = RE_CSS_SECTION.match(line)
            if m:
                t = m.group(1).strip().strip("=").strip("-").strip()
                if t and len(t) < 60 and not t.startswith("!"):
                    sections.append((i, t))
                continue
            m = RE_CSS_SELECTOR.match(line)
            if m:
                for sel in re.findall(r"[.#][A-Za-z][\w\-]*", m.group(1)):
                    selectors.append((i, sel))
    return {"sections": sections, "selectors": selectors,
            "nlines": nlines(path), "nbytes": os.path.getsize(path)}


def parse_html(path):
    ids = []
    with open(path, encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f, 1):
            for m in RE_HTML_ID.finditer(line):
                ids.append((i, m.group(1)))
    return {"ids": ids, "nlines": nlines(path), "nbytes": os.path.getsize(path)}


def data_schema():
    d = os.path.join(ROOT, DATA_DIR)
    files = sorted(f for f in os.listdir(d) if re.match(r"^\d{4}_\d{2}\.json$", f))
    if not files:
        return None, []
    latest = files[-1]
    path = os.path.join(d, latest)
    try:
        out = subprocess.run(["jq", "-c", "to_entries[0].value[0]", path],
                             capture_output=True, text=True, timeout=90)
        if out.returncode == 0 and out.stdout.strip():
            return latest, list(json.loads(out.stdout).keys())
    except Exception:
        pass
    with open(path, encoding="utf-8", errors="replace") as f:
        head = f.read(4000)
    return latest, re.findall(r'"([^"]+)"\s*:', head)[1:14]


# ---------------------------------------------------------------------------
def main():
    os.makedirs(INDEX_DIR, exist_ok=True)
    now = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")

    js_info, css_info, html_info = {}, {}, {}
    index_rows = []

    jsfiles = sorted(f for f in os.listdir(os.path.join(ROOT, JS_DIR)) if f.endswith(".js"))
    for fn in jsfiles:
        p = os.path.join(ROOT, JS_DIR, fn)
        info = parse_js(p)
        js_info[f"{JS_DIR}/{fn}"] = info
        for ln, name in info["funcs"]:
            index_rows.append(("func", name, f"{JS_DIR}/{fn}", ln))
        for ln, t in info["sections"]:
            index_rows.append(("sect", t, f"{JS_DIR}/{fn}", ln))
        for e in info["exports"]:
            index_rows.append(("export", f"window.{e}", f"{JS_DIR}/{fn}", 0))

    cssfiles = sorted(f for f in os.listdir(os.path.join(ROOT, CSS_DIR)) if f.endswith(".css"))
    for fn in cssfiles:
        p = os.path.join(ROOT, CSS_DIR, fn)
        info = parse_css(p)
        css_info[f"{CSS_DIR}/{fn}"] = info
        for ln, sel in info["selectors"]:
            index_rows.append(("css", sel, f"{CSS_DIR}/{fn}", ln))
        for ln, t in info["sections"]:
            index_rows.append(("sect", t, f"{CSS_DIR}/{fn}", ln))

    html_targets = [os.path.join(ROOT, "index.html")]
    for dp, _, fns in os.walk(os.path.join(ROOT, PARTIALS_DIR)):
        html_targets += [os.path.join(dp, f) for f in sorted(fns) if f.endswith(".html")]
    for p in html_targets:
        info = parse_html(p)
        html_info[rel(p)] = info
        for ln, i in info["ids"]:
            index_rows.append(("id", f"#{i}", rel(p), ln))

    # ---- index.tsv ----
    with open(os.path.join(INDEX_DIR, "index.tsv"), "w", encoding="utf-8") as f:
        f.write("# kind\tsymbol\tfile\tline  (generated by tools/gen_codemap.py)\n")
        for kind, sym, fp, ln in index_rows:
            f.write(f"{kind}\t{sym}\t{fp}\t{ln}\n")

    # ---- CODEMAP.md（軽量サマリのみ）----
    o = []
    w = o.append

    w("# CODEMAP — 軽量コード地図（自動生成・手編集禁止）")
    w("")
    w(f"生成: {now} JST / `python3 tools/gen_codemap.py`")
    w("")
    w("## 使い方（AIも人間もまずここを読む）")
    w("")
    w("このファイルは**サマリだけ**（約2,500トークン）。詳細索引は Markdown に書かず")
    w("`.codemap/index.tsv` に置いてある。**読まずに grep する**のが正しい使い方。")
    w("")
    w("```bash")
    w("tools/find.sh renderDailyTable   # 関数/CSS/idの定義位置を1行で返す")
    w("tools/find.sh 'バッジ'            # セクション見出しの部分一致もOK")
    w("tools/peek.sh dates 2026_08      # データの中身をトークン0で確認")
    w("```")
    w("")
    w("引いた行番号を使って **範囲読み** する:")
    w("`Read('js/daily.js', offset=1420, limit=80)`")
    w("")

    # コスト表
    w("---")
    w("")
    w("## 1. 読み込みコスト表（丸ごと読むと何トークン消えるか）")
    w("")
    rows = []
    for fp, info in js_info.items():
        rows.append((fp, info["nbytes"], info["nlines"]))
    for fp, info in css_info.items():
        rows.append((fp, info["nbytes"], info["nlines"]))
    for fp, info in html_info.items():
        rows.append((fp, info["nbytes"], info["nlines"]))
    for fn in ("ARCHITECTURE.md", "DESIGN.md", "events.json", "files.json", "CODEMAP.md"):
        p = os.path.join(ROOT, fn)
        if os.path.isfile(p):
            rows.append((fn, os.path.getsize(p), nlines(p)))
    rows.sort(key=lambda r: -r[1])

    w("| ファイル | 行 | tok | 判定 |")
    w("|---|--:|--:|:--:|")
    for name, nb, nl in rows:
        t = est(nb)
        mark = "⛔全読み禁止" if t > 20000 else ("⚠️部分のみ" if t > 8000 else "✅")
        w(f"| `{name}` | {nl} | ~{t:,} | {mark} |")
    w("")

    dtotal = 0
    dfiles = 0
    dd = os.path.join(ROOT, DATA_DIR)
    for fn in sorted(os.listdir(dd)):
        p = os.path.join(dd, fn)
        if os.path.isfile(p):
            dtotal += os.path.getsize(p)
            dfiles += 1
    uh = os.path.join(ROOT, "unit_history.json")
    if os.path.isfile(uh):
        dtotal += os.path.getsize(uh)
    w(f"**⛔ `data/*.json`（{dfiles}ファイル）+ `unit_history.json` = "
      f"{size_str(dtotal)} / 概算 {est(dtotal):,} トークン**")
    w("")
    w("→ この中身を開くと1回で月間クレジットが消える。**絶対に Read しない。**")
    w("　 集計は `jq` / `tools/peek.sh` を使う（トークン0）。スキーマは §3 にある。")
    w("")

    # JS セクション（見出しのみ・関数名は index.tsv 側）
    w("---")
    w("")
    w("## 2. js/ の構成（関数の位置は `tools/find.sh` で引く）")
    w("")
    for fp, info in js_info.items():
        t = est(info["nbytes"])
        flag = " ⛔" if t > 20000 else (" ⚠️" if t > 8000 else "")
        exp = f" — 公開 `window.{'`, `window.'.join(info['exports'])}`" if info["exports"] else ""
        w(f"**`{fp}`** {info['nlines']}行/~{t:,}tok{flag} 関数{len(info['funcs'])}個{exp}")
        if info["sections"]:
            head = " / ".join(f"L{ln} {t2}" for ln, t2 in info["sections"][:14])
            more = f" …他{len(info['sections'])-14}件" if len(info["sections"]) > 14 else ""
            w(f"　{head}{more}")
        w("")

    # CSS 一覧のみ
    w("---")
    w("")
    w("## 3. css/ 一覧（セレクタ位置は `tools/find.sh .クラス名`）")
    w("")
    for fp, info in css_info.items():
        w(f"- `{fp}` {info['nlines']}行/~{est(info['nbytes']):,}tok "
          f"（セレクタ{len(info['selectors'])}個）")
    w("")

    # partials 一覧のみ
    w("---")
    w("")
    w("## 4. partials/ 一覧（id の位置は `tools/find.sh '#myId'`）")
    w("")
    for fp, info in html_info.items():
        w(f"- `{fp}` {info['nlines']}行/~{est(info['nbytes']):,}tok （id {len(info['ids'])}個）")
    w("")

    # データスキーマ
    w("---")
    w("")
    w("## 5. データスキーマ（これを読めば data/*.json を開く必要はない）")
    w("")
    latest, keys = data_schema()
    if latest:
        w(f"取得元 `data/{latest}` の実レコード:")
        w("")
        w("```")
        w("data/YYYY_MM.json = {")
        w('  "YYYY_MM_DD": [        // 日付キー → その日の全台レコード配列')
        w("    { " + ", ".join(f'"{k}"' for k in keys) + " },")
        w("    ...")
        w("  ], ...")
        w("}")
        w("```")
        w("")
        w("**全フィールドが文字列**。数値も `\"9668\"`、確率は `\"1/123.9\"` 形式。")
        w("")
    w("### データ確認コマンド（トークン0）")
    w("")
    w("```bash")
    w("tools/peek.sh dates 2026_08          # 日付キー一覧")
    w("tools/peek.sh sample 2026_08         # 1レコードのサンプル")
    w("tools/peek.sh machines 2026_08       # 機種名一覧")
    w("tools/peek.sh count 2026_08_16       # その日の台数")
    w("tools/peek.sh fields 2026_08         # フィールド名一覧")
    w("```")
    w("")

    # フロー
    w("---")
    w("")
    w("## 6. 改修フロー（この順序が最安）")
    w("")
    w("| 手順 | コマンド | 概算tok |")
    w("|---|---|--:|")
    w("| 1. 地図を読む | `Read CODEMAP.md` | ~2,500 |")
    w("| 2. 位置を引く | `tools/find.sh 関数名` | ~50 |")
    w("| 3. 周辺だけ読む | `Read(f, offset=L-10, limit=80)` | ~1,000 |")
    w("| 4. 部分置換 | `Edit`（全体 `Write` 禁止） | ~500 |")
    w("| 5. 地図更新 | `python3 tools/gen_codemap.py` | 0 |")
    w("| 6. コミット | `git commit` | 0 |")
    w("| **合計** | | **~4,000** |")
    w("")
    w("### 禁止事項（これが7,000クレジットの原因）")
    w("")
    w("- `Read('js/utils.js')` など**全文読み** → 1回3万tok")
    w("- `Write` でファイル全体を上書き → 入力+出力で二重課金")
    w("- `data/*.json` `unit_history.json` を開く → 数十万tok")
    w("- `ARCHITECTURE.md` 全文読み → 1.6万tok。必要な章だけ `sed -n '80,140p'`")
    w("- `grep -r` を絞らずに実行 → ヒット行が全部コンテキストに乗る")
    w("- 1セッションで無関係な複数機能を触る → 文脈が累積して毎ターン再課金")
    w("")

    content = "\n".join(o) + "\n"
    with open(os.path.join(ROOT, "CODEMAP.md"), "w", encoding="utf-8") as f:
        f.write(content)

    nb = len(content.encode())
    ib = os.path.getsize(os.path.join(INDEX_DIR, "index.tsv"))
    print(f"✓ CODEMAP.md        {size_str(nb)} / 概算 {est(nb):,} tok（毎回読む用）")
    print(f"✓ .codemap/index.tsv {size_str(ib)} / {len(index_rows)}シンボル（grep用・読まない）")


if __name__ == "__main__":
    main()
