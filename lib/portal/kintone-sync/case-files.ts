import {
  KintoneApiError,
  type KintoneFileValue,
  type KintoneReadRecord,
  type KintoneWriteClient,
} from './kintone-write-client'
import { CASE_HUB_APP_ID } from './case-hub'

// 案件の「その他ファイル」＝ app296（就労_ビザ案件管理）レコードの添付ファイルフィールド。
// チェックリストに載らない任意ファイルの置き場で、Supabase Storage は経由しない。
//
// 添付ファイルフィールドは PUT で**丸ごと置換**されるため、追加は必ず
// 「読む → 既存に append → revision 付きで PUT」で行う（既存ファイルの消失を防ぐ）。

/** app296 に OP が用意する添付ファイルフィールドのコード。 */
export const OTHER_FILES_FIELD_CODE = 'other_files'

/** 画面に出す1ファイル分。 */
export interface CaseFile {
  fileKey: string
  name: string
  contentType: string
  /** バイト数。 */
  size: number
}

/** kintone クエリの文字列リテラル用エスケープ（case-hub.ts と同じ規約）。 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/** app296 の1レコードを取得する。見つからなければ null。 */
async function loadRecord(
  client: KintoneWriteClient,
  kintoneCaseId: string
): Promise<KintoneReadRecord | null> {
  const records = await client.getRecords(
    CASE_HUB_APP_ID,
    `$id = ${quote(kintoneCaseId)}`
  )
  return records[0] ?? null
}

/** レコードから添付ファイルフィールドを取り出す。未設定・非配列は空配列。 */
function readAttachments(record: KintoneReadRecord): KintoneFileValue[] {
  const value = (record[OTHER_FILES_FIELD_CODE] as { value: unknown } | undefined)
    ?.value
  return Array.isArray(value) ? (value as KintoneFileValue[]) : []
}

/** レコードの $revision。取れなければ undefined（楽観ロック無しで更新する）。 */
function readRevision(record: KintoneReadRecord): string | undefined {
  const value = (record.$revision as { value: unknown } | undefined)?.value
  return value === undefined || value === null || value === ''
    ? undefined
    : String(value)
}

/** 案件に紐づく「その他ファイル」の一覧を返す。レコードが無ければ空配列。 */
export async function listCaseFiles(
  client: KintoneWriteClient,
  kintoneCaseId: string
): Promise<CaseFile[]> {
  const record = await loadRecord(client, kintoneCaseId)
  if (!record) {
    return []
  }
  return readAttachments(record).map((file) => ({
    fileKey: file.fileKey,
    name: file.name,
    contentType: file.contentType,
    size: Number(file.size) || 0,
  }))
}

/**
 * 案件に紐づく1ファイルの本文を取得する。
 * **その案件の添付フィールドに載っている fileKey でなければ null**（fileKey を推測して
 * 他案件のファイルを読むのを防ぐ）。
 */
export async function readCaseFile(
  client: KintoneWriteClient,
  kintoneCaseId: string,
  fileKey: string
): Promise<{ name: string; contentType: string; body: Buffer } | null> {
  const files = await listCaseFiles(client, kintoneCaseId)
  const target = files.find((file) => file.fileKey === fileKey)
  if (!target) {
    return null
  }
  const downloaded = await client.downloadFile(fileKey)
  return {
    name: target.name,
    // 本文の Content-Type を優先し、取れなければレコード側の値を使う。
    contentType: downloaded.contentType || target.contentType,
    body: downloaded.body,
  }
}

/**
 * アップロード済みの fileKey を案件レコードの添付フィールドへ**追記**する。
 * revision で楽観ロックし、競合（409）したら読み直して1回だけリトライする。
 * リトライしても競合するなら、既存ファイルを消さないために例外にする。
 */
export async function appendCaseFiles(
  client: KintoneWriteClient,
  kintoneCaseId: string,
  fileKeys: string[]
): Promise<void> {
  if (fileKeys.length === 0) {
    return
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const record = await loadRecord(client, kintoneCaseId)
    if (!record) {
      throw new Error(`案件レコードが見つかりません（app296 #${kintoneCaseId}）`)
    }

    const merged = [
      ...readAttachments(record).map((file) => ({ fileKey: file.fileKey })),
      ...fileKeys.map((fileKey) => ({ fileKey })),
    ]

    try {
      await client.updateRecord(
        CASE_HUB_APP_ID,
        kintoneCaseId,
        { [OTHER_FILES_FIELD_CODE]: { value: merged } },
        { revision: readRevision(record) }
      )
      return
    } catch (error) {
      // 409 = revision 不一致（他者が先に更新）。読み直せば追記できる可能性が高い。
      const isConflict = error instanceof KintoneApiError && error.status === 409
      if (!isConflict || attempt === 1) {
        throw error
      }
    }
  }
}
