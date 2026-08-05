import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import {
  asDate,
  asNumber,
  asText,
  checkboxAlways,
  checkboxFromText,
  checkboxOn,
  combineYmdDate,
  constantText,
  keepIfEquals,
  radioFromText,
} from '@/lib/portal/kintone-sync/transforms'
import { buildRecord } from '@/lib/portal/kintone-sync/build-records'
import { APP34_MAPPING } from '@/lib/portal/kintone-sync/mappings/app34'
import { APP55_MAPPING } from '@/lib/portal/kintone-sync/mappings/app55'
import {
  transcribeWorkbook,
  buildApp55Record,
  syncStatusLabelForAction,
  APP55_PERSON_SPECIFIC_CODES,
} from '@/lib/portal/kintone-sync/transcribe'
import {
  CASE_HUB_APP_ID,
  loadCaseHubLinks,
  writeBackSyncStatus,
} from '@/lib/portal/kintone-sync/case-hub'
import { buildKoyouRowStatuses } from '@/lib/portal/kintone-sync/run-transcription'
import type {
  KintoneReadRecord,
  KintoneWriteClient,
} from '@/lib/portal/kintone-sync/kintone-write-client'
import type { AppMapping, CellReader } from '@/lib/portal/kintone-sync/types'

// (sheet, addr) → value を注入するためのヘルパ。cells[sheet][addr] を引く。
function cellsReader(cells: Record<string, Record<string, unknown>>): CellReader {
  return (sheet, addr) => cells[sheet]?.[addr]
}

// ── transforms（スカラ）────────────────────────────────────────────────
describe('transforms: asNumber / asText / asDate', () => {
  it('asNumber: カンマ・通貨記号・単位を除去して数値化', () => {
    expect(asNumber('10,000,000円')).toBe(10000000)
    expect(asNumber('30人')).toBe(30)
    expect(asNumber('¥1,234')).toBe(1234)
    expect(asNumber(42)).toBe(42)
  })

  it('asNumber: 空・数値化不能は null', () => {
    expect(asNumber('')).toBeNull()
    expect(asNumber(null)).toBeNull()
    expect(asNumber('abc')).toBeNull()
  })

  it('asText: trim して返す。空は null', () => {
    expect(asText(' x ')).toBe('x')
    expect(asText('1180001012345')).toBe('1180001012345')
    expect(asText('')).toBeNull()
    expect(asText(null)).toBeNull()
  })

  it('asDate: Date→YYYY-MM-DD（UTC成分）、文字列も正規化、空は null', () => {
    expect(asDate(new Date(Date.UTC(2026, 6, 29)))).toBe('2026-07-29')
    expect(asDate('2026-07-29')).toBe('2026-07-29')
    expect(asDate('2026/7/9')).toBe('2026-07-09')
    expect(asDate('')).toBeNull()
    expect(asDate(null)).toBeNull()
    expect(asDate('not a date')).toBeNull()
  })
})

// ── transforms（CHECK_BOX / RADIO / 有無 / 固定）────────────────────────
describe('transforms: checkbox / radio / 有無 / 固定', () => {
  it('checkboxOn: 真偽true・値ありで onValues、false/空/0で null', () => {
    const t = checkboxOn(['■'])
    expect(t(true)).toEqual(['■'])
    expect(t(200000)).toEqual(['■']) // 金額ありで自動ON
    expect(t('あり')).toEqual(['■'])
    expect(t(false)).toBeNull()
    expect(t(0)).toBeNull()
    expect(t('')).toBeNull()
    expect(t(null)).toBeNull()
  })

  it('checkboxAlways: 入力に関係なく常に ON（毎月チェック等の固定True）', () => {
    const t = checkboxAlways(['■'])
    expect(t(null)).toEqual(['■'])
    expect(t(false)).toEqual(['■'])
    expect(t(undefined)).toEqual(['■'])
  })

  it('radioFromText: 「男」「女」→選択肢文字列そのもの、一致なしは null', () => {
    const t = radioFromText(['女', '男'])
    expect(t('男')).toBe('男')
    expect(t('女')).toBe('女')
    expect(t('その他')).toBeNull()
    expect(t('')).toBeNull()
  })

  it('checkboxFromText: 「有」「無」→[選択肢]、「男」「女」→[選択肢]', () => {
    const umu = checkboxFromText(['無', '有'])
    expect(umu('有')).toEqual(['有'])
    expect(umu('無')).toEqual(['無'])
    expect(umu('？')).toBeNull()
    const sex = checkboxFromText(['女', '男'])
    expect(sex('男')).toEqual(['男'])
  })

  it('keepIfEquals: 一致時のみ出力、それ以外 null', () => {
    const t = keepIfEquals('有')
    expect(t('有')).toBe('有')
    expect(t('無')).toBeNull()
    expect(t(null)).toBeNull()
  })

  it('constantText: 入力に関係なく固定文字', () => {
    const t = constantText('水道光熱費')
    expect(t(null)).toBe('水道光熱費')
    expect(t('anything')).toBe('水道光熱費')
  })

  it('combineYmdDate: 年/月/日3セル→YYYY-MM-DD、単位付き吸収、欠け/範囲外はnull', () => {
    expect(combineYmdDate([2026, 8, 4])).toBe('2026-08-04')
    expect(combineYmdDate(['2026年', '12月', '31日'])).toBe('2026-12-31')
    expect(combineYmdDate([2026, '', 4])).toBeNull() // 月が空
    expect(combineYmdDate([2026, 13, 4])).toBeNull() // 月が範囲外
    expect(combineYmdDate([1800, 1, 1])).toBeNull() // 年が範囲外
    expect(combineYmdDate([2026, 8])).toBeNull() // 日が無い
  })
})

