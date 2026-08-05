import { describe, it, expect } from 'vitest'
import {
  mapKintoneRecordToCaseRow,
  resolveTenantOfficesByNames,
} from '@/lib/portal/kintone-sync/case-mirror'
import type { KintoneWebhookEvent } from '@/lib/portal/kintone-sync/webhook'

function event(
  record: Record<string, { value: unknown }>,
  type: KintoneWebhookEvent['type'] = 'ADD_RECORD',
  recordId = '7'
): KintoneWebhookEvent {
  return { type, appId: '296', recordId, record, raw: {} }
}

describe('mapKintoneRecordToCaseRow', () => {
  it('app296 レコードを案件行素材へ写像する（雇用条件書サブテーブル→複数人）', () => {
    const mapped = mapKintoneRecordToCaseRow(
      event({
        case_title: { value: '近江舞子しょうぶ苑・初回' },
        apply_type: { value: '新規' },
        bunya: { value: '介護' },
        company_ref: { value: '20951' },
        office_details: {
          value: [
            { id: '1', value: { office_ref: { value: '66' }, office_name_disp: { value: '近江舞子しょうぶ苑' } } },
          ],
        },
        drive_folder_url: { value: 'https://drive.google.com/drive/folders/ABC' },
        koyou_details: {
          value: [
            {
              id: '1',
              value: {
                koyou_ref: { value: '4102' },
                koyou_hrid: { value: '1' },
                koyou_applicant_disp: { value: 'グエン' },
              },
            },
            {
              id: '2',
              value: {
                koyou_ref: { value: '4103' },
                koyou_hrid: { value: '2' },
                koyou_applicant_disp: { value: 'タン' },
              },
            },
          ],
        },
      })
    )
    expect(mapped).toEqual({
      kintoneRecordId: '7',
      title: '近江舞子しょうぶ苑・初回',
      applicationCategory: 'initial',
      field: 'care',
      entityType: 'corporate',
      driveFolderUrl: 'https://drive.google.com/drive/folders/ABC',
      coid: '20951',
      officeNames: ['近江舞子しょうぶ苑'],
      koyouTargets: [
        { hrid: '1', applicantName: 'グエン', app55RecordId: '4102' },
        { hrid: '2', applicantName: 'タン', app55RecordId: '4103' },
      ],
    })
  })

  it('koyou_details: 両キー空の行はスキップ・片方のみでも残す', () => {
    const mapped = mapKintoneRecordToCaseRow(
      event({
        koyou_details: {
          value: [
            { id: '1', value: { koyou_ref: { value: '4102' }, koyou_hrid: { value: '' } } },
            { id: '2', value: {} }, // 両キー空 → スキップ
            { id: '3', value: { koyou_hrid: { value: '9' } } }, // hrid のみでも残る
          ],
        },
      })
    )
    expect(mapped.koyouTargets).toEqual([
      { hrid: null, applicantName: null, app55RecordId: '4102' },
      { hrid: '9', applicantName: null, app55RecordId: null },
    ])
  })

  it('apply_type 変更→renewal / 新規・その他→initial', () => {
    expect(mapKintoneRecordToCaseRow(event({ apply_type: { value: '変更' } })).applicationCategory).toBe('renewal')
    expect(mapKintoneRecordToCaseRow(event({ apply_type: { value: '新規' } })).applicationCategory).toBe('initial')
    expect(mapKintoneRecordToCaseRow(event({})).applicationCategory).toBe('initial')
  })

  it('bunya → field enum、未知/欠落は other', () => {
    const f = (bunya?: string) =>
      mapKintoneRecordToCaseRow(event(bunya ? { bunya: { value: bunya } } : {})).field
    expect(f('介護')).toBe('care')
    expect(f('外食')).toBe('food_service')
    expect(f('宿泊')).toBe('accommodation')
    expect(f('飲食料品製造')).toBe('food_manufacturing')
    expect(f('その他')).toBe('other')
    expect(f('未知')).toBe('other')
    expect(f()).toBe('other')
  })

  it('空・未設定フィールドは null / 空配列（crosswalk 素材含む）', () => {
    const mapped = mapKintoneRecordToCaseRow(
      event({ case_title: { value: '' }, company_ref: { value: null }, office_details: { value: [] } })
    )
    expect(mapped.title).toBeNull()
    expect(mapped.coid).toBeNull()
    expect(mapped.officeNames).toEqual([])
    expect(mapped.koyouTargets).toEqual([])
    expect(mapped.driveFolderUrl).toBeNull()
  })

  it('office_details: 配列順を保ち、空行はスキップ・同名重複は先勝ちで畳む', () => {
    const mapped = mapKintoneRecordToCaseRow(
      event({
        office_details: {
          value: [
            { id: '1', value: { office_name_disp: { value: '慈誠会前野病院' } } },
            { id: '2', value: { office_name_disp: { value: '' } } }, // 空 → スキップ
            { id: '3', value: {} }, // 未設定 → スキップ
            { id: '4', value: { office_name_disp: { value: 'メロディハウス' } } },
            { id: '5', value: { office_name_disp: { value: ' 慈誠会前野病院 ' } } }, // 重複 → 畳む
          ],
        },
      })
    )
    expect(mapped.officeNames).toEqual(['慈誠会前野病院', 'メロディハウス'])
  })

  it('office_details が配列でない/未設定なら空配列', () => {
    expect(mapKintoneRecordToCaseRow(event({})).officeNames).toEqual([])
    expect(
      mapKintoneRecordToCaseRow(event({ office_details: { value: 'not-an-array' } })).officeNames
    ).toEqual([])
  })

  it('recordId は event から取る（レコード番号＝案件キー）', () => {
    expect(mapKintoneRecordToCaseRow(event({}, 'UPDATE_RECORD', '42')).kintoneRecordId).toBe('42')
  })
})

