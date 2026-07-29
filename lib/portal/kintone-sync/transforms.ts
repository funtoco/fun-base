// セル値 → kintone 値の変換関数。空・未入力はすべて null（＝そのフィールドは書かない）。

/**
 * 文字列として取り込む。前後空白を除去し、空文字なら null。
 * 法人番号のように先頭0を保持したい値に使う（数値化しない）。
 */
export function asText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value).trim()
  return text === '' ? null : text
}

/**
 * 数値として取り込む。カンマ・空白・通貨記号（¥/￥/円）・単位（人）を除去して parse する。
 * 空文字や数値化できない値は null。
 */
export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  // カンマ・空白・全角/半角スペース・通貨記号・単位を除去
  const cleaned = String(value)
    .replace(/[,\s　¥￥円人]/g, '')
    .trim()
  if (cleaned === '') {
    return null
  }
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}