// ── buildRecord: derived（複数セル合成）───────────────────────────────
describe('buildRecord: derived（年/月/日→日付）', () => {
  const mapping: AppMapping = {
    appId: 'X',
    fields: [],
    derived: [
      { sheetName: '1-6', cells: ['B17', 'E17', 'G17'], code: '_1_1_1_契約期間開始日', kind: 'DATE', combine: combineYmdDate },
    ],
  }

  it('3セルが揃えば日付を合成、いずれか空なら出さない', () => {
    const filled = buildRecord(cellsReader({ '1-6': { B17: 2026, E17: 8, G17: 4 } }), mapping)
    expect(filled._1_1_1_契約期間開始日).toEqual({ value: '2026-08-04' })

    const partial = buildRecord(cellsReader({ '1-6': { B17: 2026, E17: 8 } }), mapping)
    expect('_1_1_1_契約期間開始日' in partial).toBe(false)
  })
})

// ── buildRecord: 汎用挙動（マージ・固定True・CALCスキップ・subtable）──────
describe('buildRecord: マージ / 固定True / CALCスキップ', () => {
  it('CHECK_BOX は複数ソースを OR 合成し、スカラは先勝ち（非null優先）', () => {
    const mapping: AppMapping = {
      appId: 'X',
      fields: [
        // 同一 CHECK_BOX を2ソースからON（union で ['■'] のまま）
        { sheetName: 'A', cell: 'C5', code: 'chk', kind: 'CHECK_BOX', transform: checkboxOn(['■']) },
        { sheetName: 'B', cell: 'E13', code: 'chk', kind: 'CHECK_BOX', transform: checkboxOn(['■']) },
        // スカラ先勝ち: 先に非nullが入れば後続は無視
        { sheetName: 'A', cell: 'E18', code: 'amount', kind: 'NUMBER', transform: asNumber },
        { sheetName: 'B', cell: 'F20', code: 'amount', kind: 'NUMBER', transform: asNumber },
      ],
    }
    const getCell = cellsReader({
      A: { C5: true, E18: 500 },
      B: { E13: 200000, F20: 999 },
    })
    const record = buildRecord(getCell, mapping)
    expect(record.chk).toEqual({ value: ['■'] })
    expect(record.amount).toEqual({ value: 500 }) // A:E18 が先勝ち
  })

  it('先ソースが空なら後ソースが採用される（年間売上フォールバック相当）', () => {
    const mapping: AppMapping = {
      appId: 'X',
      fields: [
        { sheetName: 'A', cell: 'E18', code: 'amount', kind: 'NUMBER', transform: asNumber },
        { sheetName: 'B', cell: 'F20', code: 'amount', kind: 'NUMBER', transform: asNumber },
      ],
    }
    const record = buildRecord(cellsReader({ A: { E18: '' }, B: { F20: 999 } }), mapping)
    expect(record.amount).toEqual({ value: 999 })
  })

  it('固定True CHECK_BOX はセルが空でも ON、CALC等（マッピング未登録）は出ない', () => {
    const mapping: AppMapping = {
      appId: 'X',
      fields: [
        { sheetName: 'A', cell: 'H99', code: 'maitsuki', kind: 'CHECK_BOX', transform: checkboxAlways(['■']) },
        // CALC フィールドはそもそもマッピングに含めない → payload に出ない（何も追加しないことで表現）
      ],
    }
    const record = buildRecord(cellsReader({ A: {} }), mapping)
    expect(record.maitsuki).toEqual({ value: ['■'] })
    expect('_3_支払概算額' in record).toBe(false)
  })
})