/** tenant_offices の select(.eq) だけを返す最小モック。 */
function mockOfficeService(offices: Array<{ id: string; name: string }>) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: offices }),
      }),
    }),
  }
}

describe('resolveTenantOfficesByNames', () => {
  const offices = [
    { id: 'off-1', name: '慈誠会前野病院' },
    { id: 'off-2', name: 'メロディハウス' },
    { id: 'off-3', name: '近江舞子しょうぶ苑' },
  ]

  it('入力順を保って tenant_office_id に解決する（＝sort_order）', async () => {
    const res = await resolveTenantOfficesByNames(
      mockOfficeService(offices) as never,
      'ten-1',
      ['メロディハウス', '慈誠会前野病院']
    )
    expect(res).toEqual({ resolved: ['off-2', 'off-1'], unresolvedNames: [] })
  })

  it('大小文字・前後空白のドリフトを吸収する', async () => {
    const res = await resolveTenantOfficesByNames(
      mockOfficeService(offices) as never,
      'ten-1',
      ['  メロディハウス  ']
    )
    expect(res.resolved).toEqual(['off-2'])
  })

  it('解決できた分だけ採用し、未解決の名前は別に返す（部分スキップ）', async () => {
    const res = await resolveTenantOfficesByNames(
      mockOfficeService(offices) as never,
      'ten-1',
      ['慈誠会前野病院', '存在しない事業所', '近江舞子しょうぶ苑']
    )
    expect(res).toEqual({
      resolved: ['off-1', 'off-3'],
      unresolvedNames: ['存在しない事業所'],
    })
  })

  it('同一事業所に解決する重複入力は畳む（uq_vaco 違反回避）', async () => {
    const res = await resolveTenantOfficesByNames(
      mockOfficeService(offices) as never,
      'ten-1',
      ['慈誠会前野病院', ' 慈誠会前野病院']
    )
    expect(res.resolved).toEqual(['off-1'])
  })

  it('入力が空なら DB を引かずに空を返す', async () => {
    const res = await resolveTenantOfficesByNames(
      { from: () => { throw new Error('DBを引いてはいけない') } } as never,
      'ten-1',
      []
    )
    expect(res).toEqual({ resolved: [], unresolvedNames: [] })
  })

  it('全件未解決なら resolved は空（呼び出し側が案件ごとスキップする）', async () => {
    const res = await resolveTenantOfficesByNames(
      mockOfficeService(offices) as never,
      'ten-1',
      ['どこかの事業所']
    )
    expect(res.resolved).toEqual([])
    expect(res.unresolvedNames).toEqual(['どこかの事業所'])
  })
})
