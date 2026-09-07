import re
import json
from pathlib import Path
from bs4 import BeautifulSoup


def extract_month_day_from_filename(filename: str):
    """ファイル名の最初の '(' より前の部分から月日を抽出する
    例: "9_2(水) オーギヤ磐田店 ...html" -> (9, 2)
    """
    # 拡張子を除いたファイル名本体を取得する
    stem = Path(filename).stem

    # 最初の '(' より前の部分だけを切り出す
    before_paren = stem.split("(", 1)[0]

    # "9_2" のような "数字_数字" パターンを抽出する
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


def build_date_key(filename: str, soup: BeautifulSoup) -> str:
    """ファイル名から月日、HTMLから年を取得して日付キーを組み立てる"""
    month, day = extract_month_day_from_filename(filename)

    if month is None or day is None:
        return f"unknown_date_{Path(filename).stem}"

    year = extract_year_from_html(soup)
    if year is None:
        year = "2026"  # 年情報が取得できない場合のフォールバック

    return f"{year}_{month:02d}_{day:02d}"


def parse_html_file(file_path: Path):
    """1つのHTMLファイルから全台データ一覧テーブルを抽出する"""
    with open(file_path, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")

    table_wrap = soup.find("div", class_="table_wrap")
    if table_wrap is None:
        raise ValueError("table_wrap が見つかりませんでした")

    table = table_wrap.find("table")
    tbody = table.find("tbody") if table else None
    if tbody is None:
        raise ValueError("テーブル本体(tbody)が見つかりませんでした")

    rows = tbody.find_all("tr")
    results = []

    for row in rows:
        # 見出し行(th要素のみの行)はスキップする
        if row.find("th"):
            continue

        cells = row.find_all("td")
        if len(cells) < 5:
            continue

        kishu_link = cells[0].find("a")
        kishu_name = kishu_link.get_text(strip=True) if kishu_link else cells[0].get_text(strip=True)

        num_link = cells[1].find("a")
        num_text = num_link.get_text(strip=True) if num_link else cells[1].get_text(strip=True)

        samai_text = cells[2].get_text(strip=True).replace(",", "")
        game_text = cells[3].get_text(strip=True).replace(",", "")
        deritsu_text = cells[4].get_text(strip=True)

        results.append({
            "機種名": kishu_name,
            "台番号": num_text,
            "G数": game_text,
            "差枚": samai_text,
            "出率": deritsu_text
        })

    date_key = build_date_key(file_path.name, soup)
    return date_key, results


def main():
    dir_path_str = input("HTMLファイルが入っているディレクトリのパスを入力してください: ").strip().strip('"')
    dir_path = Path(dir_path_str)

    if not dir_path.exists() or not dir_path.is_dir():
        print(f"エラー: '{dir_path}' は存在しないか、ディレクトリではありません。")
        return

    # 指定ディレクトリの直下(1階層のみ)を対象にする
    html_files = sorted(dir_path.glob("*.html"))

    if not html_files:
        print(f"エラー: '{dir_path}' の中にHTMLファイルが見つかりませんでした。")
        return

    print(f"{len(html_files)} 件のHTMLファイルが見つかりました。処理を開始します。")

    output = {}
    failed_files = []

    for file_path in html_files:
        try:
            date_key, records = parse_html_file(file_path)
        except Exception as e:
            print(f"  [失敗] {file_path.name} -> {e}")
            failed_files.append(file_path.name)
            continue

        if date_key in output:
            existing_numbers = {r["台番号"] for r in output[date_key]}
            new_records = [r for r in records if r["台番号"] not in existing_numbers]
            output[date_key].extend(new_records)
        else:
            output[date_key] = records

        print(f"  [成功] {file_path.name} -> {date_key} ({len(records)} 台分のデータを取得)")

    save_path_str = input("出力先のJSONファイル名を入力してください(空欄の場合は output.json): ").strip()
    save_path = Path(save_path_str) if save_path_str else Path("output.json")

    with open(save_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n完了しました。結果を '{save_path}' に保存しました。")
    if failed_files:
        print(f"以下の {len(failed_files)} 件のファイルは処理に失敗しました:")
        for name in failed_files:
            print(f"  - {name}")


if __name__ == "__main__":
    main()