describe('buildRecord: SUBTABLE 展開', () => {
  const stMapping: AppMapping = {
    appId: 'X',
    fields: [],
    subtables: [
      {
        code: '手当詳細',
        sheetName: '1-6別紙',
        rowStart: 9,
        rowEnd: 16,
        keyCol: 'D',
        columns: [
          { subCode: '手当名', col: 'D', kind: 'TEXT', transform: asText },
          { subCode: '手当_金額', col: 'K', kind: 'NUMBER', transform: asNumber },
          { subCode: '手当_計算方法', col: 'S', kind: 'TEXT', transform: asText },
        ],
      },
    ],
  }

  it('手当名が空の行はスキップし、入力のある行だけ展開する', () => {
    const getCell = cellsReader({
      '1-6別紙': {
        D9: '通勤手当', K9: '10,000円', S9: '実費',
        // 行10は空（スキップ対象）
        D11: '住宅手当', K11: 20000, S11: '固定',
      },
    })
    const record = buildRecord(getCell, stMapping)
    expect(record.手当詳細).toEqual({
      value: [
        { value: { 手当名: { value: '通勤手当' }, 手当_金額: { value: 10000 }, 手当_計算方法: { value: '実費' } } },
        { value: { 手当名: { value: '住宅手当' }, 手当_金額: { value: 20000 }, 手当_計算方法: { value: '固定' } } },
      ],
    })
  })

  it('全行空なら SUBTABLE キー自体が出ない', () => {
    const record = buildRecord(cellsReader({ '1-6別紙': {} }), stMapping)
    expect('手当詳細' in record).toBe(false)
  })
})

// ── app34: 確定版マッピングの代表行 ────────────────────────────────────
describe('APP34_MAPPING: 代表行が期待 payload になる', () => {
  it('はじめに＋1-11-1 から法人番号/売上/離職/CHECK_BOXを組む', () => {
    const getCell = cellsReader({
      'はじめに': { E14: '1180001012345', E15: '10,000,000円', E18: '50,000,000', E19: '30人' },
      '1-11-1': {
        K32: '1', P32: '0', K33: '2', P33: '0',
        F20: '99,999', // はじめに:E18 が優先されるため無視される
        Q34: true, Q35: false, Q36: false, Q37: true,
      },
    })
    const record = buildRecord(getCell, APP34_MAPPING)
    expect(record.法人番号_13桁_).toEqual({ value: '1180001012345' })
    expect(record.数値_1).toEqual({ value: 10000000 })
    expect(record.年間売上金額_直近年度_).toEqual({ value: 50000000 }) // E18 先勝ち
    expect(record.数値_0).toEqual({ value: 30 })
    expect(record.日本人_自発的離職者).toEqual({ value: '1' })
    expect(record.技能_該当あり).toEqual({ value: ['■'] })
    expect(record.実習_該当なし).toEqual({ value: ['■'] })
    // OFF のチェックボックスはキー自体が出ない
    expect('技能_該当なし' in record).toBe(false)
    expect('実習_該当あり' in record).toBe(false)
  })

  it('はじめに:E18 が空なら 1-11-1:F20 が売上に採用される', () => {
    const getCell = cellsReader({
      'はじめに': { E14: '1180001012345', E18: '' },
      '1-11-1': { F20: '77,777' },
    })
    const record = buildRecord(getCell, APP34_MAPPING)
    expect(record.年間売上金額_直近年度_).toEqual({ value: 77777 })
  })
})

