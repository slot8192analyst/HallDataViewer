#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check.sh — 節約体制が正しく効いているかの自己診断
#
#   tools/check.sh
#
# 索引の鮮度、巨大ファイルの diff 抑制、ガイドのサイズを確認します。
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

NG=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
bad()  { printf "  \033[31m✗\033[0m %s\n" "$1"; NG=$((NG+1)); }

echo "== クレジット節約体制の診断 =="
echo

# --- 1. ガイドファイル ---
echo "[1] ガイドファイルのサイズ"
TOTAL=0
for f in CLAUDE.md CODEMAP.md; do
  if [[ -f "$f" ]]; then
    S=$(stat -c%s "$f"); T=$((S/3)); TOTAL=$((TOTAL+T))
    if [[ $T -gt 8000 ]]; then
      warn "$f が大きい (~${T}tok)。索引を index.tsv 側に寄せてください"
    else
      ok "$f ~${T}tok"
    fi
  else
    bad "$f がありません"
  fi
done
[[ $TOTAL -gt 0 ]] && echo "      → 起動コスト合計 ~${TOTAL}tok"
echo

# --- 2. 索引の存在と鮮度 ---
echo "[2] シンボル索引"
IDX=".codemap/index.tsv"
if [[ -f "$IDX" ]]; then
  N=$(grep -vc '^#' "$IDX" 2>/dev/null || echo 0)
  ok "$IDX ($N シンボル)"

  # ソースより索引が古くないか
  STALE=$(find js css partials index.html -newer "$IDX" \
            \( -name '*.js' -o -name '*.css' -o -name '*.html' \) 2>/dev/null | head -5)
  if [[ -n "$STALE" ]]; then
    warn "索引がソースより古いです。更新してください:"
    echo "$STALE" | sed 's/^/        /'
    echo "        → python3 tools/gen_codemap.py"
  else
    ok "索引は最新"
  fi
else
  bad "$IDX がありません → python3 tools/gen_codemap.py"
fi
echo

# --- 3. 巨大ファイルの diff 抑制 ---
echo "[3] 巨大ファイルの git diff 抑制"
if [[ -f .gitattributes ]]; then
  for f in data/2026_08.json unit_history.json; do
    [[ -f "$f" ]] || continue
    ATTR=$(git check-attr diff -- "$f" 2>/dev/null | awk '{print $NF}')
    if [[ "$ATTR" == "unset" ]]; then
      ok "$f は diff 対象外 (-diff)"
    else
      bad "$f が diff 展開されます（diff=$ATTR）。.gitattributes を確認"
    fi
  done
else
  bad ".gitattributes がありません"
fi
echo

# --- 4. ツールの実行権限 ---
echo "[4] ツールの実行権限"
for f in tools/find.sh tools/peek.sh tools/check.sh; do
  if [[ -x "$f" ]]; then ok "$f"; else bad "$f に実行権限なし → chmod +x $f"; fi
done
echo

# --- 5. jq の有無 ---
echo "[5] 依存コマンド"
if command -v jq >/dev/null 2>&1; then
  ok "jq $(jq --version)"
else
  bad "jq がありません → sudo apt-get install -y jq"
fi
echo

# --- 6. 重量ファイル TOP5 ---
echo "[6] 読み込み注意ファイル TOP5（⛔は全読み禁止）"
find js css partials index.html ARCHITECTURE.md DESIGN.md \
     -maxdepth 2 -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.md' \) \
     -printf '%s\t%p\n' 2>/dev/null \
  | sort -rn | head -5 \
  | awk -F'\t' '{t=int($1/3); m=(t>20000)?"⛔":((t>8000)?"⚠️ ":"✅"); printf "  %s %-24s ~%d tok\n", m, $2, t}'
echo

# --- 結果 ---
if [[ $NG -eq 0 ]]; then
  printf "\033[32m== 診断OK: 節約体制は正常に機能しています ==\033[0m\n"
else
  printf "\033[31m== 要対応 %d 件 ==\033[0m\n" "$NG"
  exit 1
fi
