#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
みんれぽ HTMLファイルを月別JSONに統合するスクリプト（CSV同時出力対応）

anaslo_converter (convert_html_to_json.py) と同じ階層に配置して使用する。
出力先のディレクトリ構造・JSON/CSVの形式は anaslo_converter と共通。

使い方:
    python minrepo_converter.py [HTMLフォルダパス]

例:
    python minrepo_converter.py C:/Downloads/minrepo_html
    → 指定フォルダ内の「9_2(水) ○○店 ...html」形式のファイルを読み込んで
      converter/YYYY_MM_DD.csv と data/YYYY_MM.json を生成/更新

    python minrepo_converter.py
    → 対話形式でHTMLフォルダを指定

機能:
    - みんれぽのHTMLテーブル（機種名・台番号・G数・差枚）をCSVとJSONに同時変換
    - 出率は取得しない（anaslo_converter側のJSON構造に合わせるため不要）
    - 不足しているBB・RB・ART・合成確率・BB確率・RB確率・ART確率は "0" で埋めて追記
    - 既存のJSONファイルがある場合、新しいデータを追加更新
    - 同じ日付のデータがある場合はHTMLで上書き
    - 変換後のHTMLファイル削除オプション
    - files.json の自動更新
"""

import os
import re
import sys
import json
import glob
from pathlib import Path
from collections import defaultdict

import pandas as pd
from bs4 import BeautifulSoup


def get_script_dir() -> str:
    """スクリプト（またはexe）のディレクトリを取得"""
    if getattr(sys, 'frozen', False):
        # PyInstallerでexe化されている場合
        return os.path.dirname(sys.executable)
    else:
        # 通常のPython実行の場合
        return os.path.dirname(os.path.abspath(__file__))


def get_data_dir() -> str:
    """dataディレクトリのパスを取得"""
    script_dir = get_script_dir()
    parent_dir = os.path.dirname(script_dir)
    return os.path.join(parent_dir, 'data')


def get_csv_dir() -> str:
    """CSV出力ディレクトリのパスを取得（スクリプトと同じ場所）"""
    return get_script_dir()


def get_files_json_path() -> str:
    """files.jsonのパスを取得"""
    script_dir = get_script_dir()
    parent_dir = os.path.dirname(script_dir)
    return os.path.join(parent_dir, 'files.json')


def get_html_files(input_folder: str) -> list:
    """指定フォルダ内のHTMLファイル一覧を取得"""
    if not os.path.exists(input_folder):
        return []
    return glob.glob(os.path.join(input_folder, "*.html"))


def extract_month_day_from_filename(filename: str):
    """ファイル名の最初の '(' より前の部分から月日を抽出する
    例: "9_2(水) オーギヤ磐田店 ...html" -> (9, 2)
    """
    stem = Path(filename).stem
    before_paren = stem.split("(", 1)[0]
    match = re.search(r"(\d{1,2})_(\d{1,2})", before_paren)
    if match:
        month = int(match.group(1))
        day = int(match.group(2))
        return month, day
    return None, None


def extract_year_from_html(soup: BeautifulSoup):
    """HTML内のtimeタグから年だけを補完的に取得する(ファイル名には年情報がないため)"""
    time_tag = soup.find("time", class_="date")
    if time_tag and time_tag.get("datetime"):
        year_match = re.search(r"(\d{4})-", time_tag["datetime"])
        if year_match:
            return year_match.group(1)
    return None


def extract_records_from_html(soup: BeautifulSoup):
    """全台データ一覧テーブルからレコード一覧を抽出する(出率は取得しない)"""
    table_wrap = soup.find("div", class_="table_wrap")
    if table_wrap is None:
        return None

    table = table_wrap.find("table")
    tbody = table.find("tbody") if table else None
    if tbody is None:
        return None

    rows = tbody.find_all("tr")
    results = []

    for row in rows:
        # 見出し行(th要素のみの行)はスキップする
        if row.find("th"):
            continue

        cells = row.find_all("td")
        if len(cells) < 4:
            continue

        kishu_link = cells[0].find("a")
        kishu_name = kishu_link.get_text(strip=True) if kishu_link else cells[0].get_text(strip=True)

        num_link = cells[1].find("a")
        num_text = num_link.get_text(strip=True) if num_link else cells[1].get_text(strip=True)

        samai_text = cells[2].get_text(strip=True).replace(",", "")
        game_text = cells[3].get_text(strip=True).replace(",", "")

        # anaslo_converter側のJSON構造に合わせて不足項目は "0" 埋めで追加する
        results.append({
            "機種名": kishu_name,
            "台番号": num_text,
            "G数": game_text,
            "差枚": samai_text,
            "BB": "0",
            "RB": "0",
            "ART": "0",
            "合成確率": "0",
            "BB確率": "0",
            "RB確率": "0",
            "ART確率": "0",
        })

    return results


def process_html_file(filepath: str):
    """1つのHTMLファイルから日付キー・年月・レコード一覧をまとめて取得する"""
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")

    month, day = extract_month_day_from_filename(os.path.basename(filepath))
    if month is None or day is None:
        raise ValueError("ファイル名から月日を抽出できませんでした")

    year = extract_year_from_html(soup)
    if year is None:
        year = "2026"  # 年情報が取得できない場合のフォールバック

    date_key = f"{year}_{month:02d}_{day:02d}"
    year_month = f"{year}_{month:02d}"

    records = extract_records_from_html(soup)
    if not records:
        raise ValueError("テーブルデータが見つかりませんでした")

    return date_key, year_month, records


def load_existing_json(json_path: str) -> dict:
    """既存のJSONファイルを読み込む"""
    if not os.path.exists(json_path):
        return {}

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"    警告: 既存JSONの読み込みに失敗 - {e}")
        return {}


def save_csv(df: pd.DataFrame, csv_path: str) -> bool:
    """DataFrameをCSVとして保存"""
    try:
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        return True
    except Exception as e:
        print(f"    エラー: CSV保存失敗 - {e}")
        return False


def save_json(data: dict, json_path: str) -> bool:
    """辞書をJSONとして保存"""
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"    エラー: JSON保存失敗 - {e}")
        return False


def convert_html_to_json(input_folder: str) -> dict:
    """
    みんれぽのHTMLファイルをCSV/JSONに変換する

    Returns:
        変換結果の統計情報
    """
    data_dir = get_data_dir()
    csv_dir = get_csv_dir()

    if not os.path.exists(data_dir):
        print(f"エラー: dataディレクトリが見つかりません: {data_dir}")
        return {'success': False}

    html_files = get_html_files(input_folder)

    if not html_files:
        print("エラー: HTMLファイルが見つかりませんでした")
        return {'success': False}

    print(f"\n検出されたHTMLファイル: {len(html_files)}件")

    stats = {
        'success': True,
        'total_files': len(html_files),
        'months_processed': [],
        'csv_created': 0,
        'csv_files': [],
        'json_updated': 0,
        'errors': 0,
        'converted_html_files': []
    }

    # 1パス目: 各HTMLファイルを読み込んで日付キー・年月・レコードを確定する
    html_infos = []
    for filepath in sorted(html_files):
        filename = os.path.basename(filepath)
        try:
            date_key, year_month, records = process_html_file(filepath)
        except Exception as e:
            print(f"  [失敗] {filename} -> {e}")
            stats['errors'] += 1
            continue

        html_infos.append({
            'filepath': filepath,
            'filename': filename,
            'date_key': date_key,
            'year_month': year_month,
            'records': records,
        })

    if not html_infos:
        print("エラー: 有効なデータを取得できたHTMLファイルがありませんでした")
        stats['success'] = False
        return stats

    # 年月ごとにグループ化する
    groups = defaultdict(list)
    for info in html_infos:
        groups[info['year_month']].append(info)

    grouped_sorted = dict(sorted(groups.items()))

    print(f"対象年月: {', '.join(grouped_sorted.keys())}")

    for year_month, infos in grouped_sorted.items():
        infos.sort(key=lambda x: x['date_key'])

        print(f"\n{'='*50}")
        print(f"{year_month} の処理を開始 ({len(infos)}ファイル)")
        print('='*50)

        json_path = os.path.join(data_dir, f"{year_month}.json")

        existing_data = load_existing_json(json_path)
        if existing_data:
            print(f"  既存JSON: {len(existing_data)}日分のデータ")

        monthly_data = existing_data.copy()
        existing_dates = set(existing_data.keys())

        new_count = 0
        update_count = 0

        for info in infos:
            filename = info['filename']
            date_key = info['date_key']
            records = info['records']

            print(f"\n  処理中: {filename}")

            # CSV保存（スクリプトと同じディレクトリ）
            df = pd.DataFrame(records)
            csv_path = os.path.join(csv_dir, f"{date_key}.csv")
            if save_csv(df, csv_path):
                print(f"    ✓ CSV保存: {date_key}.csv ({len(df)}件)")
                stats['csv_created'] += 1
                stats['csv_files'].append(csv_path)

            if date_key in existing_dates:
                update_count += 1
                print(f"    ↻ JSON更新: {date_key} ({len(records)}件)")
            else:
                new_count += 1
                print(f"    ✓ JSON追加: {date_key} ({len(records)}件)")

            monthly_data[date_key] = records
            stats['converted_html_files'].append(info['filepath'])

        sorted_data = dict(sorted(monthly_data.items()))

        if save_json(sorted_data, json_path):
            stats['json_updated'] += 1

            file_size = os.path.getsize(json_path) / 1024
            print(f"\n  {year_month}.json 保存完了")
            print(f"    総日数: {len(sorted_data)}日分")
            print(f"    - 既存維持: {len(existing_data) - update_count}日")
            print(f"    - 新規追加: {new_count}日")
            print(f"    - 更新: {update_count}日")
            print(f"    ファイルサイズ: {file_size:.1f} KB")

            stats['months_processed'].append({
                'year_month': year_month,
                'total_days': len(sorted_data),
                'new': new_count,
                'updated': update_count
            })

    return stats


def delete_converted_html_files(html_files: list):
    """変換済みのHTMLファイルを削除"""
    if not html_files:
        print("\n削除対象のHTMLファイルはありません")
        return

    print(f"\n変換元のHTMLファイルを削除しますか？")
    print(f"対象: {len(html_files)}ファイル")

    if len(html_files) <= 10:
        for f in html_files:
            print(f"  - {os.path.basename(f)}")
    else:
        for f in html_files[:5]:
            print(f"  - {os.path.basename(f)}")
        print(f"  ... (他 {len(html_files) - 10}件)")
        for f in html_files[-5:]:
            print(f"  - {os.path.basename(f)}")

    response = input("\n削除する場合は 'yes' と入力: ").strip().lower()

    if response == 'yes':
        deleted = 0
        for filepath in html_files:
            try:
                os.remove(filepath)
                deleted += 1
            except Exception as e:
                print(f"  エラー: {os.path.basename(filepath)} - {e}")
        print(f"削除完了: {deleted}ファイル")
    else:
        print("削除をスキップしました")


def delete_csv_files(csv_files: list):
    """作成したCSVファイルを削除"""
    if not csv_files:
        return

    print(f"\n作成したCSVファイルを削除しますか？")
    print(f"対象: {len(csv_files)}ファイル")

    response = input("削除する場合は 'yes' と入力: ").strip().lower()

    if response == 'yes':
        deleted = 0
        for filepath in csv_files:
            try:
                os.remove(filepath)
                deleted += 1
            except Exception as e:
                print(f"  エラー: {os.path.basename(filepath)} - {e}")
        print(f"削除完了: {deleted}ファイル")
    else:
        print("CSVファイルを保持しました")


def update_files_json():
    """files.jsonを更新"""
    data_dir = get_data_dir()
    files_json_path = get_files_json_path()

    json_files = glob.glob(os.path.join(data_dir, "*.json"))

    monthly_files = []

    for filepath in sorted(json_files):
        filename = os.path.basename(filepath)
        parts = filename.replace('.json', '').split('_')

        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            relative_path = f"data/{filename}"
            monthly_files.append(relative_path)

    monthly_files.sort(reverse=True)

    files_data = {
        "monthly": monthly_files
    }

    try:
        with open(files_json_path, 'w', encoding='utf-8') as f:
            json.dump(files_data, f, ensure_ascii=False, indent=2)

        print(f"\nfiles.json を更新しました")
        print(f"  月別JSON: {len(monthly_files)}ファイル")

    except Exception as e:
        print(f"\nエラー: files.json の更新に失敗 - {e}")


def show_summary(stats: dict):
    """変換結果のサマリーを表示"""
    print("\n" + "="*50)
    print("変換完了サマリー")
    print("="*50)
    print(f"処理HTMLファイル: {stats['total_files']}件")
    print(f"作成CSV: {stats['csv_created']}件")
    print(f"更新JSON: {stats['json_updated']}件")
    if stats['errors'] > 0:
        print(f"エラー: {stats['errors']}件")

    if stats['months_processed']:
        print("\n月別詳細:")
        for m in stats['months_processed']:
            print(f"  {m['year_month']}: {m['total_days']}日分 "
                  f"(新規{m['new']}, 更新{m['updated']})")


def main():
    print("="*60)
    print("みんれぽ HTML → JSON 統合変換スクリプト")
    print("="*60)

    data_dir = get_data_dir()
    csv_dir = get_csv_dir()

    if not os.path.exists(data_dir):
        print(f"\nエラー: dataディレクトリが見つかりません")
        print(f"  期待パス: {data_dir}")
        sys.exit(1)

    print(f"\nJSON出力先: {data_dir}")
    print(f"CSV出力先: {csv_dir}")

    if len(sys.argv) > 1:
        input_folder = sys.argv[1]
    else:
        print("\nみんれぽのHTMLファイルが格納されているフォルダのパスを入力してください")
        print("例: C:/Downloads/minrepo_html")
        input_folder = input("\nパス: ").strip()
        input_folder = input_folder.strip('"\'')

    if not os.path.exists(input_folder):
        print(f"\nエラー: 指定されたパスが存在しません")
        print(f"  入力: {input_folder}")
        sys.exit(1)

    if not os.path.isdir(input_folder):
        print(f"\nエラー: 指定されたパスはディレクトリではありません")
        sys.exit(1)

    print(f"HTML入力元: {input_folder}")

    stats = convert_html_to_json(input_folder)

    if not stats.get('success'):
        sys.exit(1)

    show_summary(stats)

    if stats.get('converted_html_files'):
        delete_converted_html_files(stats['converted_html_files'])

    if stats.get('csv_files'):
        delete_csv_files(stats['csv_files'])

    print("\nfiles.json を更新しますか？")
    response = input("更新する場合は 'yes' と入力: ").strip().lower()

    if response == 'yes':
        update_files_json()

    print("\n処理が完了しました")


if __name__ == '__main__':
    main()
