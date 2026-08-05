import { describe, it, expect } from 'vitest'
import path from 'node:path'
import ExcelJS from 'exceljs'
import {
  MAX_TEMPLATE_OFFICES,
  OFFICE_NAME_CELLS,
  TEMPLATE_SHEET_NAME,
  fillOfficeNames,
} from '@/lib/portal/workbook-template'

/** 「はじめに」シートだけを持つ最小ワークブック。 */
function blankWorkbook(sheetName = TEMPLATE_SHEET_NAME): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet(sheetName)
  return workbook
}

/** セルの表示テキスト（リッチテキストは各断片を連結する）。 */
function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value && typeof value === 'object' && 'richText' in value) {
    return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join('')
  }
  return value === null || value === undefined ? '' : String(value)
}

function cellValues(workbook: ExcelJS.Workbook): (string | null)[] {
  const sheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME)!
  return OFFICE_NAME_CELLS.map((address) => {
    const value = sheet.getCell(address).value
    return value === null || value === undefined ? null : String(value)
  })
}

describe('fillOfficeNames', () => {
  it('事業所0件なら何も書かず overflow も無い', () => {
    const workbook = blankWorkbook()
    const result = fillOfficeNames(workbook, [])
    expect(result).toEqual({ written: 0, overflow: [] })
    expect(cellValues(workbook)).toEqual([null, null, null, null, null])
  })

  it('3件を C29 から順に書き込み、残りの欄は触らない', () => {
    const workbook = blankWorkbook()
    const result = fillOfficeNames(workbook, ['慈誠会前野病院', 'メロディハウス', '近江舞子しょうぶ苑'])
    expect(result).toEqual({ written: 3, overflow: [] })
    expect(cellValues(workbook)).toEqual([
      '慈誠会前野病院',
      'メロディハウス',
      '近江舞子しょうぶ苑',
      null,
      null,
    ])
  })

  it('上限ちょうど5件はすべて書き込む', () => {
    const workbook = blankWorkbook()
    const names = ['A事業所', 'B事業所', 'C事業所', 'D事業所', 'E事業所']
    const result = fillOfficeNames(workbook, names)
    expect(result).toEqual({ written: MAX_TEMPLATE_OFFICES, overflow: [] })
    expect(cellValues(workbook)).toEqual(names)
  })

  it('6件以上は先頭5件のみ書き、残りを overflow に返す', () => {
    const workbook = blankWorkbook()
    const result = fillOfficeNames(workbook, [
      'A事業所',
      'B事業所',
      'C事業所',
      'D事業所',
      'E事業所',
      'F事業所',
      'G事業所',
    ])
    expect(result).toEqual({ written: 5, overflow: ['F事業所', 'G事業所'] })
    expect(cellValues(workbook)[4]).toBe('E事業所')
  })

  it('空文字・空白のみの名前は欄を消費せずスキップし、前後の空白は落とす', () => {
    const workbook = blankWorkbook()
    const result = fillOfficeNames(workbook, ['', '  ', ' 慈誠会前野病院 ', 'メロディハウス'])
    expect(result).toEqual({ written: 2, overflow: [] })
    expect(cellValues(workbook)).toEqual([
      '慈誠会前野病院',
      'メロディハウス',
      null,
      null,
      null,
    ])
  })

  it('既に値がある欄は上書きする', () => {
    const workbook = blankWorkbook()
    workbook.getWorksheet(TEMPLATE_SHEET_NAME)!.getCell(OFFICE_NAME_CELLS[0]).value = '古い事業所'
    fillOfficeNames(workbook, ['新しい事業所'])
    expect(cellValues(workbook)[0]).toBe('新しい事業所')
  })

  it('対象シートが無ければ例外（テンプレ差し替えミスの早期検知）', () => {
    const workbook = blankWorkbook('別のシート')
    expect(() => fillOfficeNames(workbook, ['A事業所'])).toThrow(/はじめに/)
  })
})

describe('同梱テンプレの実ファイル', () => {
  const templatePath = path.join(
    process.cwd(),
    'lib/portal/templates/application-workbook.xlsx'
  )

  async function loadTemplate(): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(templatePath)
    return workbook
  }

  it('「はじめに」シートに Ⅲ.事業所情報 の見出しと5行の記入欄がある', async () => {
    const workbook = await loadTemplate()
    const sheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME)
    expect(sheet).toBeDefined()
    expect(String(sheet!.getCell('C27').value)).toContain('事業所情報')
    expect(String(sheet!.getCell('C28').value)).toBe('事業所名')
    // ①〜⑤ の行ラベル（リッチテキストのことがあるのでテキストを取り出して比較する）
    expect(OFFICE_NAME_CELLS).toHaveLength(5)
    expect(cellText(sheet!.getCell('B29'))).toBe('①')
    expect(cellText(sheet!.getCell('B33'))).toBe('⑤')
  })

  it('協力確認書セクション(B41:B45)は事業所名欄を参照する数式なので追従する', async () => {
    const workbook = await loadTemplate()
    const sheet = workbook.getWorksheet(TEMPLATE_SHEET_NAME)!
    const formulas = ['B41', 'B42', 'B43', 'B44', 'B45'].map(
      (address) => (sheet.getCell(address).value as { formula?: string })?.formula
    )
    expect(formulas).toEqual(['C29', 'C30', 'C31', 'C32', 'C33'])
  })

  it('事業所名を書き込んで保存・再読込しても値が残る', async () => {
    const workbook = await loadTemplate()
    const result = fillOfficeNames(workbook, ['慈誠会前野病院', 'メロディハウス'])
    expect(result.written).toBe(2)

    const buffer = await workbook.xlsx.writeBuffer()
    const reloaded = new ExcelJS.Workbook()
    await reloaded.xlsx.load(buffer as ArrayBuffer)
    const sheet = reloaded.getWorksheet(TEMPLATE_SHEET_NAME)!
    expect(sheet.getCell('C29').value).toBe('慈誠会前野病院')
    expect(sheet.getCell('C30').value).toBe('メロディハウス')
  })

  it('企業に渡す前提の DATA シートは非表示のまま', async () => {
    const workbook = await loadTemplate()
    expect(workbook.getWorksheet('DATA')?.state).toBe('hidden')
  })
})
