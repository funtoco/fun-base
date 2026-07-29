import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { asNumber, asText } from '@/lib/portal/kintone-sync/transforms'
import { buildRecord } from '@/lib/portal/kintone-sync/build-records'
import { HAJIMENI_APP34 } from '@/lib/portal/kintone-sync/mappings/hajimeni'
import { transcribeHajimeni } from '@/lib/portal/kintone-sync/transcribe'
import type {
  KintoneReadRecord,
  KintoneWriteClient,
} from '@/lib/portal/kintone-sync/kintone-write-client'
import type { CellReader } from '@/lib/portal/kintone-sync/types'

// ── transforms ─────────────────────────────────────────────────────────
describe('transforms', () => {
  it('asNumber: カンマ・通貨記号・単位を除去して数値化', () => {
    expect(asNumber('10,000,000円')).toBe(10000000)
    expect(asNumber('50,000,000')).toBe(50000000)
    expect(asNumber('30人')).toBe(30)
    expect(asNumber('¥1,234')).toBe(1234)
    expect(asNumber(42)).toBe(42)
  })

  it('asNumber: 空・数値化不能は null', () => {
    expect(asNumber('')).toBeNull()
    expect(asNumber('   ')).toBeNull()
    expect(asNumber(null)).toBeNull()
    expect(asNumber(undefined)).toBeNull()
    expect(asNumber('abc')).toBeNull()
  })

  it('asText: trim して返す。空は null', () => {
    expect(asText(' x ')).toBe('x')
    expect(asText('1180001012345')).toBe('1180001012345')
    expect(asText('')).toBeNull()
    expect(asText('   ')).toBeNull()
    expect(asText(null)).toBeNull()
    expect(asText(undefined)).toBeNull()
  })
})

// ── buildRecord ────────────────────────────────────────────────────────
describe('buildRecord (はじめに → app34)', () => {
  it('注入した getCell から期待どおりのペイロードを作る', () => {
    const cells: Record<string, unknown> = {
      E14: '1180001012345',
      E15: '10,000,000円',
      E18: '50,000,000',
      E19: '30人',
    }
    const getCell: CellReader = (addr) => cells[addr]
    const record = buildRecord(getCell, HAJIMENI_APP34)
    expect(record).toEqual({
      法人番号_13桁_: { value: '1180001012345' },
      数値_1: { value: 10000000 },
      年間売上金額_直近年度_: { value: 50000000 },
      数値_0: { value: 30 },
    })
  })

  it('空セルはキー自体が出ない', () => {
    const cells: Record<string, unknown> = {
      E14: '1180001012345',
      E15: '',
      E18: '   ',
      E19: undefined,
    }
    const getCell: CellReader = (addr) => cells[addr]
    const record = buildRecord(getCell, HAJIMENI_APP34)
    expect(record).toEqual({ 法人番号_13桁_: { value: '1180001012345' } })
    expect('数値_1' in record).toBe(false)
    expect('年間売上金額_直近年度_' in record).toBe(false)
    expect('数値_0' in record).toBe(false)
  })
})

// ── transcribeHajimeni（モッククライアントで upsert 判定）───────────────
async function makeWorkbookBuffer(
  cells: Record<string, unknown>,
  sheetName = 'はじめに'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet(sheetName)
  for (const [addr, value] of Object.entries(cells)) {
    ws.getCell(addr).value = value as ExcelJS.CellValue
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}

const HAJIMENI_CELLS = {
  E14: '1180001012345',
  E15: '10,000,000円',
  E18: '50,000,000',
  E19: '30人',
}

const EXPECTED_RECORD = {
  法人番号_13桁_: { value: '1180001012345' },
  数値_1: { value: 10000000 },
  年間売上金額_直近年度_: { value: 50000000 },
  数値_0: { value: 30 },
}

function readRecord(id: string): KintoneReadRecord {
  return { $id: { value: id }, 法人番号_13桁_: { value: '1180001012345' } }
}

function makeMockClient(overrides: Partial<KintoneWriteClient> = {}): KintoneWriteClient {
  return {
    getRecords: vi.fn().mockResolvedValue([]),
    createRecord: vi.fn().mockResolvedValue({ id: '999', revision: '1' }),
    updateRecord: vi.fn().mockResolvedValue({ revision: '2' }),
    ...overrides,
  }
}

describe('transcribeHajimeni', () => {
  it('既存1件あり（dryRun=false）→ update を呼び action=update・recordId', async () => {
    const buffer = await makeWorkbookBuffer(HAJIMENI_CELLS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42')]),
    })
    const result = await transcribeHajimeni({ buffer, dryRun: false, client })

    expect(result.plan.action).toBe('update')
    expect(result.plan.recordId).toBe('42')
    expect(result.plan.record).toEqual(EXPECTED_RECORD)
    expect(client.updateRecord).toHaveBeenCalledWith('34', '42', EXPECTED_RECORD)
    expect(client.createRecord).not.toHaveBeenCalled()
  })

  it('既存なし（dryRun=false）→ create を呼び action=create・新規recordId', async () => {
    const buffer = await makeWorkbookBuffer(HAJIMENI_CELLS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([]),
      createRecord: vi.fn().mockResolvedValue({ id: '777', revision: '1' }),
    })
    const result = await transcribeHajimeni({ buffer, dryRun: false, client })

    expect(result.plan.action).toBe('create')
    expect(result.plan.recordId).toBe('777')
    expect(client.createRecord).toHaveBeenCalledWith('34', EXPECTED_RECORD)
    expect(client.updateRecord).not.toHaveBeenCalled()
  })

  it('dryRun=true → 書込メソッドは呼ばれず plan を返す', async () => {
    const buffer = await makeWorkbookBuffer(HAJIMENI_CELLS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42')]),
    })
    const result = await transcribeHajimeni({ buffer, dryRun: true, client })

    expect(result.plan.action).toBe('dry-run')
    expect(result.plan.record).toEqual(EXPECTED_RECORD)
    expect(result.plan.keyValue).toBe('1180001012345')
    // dryRun は既存プレビューのため getRecords は呼ぶが、書込は一切しない
    expect(client.createRecord).not.toHaveBeenCalled()
    expect(client.updateRecord).not.toHaveBeenCalled()
  })

  it('client 未指定でも dryRun として plan を返す（書込なし）', async () => {
    const buffer = await makeWorkbookBuffer(HAJIMENI_CELLS)
    const result = await transcribeHajimeni({ buffer })
    expect(result.plan.action).toBe('dry-run')
    expect(result.plan.record).toEqual(EXPECTED_RECORD)
  })

  it('複数ヒット → エラー（重複のため中止）', async () => {
    const buffer = await makeWorkbookBuffer(HAJIMENI_CELLS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42'), readRecord('43')]),
    })
    await expect(
      transcribeHajimeni({ buffer, dryRun: false, client })
    ).rejects.toThrow(/複数/)
    expect(client.updateRecord).not.toHaveBeenCalled()
    expect(client.createRecord).not.toHaveBeenCalled()
  })

  it('はじめに シートが無い → エラー', async () => {
    const buffer = await makeWorkbookBuffer({ E14: 'x' }, 'その他')
    await expect(transcribeHajimeni({ buffer })).rejects.toThrow(/はじめに/)
  })
})
