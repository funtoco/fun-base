import { describe, it, expect, vi } from 'vitest'
import {
  appendCaseFiles,
  listCaseFiles,
  readCaseFile,
  OTHER_FILES_FIELD_CODE,
} from '@/lib/portal/kintone-sync/case-files'
import {
  KintoneApiError,
  type KintoneReadRecord,
  type KintoneWriteClient,
} from '@/lib/portal/kintone-sync/kintone-write-client'

/** kintone 添付ファイルフィールドの1要素（size は文字列で返る）。 */
function attachment(fileKey: string, name = `${fileKey}.pdf`) {
  return { fileKey, name, contentType: 'application/pdf', size: '1024' }
}

/** app296 の1レコード。other_files を指定しなければフィールド未設定扱い。 */
function record(params: {
  revision?: string
  files?: ReturnType<typeof attachment>[] | null
}): KintoneReadRecord {
  const rec: KintoneReadRecord = {
    $id: { value: '5' },
    $revision: { value: params.revision ?? '3' },
  }
  if (params.files !== null && params.files !== undefined) {
    rec[OTHER_FILES_FIELD_CODE] = { value: params.files }
  }
  return rec
}

/** getRecords が呼ばれるたびに順番にレコードを返すモック。 */
function mockClient(params: {
  reads: KintoneReadRecord[][]
  update?: KintoneWriteClient['updateRecord']
}) {
  let readIndex = 0
  const getRecords = vi.fn(async () => {
    const result = params.reads[Math.min(readIndex, params.reads.length - 1)]
    readIndex += 1
    return result
  })
  const updateRecord = vi.fn(
    params.update ?? (async () => ({ revision: '4' }))
  )
  return {
    getRecords,
    updateRecord,
    createRecord: vi.fn(),
    updateRecordStatus: vi.fn(),
    getRecordComments: vi.fn(),
    postRecordComment: vi.fn(),
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
  } as unknown as KintoneWriteClient & {
    getRecords: ReturnType<typeof vi.fn>
    updateRecord: ReturnType<typeof vi.fn>
  }
}

/** updateRecord に渡された other_files の fileKey 配列を取り出す。 */
function sentFileKeys(updateRecord: ReturnType<typeof vi.fn>, callIndex = 0): string[] {
  const record = updateRecord.mock.calls[callIndex][2] as {
    [code: string]: { value: Array<{ fileKey: string }> }
  }
  return record[OTHER_FILES_FIELD_CODE].value.map((f) => f.fileKey)
}

describe('listCaseFiles', () => {
  it('添付ファイルフィールドを CaseFile[] に変換する（size は数値）', async () => {
    const client = mockClient({
      reads: [[record({ files: [attachment('k1', '住民票.pdf')] })]],
    })
    const files = await listCaseFiles(client, '5')
    expect(files).toEqual([
      {
        fileKey: 'k1',
        name: '住民票.pdf',
        contentType: 'application/pdf',
        size: 1024,
      },
    ])
  })

  it('フィールド未設定・空配列・レコード無しはいずれも空配列', async () => {
    const noField = mockClient({ reads: [[record({ files: null })]] })
    expect(await listCaseFiles(noField, '5')).toEqual([])

    const empty = mockClient({ reads: [[record({ files: [] })]] })
    expect(await listCaseFiles(empty, '5')).toEqual([])

    const noRecord = mockClient({ reads: [[]] })
    expect(await listCaseFiles(noRecord, '5')).toEqual([])
  })
})

