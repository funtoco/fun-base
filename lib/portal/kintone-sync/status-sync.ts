import { getServiceClient } from '../storage'
import { CASE_HUB_APP_ID } from './case-hub'
import {
  kintoneLabelToCaseStatus,
  caseStatusToKintoneLabel,
  resolveStatusActionPath,
} from './status-map'
import type { KintoneWriteClient } from './kintone-write-client'
import type { CaseStatus } from '../types'

// Phase5: ステータス双方向同期。
// - 受信（kintone→FunBase）: applyKintoneStatusToCase（Supabase 更新のみ・kintone へ再送しない＝ループ防止）
// - 送信（FunBase→kintone）: advanceKintoneCaseStatus（app296 の現状からアクションで前進）

/** app296 のプロセスステータス（STATUS 型）のフィールドコード。 */
export const KINTONE_STATUS_FIELD = 'ステータス'

/** Webhook payload(record) から app296 のステータスラベルを取り出す。 */
export function extractKintoneStatusLabel(
  record: Record<string, { value: unknown }>
): string | null {
  const v = record[KINTONE_STATUS_FIELD]?.value
  return v === undefined || v === null || v === '' ? null : String(v)
}

/**
 * kintone→FunBase（受信）。app296 のステータス変更を Supabase に反映する。
 * ここでは kintone へ push し返さない（ループ防止）。未知ラベルは何もしない。
 */
export async function applyKintoneStatusToCase(
  kintoneCaseId: string,
  statusLabel: string
): Promise<{ updated: boolean; status?: CaseStatus }> {
  const caseStatus = kintoneLabelToCaseStatus(statusLabel)
  if (!caseStatus) {
    return { updated: false }
  }
  const service = getServiceClient()
  await service
    .from('visa_application_cases')
    .update({
      status: caseStatus,
      kintone_sync_status: 'synced',
      kintone_last_synced_at: new Date().toISOString(),
    })
    .eq('kintone_record_id', kintoneCaseId)
  return { updated: true, status: caseStatus }
}

/**
 * FunBase→kintone（送信）。app296 の現ステータスから targetStatus まで
 * プロセスアクションで前進させる（同一/後退/archived は no-op）。
 */
export async function advanceKintoneCaseStatus(
  client: KintoneWriteClient,
  kintoneCaseId: string,
  targetStatus: CaseStatus
): Promise<{ advanced: boolean; actions: string[] }> {
  // archived 等 kintone 非対応の状態は送らない。
  if (!caseStatusToKintoneLabel(targetStatus)) {
    return { advanced: false, actions: [] }
  }
  const records = await client.getRecords(
    CASE_HUB_APP_ID,
    `$id = "${kintoneCaseId}"`
  )
  if (records.length === 0) {
    return { advanced: false, actions: [] }
  }
  const currentLabel = String(records[0][KINTONE_STATUS_FIELD]?.value ?? '')
  const currentStatus = kintoneLabelToCaseStatus(currentLabel)
  if (!currentStatus) {
    return { advanced: false, actions: [] }
  }
  const actions = resolveStatusActionPath(currentStatus, targetStatus)
  for (const action of actions) {
    await client.updateRecordStatus(CASE_HUB_APP_ID, kintoneCaseId, action)
  }
  return { advanced: actions.length > 0, actions }
}
