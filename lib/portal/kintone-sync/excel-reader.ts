import ExcelJS from 'exceljs'
import type { CellReader } from './types'

/**
 * バッファ（xlsx バイナリ）から exceljs のワークブックを開く。
 * ArrayBuffer / Buffer / Uint8Array いずれも受け付ける。
 */
export async function openWorkbook(
  buffer: ArrayBuffer | Buffer | Uint8Array
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const nodeBuffer =
    buffer instanceof Buffer ? buffer : Buffer.from(buffer as ArrayBuffer)
  // exceljs の型は Buffer を受けるが、実体は Node Buffer で問題ない。
  await workbook.xlsx.load(nodeBuffer)
  return workbook
}

/**
 * exceljs のセル値を素の JS 値へ正規化する。
 * 数式は計算結果、ハイパーリンク/リッチテキストは表示テキストに変換する。
 */
function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    // リッチテキスト
    if (Array.isArray((obj as { richText?: unknown[] }).richText)) {
      return (obj as { richText: Array<{ text?: string }> }).richText
        .map((run) => run?.text ?? '')
        .join('')
    }
    // 数式（{ formula, result }）
    if ('result' in obj) {
      return (obj as { result?: unknown }).result ?? null
    }
    // ハイパーリンク（{ text, hyperlink }）
    if ('text' in obj) {
      return (obj as { text?: unknown }).text ?? null
    }
    return null
  }
  return value
}

/**
 * ワークシートに対して `(address) => value` を返す。
 * 結合セルは exceljs の master セルの値を参照する（結合範囲のどのアドレスでも同じ値になる）。
 */
export function sheetCellReader(ws: ExcelJS.Worksheet): CellReader {
  return (address: string) => {
    const cell = ws.getCell(address)
    // master は結合セルのマスターを返す（非結合なら自身）。
    const source = cell.master ?? cell
    return normalizeCellValue(source.value)
  }
}
