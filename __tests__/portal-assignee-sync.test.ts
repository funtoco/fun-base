import { describe, it, expect, vi } from 'vitest'
import {
  KINTONE_MENTION_LIMIT,
  extractKintoneAssigneeCodes,
  buildAssigneeMentions,
  applyKintoneAssigneesToCase,
} from '@/lib/portal/kintone-sync/assignee-sync'

/** visa_application_cases の update(...).eq(...).select(...) を捉える最小モック。 */
function mockService(opts: { rows?: unknown[]; error?: unknown } = {}) {
  const updates: unknown[] = []
  const service = {
    from: () => ({
      update: (row: unknown) => {
        updates.push(row)
        return {
          eq: () => ({
            select: async () => ({
              data: opts.error ? null : (opts.rows ?? [{ id: 'case-1' }]),
              error: opts.error ?? null,
            }),
          }),
        }
      },
    }),
    updates,
  }
  return service
}

describe('extractKintoneAssigneeCodes', () => {
  it('作業者(STATUS_ASSIGNEE)の value からログイン名を取り出す', () => {
    const record = {
      作業者: { value: [{ code: 'sato', name: '佐藤　昇' }, { code: 'kato', name: '加藤　美咲' }] },
    }
    expect(extractKintoneAssigneeCodes(record)).toEqual(['sato', 'kato'])
  })

  it('作業者が未設定（空配列）なら空配列（＝キャッシュを消す）', () => {
    expect(extractKintoneAssigneeCodes({ 作業者: { value: [] } })).toEqual([])
  })

  it('作業者フィールドが payload に無ければ null（＝キャッシュに触らない）', () => {
    expect(extractKintoneAssigneeCodes({})).toBeNull()
    expect(extractKintoneAssigneeCodes({ 作業者: { value: null } })).toBeNull()
  })

  it('重複コード・空コードは除き、宛先上限(10)で切る', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ code: `u${i}`, name: `u${i}` }))
    const record = {
      作業者: { value: [{ code: 'sato' }, { code: 'sato' }, { code: '' }, ...many] },
    }
    const codes = extractKintoneAssigneeCodes(record)
    expect(codes).toHaveLength(KINTONE_MENTION_LIMIT)
    expect(codes!.slice(0, 3)).toEqual(['sato', 'u0', 'u1'])
  })
})

describe('buildAssigneeMentions', () => {
  it('ログイン名を USER 宛先へ変換する', () => {
    expect(buildAssigneeMentions(['sato', 'kato'])).toEqual([
      { code: 'sato', type: 'USER' },
      { code: 'kato', type: 'USER' },
    ])
  })

  it('空なら空配列', () => {
    expect(buildAssigneeMentions([])).toEqual([])
  })
})

describe('applyKintoneAssigneesToCase', () => {
  it('kintone_record_id 一致の案件へ作業者コードを書き込む', async () => {
    const service = mockService()
    const res = await applyKintoneAssigneesToCase(service as never, '5', ['sato'])
    expect(res.updated).toBe(true)
    expect(service.updates).toEqual([{ kintone_assignee_codes: ['sato'] }])
  })

  it('未ミラー案件（0件更新）は updated:false', async () => {
    const service = mockService({ rows: [] })
    const res = await applyKintoneAssigneesToCase(service as never, '5', ['sato'])
    expect(res.updated).toBe(false)
  })

  it('DB エラーは握り潰して updated:false（Webhook を落とさない）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const service = mockService({ error: { message: 'boom' } })
    const res = await applyKintoneAssigneesToCase(service as never, '5', ['sato'])
    expect(res.updated).toBe(false)
    spy.mockRestore()
  })
})