// ── app55: 確定版マッピングの代表行 ────────────────────────────────────
describe('APP55_MAPPING: 代表行が期待 payload になる', () => {
  it('賃金区分の自動判定・性別RADIO・(b)厚生年金一本化・DATE・固定備考・subtable', () => {
    const getCell = cellsReader({
      '居住費の詳細': { M3: 25000, H4: '借上物件', H5: '按分計算', H7: 3, J2: '有' },
      '1-4': {
        D10: 'グエン', H12: '男', K12: 2,
        E13: 200000, // 月給金額あり → 月給 CHECK_BOX 自動ON
        E74: new Date(Date.UTC(2026, 6, 29)),
        E75: '株式会社Funtoco', E77: '代表取締役', I77: '山田太郎',
      },
      '1-6別紙': {
        S22: 30000, // (b)社会保険料 → 厚生年金保険料へ
        C26: '(f) その他 （水道光熱費）',
        D9: '通勤手当', K9: 10000, S9: '実費',
        D27: '(g)組合費', S27: 1000,
      },
      '1-6': {
        H99: false, // 締切「毎月」は固定Trueなのでセルに関係なくON
        E103: true, // 昇給有
      },
      '【介護分野】事業所概要1': { A19: '特記事項テスト' },
    })
    const record = buildRecord(getCell, APP55_MAPPING)

    // 賃金区分: 金額の有無で 月給 CHECK_BOX を自動ON
    expect(record.月給金額).toEqual({ value: 200000 })
    expect(record.月給).toEqual({ value: ['■'] })
    // 性別は RADIO_BUTTON（選択肢文字列そのもの）
    expect(record.性別).toEqual({ value: '男' })
    // (b)社会保険料は 厚生年金保険料 に一本化し、健康保険料は設定しない
    expect(record.厚生年金保険料).toEqual({ value: 30000 })
    expect('健康保険料' in record).toBe(false)
    // 宿泊施設 CHECK_BOX（テキスト一致）
    expect(record.提供する宿泊施設の具体的な内容).toEqual({ value: ['借上物件'] })
    // 居住費控除_有 は「有」でマーカー
    expect(record.居住費控除_有).toEqual({ value: '有' })
    // DATE
    expect(record.書類に反映する_作成日_署名日).toEqual({ value: '2026-07-29' })
    // 固定備考
    expect(record._4_f_控除額_備考).toEqual({ value: '水道光熱費' })
    // 締切「毎月」は固定True
    expect(record._1賃金締切日_毎月).toEqual({ value: ['■'] })
    // 昇給有 ON
    expect(record._7_8_1_昇給有).toEqual({ value: ['■'] })
    // その他特記事項（app36→app55振替）
    expect(record._2その他特記事項).toEqual({ value: '特記事項テスト' })

    // SUBTABLE
    expect(record.手当詳細).toEqual({
      value: [
        { value: { 手当名: { value: '通勤手当' }, 手当_金額: { value: 10000 }, 手当_計算方法: { value: '実費' } } },
      ],
    })
    expect(record.その他の控除の明細).toEqual({
      value: [{ value: { その他控除項目: { value: '(g)組合費' }, その他の控除額: { value: 1000 } } }],
    })

    // CALC はマッピングに無いので出ない
    expect('申請人_年齢' in record).toBe(false)
    expect('_3_支払概算額' in record).toBe(false)
  })

  it('1-4:E13 が空でも 1-6別紙:C5 の明示チェックで 月給 CHECK_BOX が ON', () => {
    const getCell = cellsReader({
      '1-4': {},
      '1-6別紙': { C5: true, F5: 180000 },
    })
    const record = buildRecord(getCell, APP55_MAPPING)
    expect(record.月給).toEqual({ value: ['■'] })
    expect(record.月給金額).toEqual({ value: 180000 })
  })
})

// ── transcribeWorkbook（モッククライアントで upsert 判定・書込未呼出）──────
async function makeWorkbookBuffer(
  sheets: Record<string, Record<string, unknown>>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const [sheetName, cells] of Object.entries(sheets)) {
    const ws = workbook.addWorksheet(sheetName)
    for (const [addr, value] of Object.entries(cells)) {
      ws.getCell(addr).value = value as ExcelJS.CellValue
    }
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer as ArrayBuffer)
}

const APP34_SHEETS = {
  'はじめに': { E14: '1180001012345', E15: '10,000,000円', E18: '50,000,000', E19: '30人' },
}

function readRecord(id: string): KintoneReadRecord {
  return { $id: { value: id }, 法人番号_13桁_: { value: '1180001012345' } }
}

