import { describe, it, expect } from 'vitest'
import { mapKintoneRecordToCaseRow } from '@/lib/portal/kintone-sync/case-mirror'
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
        office_name_disp: { value: '近江舞子しょうぶ苑' },
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
      officeName: '近江舞子しょうぶ苑',
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

  it('空・未設定フィールドは null（crosswalk 素材含む）', () => {
    const mapped = mapKintoneRecordToCaseRow(
      event({ case_title: { value: '' }, company_ref: { value: null }, office_name_disp: { value: '' } })
    )
    expect(mapped.title).toBeNull()
    expect(mapped.coid).toBeNull()
    expect(mapped.officeName).toBeNull()
    expect(mapped.koyouTargets).toEqual([])
    expect(mapped.driveFolderUrl).toBeNull()
  })

  it('recordId は event から取る（レコード番号＝案件キー）', () => {
    expect(mapKintoneRecordToCaseRow(event({}, 'UPDATE_RECORD', '42')).kintoneRecordId).toBe('42')
  })
})
