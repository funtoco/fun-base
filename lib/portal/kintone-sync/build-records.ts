import { asText } from './transforms'
import type {
  AppMapping,
  CellReader,
  KintoneFieldKind,
  KintoneRecordPayload,
  KintoneSubtableRow,
  SubtableMapping,
} from './types'

/**
 * 1フィールドを payload にマージする。
 * - CHECK_BOX: 複数のマッピング行から OR 合成（選択肢文字列を重複なく union）。
 *   例: 月給金額の有無（1-4:E13）と 1-6別紙:C5 の明示チェックが両方 ['■'] を出しても ['■'] のまま。
 * - それ以外（TEXT/NUMBER/DATE/RADIO）: 先勝ち（非null優先）。既に非nullが入っていれば上書きしない。
 *   例: 年間売上（はじめに:E18 優先、空なら 1-11-1:F20）、資料作成者（1-4 優先、再掲は無視）。
 */
function mergeField(
  record: KintoneRecordPayload,
  code: string,
  kind: KintoneFieldKind,
  value: string | number | string[]
): void {
  if (kind === 'CHECK_BOX') {
    const existing = record[code]?.value
    if (Array.isArray(existing)) {
      const union = new Set<string>([
        ...(existing as string[]),
        ...(value as string[]),
      ])
      record[code] = { value: Array.from(union) }
    } else {
      record[code] = { value: value as string[] }
    }
    return
  }
  // スカラは先勝ち（既に入っていれば上書きしない）。buildRecord は非nullのみ渡す。
  if (!(code in record)) {
    record[code] = { value: value as string | number }
  }
}

/**
 * SUBTABLE の行を Excel の rowStart..rowEnd から展開する。
 * keyCol（明細の主キー列）が空の行はスキップ。全列 null の行もスキップ。
 */
function buildSubtableRows(
  getCell: CellReader,
  subtable: SubtableMapping
): KintoneSubtableRow[] {
  const rows: KintoneSubtableRow[] = []
  for (let row = subtable.rowStart; row <= subtable.rowEnd; row++) {
    // keyCol が空なら明細行なしとみなしスキップ。
    const keyRaw = getCell(subtable.sheetName, `${subtable.keyCol}${row}`)
    if (asText(keyRaw) === null) {
      continue
    }
    const value: KintoneSubtableRow['value'] = {}
    for (const column of subtable.columns) {
      const raw = getCell(subtable.sheetName, `${column.col}${row}`)
      const converted = column.transform(raw)
      if (converted === null || Array.isArray(converted)) {
        continue
      }
      value[column.subCode] = { value: converted }
    }
    if (Object.keys(value).length > 0) {
      rows.push({ value })
    }
  }
  return rows
}

/**
 * アプリ別マッピング定義に従い、注入された getCell からセル値を読み、kintone レコード payload を組み立てる。
 * - 変換結果が null（空・未入力・非該当）のフィールドは payload に含めない（既存値を消さない）。
 * - CALC/対象外フィールドはそもそもマッピングに含めない（呼び出し側の mappings 参照）。
 * - CHECK_BOX は OR 合成、スカラは先勝ち（mergeField 参照）。
 * - SUBTABLE は空行スキップで展開し、1行以上あるときのみ payload に含める。
 *
 * getCell を注入式にしているため、テストは Excel ファイル無しで期待ペイロードを検証できる。
 */
export function buildRecord(
  getCell: CellReader,
  mapping: AppMapping
): KintoneRecordPayload {
  const record: KintoneRecordPayload = {}

  for (const field of mapping.fields) {
    const raw = getCell(field.sheetName, field.cell)
    const value = field.transform(raw)
    if (value === null) {
      continue
    }
    mergeField(record, field.code, field.kind, value)
  }

  // 合成フィールド（複数セル → 1フィールド。例: 年/月/日 → 日付）。
  for (const derived of mapping.derived ?? []) {
    const raws = derived.cells.map((c) => getCell(derived.sheetName, c))
    const value = derived.combine(raws)
    if (value === null) {
      continue
    }
    mergeField(record, derived.code, derived.kind, value)
  }

  for (const subtable of mapping.subtables ?? []) {
    const rows = buildSubtableRows(getCell, subtable)
    if (rows.length > 0) {
      record[subtable.code] = { value: rows }
    }
  }

  return record
}
