import { describe, it, expect, vi } from 'vitest'
import {
  extractKintoneStatusLabel,
  advanceKintoneCaseStatus,
} from '@/lib/portal/kintone-sync/status-sync'
import type {
  KintoneReadRecord,
  KintoneWriteClient,
} from '@/lib/portal/kintone-sync/kintone-write-client'

function mockClient(overrides: Partial<KintoneWriteClient> = {}): KintoneWriteClient {
  return {
    getRecords: vi.fn().mockResolvedValue([]),
    createRecord: vi.fn().mockResolvedValue({ id: '1', revision: '1' }),
    updateRecord: vi.fn().mockResolvedValue({ revision: '1' }),
    updateRecordStatus: vi.fn().mockResolvedValue({ revision: '1' }),
    getRecordComments: vi.fn().mockResolvedValue([]),
    postRecordComment: vi.fn().mockResolvedValue({ id: '1' }),
    uploadFile: vi.fn().mockResolvedValue({ fileKey: 'fk1' }),
    downloadFile: vi
      .fn()
      .mockResolvedValue({ body: Buffer.from(''), contentType: 'application/pdf' }),
    ...overrides,
  }
}

function recordWithStatus(label: string): KintoneReadRecord {
  return { $id: { value: '5' }, ステータス: { value: label } }
}

describe('extractKintoneStatusLabel', () => {
  it('ステータス フィールドからラベルを取り出す、無ければ null', () => {
    expect(extractKintoneStatusLabel({ ステータス: { value: '確認中' } })).toBe('確認中')
    expect(extractKintoneStatusLabel({ ステータス: { value: '' } })).toBeNull()
    expect(extractKintoneStatusLabel({})).toBeNull()
  })
})

describe('advanceKintoneCaseStatus', () => {
  it('現状(確認中)→目標(synced)で 準備完了へ→kintone連携 を順に実行', async () => {
    const client = mockClient({
      getRecords: vi.fn().mockResolvedValue([recordWithStatus('確認中')]),
    })
    const res = await advanceKintoneCaseStatus(client, '5', 'synced')
    expect(res.actions).toEqual(['準備完了へ', 'kintone連携'])
    expect(client.updateRecordStatus).toHaveBeenCalledTimes(2)
    expect(client.updateRecordStatus).toHaveBeenNthCalledWith(1, '296', '5', '準備完了へ')
    expect(client.updateRecordStatus).toHaveBeenNthCalledWith(2, '296', '5', 'kintone連携')
  })

  it('現状==目標 は no-op（アクション実行なし）', async () => {
    const client = mockClient({
      getRecords: vi.fn().mockResolvedValue([recordWithStatus('連携済み')]),
    })
    const res = await advanceKintoneCaseStatus(client, '5', 'synced')
    expect(res.advanced).toBe(false)
    expect(res.actions).toEqual([])
    expect(client.updateRecordStatus).not.toHaveBeenCalled()
  })

  it('後退（現状 連携済み→目標 reviewing）は no-op', async () => {
    const client = mockClient({
      getRecords: vi.fn().mockResolvedValue([recordWithStatus('連携済み')]),
    })
    const res = await advanceKintoneCaseStatus(client, '5', 'reviewing')
    expect(res.actions).toEqual([])
    expect(client.updateRecordStatus).not.toHaveBeenCalled()
  })

  it('archived 目標は kintone 非対応で no-op（レコード取得もしない）', async () => {
    const getRecords = vi.fn().mockResolvedValue([recordWithStatus('確認中')])
    const client = mockClient({ getRecords })
    const res = await advanceKintoneCaseStatus(client, '5', 'archived')
    expect(res.advanced).toBe(false)
    expect(getRecords).not.toHaveBeenCalled()
  })

  it('app296 にレコードが無ければ no-op', async () => {
    const client = mockClient({ getRecords: vi.fn().mockResolvedValue([]) })
    const res = await advanceKintoneCaseStatus(client, '999', 'synced')
    expect(res.advanced).toBe(false)
    expect(client.updateRecordStatus).not.toHaveBeenCalled()
  })
})
