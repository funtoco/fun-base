#!/usr/bin/env bash
# fun-base-infra のマイグレーション採番が安全かを判定する。
#
# 使い方（supabase サブモジュール内で実行）:
#   check-numbering.sh <base-ref> <head-ref> [applied-max]
#     base-ref    比較元。通常 origin/main
#     head-ref    対象ブランチ。通常 HEAD や FETCH_HEAD
#     applied-max 本番の schema_migrations の最大 version（任意・分かるなら渡す）
#
# 出力: 問題があれば「現ファイル名 → 推奨ファイル名」を1行ずつ出す（rename 指示）。
# 終了コード: 0=問題なし / 1=要リネーム / 2=使い方エラー
#
# 提案採番は「基準の翌日」から作る。基準が動かないと提案も動かないので、
# 複数PRを同時に採番し直すと同じ番号がぶつかる。必ず1本ずつ、マージ直前に実行すること。
set -euo pipefail

BASE_REF="${1:-origin/main}"
HEAD_REF="${2:-HEAD}"
APPLIED_MAX="${3:-0}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "base-ref '$BASE_REF' が見つかりません。git fetch origin を先に実行してください。" >&2
  exit 2
fi

version_of() { basename "$1" | cut -d_ -f1; }

# base 側（通常 main）にある最新の採番
base_max=0
while read -r f; do
  [ -n "$f" ] || continue
  v="$(version_of "$f")"
  [[ "$v" =~ ^[0-9]{14}$ ]] || continue
  [ "$v" -gt "$base_max" ] && base_max="$v"
done < <(git ls-tree --name-only "$BASE_REF" migrations/ 2>/dev/null || true)

# 基準は「main の最新」と「本番に適用済みの最新」の大きい方。
# db push は適用済み最新より古い採番を無警告でスキップするため、両方を超える必要がある。
baseline="$base_max"
if [[ "$APPLIED_MAX" =~ ^[0-9]{14}$ ]] && [ "$APPLIED_MAX" -gt "$baseline" ]; then
  baseline="$APPLIED_MAX"
fi

echo "main の最新採番:       $base_max"
echo "本番の適用済み最新:     ${APPLIED_MAX:-未指定}"
echo "基準（これより後ろが必要）: $baseline"
echo

# このブランチが追加(A)またはリネーム(R)したマイグレーション
changed="$(git diff --name-only --diff-filter=AR "$BASE_REF...$HEAD_REF" -- 'migrations/*.sql' || true)"
if [ -z "$changed" ]; then
  echo "追加・改名されたマイグレーションはありません。"
  exit 0
fi

# 提案する採番は基準の「翌日 00:00:00」を起点に、1件ずつ1時間ずらす。
# 現在時刻を使うと複数PRが同じ分に集中して衝突しやすいため、基準からの相対で決める。
# 月末（例 20260831 の翌日）を正しく扱うため日付計算は python3 に任せる。
next_base="$(python3 -c "
import datetime, sys
d = datetime.datetime.strptime('${baseline:0:8}', '%Y%m%d').date() + datetime.timedelta(days=1)
print(d.strftime('%Y%m%d') + '000000')
")"

need_rename=0
i=0
while read -r f; do
  [ -n "$f" ] || continue
  v="$(version_of "$f")"
  name="${f#migrations/}"
  suffix="${name#*_}"

  if ! [[ "$v" =~ ^[0-9]{14}$ ]]; then
    echo "NG  $name"
    echo "    先頭が14桁のタイムスタンプではありません。"
    need_rename=1
    continue
  fi

  if [ "$v" -le "$baseline" ]; then
    proposed="$(( next_base + i * 10000 ))"
    echo "NG  $name"
    echo "    採番 $v は基準 $baseline 以前です。db push に無警告でスキップされます。"
    echo "    RENAME: migrations/$name -> migrations/${proposed}_${suffix}"
    need_rename=1
    i=$(( i + 1 ))
  else
    echo "OK  $name ($v > $baseline)"
  fi
done <<< "$changed"

exit "$need_rename"
