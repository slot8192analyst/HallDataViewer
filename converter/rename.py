#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JSON内の指定日付データを、基準日付の台番号順・機種名に合わせて並び替えるスクリプト

背景:
    アナスロから取得したデータとみんれぽから取得したデータでは、
    同じ台であっても機種名の表記や台番号の並び順が異なる場合があり、
    集計ロジック側で「存在しない機種」として誤判定されてしまう問題があった。
    このスクリプトは、信頼できる基準日付（例: アナスロ側のデータがある日）を1つ選び、
    その日の「台番号の並び順」と「台番号ごとの機種名」を正として、
    書き換えたい別日付のデータに適用し直すためのもの。

使い方:
    python reorder_by_reference.py
    → 対話形式で書き換えたいJSONファイルのパス・基準日付・対象日付を指定する

仕様:
    - 基準日付に存在する台番号が対象日付に存在しない場合はスキップ（警告表示）
    - 対象日付にしか存在しない台番号は、元の並び順のまま末尾に追加（警告表示）
    - 機種名は「基準日付の同じ台番号の機種名」に置き換える（それ以外の項目は対象日付の値をそのまま使用）
    - 上書き前に自動でバックアップファイルを作成する
    - 上書き前に変更内容のサマリーを表示し、'yes' 入力で確定する
"""

import os
import sys
import json
import shutil
from datetime import datetime
from pathlib import Path


def load_json(json_path: Path) -> dict:
    """JSONファイルを読み込む"""
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(json_path: Path, data: dict) -> None:
    """JSONファイルを保存する"""
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def backup_file(json_path: Path) -> Path:
    """上書き前に対象ファイルをバックアップとして退避する"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = json_path.with_name(f"{json_path.name}.bak_{timestamp}")
    shutil.copy2(json_path, backup_path)
    return backup_path


def select_date_key(dates: list, prompt_text: str) -> str:
    """日付一覧を番号付きで表示し、選択された日付キーを返す"""
    print(f"\n{prompt_text}")
    for idx, date_key in enumerate(dates, start=1):
        print(f"  {idx}: {date_key}")

    while True:
        choice = input("番号を入力してください: ").strip()
        if not choice.isdigit():
            print("  数字を入力してください。")
            continue
        idx = int(choice)
        if 1 <= idx <= len(dates):
            return dates[idx - 1]
        print(f"  1〜{len(dates)} の範囲で入力してください。")


def build_reference_order(records: list):
    """基準日付のレコードから、台番号の並び順リストと台番号->機種名の対応表を作成する"""
    order = []
    number_to_name = {}
    seen = set()

    for record in records:
        num = record.get("台番号", "")
        name = record.get("機種名", "")

        if num in seen:
            print(f"  警告: 基準日付内で台番号 {num} が重複しています。最初の1件のみ使用します。")
            continue

        seen.add(num)
        order.append(num)
        number_to_name[num] = name

    return order, number_to_name


def build_target_lookup(records: list):
    """対象日付のレコードを台番号をキーにした辞書に変換する（重複時は最初の1件を使用）"""
    lookup = {}
    order_in_target = []

    for record in records:
        num = record.get("台番号", "")
        if num in lookup:
            print(f"  警告: 対象日付内で台番号 {num} が重複しています。最初の1件のみ使用します。")
            continue
        lookup[num] = record
        order_in_target.append(num)

    return lookup, order_in_target


def reorder_records(reference_order: list, reference_name_map: dict, target_records: list):
    """
    基準日付の並び順・機種名に合わせて対象日付のレコードを並び替える

    Returns:
        (new_records, stats)
        stats = {
            "matched": 一致してならび替え・機種名補正された件数,
            "skipped": 基準日付にはあるが対象日付に存在せずスキップした台番号リスト,
            "appended": 対象日付にしかなく末尾に追加した台番号リスト,
        }
    """
    target_lookup, target_order = build_target_lookup(target_records)

    new_records = []
    matched_count = 0
    skipped = []
    appended = []

    reference_numbers = set(reference_order)

    # 1. 基準日付の並び順どおりに、対象日付のデータを並べ直す
    for num in reference_order:
        if num not in target_lookup:
            skipped.append((num, reference_name_map.get(num, "")))
            continue

        record = dict(target_lookup[num])  # 元データを壊さないようコピー
        record["機種名"] = reference_name_map.get(num, record.get("機種名", ""))
        new_records.append(record)
        matched_count += 1

    # 2. 対象日付にしか存在しない台番号は、元の並び順のまま末尾に追加する
    for num in target_order:
        if num not in reference_numbers:
            record = dict(target_lookup[num])  # 機種名は補正せずそのまま使用
            new_records.append(record)
            appended.append((num, record.get("機種名", "")))

    stats = {
        "matched": matched_count,
        "skipped": skipped,
        "appended": appended,
    }

    return new_records, stats


