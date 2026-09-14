"""
convert_to_new_format.py
既存 data/YYYY_MM.json を新形式に変換するスクリプト。

変換内容:
  - 確率4列（合成確率・BB確率・RB確率・ART確率）を削除
  - 数値フィールド（台番号・G数・差枚・BB・RB・ART）を文字列→数値(int)に変換
  - 1台1行のコンパクト出力（インデントなし・改行なし）
  - 変換前の元ファイルを data/backup/ に退避

実行方法:
  cd /home/user/webapp
  python3 converter/convert_to_new_format.py

注意:
  - 既存の converter/ 内スクリプトは一切変更しません
  - 冪等（何度実行しても同じ結果）
  - バックアップは初回のみ作成（backup/ に既に存在するファイルは上書きしない）
"""

import json
import os
import shutil
import glob
import sys

# -----------------------------------------------------------------------
# 設定
# -----------------------------------------------------------------------
DATA_DIR   = os.path.join(os.path.dirname(__file__), '..', 'data')
BACKUP_DIR = os.path.join(DATA_DIR, 'backup')

# 変換対象ファイルのパターン（island-config.json 等は除外）
FILE_PATTERN = os.path.join(DATA_DIR, '????_??.json')

# 削除するフィールド
DROP_FIELDS = {'合成確率', 'BB確率', 'RB確率', 'ART確率'}

# 文字列→int に変換するフィールド
INT_FIELDS = {'台番号', 'G数', '差枚', 'BB', 'RB', 'ART'}


# -----------------------------------------------------------------------
# ヘルパー
# -----------------------------------------------------------------------

def convert_record(rec: dict) -> dict:
    """1台レコードを新形式に変換する（純関数）"""
    result = {}
    for key, val in rec.items():
        if key in DROP_FIELDS:
            continue
        if key in INT_FIELDS:
            try:
                result[key] = int(val)
            except (ValueError, TypeError):
                print(f'  [ERROR] int変換失敗: key={key} val={repr(val)}', file=sys.stderr)
                raise
        else:
            result[key] = val
    return result


def convert_month_data(data: dict) -> dict:
    """月別JSONオブジェクト全体を変換する"""
    converted = {}
    for date_key, records in data.items():
        converted[date_key] = [convert_record(r) for r in records]
    return converted


def build_compact_json(data: dict) -> str:
    """
    月別JSONを「日付キーごとに1行」のコンパクト形式にシリアライズする。

    出力イメージ:
    {
    "2026_08_16": [{"機種名": "...", "台番号": 881, ...}, {"機種名": "...", ...}],
    "2026_08_15": [...],
    ...
    }
    """
    lines = ['{']
    date_keys = list(data.keys())
    for i, date_key in enumerate(date_keys):
        records = data[date_key]
        # 各レコードをインラインJSONに（ensure_ascii=False で日本語をそのまま）
        records_json = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
        comma = ',' if i < len(date_keys) - 1 else ''
        lines.append(f'  "{date_key}": {records_json}{comma}')
    lines.append('}')
    return '\n'.join(lines) + '\n'


# -----------------------------------------------------------------------
# メイン処理
# -----------------------------------------------------------------------

def main():
    # バックアップディレクトリを作成
    os.makedirs(BACKUP_DIR, exist_ok=True)

    target_files = sorted(glob.glob(FILE_PATTERN))

    if not target_files:
        print('変換対象ファイルが見つかりません。DATA_DIR を確認してください。')
        print(f'  DATA_DIR = {os.path.abspath(DATA_DIR)}')
        sys.exit(1)

    print(f'変換対象: {len(target_files)} ファイル')
    print(f'バックアップ先: {os.path.abspath(BACKUP_DIR)}')
    print()

    total_before = 0
    total_after  = 0

    for filepath in target_files:
        filename = os.path.basename(filepath)
        backup_path = os.path.join(BACKUP_DIR, filename)

        # --- バックアップ（既に存在する場合は上書きしない）---
        if os.path.exists(backup_path):
            print(f'[SKIP backup] {filename}  （既にバックアップ済み）')
        else:
            shutil.copy2(filepath, backup_path)
            print(f'[backup]      {filename}  → data/backup/{filename}')

        # --- 変換 ---
        size_before = os.path.getsize(filepath)
        total_before += size_before

        with open(filepath, encoding='utf-8') as f:
            original = json.load(f)

        converted = convert_month_data(original)
        compact   = build_compact_json(converted)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(compact)

        size_after = os.path.getsize(filepath)
        total_after += size_after

        # 日数・台数カウント（サマリー用）
        date_count   = len(converted)
        record_count = sum(len(v) for v in converted.values())
        ratio = (1 - size_after / size_before) * 100 if size_before > 0 else 0

        print(
            f'[convert]     {filename}'
            f'  {date_count}日 / {record_count:,}台'
            f'  {size_before/1024:.1f}KB → {size_after/1024:.1f}KB'
            f'  ({ratio:.0f}%削減)'
        )

    print()
    print('=' * 60)
    print(
        f'完了: {len(target_files)} ファイル変換'
        f'  合計 {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.1f}MB'
        f'  ({(1 - total_after/total_before)*100:.0f}%削減)'
    )
    print(f'バックアップ: {os.path.abspath(BACKUP_DIR)}')


if __name__ == '__main__':
    main()
