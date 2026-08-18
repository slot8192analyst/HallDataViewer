#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# find.sh — シンボルの定義位置を1行で返す（クレジット節約の主役）
#
# ソースを丸ごと読む代わりにこれを使う。出力は数行なのでトークン消費はほぼ0。
#
# 使い方:
#   tools/find.sh renderDailyTable     # 関数を探す
#   tools/find.sh '#dailyTable'        # HTML の id を探す
#   tools/find.sh '.badge-tako'        # CSS セレクタを探す
#   tools/find.sh バッジ                # セクション見出しの部分一致
#   tools/find.sh -e getUnitStatus     # 完全一致のみ
#
# 出力例:
#   func   renderDailyTable   js/daily.js:1433
#   → Read('js/daily.js', offset=1423, limit=80) で周辺だけ読む
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX="$ROOT/.codemap/index.tsv"

EXACT=0
if [[ "${1:-}" == "-e" ]]; then
  EXACT=1
  shift
fi

QUERY="${1:-}"
if [[ -z "$QUERY" ]]; then
  cat >&2 <<'USAGE'
使い方: tools/find.sh [-e] <シンボル名 | #id | .css-class | 見出しの一部>

  -e   完全一致のみ（部分一致を抑制）

例:
  tools/find.sh renderDailyTable
  tools/find.sh '#dailyTable'
  tools/find.sh '.badge-tako'
  tools/find.sh バッジ
USAGE
  exit 1
fi

if [[ ! -f "$INDEX" ]]; then
  echo "索引がありません。先に生成してください:" >&2
  echo "  cd $ROOT && python3 tools/gen_codemap.py" >&2
  exit 1
fi

# 索引を検索（コメント行は除外）
if [[ $EXACT -eq 1 ]]; then
  RESULT=$(awk -F'\t' -v q="$QUERY" '$1!~/^#/ && $2==q' "$INDEX")
else
  RESULT=$(awk -F'\t' -v q="$QUERY" '$1!~/^#/ && index($2,q)>0' "$INDEX")
fi

if [[ -z "$RESULT" ]]; then
  echo "索引に見つかりません: $QUERY"
  echo
  echo "▼ ソース内の生 grep にフォールバック（件数のみ表示）"
  # 巨大データは除外して検索。件数だけ出してトークンを抑える
  cd "$ROOT" || exit 1
  grep -rn --include="*.js" --include="*.css" --include="*.html" \
       --exclude-dir=data --exclude-dir=.git --exclude-dir=.codemap \
       -F "$QUERY" . 2>/dev/null \
    | head -20 \
    | sed 's|^\./||' \
    | awk -F: '{printf "  %s:%s\n", $1, $2}'
  TOTAL=$(grep -rc --include="*.js" --include="*.css" --include="*.html" \
       --exclude-dir=data --exclude-dir=.git --exclude-dir=.codemap \
       -F "$QUERY" . 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')
  echo "  （総ヒット ${TOTAL} 件。多い場合は検索語を絞ること）"
  exit 0
fi

# 整形出力: kind / symbol / file:line
echo "$RESULT" | awk -F'\t' '
{
  loc = ($4 == "0") ? $3 : $3 ":" $4
  printf "%-7s %-34s %s\n", $1, $2, loc
}' | head -40

COUNT=$(echo "$RESULT" | wc -l | tr -d ' ')
if [[ "$COUNT" -gt 40 ]]; then
  echo "… 他 $((COUNT - 40)) 件（検索語を絞ってください）"
fi

# 読み方のヒント（1件に絞れたときだけ）
if [[ "$COUNT" -eq 1 ]]; then
  FILE=$(echo "$RESULT" | cut -f3)
  LINE=$(echo "$RESULT" | cut -f4)
  if [[ "$LINE" != "0" ]]; then
    START=$(( LINE > 10 ? LINE - 10 : 1 ))
    echo
    echo "→ 周辺だけ読む: Read('$FILE', offset=$START, limit=80)"
    echo "→ CLIで見る  : sed -n '${START},$((LINE + 70))p' $FILE"
  fi
fi
