import { describe, it, expect, vi } from 'vitest'
import {
  FUNBASE_COMMENT_PREFIX,
  buildKintoneCommentText,
  isFunbaseOriginText,
  pushCommentToKintone,
  importKintoneComment,
} from '@/lib/portal/kintone-sync/comment-sync'
import type { KintoneWriteClient } from '@/lib/portal/kintone-sync/kintone-write-client'

function mockClient(overrides: Partial<KintoneWriteClient> = {}): KintoneWriteClient {
  return {
    getRecords: vi.fn().mockResolvedValue([]),
    createRecord: vi.fn().mockResolvedValue({ id: '1', revision: '1' }),
    updateRecord: vi.fn().mockResolvedValue({ revision: '1' }),
    updateRecordStatus: vi.fn().mockResolvedValue({ revision: '1' }),
    getRecordComments: vi.fn().mockResolvedValue([]),
    postRecordComment: vi.fn().mockResolvedValue({ id: 'kc99' }),
    ...overrides,
  }
}

// case_comments の select(.eq.eq.maybeSingle) と insert を捉える最小モック。
function mockService(opts: { existing?: unknown } = {}) {
  const inserts: unknown[] = []
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.existing ?? null }) }),
        }),
      }),
      insert: (row: unknown) => {
        inserts.push(row)
        return Promise.resolve({ data: null, error: null })
      },
    }),
    inserts,
  }
  return service
}

const caseKey = { caseId: 'case-1', tenantId: 'ten-1', tenantOfficeId: 'off-1' }

describe('comment-sync: 純粋ヘルパ', () => {
  it('buildKintoneCommentText: 接頭辞＋投稿者＋本文', () => {
    expect(buildKintoneCommentText('山田', 'よろしく')).toBe('[FunBase] 山田: よろしく')
    expect(buildKintoneCommentText(null, 'hi')).toBe('[FunBase]: hi')
  })

  it('isFunbaseOriginText: 接頭辞つき=true（先頭空白許容）、通常=false', () => {
    expect(isFunbaseOriginText(`${FUNBASE_COMMENT_PREFIX} 山田: hi`)).toBe(true)
    expect(isFunbaseOriginText('   [FunBase]: hi')).toBe(true)
    expect(isFunbaseOriginText('普通のコメント')).toBe(false)
  })
})

describe('pushCommentToKintone', () => {
  it('接頭辞つき本文で postRecordComment を呼び id を返す', async () => {
    const client = mockClient()
    const res = await pushCommentToKintone({
      client,
      kintoneRecordId: '5',
      authorLabel: '山田',
      body: 'hi',
    })
    expect(client.postRecordComment).toHaveBeenCalledWith('296', '5', '[FunBase] 山田: hi')
    expect(res).toEqual({ kintoneCommentId: 'kc99' })
  })
})

describe('importKintoneComment: 三重ループ防止', () => {
  it('接頭辞つき（自分のecho）は loop でスキップ（insert しない）', async () => {
    const service = mockService()
    const res = await importKintoneComment({
      service: service as never,
      caseKey,
      comment: { id: 'kc1', text: '[FunBase] 山田: echo', creatorName: 'X' },
    })
    expect(res).toEqual({ imported: false, reason: 'loop' })
    expect(service.inserts).toHaveLength(0)
  })

  it('同一 kintone_comment_id は duplicate でスキップ', async () => {
    const service = mockService({ existing: { id: 'existing' } })
    const res = await importKintoneComment({
      service: service as never,
      caseKey,
      comment: { id: 'kc1', text: 'kintoneからの新規', creatorName: '田中' },
    })
    expect(res).toEqual({ imported: false, reason: 'duplicate' })
    expect(service.inserts).toHaveLength(0)
  })

  it('新規は source=kintone / author=null / kintone_author付きで挿入', async () => {
    const service = mockService({ existing: null })
    const res = await importKintoneComment({
      service: service as never,
      caseKey,
      comment: { id: 'kc2', text: 'kintoneからの新規', creatorName: '田中' },
    })
    expect(res).toEqual({ imported: true })
    expect(service.inserts[0]).toEqual({
      case_id: 'case-1',
      tenant_id: 'ten-1',
      tenant_office_id: 'off-1',
      author: null,
      body: 'kintoneからの新規',
      source: 'kintone',
      kintone_comment_id: 'kc2',
      kintone_author: '田中',
    })
  })
})
