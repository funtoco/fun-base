import { buildRecord } from './build-records'
import { openWorkbook, workbookCellReader } from './excel-reader'
import { APP34_MAPPING } from './mappings/app34'
import { APP36_MAPPING } from './mappings/app36'
import { APP55_MAPPING } from './mappings/app55'
import type { KintoneWriteClient } from './kintone-write-client'
import type { AppMapping, CellReader, KintoneRecordPayload } from './types'

export type TranscribeAction = 'create' | 'update' | 'dry-run' | 'error'

export interface TranscribePlan {
  /** 転記先アプリID（例: '34'）。 */
  appId: string
  /** 実行された/される操作。dryRun のときは 'dry-run'。書込実行が失敗すると 'error'。 */
  action: TranscribeAction
  /** update / 既存ヒット時の kintone レコードID。create 実行時は新規ID。error 時は対象ID。 */
  recordId?: string
  /** upsert キーの値（app34=法人番号）。キー未定/空なら null。 */
  keyValue: string | null
  /** kintone に送る（送った）レコード payload。 */
  record: KintoneRecordPayload
  /** 補足（app55 の upsert キー未定など、実書込できない理由）。 */
  note?: string
  /** action='error' 時のエラーメッセージ。 */
  error?: string
}

/** plan.action → app296 の反映ステータスラベル（app 別に成否を可視化する）。 */
export function syncStatusLabelForAction(
  action: TranscribeAction
): '反映済' | '未反映' | 'エラー' {
  if (action === 'error') {
    return 'エラー'
  }
  if (action === 'dry-run') {
    return '未反映'
  }
  return '反映済'
}

export interface TranscribeResult {
  /** 主となるソースシート名（app34='はじめに'、app55='1-4'）。 */
  sheet: string
  plan: TranscribePlan
}

/** ワークブック単位の転記結果。app55/app36 は payload のみ返し、N件への書込は run-transcription が fan-out する。 */
export interface TranscribeWorkbookResult {
  /** 法人(app34)。案件レベルで1回 update/preview。 */
  app34: TranscribeResult
  /** 雇用条件書(app55)の payload（人固有項目は除外済み・共通項目のみ）。 */
  app55Record: KintoneRecordPayload
  /** app55 の主ソースシート。 */
  app55Sheet: string
  /**
   * 事業所(app36)の payload（所定労働時間数・所定労働日数・年間合計休日日数のみ）。
   * app55 側はこれらが OFID ルックアップのコピー先＝書込ロックのため、コピー元の app36 に書く。
   * Excel に記入が無ければ空オブジェクト（＝書込不要）。
   */
  app36Record: KintoneRecordPayload
}

/**
 * 反映先レコードID（app296「ビザ案件管理」の事前紐付けから解決した値）。
 * Aモデル: 「どのレコードに書くか」は事前紐付けで確定済みなので、照合せず直接 update する。
 * app55 は雇用条件書サブテーブル(複数人)なので targets には含めず、run-transcription が各行へ書く。
 */
export interface TranscribeTargets {
  /** app296 の company_ref（= app34 マスタ_法人 のレコード番号 COID）。 */
  app34RecordId?: string | null
}

/**
 * app55（雇用条件書）の人固有項目。app55 の HRID ルックアップが人材マスタから自動補完するため、
 * 転記からは除外する（複数人へ同一Excelを適用しても氏名/性別が上書きされない）。
 */
export const APP55_PERSON_SPECIFIC_CODES = ['申請人氏名', '性別', '申請人_経験年数']

