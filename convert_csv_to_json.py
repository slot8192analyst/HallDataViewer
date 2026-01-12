#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSVファイルを月別JSONに統合するスクリプト

使い方:
    python convert_csv_to_json.py [対象年月]
    
例:
    python convert_csv_to_json.py 2025_12
    → data/2025_12_*.csv を読み込んで data/2025_12.json を生成/更新

    python convert_csv_to_json.py
    → 対話形式で年月を指定

対応エンコーディング:
    - UTF-8 (BOM付き/なし)
    - Shift-JIS (CP932)

機能:
    - 既存のJSONファイルがある場合、新しいCSVデータを追加更新
    - 同じ日付のデータがある場合はCSVで上書き
"""

import os
import csv
import json
import glob
import sys


def detect_encoding(filepath: str) -> str:
    """ファイルのエンコーディングを自動検出"""
    
    # まずBOMをチェック
    with open(filepath, 'rb') as f:
        raw = f.read(4)
    
    # UTF-8 BOM
    if raw.startswith(b'\xef\xbb\xbf'):
        return 'utf-8-sig'
    
    # UTF-16 BOM (LE/BE)
    if raw.startswith(b'\xff\xfe') or raw.startswith(b'\xfe\xff'):
        return 'utf-16'
    
    # BOMがない場合、内容で判定
    encodings_to_try = ['utf-8', 'cp932', 'shift_jis', 'euc-jp']
    
    for encoding in encodings_to_try:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                content = f.read()
                return encoding
        except (UnicodeDecodeError, UnicodeError):
            continue
    
    return 'utf-8'


def get_csv_files_for_month(data_dir: str, year_month: str) -> list:
    """指定年月のCSVファイル一覧を取得"""
    pattern = os.path.join(data_dir, f"{year_month}_*.csv")
    files = glob.glob(pattern)
    return sorted(files)


def parse_csv_file(filepath: str) -> list:
    """CSVファイルを読み込んでリストで返す（エンコーディング自動検出）"""
    data = []
    
    encoding = detect_encoding(filepath)
    
    try:
        with open(filepath, 'r', encoding=encoding) as f:
            reader = csv.DictReader(f)
            for row in reader:
                cleaned_row = {}
                for k, v in row.items():
                    if k is None:
                        continue
                    clean_key = k.strip().replace('\ufeff', '')
                    clean_value = v.strip() if v else ''
                    cleaned_row[clean_key] = clean_value
                data.append(cleaned_row)
        
        filename = os.path.basename(filepath)
        if encoding not in ['utf-8', 'utf-8-sig']:
            print(f"    ({encoding}で読み込み)")
            
    except Exception as e:
        print(f"  エラー: {filepath} の読み込みに失敗 - {e}")
        print(f"    検出エンコーディング: {encoding}")
    
    return data


def extract_date_key(filepath: str) -> str:
    """ファイルパスから日付キー(YYYY_MM_DD)を抽出"""
    filename = os.path.basename(filepath)
    return filename.replace('.csv', '')


def load_existing_json(json_path: str) -> dict:
    """既存のJSONファイルを読み込む"""
    if not os.path.exists(json_path):
        return {}
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            print(f"  既存JSON読み込み: {len(data)}日分のデータ")
            return data
    except Exception as e:
        print(f"  警告: 既存JSONの読み込みに失敗 - {e}")
        print(f"  新規作成モードで続行します")
        return {}


def convert_month_to_json(data_dir: str, year_month: str, output_dir: str = None) -> bool:
    """指定月のCSVをJSONに統合（既存JSONへの追加更新対応）"""
    
    if output_dir is None:
        output_dir = data_dir
    
    csv_files = get_csv_files_for_month(data_dir, year_month)
    output_path = os.path.join(output_dir, f"{year_month}.json")
    
    # 既存のJSONを読み込む
    existing_data = load_existing_json(output_path)
    existing_dates = set(existing_data.keys())
    
    if not csv_files and not existing_data:
        print(f"エラー: {year_month} に該当するデータが見つかりません")
        return False
    
    if not csv_files:
        print(f"\n{year_month} に新規CSVファイルはありません")
        print(f"既存JSON: {len(existing_data)}日分")
        return True
    
    print(f"\n{year_month} の変換を開始します")
    print(f"  新規CSVファイル: {len(csv_files)}件")
    print(f"  既存JSONデータ: {len(existing_data)}日分")
    
    # 既存データをベースにする
    monthly_data = existing_data.copy()
    
    new_count = 0
    update_count = 0
    total_records = 0
    
    for filepath in csv_files:
        date_key = extract_date_key(filepath)
        data = parse_csv_file(filepath)
        
        if data:
            if date_key in existing_dates:
                update_count += 1
                print(f"  ↻ {date_key}: {len(data)}件 (更新)")
            else:
                new_count += 1
                print(f"  ✓ {date_key}: {len(data)}件 (新規)")
            
            monthly_data[date_key] = data
            total_records += len(data)
        else:
            print(f"  ✗ {date_key}: データなし")
    
    # 日付順にソート
    sorted_data = dict(sorted(monthly_data.items()))
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(sorted_data, f, ensure_ascii=False, indent=2)
        
        file_size = os.path.getsize(output_path)
        file_size_kb = file_size / 1024
        
        print(f"\n変換完了!")
        print(f"  出力: {output_path}")
        print(f"  総日数: {len(sorted_data)}日分")
        print(f"    - 既存: {len(existing_data)}日")
        print(f"    - 新規追加: {new_count}日")
        print(f"    - 更新: {update_count}日")
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
        
        if filename.endswith('.json'):
            parts = filename.replace('.json', '').split('_')
            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                monthly_files.append(relative_path)
    
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
        print("\n削除対象のCSVファイルはありません")
        return
    
    print(f"\n変換元のCSVファイルを削除しますか？")
    print(f"対象: {len(csv_files)}ファイル")
    for f in csv_files:
        print(f"  - {os.path.basename(f)}")
    
    response = input("\n削除する場合は 'yes' と入力: ").strip().lower()
    
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
    """利用可能な年月一覧を取得（CSV + 既存JSON）"""
    
    months = set()
    
    # CSVファイルから年月を取得
    csv_files = glob.glob(os.path.join(data_dir, "*.csv"))
    for filepath in csv_files:
        filename = os.path.basename(filepath)
        parts = filename.replace('.csv', '').split('_')
        if len(parts) >= 2:
            year_month = f"{parts[0]}_{parts[1]}"
            months.add(year_month)
    
    # 既存JSONファイルから年月を取得
    json_files = glob.glob(os.path.join(data_dir, "*.json"))
    for filepath in json_files:
        filename = os.path.basename(filepath)
        parts = filename.replace('.json', '').split('_')
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            year_month = f"{parts[0]}_{parts[1]}"
            months.add(year_month)
    
    return sorted(months)


def show_month_status(data_dir: str, year_month: str) -> tuple:
    """指定年月のCSVとJSONの状態を返す"""
    csv_count = len(get_csv_files_for_month(data_dir, year_month))
    
    json_path = os.path.join(data_dir, f"{year_month}.json")
    json_days = 0
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                json_days = len(data)
        except:
            pass
    
    return csv_count, json_days


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
            print("変換可能なデータがありません")
            sys.exit(1)
        
        print("=" * 60)
        print("CSV → JSON 統合スクリプト（追加更新対応）")
        print("=" * 60)
        print("\n利用可能な年月:")
        print(f"  {'No.':<4} {'年月':<10} {'CSV':<12} {'JSON':<12} {'状態'}")
        print(f"  {'-'*4} {'-'*10} {'-'*12} {'-'*12} {'-'*10}")
        
        for i, month in enumerate(available_months, 1):
            csv_count, json_days = show_month_status(data_dir, month)
            
            if csv_count > 0 and json_days > 0:
                status = "追加更新可"
            elif csv_count > 0:
                status = "新規作成"
            elif json_days > 0:
                status = "変換済み"
            else:
                status = "-"
            
            csv_str = f"{csv_count}ファイル" if csv_count > 0 else "-"
            json_str = f"{json_days}日分" if json_days > 0 else "-"
            
            print(f"  {i:<4} {month:<10} {csv_str:<12} {json_str:<12} {status}")
        
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
