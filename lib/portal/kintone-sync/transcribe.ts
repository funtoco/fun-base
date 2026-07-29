import { buildRecord } from './build-records'
import { openWorkbook, workbookCellReader } from './excel-reader'
import { APP34_MAPPING } from './mappings/app34'
import { APP55_MAPPING } from './mappings/app55'
import type { KintoneWriteClient } from './kintone-write-client'
import type { AppMapping, CellReader, KintoneRecordPayload } from './types'

export type TranscribeAction = 'create' | 'update' | 'dry-run'

export interface TranscribePlan {
  /** 転記先アプリID（例: '34'）。 */
  appId: string
  /** 実行された/される操作。dryRun のときは 'dry-run'。 */
  action: TranscribeAction
  /** update / 既存ヒット時の kintone レコードID。create 実行時は新規ID。 */
  recordId?: string
  /** upsert キーの値（app34=法人番号）。キー未定/空なら null。 */
  keyValue: string | null
  /** kintone に送る（送った）レコード payload。 */
  record: KintoneRecordPayload
  /** 補足（app55 の upsert キー未定など、実書込できない理由）。 */
  note?: string
}

export interface TranscribeResult {
  /** 主となるソースシート名（app34='はじめに'、app55='1-4'）。 */
  sheet: string
  plan: TranscribePlan
}

/** app34/app55 の両 plan をまとめたワークブック単位の転記結果。 */
export interface TranscribeWorkbookResult {
  app34: TranscribeResult
  app55: TranscribeResult
  /** app34, app55 の plan 配列（API がそのまま返せる形）。app36 は対象外で含めない。 */
  plans: TranscribePlan[]
}

export interface TranscribeOptions {
  buffer: ArrayBuffer | Buffer | Uint8Array
  /** 既定 true。false かつ client 指定時のみ app34 を実書き込みする（app55 は常に dry-run）。 */
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
  appId: string,
  keyCode: string,
  keyValue: string
): Promise<string | null> {
  const query = `${keyCode} = ${quote(keyValue)}`
  const records = await client.getRecords(appId, query)
  if (records.length > 1) {
    throw new Error(
      `法人番号「${keyValue}」が app${appId} に複数（${records.length}件）存在します。重複のため自動転記を中止しました。`
    )
  }
  return records.length === 1 ? records[0].$id.value : null
}

/**
 * app34（マスタ_法人）を法人番号で upsert する。
 * - dryRun（既定）: 書き込みなし。client があれば getRecords で既存有無をプレビューし recordId を埋める。
 * - dryRun=false かつ client あり: 既存1件→update / 0件→create。複数ヒットはエラー。
 */
async function transcribeApp34(
  getCell: CellReader,
  dryRun: boolean,
  client: KintoneWriteClient | null
): Promise<TranscribeResult> {
  const mapping = APP34_MAPPING
  const keyCode = mapping.keyCode as string
  const record = buildRecord(getCell, mapping)
  const keyField = record[keyCode]
  const keyValue =
    keyField && typeof keyField.value !== 'object' ? String(keyField.value) : null

  // dryRun または client 無し → 書き込みしない。可能ならプレビューで既存IDを埋める。
  if (dryRun || !client) {
    let recordId: string | undefined
    if (client && keyValue) {
      const existingId = await findExistingRecordId(client, mapping.appId, keyCode, keyValue)
      recordId = existingId ?? undefined
    }
    return {
      sheet: mapping.requiredSheet ?? 'はじめに',
      plan: { appId: mapping.appId, action: 'dry-run', recordId, keyValue, record },
    }
  }

  // 実書き込み: キーが無いと安全に upsert できない（重複作成を防ぐ）。
  if (!keyValue) {
    throw new Error('法人番号（法人番号_13桁_）が空のため転記できません')
  }

  const existingId = await findExistingRecordId(client, mapping.appId, keyCode, keyValue)
  if (existingId) {
    await client.updateRecord(mapping.appId, existingId, record)
    return {
      sheet: mapping.requiredSheet ?? 'はじめに',
      plan: { appId: mapping.appId, action: 'update', recordId: existingId, keyValue, record },
    }
  }

  const created = await client.createRecord(mapping.appId, record)
  return {
    sheet: mapping.requiredSheet ?? 'はじめに',
    plan: { appId: mapping.appId, action: 'create', recordId: created.id, keyValue, record },
  }
}

/**
 * app55（雇用条件書）の payload を生成する（ドライラン専用）。
 *
 * TODO: app55 は upsert キーが未定のため、現状は実書き込み未対応（action は常に 'dry-run'）。
 * write メソッドは呼ばない。キー確定後に app34 同様の upsert を実装する。
 */
function transcribeApp55(getCell: CellReader): TranscribeResult {
  const mapping = APP55_MAPPING
  const record = buildRecord(getCell, mapping)
  return {
    sheet: '1-4',
    plan: {
      appId: mapping.appId,
      action: 'dry-run',
      keyValue: null,
      record,
      note: 'app55 は upsert キー未定のため payload 生成（ドライラン）のみ。実書き込みは未対応。',
    },
  }
}

/**
 * 提出Excel（申請書類作成フォーム）を読み、app34 と app55 の転記 plan を返す。
 * app36 は対象外（内定時に別フローで登録済みのため）。
 *
 * - app34: 法人番号で upsert（dryRun=false かつ client ありのときのみ実書き込み）。
 * - app55: payload 生成のみ（upsert キー未定・実書き込み未対応）。常に dry-run。
 */
export async function transcribeWorkbook(
  options: TranscribeOptions
): Promise<TranscribeWorkbookResult> {
  const dryRun = options.dryRun ?? true
  const client = options.client ?? null

  const workbook = await openWorkbook(options.buffer)

  // app34 の必須シート（法人番号のソース）が無ければ安全に中止する。
  const requiredSheet = APP34_MAPPING.requiredSheet ?? 'はじめに'
  if (!workbook.getWorksheet(requiredSheet)) {
    throw new Error(`シート「${requiredSheet}」が見つかりません`)
  }

  const getCell = workbookCellReader(workbook)

  const app34 = await transcribeApp34(getCell, dryRun, client)
  const app55 = transcribeApp55(getCell)

  return { app34, app55, plans: [app34.plan, app55.plan] }
}
