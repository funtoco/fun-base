import type { KintoneWriteClient } from './kintone-write-client'
import type { KintoneRecordPayload } from './types'

// kintone「就労_ビザ案件管理」= 案件マスタ（発生源）。
// このハブが「どのレコードに書くか」を事前紐付け（company_ref / koyou_ref）で保持する。
// 転記はこの紐付けを使って app34 / app55 を直接 update する（Aモデル・照合レス）。
export const CASE_HUB_APP_ID = '296'

/** 雇用条件書サブテーブル(koyou_details)の1行＝1人分の反映先。 */
export interface KoyouTarget {
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
  /** drive_folder_url（その他書類の Drive アップロード先）。未設定なら null。 */
  driveFolderUrl: string | null
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
  for (const row of subRows) {
    const cell = (code: string): unknown => row.value?.[code]?.value
    const app55RecordId = asIdString(cell('koyou_ref'))
    if (!app55RecordId) {
      continue
    }
    koyouTargets.push({
      app55RecordId,
      hrid: asIdString(cell('koyou_hrid')),
      applicantName:
        cell('koyou_applicant_disp') != null && cell('koyou_applicant_disp') !== ''
          ? String(cell('koyou_applicant_disp'))
          : null,
    })
  }

  const driveUrl = field('drive_folder_url')
  return {
    kintoneCaseId,
    app34RecordId: asIdString(field('company_ref')),
    koyouTargets,
    driveFolderUrl:
      driveUrl === undefined || driveUrl === null || driveUrl === ''
        ? null
        : String(driveUrl),
  }
}

/** SUBTABLE の1行（`{ id?, value: { subCode: { value } } }`）。 */
interface SubtableRow {
  id?: string
  value: Record<string, { value: unknown } | undefined>
}

/** 反映ステータスの選択肢（app296 の DROP_DOWN）。 */
export type SyncStatus = '未反映' | '反映済' | 'エラー'

export interface SyncStatusWriteback {
  companyStatus: SyncStatus
  koyouStatus: SyncStatus
  /** ISO 8601（例: 2026-08-03T02:35:00Z）。kintone DATETIME 用。 */
  syncedAt?: string
  /** 反映ログ（成功サマリ or エラー詳細）。 */
  log?: string
}

/**
 * 反映結果を app296（案件ハブ）に書き戻す（sync_*_status / synced_at / sync_log）。
 */
export async function writeBackSyncStatus(
  client: KintoneWriteClient,
  kintoneCaseId: string,
  status: SyncStatusWriteback
): Promise<void> {
  const record: KintoneRecordPayload = {
    sync_company_status: { value: status.companyStatus },
    sync_koyou_status: { value: status.koyouStatus },
  }
  if (status.syncedAt) {
    record.synced_at = { value: status.syncedAt }
  }
  if (status.log !== undefined) {
    record.sync_log = { value: status.log }
  }
  await client.updateRecord(CASE_HUB_APP_ID, kintoneCaseId, record)
}