function makeMockClient(overrides: Partial<KintoneWriteClient> = {}): KintoneWriteClient {
  return {
    getRecords: vi.fn().mockResolvedValue([]),
    createRecord: vi.fn().mockResolvedValue({ id: '999', revision: '1' }),
    updateRecord: vi.fn().mockResolvedValue({ revision: '2' }),
    updateRecordStatus: vi.fn().mockResolvedValue({ revision: '3' }),
    getRecordComments: vi.fn().mockResolvedValue([]),
    postRecordComment: vi.fn().mockResolvedValue({ id: '1' }),
    ...overrides,
  }
}

describe('transcribeWorkbook', () => {
  it('app34 既存1件あり（dryRun=false）→ update・app55 は payload のみ返す（書込なし）', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42')]),
    })
    const result = await transcribeWorkbook({ buffer, dryRun: false, client })

    expect(result.app34.plan.action).toBe('update')
    expect(result.app34.plan.recordId).toBe('42')
    expect(client.updateRecord).toHaveBeenCalledWith(
      '34',
      '42',
      expect.objectContaining({ 法人番号_13桁_: { value: '1180001012345' } })
    )
    // app55 は payload のみ（fan-out は run-transcription 側）。app34 の1回だけ書込。
    expect(result.app55Record).toBeTypeOf('object')
    expect(result.app55Sheet).toBe('1-4')
    expect(client.updateRecord).toHaveBeenCalledTimes(1)
  })

  it('app34 既存なし（dryRun=false）→ create、app55 は書込未呼出', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([]),
      createRecord: vi.fn().mockResolvedValue({ id: '777', revision: '1' }),
    })
    const result = await transcribeWorkbook({ buffer, dryRun: false, client })

    expect(result.app34.plan.action).toBe('create')
    expect(result.app34.plan.recordId).toBe('777')
    expect(client.createRecord).toHaveBeenCalledTimes(1) // app34 のみ、app55 は呼ばない
  })

  it('dryRun=true → 書込メソッドは一切呼ばれず app34 plan と app55 payload を返す', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42')]),
    })
    const result = await transcribeWorkbook({ buffer, dryRun: true, client })

    expect(result.app34.plan.action).toBe('dry-run')
    expect(result.app34.plan.keyValue).toBe('1180001012345')
    expect(result.app55Record).toBeTypeOf('object')
    expect(client.createRecord).not.toHaveBeenCalled()
    expect(client.updateRecord).not.toHaveBeenCalled()
  })

  it('client 未指定でも dryRun として app34 plan と app55 payload を返す（書込なし）', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const result = await transcribeWorkbook({ buffer })
    expect(result.app34.plan.action).toBe('dry-run')
    expect(result.app55Record).toBeTypeOf('object')
  })

  it('app34 複数ヒット（dryRun=false）→ エラー（重複のため中止・書込なし）', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const client = makeMockClient({
      getRecords: vi.fn().mockResolvedValue([readRecord('42'), readRecord('43')]),
    })
    await expect(
      transcribeWorkbook({ buffer, dryRun: false, client })
    ).rejects.toThrow(/複数/)
    expect(client.updateRecord).not.toHaveBeenCalled()
    expect(client.createRecord).not.toHaveBeenCalled()
  })

  it('はじめに シートが無い → エラー', async () => {
    const buffer = await makeWorkbookBuffer({ 'その他': { A1: 'x' } })
    await expect(transcribeWorkbook({ buffer })).rejects.toThrow(/はじめに/)
  })
})

// ── Aモデル: 事前紐付け（targets）による直接update ──────────────────────
describe('transcribeWorkbook: targets（app296 事前紐付け・Aモデル）', () => {
  it('app34RecordId 指定（dryRun=false）→ 法人番号照合せず紐付けIDへ直接update', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const getRecords = vi.fn().mockResolvedValue([]) // 照合が呼ばれないことの確認用
    const client = makeMockClient({ getRecords })
    const result = await transcribeWorkbook({
      buffer,
      dryRun: false,
      client,
      targets: { app34RecordId: '100' },
    })
    expect(result.app34.plan.action).toBe('update')
    expect(result.app34.plan.recordId).toBe('100')
    expect(client.updateRecord).toHaveBeenCalledWith('34', '100', expect.any(Object))
    // 法人番号照合(getRecords)は呼ばれない（照合レス）
    expect(getRecords).not.toHaveBeenCalled()
  })

  it('targets 指定でも dryRun=true → 書込なし・recordId はプレビュー表示', async () => {
    const buffer = await makeWorkbookBuffer(APP34_SHEETS)
    const client = makeMockClient()
    const result = await transcribeWorkbook({
      buffer,
      dryRun: true,
      client,
      targets: { app34RecordId: '100' },
    })
    expect(result.app34.plan.action).toBe('dry-run')
    expect(result.app34.plan.recordId).toBe('100')
    expect(client.updateRecord).not.toHaveBeenCalled()
    expect(client.createRecord).not.toHaveBeenCalled()
  })
})

