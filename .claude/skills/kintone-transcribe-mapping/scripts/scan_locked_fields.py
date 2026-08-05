#!/usr/bin/env python3
"""kintone app の「書込ロック項目」を洗い出す（ハマり①）。

ルックアップのコピー先(lookup.fieldMappings[].field)と CALC は updateRecord で書いても
エラーにならず無視される。マッピングに入れても no-op になるので事前に除外する。

使い方:
  1. app fields を保存: curl -H "X-Cybozu-Authorization: $AUTH" \
       "$BASE/k/v1/app/form/fields.json?app=55" > app55_fields.json
  2. python scan_locked_fields.py app55_fields.json [チェックしたいコード...]
     引数のコードを省略すると、ロック対象フィールドを全部一覧する。

確証したい時は直接PUTして消えるか見る:
  curl -X PUT "$BASE/k/v1/record.json" -H "Content-Type: application/json" \
    -d '{"app":55,"id":<rec>,"record":{"<code>":{"value":"TEST"}}}'
  → 再取得して空なら書込ロック確定。
"""
import json
import sys


def load_locked(fields_json_path):
    props = json.load(open(fields_json_path))["properties"]
    copy_dest = {}  # コピー先フィールド -> それを供給するルックアップ元
    for code, v in props.items():
        lk = v.get("lookup")
        if lk:
            for fm in lk.get("fieldMappings", []):
                copy_dest[fm.get("field")] = code
    calc = {c for c, v in props.items() if v.get("type") == "CALC"}
    return copy_dest, calc


def main():
    if len(sys.argv) < 2:
        print("usage: python scan_locked_fields.py <app_fields.json> [code ...]")
        sys.exit(1)
    copy_dest, calc = load_locked(sys.argv[1])
    check = sys.argv[2:]
    if check:
        for c in check:
            base = c.split(".")[0]  # サブテーブルは code.sub 形式
            if base in copy_dest:
                print(f"  ★ロック {c} ← {copy_dest[base]}ルックアップ自動コピー")
            elif base in calc:
                print(f"  ★ロック {c} ← CALC(自動計算)")
            else:
                print(f"    OK   {c} (書込可)")
    else:
        print("=== ルックアップ自動コピー先 (書込ロック) ===")
        for dest, src in sorted(copy_dest.items()):
            print(f"  {dest} ← {src}")
        print("\n=== CALC (書込不可) ===")
        for c in sorted(calc):
            print(f"  {c}")


if __name__ == "__main__":
    main()
