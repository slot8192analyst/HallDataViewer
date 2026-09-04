#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
minrepo_convert.py
みんれぽ(みんなのパチスロ実践レポート)からダウンロードしたHTMLファイルを
既存のCSV/JSONデータ形式に変換・追記するコンバーター。

使い方:
    python minrepo_convert.py [HTMLフォルダパス]
    (引数を省略した場合は実行時に入力を求めます)
"""

import os
import re
import csv
import json
import sys
import glob

# ========= 出力データの列定義 =========
# みんれぽから取得できるのは 機種名・台番号・G数・差枚 の4項目のみ。
# それ以外は既存フォーマットに合わせて0埋めする。
# カウント系(BB/RB/ART)は "0"、確率系は既存データで件数0のときの表記に合わせて "1/0.0" とする。
OUTPUT_COLUMNS = [
    "機種名", "台番号", "G数", "差枚",
    "BB", "RB", "ART",
    "合成確率", "BB確率", "RB確率", "ART確率"
]

ZERO_FILL_COUNT = "0"
ZERO_FILL_PROB = "1/0.0"

COUNT_FIELDS = {"BB", "RB", "ART"}
PROB_FIELDS = {"合成確率", "BB確率", "RB確率", "ART確率"}


def get_script_dir():
    return os.path.dirname(os.path.abspath(__file__))


def get_data_dir():
    """既存コンバーターと同じ ../data/ ディレクトリを指す"""
    return os.path.normpath(os.path.join(get_script_dir(), "..", "data"))


def get_csv_dir():
    """CSVはスクリプトと同じ階層に出力する"""
    return get_script_dir()


def get_files_json_path():
    return os.path.join(get_script_dir(), "..", "files.json")


# ========= HTMLからの日付抽出 =========
def extract_date_from_minrepo_html(html_text):
    """
    <h1>内の "9/4(金)" のような表記から月日を取得し、
    <time datetime="...">から年を取得して YYYY_MM_DD を組み立てる。
    見出しの月が公開月より大きい場合は年を1つ前にする(年末年始対応)。
    """
    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_text, re.S)
    month = day = None
    if h1_match:
        h1_text = re.sub(r'<[^>]+>', '', h1_match.group(1))
        md_match = re.search(r'(\d{1,2})/(\d{1,2})', h1_text)
        if md_match:
            month = int(md_match.group(1))
            day = int(md_match.group(2))

    year = None
    time_match = re.search(r'<time[^>]*datetime="(\d{4})-(\d{2})-(\d{2})', html_text)
    if time_match:
        year = int(time_match.group(1))
        pub_month = int(time_match.group(2))
        if month is not None and month > pub_month:
            year -= 1

    if month is None or day is None or year is None:
        return None

    return "%04d_%02d_%02d" % (year, month, day)


# ========= テーブル行の抽出 =========
def extract_minrepo_records(html_text):
    """
    みんれぽのテーブルから 機種・台番・差枚・G数 を抽出する。
    <th>を含む行(ヘッダー行)はスキップする。
    """
    records = []

    table_match = re.search(r'<table.*?>(.*?)</table>', html_text, re.S)
    if not table_match:
        return records

    table_html = table_match.group(1)
    row_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.S)

    for row_html in row_matches:
        if '<th' in row_html:
            continue

        cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.S)
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        cells = [c.replace('\u3000', '').replace(',', '') for c in cells]

        if len(cells) < 4:
            continue

        kishu, daiban, sahai, gsu = cells[0], cells[1], cells[2], cells[3]

        records.append({
            "機種名": kishu,
            "台番号": daiban,
            "G数": gsu,
            "差枚": sahai,
        })

    return records


# ========= 欠損項目の穴埋め =========
def pad_record(record):
    full = {}
    for col in OUTPUT_COLUMNS:
        if col in record:
            full[col] = record[col]
        elif col in COUNT_FIELDS:
            full[col] = ZERO_FILL_COUNT
        elif col in PROB_FIELDS:
            full[col] = ZERO_FILL_PROB
        else:
            full[col] = ""
    return full


def records_to_full_dict_list(records):
    return [pad_record(r) for r in records]


# ========= 保存処理 =========
def save_csv(date_key, records, csv_dir):
    csv_path = os.path.join(csv_dir, f"{date_key}.csv")
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for r in records:
            writer.writerow(r)
    return csv_path


def load_monthly_json(json_path):
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_monthly_json(json_path, data):
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def update_files_json(month_key):
    """
    files.json は以下の構造:
    {
      "monthly": [
        "data/2026_09.json",
        "data/2026_08.json",
        ...
      ]
    }
    新しい月ほど先頭に来る降順で並んでいるため、その順序を保って追加する。
    """
    files_json_path = get_files_json_path()

    if os.path.exists(files_json_path):
        with open(files_json_path, "r", encoding="utf-8") as f:
            files_data = json.load(f)
    else:
        files_data = {"monthly": []}

    if "monthly" not in files_data or not isinstance(files_data["monthly"], list):
        files_data["monthly"] = []

    entry_name = f"data/{month_key}.json"  # 常にスラッシュ区切りで統一

    if entry_name not in files_data["monthly"]:
        files_data["monthly"].append(entry_name)

        # "data/2026_09.json" → (2026, 9) のようにキーを抽出して降順ソート
        def sort_key(path):
            name = os.path.basename(path).replace(".json", "")
            y, m = name.split("_")
            return (int(y), int(m))

        files_data["monthly"].sort(key=sort_key, reverse=True)

        with open(files_json_path, "w", encoding="utf-8") as f:
            json.dump(files_data, f, ensure_ascii=False, indent=2)

        print(f"[OK] files.json に追加しました: {entry_name}")
    else:
        # 既に存在する場合は何もしない(順序も変更しない)
        pass


# ========= メイン処理 =========
def convert_minrepo_to_json(html_dir):
    html_files = glob.glob(os.path.join(html_dir, "*.html")) + \
                 glob.glob(os.path.join(html_dir, "*.htm"))

    if not html_files:
        print(f"[警告] {html_dir} 内にHTMLファイルが見つかりませんでした。")
        return

    data_dir = get_data_dir()
    csv_dir = get_csv_dir()
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(csv_dir, exist_ok=True)

    daily_records = {}
    errors = []

    for path in html_files:
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                html_text = f.read()
        except Exception as e:
            errors.append(f"{path}: 読み込みエラー ({e})")
            continue

        date_key = extract_date_from_minrepo_html(html_text)
        if not date_key:
            errors.append(f"{path}: 日付を特定できませんでした。スキップします。")
            continue

        raw_records = extract_minrepo_records(html_text)
        if not raw_records:
            errors.append(f"{path}: 台データを抽出できませんでした。")
            continue

        full_records = records_to_full_dict_list(raw_records)
        daily_records.setdefault(date_key, []).extend(full_records)
        print(f"[OK] {os.path.basename(path)} → {date_key} ({len(full_records)}台)")

    if not daily_records:
        print("処理できるデータがありませんでした。")
        return

    month_groups = {}
    for date_key in daily_records:
        month_key = "_".join(date_key.split("_")[:2])
        month_groups.setdefault(month_key, []).append(date_key)

    created_csv = []
    updated_json = []

    for month_key, date_keys in month_groups.items():
        json_path = os.path.join(data_dir, f"{month_key}.json")
        monthly_data = load_monthly_json(json_path)

        for date_key in date_keys:
            records = daily_records[date_key]
            monthly_data[date_key] = records  # 追記/上書き

            csv_path = save_csv(date_key, records, csv_dir)
            created_csv.append(csv_path)

        monthly_data = dict(sorted(monthly_data.items()))
        save_monthly_json(json_path, monthly_data)
        update_files_json(month_key)
        updated_json.append(json_path)

    print("\n=== 処理結果 ===")
    print(f"処理したHTMLファイル数: {len(html_files)}")
    print(f"作成/更新したCSVファイル数: {len(created_csv)}")
    for p in created_csv:
        print(f"  - {p}")
    print(f"更新したJSONファイル数: {len(updated_json)}")
    for p in updated_json:
        print(f"  - {p}")

    if errors:
        print("\n=== 警告・エラー ===")
        for e in errors:
            print(f"  - {e}")


def main():
    if len(sys.argv) > 1:
        html_dir = sys.argv[1]
    else:
        html_dir = input("みんれぽHTMLファイルが入っているフォルダのパスを入力してください: ").strip()

    if not html_dir:
        html_dir = get_script_dir()

    if not os.path.isdir(html_dir):
        print(f"[エラー] 指定されたパスはディレクトリではありません: {html_dir}")
        return

    convert_minrepo_to_json(html_dir)


if __name__ == "__main__":
    main()
