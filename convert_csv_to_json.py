#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSVファイルを月別JSONに統合するスクリプト

使い方:
    python convert_csv_to_json.py [対象年月]
    
例:
    python convert_csv_to_json.py 2025_12
    → data/2025_12_*.csv を読み込んで data/2025_12.json を生成

    python convert_csv_to_json.py
    → 対話形式で年月を指定
"""

import os
import csv
import json
import glob
import sys


def get_csv_files_for_month(data_dir: str, year_month: str) -> list:
    """指定年月のCSVファイル一覧を取得"""
    pattern = os.path.join(data_dir, f"{year_month}_*.csv")
    files = glob.glob(pattern)
    return sorted(files)


def parse_csv_file(filepath: str) -> list:
    """CSVファイルを読み込んでリストで返す"""
    data = []
    try:
        # UTF-8 BOM対応: encoding='utf-8-sig' を使用
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # 各フィールドの前後空白を除去し、BOM文字も除去
                cleaned_row = {}
                for k, v in row.items():
                    # キーからBOMと空白を除去
                    clean_key = k.strip().replace('\ufeff', '')
                    # 値から空白を除去
                    clean_value = v.strip() if v else ''
                    cleaned_row[clean_key] = clean_value
                data.append(cleaned_row)
    except Exception as e:
        print(f"  エラー: {filepath} の読み込みに失敗 - {e}")
    return data


def extract_date_key(filepath: str) -> str:
    """ファイルパスから日付キー(YYYY_MM_DD)を抽出"""
    filename = os.path.basename(filepath)
    return filename.replace('.csv', '')


def convert_month_to_json(data_dir: str, year_month: str, output_dir: str = None) -> bool:
    """指定月のCSVをJSONに統合"""
    
    if output_dir is None:
        output_dir = data_dir
    
    csv_files = get_csv_files_for_month(data_dir, year_month)
    
    if not csv_files:
        print(f"エラー: {year_month} に該当するCSVファイルが見つかりません")
        return False
    
    print(f"\n{year_month} の変換を開始します")
    print(f"対象ファイル数: {len(csv_files)}")
    
    monthly_data = {}
    total_records = 0
    
    for filepath in csv_files:
        date_key = extract_date_key(filepath)
        data = parse_csv_file(filepath)
        
        if data:
            monthly_data[date_key] = data
            total_records += len(data)
            print(f"  ✓ {date_key}: {len(data)}件")
        else:
            print(f"  ✗ {date_key}: データなし")
    
    output_path = os.path.join(output_dir, f"{year_month}.json")
    
    try:
        # BOMなしのUTF-8で出力
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(monthly_data, f, ensure_ascii=False, indent=2)
        
        file_size = os.path.getsize(output_path)
        file_size_kb = file_size / 1024
        
        print(f"\n変換完了!")
        print(f"  出力: {output_path}")
        print(f"  日数: {len(monthly_data)}日分")
        print(f"  総レコード: {total_records}件")
        print(f"  ファイルサイズ: {file_size_kb:.1f} KB")
        
        return True
        
    except Exception as e:
        print(f"エラー: JSONファイルの書き込みに失敗 - {e}")
        return False


def update_files_json(data_dir: str, files_json_path: str):
    """files.jsonを新形式で更新"""
    
    all_files = glob.glob(os.path.join(data_dir, "*"))
    
    monthly_files = []
    
    for filepath in sorted(all_files):
        filename = os.path.basename(filepath)
        relative_path = f"data/{filename}"
        
        # 2025_12.json のような形式（年月.json）を判定
        if filename.endswith('.json'):
            parts = filename.replace('.json', '').split('_')
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                monthly_files.append(relative_path)
    
    # 新しい順にソート
    monthly_files.sort(reverse=True)
    
    files_data = {
        "monthly": monthly_files
    }
    
    with open(files_json_path, 'w', encoding='utf-8') as f:
        json.dump(files_data, f, ensure_ascii=False, indent=2)
    
    print(f"\nfiles.json を更新しました")
    print(f"  月別JSON: {len(monthly_files)}ファイル")


def delete_converted_csv_files(data_dir: str, year_month: str):
    """変換済みのCSVファイルを削除"""
    csv_files = get_csv_files_for_month(data_dir, year_month)
    
    if not csv_files:
        return
    
    print(f"\n変換元のCSVファイルを削除しますか？")
    print(f"対象: {len(csv_files)}ファイル")
    
    response = input("削除する場合は 'yes' と入力: ").strip().lower()
    
    if response == 'yes':
        for filepath in csv_files:
            try:
                os.remove(filepath)
                print(f"  削除: {os.path.basename(filepath)}")
            except Exception as e:
                print(f"  エラー: {os.path.basename(filepath)} - {e}")
        print("削除完了")
    else:
        print("削除をスキップしました")


def get_available_months(data_dir: str) -> list:
    """利用可能な年月一覧を取得"""
    csv_files = glob.glob(os.path.join(data_dir, "*.csv"))
    
    months = set()
    for filepath in csv_files:
        filename = os.path.basename(filepath)
        parts = filename.replace('.csv', '').split('_')
        if len(parts) >= 2:
            year_month = f"{parts[0]}_{parts[1]}"
            months.add(year_month)
    
    return sorted(months)


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(script_dir, 'data')
    files_json_path = os.path.join(script_dir, 'files.json')
    
    if not os.path.exists(data_dir):
        print(f"エラー: dataディレクトリが見つかりません: {data_dir}")
        sys.exit(1)
    
    if len(sys.argv) > 1:
        year_month = sys.argv[1]
    else:
        available_months = get_available_months(data_dir)
        
        if not available_months:
            print("変換可能なCSVファイルがありません")
            sys.exit(1)
        
        print("=" * 50)
        print("CSV → JSON 統合スクリプト")
        print("=" * 50)
        print("\n利用可能な年月:")
        for i, month in enumerate(available_months, 1):
            csv_count = len(get_csv_files_for_month(data_dir, month))
            print(f"  {i}. {month} ({csv_count}ファイル)")
        
        print("\n変換する年月を入力してください")
        print("例: 2025_12")
        print("または番号で選択: 1")
        
        user_input = input("\n入力: ").strip()
        
        if user_input.isdigit():
            index = int(user_input) - 1
            if 0 <= index < len(available_months):
                year_month = available_months[index]
            else:
                print("無効な番号です")
                sys.exit(1)
        else:
            year_month = user_input
    
    success = convert_month_to_json(data_dir, year_month)
    
    if success:
        delete_converted_csv_files(data_dir, year_month)
        
        print("\nfiles.json を更新しますか？")
        response = input("更新する場合は 'yes' と入力: ").strip().lower()
        
        if response == 'yes':
            update_files_json(data_dir, files_json_path)


if __name__ == '__main__':
    main()