// ── buildApp55Record: 共通payload生成（人固有項目は除外）───────────────
describe('buildApp55Record（複数人・共通payload）', () => {
  it('人固有項目（氏名/性別/経験年数）は除外し、共通項目は残す', () => {
    const getCell = cellsReader({
      '1-4': { D10: 'グエン', H12: '男', K12: 2, E13: 200000 },
    })
    const record = buildApp55Record(getCell)
    // 人固有（HRIDルックアップが人材マスタから補完する項目）は payload に出さない。
    for (const code of APP55_PERSON_SPECIFIC_CODES) {
      expect(code in record).toBe(false)
    }
    expect('申請人氏名' in record).toBe(false)
    expect('性別' in record).toBe(false)
    expect('申請人_経験年数' in record).toBe(false)
    // 共通項目（全員一緒）は残る。月給金額あり → 月給 CHECK_BOX 自動ON。
    expect(record.月給金額).toEqual({ value: 200000 })
    expect(record.月給).toEqual({ value: ['■'] })
  })
})

describe('syncStatusLabelForAction', () => {
  it('action → app296 反映ステータスラベル', () => {
    expect(syncStatusLabelForAction('update')).toBe('反映済')
    expect(syncStatusLabelForAction('create')).toBe('反映済')
    expect(syncStatusLabelForAction('dry-run')).toBe('未反映')
    expect(syncStatusLabelForAction('error')).toBe('エラー')
  })
})

