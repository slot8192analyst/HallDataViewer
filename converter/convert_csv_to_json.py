#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
HTMLファイルを月別JSONに統合するスクリプト（CSV同時出力対応）

使い方:
    python convert_html_to_json.py [HTMLフォルダパス]
    
例:
    python convert_html_to_json.py C:/Downloads/html_data
    → 指定フォルダ内の YYYY_MM_DD *.html を読み込んで
      converter/YYYY_MM_DD.csv と data/YYYY_MM.json を生成/更新

    python convert_html_to_json.py
    → 対話形式でHTMLフォルダを指定

機能:
    - HTMLテーブルをCSVとJSONに同時変換
    - 既存のJSONファイルがある場合、新しいデータを追加更新
    - 同じ日付のデータがある場合はHTMLで上書き
    - 変換後のHTMLファイル削除オプション
    - files.json の自動更新
"""

import os
import sys
import json
import glob
from pathlib import Path
from collections import defaultdict

import pandas as pd
import lxml.html


def get_script_dir() -> str:
    """スクリプトのディレクトリを取得"""
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


def parse_date_from_filename(filepath: str) -> tuple:
    """
    ファイル名から日付情報を抽出
    
    Returns:
        (date_key, year_month) - 例: ('2025_12_15', '2025_12')
        パース失敗時は (None, None)
    """
    stem = Path(filepath).stem
    date_part = stem.split()[0]
    
    parts = date_part.split('_')
    if len(parts) >= 3 and all(p.isdigit() for p in parts[:3]):
        date_key = f"{parts[0]}_{parts[1]}_{parts[2]}"
        year_month = f"{parts[0]}_{parts[1]}"
        return date_key, year_month
    
    return None, None


def group_html_files_by_month(html_files: list) -> dict:
    """HTMLファイルを年月ごとにグループ化"""
    groups = defaultdict(list)
    
    for filepath in html_files:
        date_key, year_month = parse_date_from_filename(filepath)
        if date_key and year_month:
            groups[year_month].append({
                'filepath': filepath,
                'date_key': date_key
            })
    
    for year_month in groups:
        groups[year_month].sort(key=lambda x: x['date_key'])
    
    return dict(sorted(groups.items()))


def extract_table_from_html(filepath: str) -> pd.DataFrame:
    """
    HTMLファイルからID付きテーブルを抽出してDataFrameで返す
    
    Returns:
        DataFrame or None
    """
    try:
        tree = lxml.html.parse(filepath)
        tables_with_id = tree.xpath('//table[@id]')
        
        if not tables_with_id:
            return None
        
        first_table_node = tables_with_id[0]
        target_table_html = lxml.html.tostring(first_table_node, encoding='unicode')
        
        dfs = pd.read_html(target_table_html)
        if dfs:
            return dfs[0]
        
        return None
        
    except Exception as e:
        print(f"    エラー: テーブル抽出失敗 - {e}")
        return None


def dataframe_to_dict_list(df: pd.DataFrame) -> list:
    """DataFrameを辞書のリストに変換（JSON用）"""
    df = df.fillna('')
    
    records = []
    for _, row in df.iterrows():
        record = {}
        for col in df.columns:
            value = row[col]
            if isinstance(value, float) and value == int(value):
                record[str(col)] = str(int(value))
            else:
                record[str(col)] = str(value) if value != '' else ''
        records.append(record)
    
    return records


def load_existing_json(json_path: str) -> dict:
    """既存のJSONファイルを読み込む"""
    if not os.path.exists(json_path):
        return {}
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data
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
    HTMLファイルをCSV/JSONに変換
    
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
    
    grouped = group_html_files_by_month(html_files)
    
    if not grouped:
        print("エラー: 有効な日付形式のHTMLファイルが見つかりませんでした")
        print("  期待する形式: YYYY_MM_DD *.html")
        return {'success': False}
    
    print(f"\n検出されたHTMLファイル: {len(html_files)}件")
    print(f"対象年月: {', '.join(grouped.keys())}")
    
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
    
    for year_month, file_infos in grouped.items():
        print(f"\n{'='*50}")
        print(f"{year_month} の処理を開始 ({len(file_infos)}ファイル)")
        print('='*50)
        
        json_path = os.path.join(data_dir, f"{year_month}.json")
        
        existing_data = load_existing_json(json_path)
        if existing_data:
            print(f"  既存JSON: {len(existing_data)}日分のデータ")
        
        monthly_data = existing_data.copy()
        existing_dates = set(existing_data.keys())
        
        new_count = 0
        update_count = 0
        
        for file_info in file_infos:
            filepath = file_info['filepath']
            date_key = file_info['date_key']
            filename = os.path.basename(filepath)
            
            print(f"\n  処理中: {filename}")
            
            df = extract_table_from_html(filepath)
            
            if df is None or df.empty:
                print(f"    ✗ データなし（スキップ）")
                stats['errors'] += 1
                continue
            
            # CSV保存（スクリプトと同じディレクトリ）
            csv_path = os.path.join(csv_dir, f"{date_key}.csv")
            if save_csv(df, csv_path):
                print(f"    ✓ CSV保存: {date_key}.csv ({len(df)}件)")
                stats['csv_created'] += 1
                stats['csv_files'].append(csv_path)
            
            records = dataframe_to_dict_list(df)
            
            if date_key in existing_dates:
                update_count += 1
                print(f"    ↻ JSON更新: {date_key} ({len(records)}件)")
            else:
                new_count += 1
                print(f"    ✓ JSON追加: {date_key} ({len(records)}件)")
            
            monthly_data[date_key] = records
            stats['converted_html_files'].append(filepath)
        
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
    print("HTML → JSON 統合変換スクリプト")
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
        print("\nHTMLファイルが格納されているフォルダのパスを入力してください")
        print("例: C:/Downloads/html_data")
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
