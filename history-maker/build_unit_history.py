#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_unit_history.py

data/*.json を全スキャンし、台の状態変化履歴 unit_history.json を生成する
完全に独立した単体スクリプト。

    python build_unit_history.py

- converter.py からは呼び出さない（独立実行専用）。
- 標準ライブラリのみを使用（外部依存なし）。
- メモリ効率: 同時に載せるのは「処理中の1か月分データ」＋「直前1日分の
  スナップショット」＋「蓄積中の出力データ」のみ。全月を一度に展開しない。
- 全再生成方式（増分ビルドはしない）。
"""

import os
import re
import json

# --- パス設定 -------------------------------------------------------------
# このスクリプトは converter/ 配下に置かれる想定。
# data/ はプロジェクトルート直下（converter/ の1つ上）にある。
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
# 出力先はプロジェクトルート直下（既存の data/*.json や files.json と同階層）。
OUTPUT_PATH = os.path.join(PROJECT_ROOT, "unit_history.json")

# YYYY_MM.json 形式のファイル名にマッチする正規表現
MONTH_FILE_RE = re.compile(r"^(\d{4})_(\d{2})\.json$")
# YYYY_MM_DD 形式の日付キーにマッチする正規表現
DATE_KEY_RE = re.compile(r"^(\d{4})_(\d{2})_(\d{2})$")


def list_month_files(data_dir):
    """
    data_dir 内の YYYY_MM.json を年月の古い順にソートして返す。
    戻り値: [(year, month, filepath), ...]
    """
    result = []
    if not os.path.isdir(data_dir):
        return result
    for name in os.listdir(data_dir):
        m = MONTH_FILE_RE.match(name)
        if not m:
            continue
        year = int(m.group(1))
        month = int(m.group(2))
        result.append((year, month, os.path.join(data_dir, name)))
    # 年月の古い順
    result.sort(key=lambda x: (x[0], x[1]))
    return result


def sorted_date_keys(month_data):
    """
    月次データ（{ "YYYY_MM_DD": [...] }）の日付キーを古い順にソートして返す。
    日付形式でないキーは無視する。
    """
    keys = []
    for k in month_data.keys():
        m = DATE_KEY_RE.match(k)
        if not m:
            continue
        keys.append(k)
    # 文字列 "YYYY_MM_DD" はゼロ埋めされているため辞書順＝時系列順
    keys.sort()
    return keys


def build_snapshot(day_records):
    """
    ある1日分のレコード配列から「機種名 -> 台番号のSet」マップを構築する。
    day_records: [ { "機種名": "...", "台番号": "...", ... }, ... ]
    戻り値: { 機種名: set([台番号, ...]) }
    """
    snapshot = {}
    for rec in day_records:
        machine = rec.get("機種名")
        unit = rec.get("台番号")
        if machine is None or unit is None:
            continue
        # 台番号は文字列として扱う
        unit = str(unit)
        machine = str(machine)
        if machine not in snapshot:
            snapshot[machine] = set()
        snapshot[machine].add(unit)
    return snapshot


def snapshot_all_units(snapshot):
    """
    スナップショット全体の「台番号 -> 機種名」対応を返す（台番号軸の記録に使用）。
    戻り値: { 台番号: 機種名 }
    """
    unit_to_machine = {}
    for machine, units in snapshot.items():
        for u in units:
            unit_to_machine[u] = machine
    return unit_to_machine


def diff_and_emit_events(prev_snapshot, cur_snapshot, date_key, machine_history):
    """
    前日スナップショットと当日スナップショットを比較し、
    machine_history にイベントを push する。

    判定ルール:
      - new:      機種名が前日に存在しない
      - add:      同機種で台数が増えた
      - remove:   同機種で台数が減った
      - move:     機種名は同じ・台数も同じだが台番号Setが変わった
      - withdraw: 前日に存在した機種名が当日消えた

    複数属性の同時発生（例: 台数増＋入れ替わり）は、それぞれ別イベントとして
    複数 push する。各イベントの type は必ず単一の文字列。
    """

    def push_event(machine, ev_type, cur_units, prev_units):
        if machine not in machine_history:
            machine_history[machine] = {"events": []}
        machine_history[machine]["events"].append({
            "date": date_key,
            "type": ev_type,
            # units は今日時点の全体、prev_units は前日時点の全体
            "units": sorted(cur_units),
            "prev_units": sorted(prev_units),
        })

    prev_machines = set(prev_snapshot.keys())
    cur_machines = set(cur_snapshot.keys())

    # --- 当日に存在する機種を評価 ---
    for machine in cur_machines:
        cur_units = cur_snapshot[machine]
        if machine not in prev_snapshot:
            # 前日に無い機種名 → 新台
            push_event(machine, "new", cur_units, set())
            continue

        prev_units = prev_snapshot[machine]
        cur_n = len(cur_units)
        prev_n = len(prev_units)

        # 台数差による判定（new/add/remove）
        if cur_n > prev_n:
            push_event(machine, "add", cur_units, prev_units)
        elif cur_n < prev_n:
            push_event(machine, "remove", cur_units, prev_units)

        # 台番号Setの入れ替わりによる move 判定。
        # 台数が同じ場合の純粋な入れ替えはもちろん、
        # 台数変化と同時に入れ替わりがある場合も別途 move を立てる。
        if cur_units != prev_units:
            if cur_n == prev_n:
                # 台数同じ・中身違う → move
                push_event(machine, "move", cur_units, prev_units)
            else:
                # 台数変化あり。単なる増減（片方が他方の部分集合）なら move にしない。
                # 増台なら prev が cur の部分集合、減台なら cur が prev の部分集合の
                # ときは「純粋な増減」なので move を立てない。
                # それ以外（入れ替わりを伴う増減）は add/remove に加えて move も立てる。
                if cur_n > prev_n:
                    pure_add = prev_units.issubset(cur_units)
                    if not pure_add:
                        push_event(machine, "move", cur_units, prev_units)
                else:
                    pure_remove = cur_units.issubset(prev_units)
                    if not pure_remove:
                        push_event(machine, "move", cur_units, prev_units)

    # --- 前日に存在したが当日消えた機種を評価（withdraw） ---
    for machine in prev_machines - cur_machines:
        prev_units = prev_snapshot[machine]
        push_event(machine, "withdraw", set(), prev_units)


def record_unit_axis(prev_unit_to_machine, cur_unit_to_machine,
                     date_key, unit_history, is_first_day):
    """
    台番号軸（unit_history）の記録。
    機種が変化した節目の日だけ記録する（毎日は記録しない）。

    - 最初のデータ日: 全台番号の初回エントリを記録（初期状態）。
    - 以降: ある台番号について、前回記録時の機種（＝prev の機種）と
      当日の機種が異なる場合に { date, machine } を追記する。

    prev_unit_to_machine: 前日時点の { 台番号: 機種名 }
    cur_unit_to_machine:  当日時点の { 台番号: 機種名 }
    unit_history:         蓄積中の { 台番号: [ {date, machine}, ... ] }
    """
    if is_first_day:
        # 初期状態として全台番号の初回エントリを記録
        for unit, machine in cur_unit_to_machine.items():
            unit_history.setdefault(unit, []).append({
                "date": date_key,
                "machine": machine,
            })
        return

    for unit, machine in cur_unit_to_machine.items():
        # 「前回記録時の機種」は unit_history の末尾エントリを正とする。
        # （台が一時的に消えて別機種で復活した場合も末尾比較で節目を拾える）
        history = unit_history.get(unit)
        if not history:
            # これまで一度も記録が無い台番号 → 初出。記録する。
            unit_history.setdefault(unit, []).append({
                "date": date_key,
                "machine": machine,
            })
            continue
        last_machine = history[-1]["machine"]
        if last_machine != machine:
            # 機種が変わった節目 → 追記
            history.append({
                "date": date_key,
                "machine": machine,
            })


def main():
    month_files = list_month_files(DATA_DIR)
    if not month_files:
        print("data/ に YYYY_MM.json が見つかりません。")
        # 空の出力を書き出しておく（読み込み側が null 扱いしやすいよう最小構造）
        output = {"machine_history": {}, "unit_history": {}}
        with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        return

    machine_history = {}   # 蓄積中の出力（機種軸）
    unit_history = {}      # 蓄積中の出力（台番号軸）

    # 直前1日分のスナップショットのみ保持（メモリ効率のため）
    prev_snapshot = None            # { 機種名: set(台番号) }
    prev_unit_to_machine = None     # { 台番号: 機種名 }
    seen_first_day = False

    for (year, month, filepath) in month_files:
        # 処理中の1か月分だけをメモリに載せる
        with open(filepath, "r", encoding="utf-8") as f:
            month_data = json.load(f)

        for date_key in sorted_date_keys(month_data):
            day_records = month_data[date_key]
            cur_snapshot = build_snapshot(day_records)
            cur_unit_to_machine = snapshot_all_units(cur_snapshot)

            if not seen_first_day:
                # 最初のデータ日: new を立てず、台番号軸に初期状態のみ記録
                record_unit_axis(None, cur_unit_to_machine, date_key,
                                 unit_history, is_first_day=True)
                seen_first_day = True
            else:
                # 前日（＝直前スナップショット。月境界も同じ変数で接続される）と比較
                diff_and_emit_events(prev_snapshot, cur_snapshot,
                                     date_key, machine_history)
                record_unit_axis(prev_unit_to_machine, cur_unit_to_machine,
                                 date_key, unit_history, is_first_day=False)

            # 当日を「次の前日」として保持（月境界の接続もここで担保される）
            prev_snapshot = cur_snapshot
            prev_unit_to_machine = cur_unit_to_machine

        # 月ファイルの参照を解放（次月ロード前にメモリを空ける）
        month_data = None

    output = {
        "machine_history": machine_history,
        "unit_history": unit_history,
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("生成完了: {}".format(OUTPUT_PATH))
    print("  機種数: {}, 台番号数: {}".format(
        len(machine_history), len(unit_history)))


if __name__ == "__main__":
    main()