def print_warnings(stats: dict) -> None:
    """スキップ・末尾追加の警告内容を表示する"""
    if stats["skipped"]:
        print(f"\n警告: 基準日付には存在するが対象日付に存在しないためスキップした台番号 ({len(stats['skipped'])}件):")
        for num, name in stats["skipped"]:
            print(f"  - 台番号 {num} (基準日付の機種名: {name})")

    if stats["appended"]:
        print(f"\n警告: 対象日付にのみ存在するため末尾に追加した台番号 ({len(stats['appended'])}件):")
        for num, name in stats["appended"]:
            print(f"  - 台番号 {num} (機種名: {name}、基準日付の並び順情報がないため機種名は補正していません)")


def print_summary(reference_date: str, target_date: str, target_original_count: int, stats: dict) -> None:
    """変更内容のサマリーを表示する"""
    print("\n" + "=" * 50)
    print("変更内容サマリー")
    print("=" * 50)
    print(f"基準日付: {reference_date}")
    print(f"対象日付: {target_date}")
    print(f"対象日付の元データ件数: {target_original_count}件")
    print(f"並び替え・機種名補正した件数: {stats['matched']}件")
    print(f"スキップした件数: {len(stats['skipped'])}件")
    print(f"末尾に追加した件数: {len(stats['appended'])}件")
    print(f"書き換え後の件数: {stats['matched'] + len(stats['appended'])}件")


def main():
    print("=" * 60)
    print("JSON台番号順・機種名 正規化スクリプト")
    print("=" * 60)

    json_path_str = input("\n書き換えたいJSONファイルのパスを入力してください: ").strip().strip('"\'')
    json_path = Path(json_path_str)

    if not json_path.exists() or not json_path.is_file():
        print(f"エラー: '{json_path}' は存在しないか、ファイルではありません。")
        return

    try:
        data = load_json(json_path)
    except Exception as e:
        print(f"エラー: JSONの読み込みに失敗しました - {e}")
        return

    dates = sorted(data.keys())
    if not dates:
        print("エラー: JSON内に日付データが見つかりませんでした。")
        return

    reference_date = select_date_key(dates, "基準となる日付を選択してください（この日の台番号順・機種名を正とします）:")
    target_date = select_date_key(dates, "書き換えたい日付を選択してください:")

    if reference_date == target_date:
        print("\n注意: 基準日付と対象日付が同じです。自己整列（重複台番号の整理など）のみ行われます。")

    reference_records = data[reference_date]
    target_records = data[target_date]

    reference_order, reference_name_map = build_reference_order(reference_records)
    new_records, stats = reorder_records(reference_order, reference_name_map, target_records)

    print_summary(reference_date, target_date, len(target_records), stats)
    print_warnings(stats)

    print("\n上記の内容で書き換えを実行しますか？")
    confirm = input("実行する場合は 'yes' と入力: ").strip().lower()

    if confirm != "yes":
        print("処理を中止しました。ファイルは変更されていません。")
        return

    try:
        backup_path = backup_file(json_path)
        print(f"\nバックアップを作成しました: {backup_path}")
    except Exception as e:
        print(f"エラー: バックアップの作成に失敗したため処理を中止します - {e}")
        return

    data[target_date] = new_records

    try:
        save_json(json_path, data)
    except Exception as e:
        print(f"エラー: JSONの保存に失敗しました - {e}")
        print(f"バックアップから復元してください: {backup_path}")
        return

    print(f"\n完了しました。'{json_path}' の '{target_date}' を更新しました。")


if __name__ == "__main__":
    main()
