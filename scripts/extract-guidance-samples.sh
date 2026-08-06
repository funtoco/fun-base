#!/usr/bin/env bash
# ご案内資料の PDF から書類サンプル画像を切り出して public/guidance/samples/ に出力する。
#
# 使い方:
#   ./scripts/extract-guidance-samples.sh [個人事業主向けPDF] [法人向けPDF]
#
# 切り出しは 150dpi のページ(1754 x 1241 px)に対する3プリセットで表現する。
#   half-left  : x=0    W=877   -> 982 x 1200
#   half-right : x=877  W=877   -> 982 x 1200
#   full       : x=0    W=1754  -> 1200 x 733
# 高さは全プリセット共通で H=1071。
#
# 上端 y はデッキごとに違う。2冊はスライドマスタのレイアウトが異なり、
# 書類名(「◯◯証明書」＋「No.N」)の位置が約 55px ずれているため。
# 実測(150dpi のページ上の ink 行):
#   個人事業主向け: スライド見出し 125-150 / 書類名 196-219  -> y=170
#   法人向け      : スライド見出し  98-135 / 書類名 140-166  -> y=137
# いずれもスライド見出し「取得書類一覧サンプル」を落とし、書類名と No. を残す位置。
# 法人向けは見出しと書類名の間隔が 5px しかないので y の余地は 136-140 しかない。
#
# 出力は sips -z で実寸を明示指定する(-Z は端数を切り捨てるため full が 732 になり
# samples.ts の 733 とずれる)。
#
# 出力ファイル名は lib/portal/guidance/samples.ts の src と対応する。
# id を増減したり寸法を変えたら samples.ts の HALF / FULL も更新すること。

set -euo pipefail

SP_PDF="${1:-$HOME/Downloads/1．ご案内資料(個人事業主向け).pdf}"
CORP_PDF="${2:-$HOME/Downloads/1．ご案内資料(法人向け).pdf}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/public/guidance/samples"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SP_Y=170
CORP_Y=137
CROP_H=1071
CROP_Y="$SP_Y"

for pdf in "$SP_PDF" "$CORP_PDF"; do
  if [ ! -f "$pdf" ]; then
    echo "PDF が見つかりません: $pdf" >&2
    exit 1
  fi
done

if ! command -v pdftoppm >/dev/null 2>&1; then
  echo "pdftoppm が必要です。brew install poppler を実行してください。" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# extract <pdf> <page> <preset> <sampleId>   ※上端は $CROP_Y を使う
extract() {
  local pdf="$1" page="$2" preset="$3" id="$4"
  local x w ow oh
  case "$preset" in
    half-left)  x=0;   w=877;  ow=982;  oh=1200 ;;
    half-right) x=877; w=877;  ow=982;  oh=1200 ;;
    full)       x=0;   w=1754; ow=1200; oh=733  ;;
    *) echo "未知のプリセット: $preset" >&2; exit 1 ;;
  esac

  pdftoppm -f "$page" -l "$page" -r 150 \
    -x "$x" -y "$CROP_Y" -W "$w" -H "$CROP_H" \
    -png "$pdf" "$TMP_DIR/$id"

  local png
  png="$(find "$TMP_DIR" -maxdepth 1 -name "$id-*.png" | head -1)"
  if [ -z "$png" ]; then
    echo "切り出しに失敗しました: $id" >&2
    exit 1
  fi

  sips -s format jpeg -s formatOptions 70 -z "$oh" "$ow" "$png" --out "$OUT_DIR/$id.jpg" >/dev/null
  rm -f "$png"
  echo "  $id.jpg (${ow}x${oh})"
}

CROP_Y="$SP_Y"
echo "個人事業主向け (y=$CROP_Y):"
extract "$SP_PDF"    8  half-left  sp-residence-certificate
extract "$SP_PDF"    8  half-right sp-labor-insurance-certificate
extract "$SP_PDF"    9  half-left  sp-tax-certificate-3
extract "$SP_PDF"   10  full       sp-resident-tax-certificate
extract "$SP_PDF"   11  half-left  business-permit-food
extract "$SP_PDF"   11  half-right business-permit-lodging

CROP_Y="$CORP_Y"
echo "法人向け (y=$CROP_Y):"
extract "$CORP_PDF"  8  half-left  corp-registry
extract "$CORP_PDF"  8  half-right corp-residence-certificate
extract "$CORP_PDF"  9  full       corp-labor-insurance-certificate
extract "$CORP_PDF" 10  half-left  corp-tax-certificate-3
extract "$CORP_PDF" 10  half-right corp-tax-certificate-3-form
extract "$CORP_PDF" 11  half-left  social-insurance-inquiry
extract "$CORP_PDF" 11  half-right social-insurance-receipt
extract "$CORP_PDF" 12  full       corp-resident-tax-certificate

echo "完了: $OUT_DIR"
