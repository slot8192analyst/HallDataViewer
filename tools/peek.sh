#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# peek.sh — 巨大データ JSON をトークン0で覗く
#
# data/*.json は1ファイル約68万トークン。中身を Read すると一撃で
# 月間クレジットが飛ぶ。確認は必ずこのスクリプト経由で行う。
#
# 使い方:
#   tools/peek.sh dates    2026_08          日付キー一覧
#   tools/peek.sh sample   2026_08          1レコードのサンプル
#   tools/peek.sh fields   2026_08          フィールド名一覧
#   tools/peek.sh machines 2026_08          機種名一覧（重複除去）
#   tools/peek.sh count    2026_08_16       その日の台数
#   tools/peek.sh unit     2026_08_16 881   特定台のレコード
#   tools/peek.sh top      2026_08_16 10    差枚トップN
#   tools/peek.sh files                     データファイル一覧とサイズ
#   tools/peek.sh history  881              unit_history.json から台番号を引く
#   tools/peek.sh jq       2026_08 '<expr>' 任意の jq 式
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

if ! command -v jq >/dev/null 2>&1; then
  echo "jq が必要です: sudo apt-get install -y jq" >&2
  exit 1
fi

CMD="${1:-}"

# YYYY_MM または YYYY_MM_DD からファイルパスを解決
resolve() {
  local key="$1"
  local ym="${key:0:7}"          # YYYY_MM
  local f="data/${ym}.json"
  if [[ ! -f "$f" ]]; then
    echo "ファイルが見つかりません: $f" >&2
    return 1
  fi
  echo "$f"
}

usage() {
  sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's|^# \{0,1\}||'
}

case "$CMD" in
  dates)
    F=$(resolve "${2:?YYYY_MM を指定}") || exit 1
    jq -r 'keys_unsorted[]' "$F"
    ;;

  sample)
    F=$(resolve "${2:?YYYY_MM を指定}") || exit 1
    jq 'to_entries[0].value[0]' "$F"
    ;;

  fields)
    F=$(resolve "${2:?YYYY_MM を指定}") || exit 1
    jq -r 'to_entries[0].value[0] | keys_unsorted[]' "$F"
    ;;

  machines)
    F=$(resolve "${2:?YYYY_MM を指定}") || exit 1
    jq -r '[.[][]["機種名"]] | unique | .[]' "$F"
    ;;

  count)
    KEY="${2:?YYYY_MM_DD を指定}"
    F=$(resolve "$KEY") || exit 1
    jq --arg k "$KEY" '.[$k] | length' "$F"
    ;;

  unit)
    KEY="${2:?YYYY_MM_DD を指定}"
    NO="${3:?台番号を指定}"
    F=$(resolve "$KEY") || exit 1
    jq --arg k "$KEY" --arg n "$NO" '.[$k][] | select(.["台番号"] == $n)' "$F"
    ;;

  top)
    KEY="${2:?YYYY_MM_DD を指定}"
    N="${3:-10}"
    F=$(resolve "$KEY") || exit 1
    jq -r --arg k "$KEY" --argjson n "$N" '
      .[$k]
      | map({no: .["台番号"], name: .["機種名"],
             diff: ((.["差枚"] | tonumber?) // 0), g: .["G数"]})
      | sort_by(-.diff) | .[0:$n]
      | .[] | "\(.no)\t\(.diff)\t\(.g)\t\(.name)"
    ' "$F"
    ;;

  files)
    printf "%-28s %8s %12s\n" "FILE" "SIZE" "EST_TOKENS"
    for f in data/*.json unit_history.json events.json; do
      [[ -f "$f" ]] || continue
      s=$(stat -c%s "$f")
      printf "%-28s %7sK %11s\n" "$f" "$((s/1024))" "$((s/3))"
    done
    ;;

  history)
    NO="${2:?台番号を指定}"
    [[ -f unit_history.json ]] || { echo "unit_history.json がありません" >&2; exit 1; }
    jq --arg n "$NO" '
      if type=="object" then
        (to_entries | map(select(.key==$n)) | from_entries)
      else
        [.[] | select(((.["台番号"]? // .unitNo? // "")) == $n)]
      end
    ' unit_history.json
    ;;

  jq)
    F=$(resolve "${2:?YYYY_MM を指定}") || exit 1
    EXPR="${3:?jq 式を指定}"
    jq "$EXPR" "$F"
    ;;

  ""|-h|--help|help)
    usage
    ;;

  *)
    echo "不明なコマンド: $CMD" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
