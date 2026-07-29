import type { CellReader, KintoneRecordPayload, SheetMapping } from './types'

/**
 * マッピング定義に従い、注入された getCell からセル値を読み、kintone レコード payload を組み立てる。
 * 変換結果が null（空・未入力）のフィールドは payload に含めない（kintone 側の既存値を消さない）。
 *
 * getCell を注入式にしているため、テストは Excel ファイル無しで期待ペイロードを検証できる。
 */
export function buildRecord(
  getCell: CellReader,
  mapping: SheetMapping
): KintoneRecordPayload {
  const record: KintoneRecordPayload = {}
  for (const field of mapping.fields) {
    const raw = getCell(field.cell)
    const value = field.transform(raw)
    if (value === null) {
      continue
    }
    record[field.code] = { value }
  }
  return record
}
