import { buildRecord } from './build-records'
import { openWorkbook, sheetCellReader } from './excel-reader'
import { HAJIMENI_APP34 } from './mappings/hajimeni'
import type { KintoneWriteClient } from './kintone-write-client'
import type { KintoneRecordPayload, SheetMapping } from './types'

export type TranscribeAction = 'create' | 'update' | 'dry-run'

export interface TranscribePlan {
  /** 転記先アプリID（例: '34'）。 */
  appId: string
  /** 実行された/される操作。dryRun のときは 'dry-run'。 */
  action: TranscribeAction
  /** update / 既存ヒット時の kintone レコードID。create 実行時は新規ID。 */
  recordId?: string
  /** upsert キー（法人番号）の値。空なら null。 */
  keyValue: string | null
  /** kintone に送る（送った）レコード payload。 */
  record: KintoneRecordPayload
}

export interface TranscribeResult {
  sheet: string
  plan: TranscribePlan
}

export interface TranscribeOptions {
  buffer: ArrayBuffer | Buffer | Uint8Array
  /** 既定 true。false かつ client 指定時のみ実書き込みする。 */
  dryRun?: boolean
  /** kintone 書込クライアント（未指定/null なら dryRun 扱い）。 */
  client?: KintoneWriteClient | null
}

/** kintone クエリの文字列リテラル用エスケープ（ダブルクォートを退避）。 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/**
 * upsert キーで既存レコードを検索する。複数ヒットは重複としてエラー（自動転記を中止）。
 * @returns 既存レコードID（1件）または null（0件）。
 */
async function findExistingRecordId(
  client: KintoneWriteClient,
  mapping: SheetMapping,
  keyValue: string
): Promise<string | null> {
  const query = `${mapping.keyCode} = ${quote(keyValue)}`
  const records = await client.getRecords(mapping.appId, query)
  if (records.length > 1) {
    throw new Error(
      `法人番号「${keyValue}」が app${mapping.appId} に複数（${records.length}件）存在します。重複のため自動転記を中止しました。`
    )
  }
  return records.length === 1 ? records[0].$id.value : null
}

/**
 * `はじめに` シートを読み、app34（マスタ_法人）へ upsert する（法人番号で照合→更新/新規）。
 *
 * - dryRun（既定）: kintone への書き込みは一切行わず、plan を返す。
 *   client があれば読み取り（getRecords）で既存有無をプレビューし recordId を埋める。
 * - dryRun=false かつ client あり: 既存1件→updateRecord / 0件→createRecord。複数ヒットはエラー。
 */
export async function transcribeHajimeni(
  options: TranscribeOptions
): Promise<TranscribeResult> {
  const dryRun = options.dryRun ?? true
  const client = options.client ?? null
  const mapping = HAJIMENI_APP34

  const workbook = await openWorkbook(options.buffer)
  const worksheet = workbook.getWorksheet(mapping.sheetName)
  if (!worksheet) {
    throw new Error(`シート「${mapping.sheetName}」が見つかりません`)
  }

  const getCell = sheetCellReader(worksheet)
  const record = buildRecord(getCell, mapping)
  const keyField = record[mapping.keyCode]
  const keyValue = keyField ? String(keyField.value) : null

  // dryRun または client 無し → 書き込みしない。可能ならプレビューで既存IDを埋める。
  if (dryRun || !client) {
    let recordId: string | undefined
    if (client && keyValue) {
      const existingId = await findExistingRecordId(client, mapping, keyValue)
      recordId = existingId ?? undefined
    }
    return {
      sheet: mapping.sheetName,
      plan: { appId: mapping.appId, action: 'dry-run', recordId, keyValue, record },
    }
  }

  // 実書き込み: キーが無いと安全に upsert できない（重複作成を防ぐ）。
  if (!keyValue) {
    throw new Error('法人番号（法人番号_13桁_）が空のため転記できません')
  }

  const existingId = await findExistingRecordId(client, mapping, keyValue)
  if (existingId) {
    await client.updateRecord(mapping.appId, existingId, record)
    return {
      sheet: mapping.sheetName,
      plan: { appId: mapping.appId, action: 'update', recordId: existingId, keyValue, record },
    }
  }

  const created = await client.createRecord(mapping.appId, record)
  return {
    sheet: mapping.sheetName,
    plan: { appId: mapping.appId, action: 'create', recordId: created.id, keyValue, record },
  }
}
