// セル値 → kintone 値の変換関数。空・未入力はすべて null（＝そのフィールドは書かない）。
//
// スカラ変換（asText/asNumber/asDate）に加え、CHECK_BOX / RADIO_BUTTON 用の
// 「選択肢文字列」ベースの変換ファクトリを提供する。選択肢文字列（例: '■' / '男' / '有'）は
// kintone のフィールド定義 JSON から取得し、各マッピング行が保持する。

import type { CellTransform } from './types'

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

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 日付として取り込み、'YYYY-MM-DD'（kintone DATE 形式）で返す。
 * - Date（例: Excel の =TODAY() 計算結果）は UTC 成分で整形（TZ ずれ防止）。
 * - 'YYYY-MM-DD' / 'YYYY/MM/DD'（時刻付き含む）はそのまま整形。
 * - それ以外は Date.parse を試み、失敗すれば null。
 */
export function asDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null
    }
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(
      value.getUTCDate()
    )}`
  }
  const text = String(value).trim()
  if (text === '') {
    return null
  }
  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (ymd) {
    return `${ymd[1]}-${pad2(Number(ymd[2]))}-${pad2(Number(ymd[3]))}`
  }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(
    parsed.getUTCDate()
  )}`
}

/**
 * 「チェックされている／値が存在する」とみなせるか。
 * - boolean はそのまま。number は 0 以外を true。
 * - 文字は空/『false/0/no/off/×/✕/✗/なし』を false、それ以外を true。
 * 賃金区分の CHECK_BOX を金額セルの有無から自動判定する用途にも使う（例: 月給金額あり→月給ON）。
 */
export function isCheckedPresence(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0
  }
  const text = String(value).trim()
  if (text === '') {
    return false
  }
  return !/^(false|0|no|off|×|✕|✗|なし)$/i.test(text)
}

/**
 * CHECK_BOX 用: セルが「ON（真偽 true / 値あり）」のとき onValues を、そうでなければ null。
 * onValues はそのフィールドの実選択肢文字列（例: ['■']）。
 */
export function checkboxOn(onValues: string[]): CellTransform {
  return (value) => (isCheckedPresence(value) ? [...onValues] : null)
}

/**
 * CHECK_BOX 用: 入力に関係なく常に ON（毎月チェック等の固定 True）。
 * onValues はそのフィールドの実選択肢文字列（例: ['■']）。
 */
export function checkboxAlways(onValues: string[]): CellTransform {
  return () => [...onValues]
}

/**
 * CHECK_BOX 用: Excel のテキスト（例: '男'/'女'、'有'/'無'）を該当選択肢に一致させ [選択肢] を返す。
 * options はそのフィールドの実選択肢文字列（例: ['女','男'] / ['無','有']）。一致なしは null。
 */
export function checkboxFromText(options: string[]): CellTransform {
  return (value) => {
    const text = asText(value)
    if (text === null) {
      return null
    }
    const matched = options.find((option) => option === text)
    return matched ? [matched] : null
  }
}

/**
 * RADIO_BUTTON 用: Excel のテキスト（例: '男'/'女'）を該当選択肢文字列そのものに変換する。
 * options はそのフィールドの実選択肢文字列（例: ['女','男']）。一致なしは null。
 */
export function radioFromText(options: string[]): CellTransform {
  return (value) => {
    const text = asText(value)
    if (text === null) {
      return null
    }
    const matched = options.find((option) => option === text)
    return matched ?? null
  }
}

/**
 * 「入力が expected と一致するときだけ out（既定は expected）を格納する」TEXT 変換。
 * 居住費控除_有（J2=IF(M3=0,"無","有")）で「有」のときだけマーカー文字を入れる用途。
 */
export function keepIfEquals(expected: string, out: string = expected): CellTransform {
  return (value) => (asText(value) === expected ? out : null)
}

/** 入力に関係なく常に固定文字を返す TEXT 変換（例: 4_f_控除額_備考='水道光熱費'）。 */
export function constantText(text: string): CellTransform {
  return () => text
}

/**
 * 年/月/日が別セルに分かれた日付を1つの 'YYYY-MM-DD' に合成する（合成フィールド用）。
 * kintone の年/月/日フィールドは日付から自動計算(CALC)のため、書けるのは日付フィールド1つだけ。
 * values は [年, 月, 日] の順（各セルの生値）。単位付き（例: '2026年'）は asNumber で吸収。
 * いずれかが空・数値化不能・範囲外なら null（部分的な日付は作らない）。
 */
export function combineYmdDate(values: unknown[]): string | null {
  // 年/月/日の単位が同一セルに紛れても吸収する（通常は単位ラベルが別セルで数値のみ）。
  const num = (v: unknown) =>
    asNumber(typeof v === 'string' ? v.replace(/[年月日]/g, '') : v)
  const y = num(values[0])
  const m = num(values[1])
  const d = num(values[2])
  if (y === null || m === null || d === null) {
    return null
  }
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) {
    return null
  }
  return `${y}-${pad2(m)}-${pad2(d)}`
}
