import type { KintoneWriteClient } from './kintone-write-client'
import type { KintoneRecordPayload } from './types'

// kintone「就労_ビザ案件管理」= 案件マスタ（発生源）。
// このハブが「どのレコードに書くか」を事前紐付け（company_ref / koyou_ref）で保持する。
// 転記はこの紐付けを使って app34 / app55 を直接 update する（Aモデル・照合レス）。
export const CASE_HUB_APP_ID = '296'

/** 雇用条件書サブテーブル(koyou_details)の1行＝1人分の反映先。 */
export interface KoyouTarget {
  /** サブテーブルの行ID。行単位の反映ステータス(koyou_sync_status)を書き戻すのに使う。 */
  rowId: string | null
  /** koyou_ref（= app55 雇用条件書 レコード番号）。 */
  app55RecordId: string
  /** koyou_hrid（app55 の HRID を自動コピー。FunBase メンバー解決に使う）。 */
  hrid: string | null
  /** koyou_applicant_disp（申請人氏名の自動コピー・表示用）。 */
  applicantName: string | null
}

/** 案件ハブ（app296）1レコードから解決した反映先リンク。 */
export interface CaseHubLinks {
  /** app296 のレコード番号（案件キー）。 */
  kintoneCaseId: string
  /** company_ref（= app34 レコード番号 COID）。未設定なら null。 */
  app34RecordId: string | null
  /** 雇用条件書サブテーブルの各行（複数人分の app55 反映先）。 */
  koyouTargets: KoyouTarget[]
  /**
   * koyou_details の全行ID（フォーム上の並び順）。koyou_ref 未設定の行も含む。
   * サブテーブル更新は「送信した行で置換」なので、書き戻し時にここの全行を送り返す。
   */
  koyouRowIds: string[]
  /** drive_folder_url（その他書類の Drive アップロード先）。未設定なら null。 */
  driveFolderUrl: string | null
  /** company_name_disp（法人ルックアップの自動コピー。Drive のファイル名に使う）。未設定なら null。 */
  companyName: string | null
}

/** kintone クエリの文字列リテラル用エスケープ。 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/** レコードのフィールド値を文字列 or null に正規化する（数値/空/未設定を吸収）。 */
function asIdString(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  return String(value)
}

/**
 * app296 の1レコードを読み、反映先（company_ref / koyou_ref / applicant_ref）を解決する。
 * @returns 見つからなければ null。
 */
export async function loadCaseHubLinks(
  client: KintoneWriteClient,
  kintoneCaseId: string
): Promise<CaseHubLinks | null> {
  const records = await client.getRecords(
    CASE_HUB_APP_ID,
    `$id = ${quote(kintoneCaseId)}`
  )
  if (records.length === 0) {
    return null
  }
  const record = records[0]
  const field = (code: string): unknown =>
    (record[code] as { value: unknown } | undefined)?.value

  // 雇用条件書サブテーブル(koyou_details)を各行→KoyouTargetへ。koyou_ref が無い行は無視。
  const subRows =
    (record['koyou_details'] as { value: SubtableRow[] } | undefined)?.value ?? []
  const koyouTargets: KoyouTarget[] = []
  const koyouRowIds: string[] = []
  for (const row of subRows) {
    const rowId = asIdString(row.id)
    if (rowId) {
      koyouRowIds.push(rowId)
    }
    const cell = (code: string): unknown => row.value?.[code]?.value
    const app55RecordId = asIdString(cell('koyou_ref'))
    if (!app55RecordId) {
      continue
    }
    koyouTargets.push({
      rowId,
      app55RecordId,
      hrid: asIdString(cell('koyou_hrid')),
      applicantName:
        cell('koyou_applicant_disp') != null && cell('koyou_applicant_disp') !== ''
          ? String(cell('koyou_applicant_disp'))
          : null,
    })
  }

  const driveUrl = field('drive_folder_url')
  const companyName = field('company_name_disp')
  return {
    kintoneCaseId,
    app34RecordId: asIdString(field('company_ref')),
    koyouTargets,
    koyouRowIds,
    driveFolderUrl:
      driveUrl === undefined || driveUrl === null || driveUrl === ''
        ? null
        : String(driveUrl),
    companyName:
      companyName === undefined || companyName === null || companyName === ''
        ? null
        : String(companyName),
  }
}

/** SUBTABLE の1行（`{ id?, value: { subCode: { value } } }`）。 */
interface SubtableRow {
  id?: string
  value: Record<string, { value: unknown } | undefined>
}

/** 反映ステータスの選択肢（app296 の DROP_DOWN）。 */
export type SyncStatus = '未反映' | '反映済' | 'エラー'

/** koyou_details 1行分の反映ステータス書き戻し指定。 */
export interface KoyouRowStatus {
  /** サブテーブルの行ID。 */
  rowId: string
  status: SyncStatus
}

export interface SyncStatusWriteback {
  companyStatus: SyncStatus
  /**
   * 雇用条件書の反映ステータス（koyou_details 行単位の koyou_sync_status）。
   * kintone のサブテーブル更新は送信した行での置換なので、**全行分**を渡すこと
   * （渡さなかった行は kintone 側で削除される）。未指定・空なら koyou_details は触らない。
   */
  koyouRows?: KoyouRowStatus[]
  /** ISO 8601（例: 2026-08-03T02:35:00Z）。kintone DATETIME 用。 */
  syncedAt?: string
  /** 反映ログ（成功サマリ or エラー詳細）。 */
  log?: string
}

/**
 * 反映結果を app296（案件ハブ）に書き戻す
 * （sync_company_status / koyou_details[].koyou_sync_status / synced_at / sync_log）。
 */
export async function writeBackSyncStatus(
  client: KintoneWriteClient,
  kintoneCaseId: string,
  status: SyncStatusWriteback
): Promise<void> {
  const record: KintoneRecordPayload = {
    sync_company_status: { value: status.companyStatus },
  }
  // 雇用条件書は複数人（koyou_details サブテーブル）なので、反映ステータスも行ごとに書く。
  // レコード直下の sync_koyou_status はサブテーブル化に伴い kintone 側から廃止済み。
  if (status.koyouRows && status.koyouRows.length > 0) {
    record.koyou_details = {
      value: status.koyouRows.map((row) => ({
        id: row.rowId,
        value: { koyou_sync_status: { value: row.status } },
      })),
    }
  }
  if (status.syncedAt) {
    record.synced_at = { value: status.syncedAt }
  }
  if (status.log !== undefined) {
    record.sync_log = { value: status.log }
  }
  await client.updateRecord(CASE_HUB_APP_ID, kintoneCaseId, record)
}
