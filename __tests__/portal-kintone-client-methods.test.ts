import { describe, it, expect, vi, afterEach } from 'vitest'
import { RestKintoneWriteClient } from '@/lib/portal/kintone-sync/kintone-write-client'

function stubFetch(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function client() {
  return new RestKintoneWriteClient({
    baseUrl: 'https://x.cybozu.com',
    username: 'u',
    password: 'p',
  })
}

function callArgs(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, opts] = fetchMock.mock.calls[0]
  return { url: url as string, opts: opts as { method: string; body?: string; headers: Record<string, string> } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RestKintoneWriteClient: 新メソッド', () => {
  it('updateRecordStatus → PUT /k/v1/record/status.json（body に app/id/action）', async () => {
    const fetchMock = stubFetch({ revision: '9' })
    const res = await client().updateRecordStatus('296', '5', 'kintone連携')
    const { url, opts } = callArgs(fetchMock)
    expect(url).toBe('https://x.cybozu.com/k/v1/record/status.json')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body!)).toEqual({ app: '296', id: '5', action: 'kintone連携' })
    expect(opts.headers['X-Cybozu-Authorization']).toBeTruthy()
    expect(res).toEqual({ revision: '9' })
  })

  it('updateRecordStatus: assignee/revision 指定時のみ body に含める', async () => {
    const fetchMock = stubFetch({ revision: '9' })
    await client().updateRecordStatus('296', '5', '完了', { assignee: 'bot', revision: '3' })
    const { opts } = callArgs(fetchMock)
    expect(JSON.parse(opts.body!)).toEqual({
      app: '296',
      id: '5',
      action: '完了',
      assignee: 'bot',
      revision: '3',
    })
  })

  it('getRecordComments → GET /k/v1/record/comments.json?app=&record=&order=asc', async () => {
    const comments = [
      { id: '1', text: 'hi', createdAt: '2026-08-03T00:00:00Z', creator: { code: 'u', name: 'U' } },
    ]
    const fetchMock = stubFetch({ comments })
    const res = await client().getRecordComments('296', '5')
    const { url, opts } = callArgs(fetchMock)
    expect(url).toContain('/k/v1/record/comments.json?')
    expect(url).toContain('app=296')
    expect(url).toContain('record=5')
    expect(url).toContain('order=asc')
    expect(opts.method).toBe('GET')
    expect(res).toEqual(comments)
  })

  it('postRecordComment → POST /k/v1/record/comment.json（body に comment.text）', async () => {
    const fetchMock = stubFetch({ id: '42' })
    const res = await client().postRecordComment('296', '5', '[FunBase] 山田: よろしく')
    const { url, opts } = callArgs(fetchMock)
    expect(url).toBe('https://x.cybozu.com/k/v1/record/comment.json')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body!)).toEqual({
      app: '296',
      record: '5',
      comment: { text: '[FunBase] 山田: よろしく' },
    })
    expect(res).toEqual({ id: '42' })
  })

  it('postRecordComment: mentions 指定時は comment.mentions を含める', async () => {
    const fetchMock = stubFetch({ id: '42' })
    await client().postRecordComment('296', '5', 'hi', [{ code: 'u1', type: 'USER' }])
    const { opts } = callArgs(fetchMock)
    expect(JSON.parse(opts.body!).comment).toEqual({
      text: 'hi',
      mentions: [{ code: 'u1', type: 'USER' }],
    })
  })
})