// ── case-hub: app296 のリンク解決・ステータス書き戻し ──────────────────
describe('case-hub: loadCaseHubLinks / writeBackSyncStatus', () => {
  function hubRecord(): KintoneReadRecord {
    return {
      $id: { value: '5' },
      company_ref: { value: '100' },
      // 雇用条件書サブテーブル（複数人）。
      koyou_details: {
        value: [
          {
            id: '1',
            value: {
              koyou_ref: { value: '55' },
              koyou_hrid: { value: 'HR-001' },
              koyou_applicant_disp: { value: 'グエン' },
            },
          },
          {
            id: '2',
            value: {
              koyou_ref: { value: '56' },
              koyou_hrid: { value: 'HR-002' },
              koyou_applicant_disp: { value: 'タン' },
            },
          },
        ],
      } as unknown as { value: unknown },
    }
  }

  it('loadCaseHubLinks: app296 レコードから company_ref と雇用条件書サブテーブルを解決する', async () => {
    const getRecords = vi.fn().mockResolvedValue([hubRecord()])
    const client = makeMockClient({ getRecords })
    const links = await loadCaseHubLinks(client, '5')
    expect(getRecords).toHaveBeenCalledWith(CASE_HUB_APP_ID, '$id = "5"')
    expect(links).toEqual({
      kintoneCaseId: '5',
      app34RecordId: '100',
      koyouTargets: [
        { rowId: '1', app55RecordId: '55', hrid: 'HR-001', applicantName: 'グエン' },
        { rowId: '2', app55RecordId: '56', hrid: 'HR-002', applicantName: 'タン' },
      ],
      koyouRowIds: ['1', '2'],
      driveFolderUrl: null,
      companyName: null,
    })
  })

  it('loadCaseHubLinks: company_name_disp を companyName として返す（Driveのファイル名に使う）', async () => {
    const rec = hubRecord()
    rec.company_name_disp = { value: '医療法人縁和会' }
    const client = makeMockClient({ getRecords: vi.fn().mockResolvedValue([rec]) })
    const links = await loadCaseHubLinks(client, '5')
    expect(links?.companyName).toBe('医療法人縁和会')
  })

  it('loadCaseHubLinks: koyou_ref 無しの行はスキップ、hrid/氏名 空は null に正規化', async () => {
    const rec: KintoneReadRecord = {
      $id: { value: '5' },
      company_ref: { value: '100' },
      koyou_details: {
        value: [
          {
            id: '1',
            value: {
              koyou_ref: { value: '55' },
              koyou_hrid: { value: '' },
              koyou_applicant_disp: { value: '' },
            },
          },
          // koyou_ref 空の行は反映先が無いのでスキップ。
          { id: '2', value: { koyou_ref: { value: '' } } },
        ],
      } as unknown as { value: unknown },
    }
    const client = makeMockClient({ getRecords: vi.fn().mockResolvedValue([rec]) })
    const links = await loadCaseHubLinks(client, '5')
    expect(links?.app34RecordId).toBe('100')
    expect(links?.koyouTargets).toEqual([
      { rowId: '1', app55RecordId: '55', hrid: null, applicantName: null },
    ])
    // 反映先が無い行も「サブテーブル書き戻しで消さない」ため行IDは保持する。
    expect(links?.koyouRowIds).toEqual(['1', '2'])
  })

  it('loadCaseHubLinks: 見つからなければ null', async () => {
    const client = makeMockClient({ getRecords: vi.fn().mockResolvedValue([]) })
    expect(await loadCaseHubLinks(client, '999')).toBeNull()
  })

  it('writeBackSyncStatus: app296 へ status/synced_at/log を update', async () => {
    const updateRecord = vi.fn().mockResolvedValue({ revision: '2' })
    const client = makeMockClient({ updateRecord })
    await writeBackSyncStatus(client, '5', {
      companyStatus: '反映済',
      koyouRows: [
        { rowId: '1', status: '反映済' },
        { rowId: '2', status: 'エラー' },
      ],
      syncedAt: '2026-08-03T02:35:00Z',
      log: 'ok',
    })
    // 雇用条件書の反映ステータスは koyou_details サブテーブルの行単位（koyou_sync_status）。
    // レコード直下の sync_koyou_status は kintone 側に存在しないので送らない。
    expect(updateRecord).toHaveBeenCalledWith(CASE_HUB_APP_ID, '5', {
      sync_company_status: { value: '反映済' },
      koyou_details: {
        value: [
          { id: '1', value: { koyou_sync_status: { value: '反映済' } } },
          { id: '2', value: { koyou_sync_status: { value: 'エラー' } } },
        ],
      },
      synced_at: { value: '2026-08-03T02:35:00Z' },
      sync_log: { value: 'ok' },
    })
    const payload = updateRecord.mock.calls[0][2] as Record<string, unknown>
    expect('sync_koyou_status' in payload).toBe(false)
  })

  it('writeBackSyncStatus: koyouRows 未指定なら koyou_details を送らない（既存行を消さない）', async () => {
    const updateRecord = vi.fn().mockResolvedValue({ revision: '2' })
    const client = makeMockClient({ updateRecord })
    await writeBackSyncStatus(client, '5', { companyStatus: 'エラー' })
    expect(updateRecord).toHaveBeenCalledWith(CASE_HUB_APP_ID, '5', {
      sync_company_status: { value: 'エラー' },
    })
  })
})

// ── run-transcription: 行単位の反映ステータス組み立て ──────────────────
describe('buildKoyouRowStatuses', () => {
  it('行IDごとに書込結果 → 反映ステータス。結果が無い行（反映先未設定）は未反映', () => {
    expect(
      buildKoyouRowStatuses(
        ['1', '2', '3', '4'],
        [
          { rowId: '1', app55RecordId: '55', action: 'update', applicantName: 'グエン' },
          {
            rowId: '2',
            app55RecordId: '56',
            action: 'error',
            applicantName: 'タン',
            error: 'boom',
          },
          { rowId: '3', app55RecordId: '57', action: 'dry-run', applicantName: null },
        ]
      )
    ).toEqual([
      { rowId: '1', status: '反映済' },
      { rowId: '2', status: 'エラー' },
      { rowId: '3', status: '未反映' },
      { rowId: '4', status: '未反映' },
    ])
  })

  it('全行を同一ステータスで上書きできる（転記自体が失敗したときのエラー書き戻し用）', () => {
    expect(buildKoyouRowStatuses(['1', '2'], [], 'エラー')).toEqual([
      { rowId: '1', status: 'エラー' },
      { rowId: '2', status: 'エラー' },
    ])
  })
})
