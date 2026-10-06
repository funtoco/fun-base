import { describe, expect, it } from 'vitest'
import { parseApp296ReplayInput } from '@/lib/portal/kintone-sync/case-replay'

describe('parseApp296ReplayInput', () => {
  it('kintone API形式のレコードを再実行イベントへ変換する', () => {
    const event = parseApp296ReplayInput(
      JSON.stringify({
        $id: { type: '__ID__', value: '10' },
        case_title: { type: 'SINGLE_LINE_TEXT', value: '医療法人福寿会20261006' },
        company_ref: { type: 'NUMBER', value: '2757' },
        office_details: {
          type: 'SUBTABLE',
          value: [
            {
              id: '1',
              value: {
                office_name_disp: { type: 'SINGLE_LINE_TEXT', value: 'グループホーム西坂' },
              },
            },
          ],
        },
      })
    )

    expect(event.type).toBe('UPDATE_RECORD')
    expect(event.appId).toBe('296')
    expect(event.recordId).toBe('10')
    expect(event.record.case_title.value).toBe('医療法人福寿会20261006')
  })

  it('MCPのrecords配列を含む応答も受け付ける', () => {
    const event = parseApp296ReplayInput(
      JSON.stringify({
        records: [
          {
            $id: { type: '__ID__', value: '10' },
            case_title: { type: 'SINGLE_LINE_TEXT', value: '案件' },
          },
        ],
        totalCount: '1',
      })
    )

    expect(event.recordId).toBe('10')
    expect(event.record.case_title.value).toBe('案件')
  })

  it('対象レコードが1件でない場合は拒否する', () => {
    expect(() => parseApp296ReplayInput(JSON.stringify({ records: [] }))).toThrow(
      'app296レコードを1件だけ指定してください'
    )
    expect(() =>
      parseApp296ReplayInput(
        JSON.stringify({
          records: [
            { $id: { value: '10' } },
            { $id: { value: '11' } },
          ],
        })
      )
    ).toThrow('app296レコードを1件だけ指定してください')
  })

  it('不正JSONとレコードID欠落を拒否する', () => {
    expect(() => parseApp296ReplayInput('{')).toThrow('APP296_RECORD_JSONが不正なJSONです')
    expect(() => parseApp296ReplayInput(JSON.stringify({ case_title: { value: '案件' } }))).toThrow(
      'app296レコードの$id.valueがありません'
    )
  })
})