describe('appendCaseFiles', () => {
  it('既存ファイルを保持したまま新規 fileKey を末尾に追加する', async () => {
    const client = mockClient({
      reads: [[record({ files: [attachment('k1'), attachment('k2')] })]],
    })

    await appendCaseFiles(client, '5', ['new1', 'new2'])

    expect(client.updateRecord).toHaveBeenCalledTimes(1)
    expect(sentFileKeys(client.updateRecord)).toEqual(['k1', 'k2', 'new1', 'new2'])
  })

  it('読み取った revision を指定して楽観ロックする', async () => {
    const client = mockClient({
      reads: [[record({ revision: '7', files: [attachment('k1')] })]],
    })

    await appendCaseFiles(client, '5', ['new1'])

    expect(client.updateRecord.mock.calls[0][3]).toEqual({ revision: '7' })
  })

  it('revision 競合(409)は読み直して1回リトライし、他者の追加分も残す', async () => {
    // 1回目の読み取り後に他者が k2 を追加 → 409 → 読み直すと k1,k2 が見える
    const update = vi
      .fn()
      .mockRejectedValueOnce(new KintoneApiError(409, 'revision mismatch'))
      .mockResolvedValueOnce({ revision: '9' })
    const client = mockClient({
      reads: [
        [record({ revision: '7', files: [attachment('k1')] })],
        [record({ revision: '8', files: [attachment('k1'), attachment('k2')] })],
      ],
      update: update as unknown as KintoneWriteClient['updateRecord'],
    })

    await appendCaseFiles(client, '5', ['new1'])

    expect(client.updateRecord).toHaveBeenCalledTimes(2)
    expect(sentFileKeys(client.updateRecord, 1)).toEqual(['k1', 'k2', 'new1'])
    expect(client.updateRecord.mock.calls[1][3]).toEqual({ revision: '8' })
  })

  it('リトライしても 409 なら例外にする（黙って上書きしない）', async () => {
    const update = vi
      .fn()
      .mockRejectedValue(new KintoneApiError(409, 'revision mismatch'))
    const client = mockClient({
      reads: [[record({ files: [attachment('k1')] })]],
      update: update as unknown as KintoneWriteClient['updateRecord'],
    })

    await expect(appendCaseFiles(client, '5', ['new1'])).rejects.toThrow(
      KintoneApiError
    )
    expect(client.updateRecord).toHaveBeenCalledTimes(2)
  })

  it('409 以外のエラーはリトライせずそのまま投げる', async () => {
    const update = vi.fn().mockRejectedValue(new KintoneApiError(403, 'forbidden'))
    const client = mockClient({
      reads: [[record({ files: [attachment('k1')] })]],
      update: update as unknown as KintoneWriteClient['updateRecord'],
    })

    await expect(appendCaseFiles(client, '5', ['new1'])).rejects.toThrow('forbidden')
    expect(client.updateRecord).toHaveBeenCalledTimes(1)
  })

  it('レコードが見つからなければ例外（アップロード済みファイルを孤児にしない）', async () => {
    const client = mockClient({ reads: [[]] })
    await expect(appendCaseFiles(client, '5', ['new1'])).rejects.toThrow()
    expect(client.updateRecord).not.toHaveBeenCalled()
  })

  it('追加ファイルが無ければ何もしない', async () => {
    const client = mockClient({ reads: [[record({ files: [attachment('k1')] })]] })
    await appendCaseFiles(client, '5', [])
    expect(client.updateRecord).not.toHaveBeenCalled()
  })
})

describe('readCaseFile', () => {
  function clientWith(files: ReturnType<typeof attachment>[]) {
    const client = mockClient({ reads: [[record({ files })]] })
    ;(client.downloadFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      body: Buffer.from('BODY'),
      contentType: 'application/pdf',
    })
    return client as typeof client & { downloadFile: ReturnType<typeof vi.fn> }
  }

  it('案件に紐づく fileKey なら本文とファイル名を返す', async () => {
    const client = clientWith([attachment('k1', '住民票.pdf')])

    const file = await readCaseFile(client, '5', 'k1')

    expect(file).toEqual({
      name: '住民票.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('BODY'),
    })
    expect(client.downloadFile).toHaveBeenCalledWith('k1')
  })

  it('案件に紐づかない fileKey は null（他案件のファイルを読ませない）', async () => {
    const client = clientWith([attachment('k1')])

    expect(await readCaseFile(client, '5', 'よその案件のfileKey')).toBeNull()
    expect(client.downloadFile).not.toHaveBeenCalled()
  })

  it('添付が1件も無い案件でも null を返すだけで落ちない', async () => {
    const client = clientWith([])
    expect(await readCaseFile(client, '5', 'k1')).toBeNull()
    expect(client.downloadFile).not.toHaveBeenCalled()
  })
})