export interface TranscribeOptions {
  buffer: ArrayBuffer | Buffer | Uint8Array
  /** 既定 true。false かつ client 指定時のみ実書き込みする。 */
  dryRun?: boolean
  /** kintone 書込クライアント（未指定/null なら dryRun 扱い）。 */
  client?: KintoneWriteClient | null
  /**
   * 反映先レコードID（app296 の事前紐付け）。
   * - app34RecordId 指定時: 法人番号照合をスキップし、その ID へ直接 update（Aモデル）。
   * - 未指定時: 従来動作（app34=法人番号upsert）にフォールバック。
   * app55（雇用条件書）は複数人サブテーブルのため targets には含めず、run-transcription が各人へ fan-out。
   */
  targets?: TranscribeTargets
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
 * app34（マスタ_法人）を転記する。
 * - targetRecordId 指定（Aモデル/app296 の company_ref）: 法人番号照合をスキップし、その ID へ直接 update。
 * - targetRecordId 無し（後方互換）: 法人番号で upsert（既存1件→update / 0件→create / 複数→エラー）。
 * - dryRun / client 無し: 書き込みなし。可能なら recordId をプレビューで埋める。
 */
async function transcribeApp34(
  getCell: CellReader,
  dryRun: boolean,
  client: KintoneWriteClient | null,
  targetRecordId: string | null
): Promise<TranscribeResult> {
  const mapping = APP34_MAPPING
  const keyCode = mapping.keyCode as string
  const record = buildRecord(getCell, mapping)
  const keyField = record[keyCode]
  const keyValue =
    keyField && typeof keyField.value !== 'object' ? String(keyField.value) : null
  const sheet = mapping.requiredSheet ?? 'はじめに'

  // dryRun または client 無し → 書き込みしない。可能ならプレビューで recordId を埋める。
  if (dryRun || !client) {
    let recordId: string | undefined
    if (targetRecordId) {
      // Aモデル: 紐付け先IDをそのままプレビュー表示。
      recordId = targetRecordId
    } else if (client && keyValue) {
      const existingId = await findExistingRecordId(client, mapping.appId, keyCode, keyValue)
      recordId = existingId ?? undefined
    }
    return {
      sheet,
      plan: { appId: mapping.appId, action: 'dry-run', recordId, keyValue, record },
    }
  }

  // 実書き込み（Aモデル）: 事前紐付けで確定済みのレコードへ直接 update（照合不要・重複ゼロ）。
  // 書込「実行」の失敗は throw せず error plan で返す（他アプリの成否を巻き添えにしない）。
  if (targetRecordId) {
    try {
      await client.updateRecord(mapping.appId, targetRecordId, record)
      return {
        sheet,
        plan: { appId: mapping.appId, action: 'update', recordId: targetRecordId, keyValue, record },
      }
    } catch (e) {
      return {
        sheet,
        plan: {
          appId: mapping.appId,
          action: 'error',
          recordId: targetRecordId,
          keyValue,
          record,
          error: e instanceof Error ? e.message : String(e),
        },
      }
    }
  }

  // 後方互換: 紐付けが無ければ法人番号で upsert。キーが無いと安全に upsert できない。
  if (!keyValue) {
    throw new Error('法人番号（法人番号_13桁_）が空のため転記できません')
  }
  // findExistingRecordId は重複ヒット時に throw（安全のための転記中止＝write前）。
  const existingId = await findExistingRecordId(client, mapping.appId, keyCode, keyValue)
  try {
    if (existingId) {
      await client.updateRecord(mapping.appId, existingId, record)
      return {
        sheet,
        plan: { appId: mapping.appId, action: 'update', recordId: existingId, keyValue, record },
      }
    }
    const created = await client.createRecord(mapping.appId, record)
    return {
      sheet,
      plan: { appId: mapping.appId, action: 'create', recordId: created.id, keyValue, record },
    }
  } catch (e) {
    return {
      sheet,
      plan: {
        appId: mapping.appId,
        action: 'error',
        recordId: existingId ?? undefined,
        keyValue,
        record,
        error: e instanceof Error ? e.message : String(e),
      },
    }
  }
}

/**
 * app55（雇用条件書）の payload を生成する（人固有項目は除外・共通項目のみ）。
 * 実際の書込は複数人（サブテーブル）へ run-transcription が fan-out する。
 */
export function buildApp55Record(getCell: CellReader): KintoneRecordPayload {
  const record = buildRecord(getCell, APP55_MAPPING)
  for (const code of APP55_PERSON_SPECIFIC_CODES) {
    delete record[code]
  }
  return record
}

/**
 * app36（マスタ_事業所）の payload を生成する（労働時間系のみ）。
 * 実際の書込は案件に紐づく事業所（複数可）へ run-transcription が fan-out する。
 */
export function buildApp36Record(getCell: CellReader): KintoneRecordPayload {
  return buildRecord(getCell, APP36_MAPPING)
}

/**
 * 提出Excel（申請書類作成フォーム）を読み、app34 を転記し、app55 / app36 の payload を返す。
 * app55（雇用条件書）は複数人、app36（事業所マスタ）は複数事業所なので、ここでは payload 生成のみ。
 * 各レコードへの書込は run-transcription が fan-out する。
 */
export async function transcribeWorkbook(
  options: TranscribeOptions
): Promise<TranscribeWorkbookResult> {
  const dryRun = options.dryRun ?? true
  const client = options.client ?? null
  const targets = options.targets ?? {}

  const workbook = await openWorkbook(options.buffer)

  // app34 の必須シート（法人番号のソース）が無ければ安全に中止する。
  const requiredSheet = APP34_MAPPING.requiredSheet ?? 'はじめに'
  if (!workbook.getWorksheet(requiredSheet)) {
    throw new Error(`シート「${requiredSheet}」が見つかりません`)
  }

  const getCell = workbookCellReader(workbook)

  const app34 = await transcribeApp34(getCell, dryRun, client, targets.app34RecordId ?? null)
  const app55Record = buildApp55Record(getCell)
  const app36Record = buildApp36Record(getCell)

  return { app34, app55Record, app55Sheet: '1-4', app36Record }
}
