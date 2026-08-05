import { getServiceClient } from '../storage'
import { CASE_HUB_APP_ID } from './case-hub'
import {
  buildOfficeDocStatusPayload,
  extractOfficeDocStatuses,
  diffOfficeDocStatuses,
  OFFICE_DOC_STATUS_FIELDS,
} from './office-doc-status'
import type { OfficeDocRequirement } from './office-doc-status'
import type { KintoneWriteClient } from './kintone-write-client'
import type { RequirementStatus } from '../types'

// 事業所書類ステータスの kintone 同期（DB orchestration）。
// 送信: FunBase → app296 の doc_status_* フィールド（初期化・提出時の「確認中」）。
// 受信: app296 → case_document_requirements.status（OP の承認/要修正）。
// kintone を正とするため、受信側は Supabase を更新するだけで kintone へ書き返さない（ループ防止）。
// すべて best-effort。未紐付け・認証未設定は skip し、例外は握って error を返す（throw しない）。

type ServiceClient = ReturnType<typeof getServiceClient>

export interface OfficeDocPushResult {
  status: 'pushed' | 'skipped' | 'error'
  reason?: string
  /** 実際に送ったフィールド数。 */
  fields?: number
}

export interface OfficeDocApplyResult {
  status: 'applied' | 'skipped' | 'error'
  reason?: string
  /** 実際に更新した要件数。 */
  updated?: number
}

/** ステータス変更のうち監査イベントに残すもの（未提出/確認中は残さない）。 */
const EVENT_TYPE_BY_STATUS: Partial<Record<RequirementStatus, string>> = {
  approved: 'approved',
  needs_fix: 'rejected',
}

/** 案件の office 要件を読む。 */
async function loadOfficeRequirements(
  service: ServiceClient,
  caseId: string
): Promise<OfficeDocRequirement[]> {
  const { data } = await service
    .from('case_document_requirements')
    .select('id, document_code, status')
    .eq('case_id', caseId)
    .eq('scope', 'office')
  const rows =
    (data as { id: string; document_code: string; status: RequirementStatus }[] | null) ??
    []
  return rows.map((r) => ({
    id: r.id,
    documentCode: r.document_code,
    status: r.status,
  }))
}

/**
 * FunBase の要件ステータスを app296 の doc_status_* へ書き込む。
 * @param documentCodes 送る書類を限定する（提出時は1件）。未指定は全件。
 * @param skipDocumentCodes kintone 側で既に値が入っている書類（初期化時に OP の入力を上書きしない）。
 */
export async function pushOfficeDocStatuses(params: {
  caseId: string
  kintoneCaseId: string | null
  client: KintoneWriteClient | null
  documentCodes?: string[]
  skipDocumentCodes?: string[]
}): Promise<OfficeDocPushResult> {
  const { caseId, kintoneCaseId, client, documentCodes, skipDocumentCodes } = params
  if (!client) {
    return { status: 'skipped', reason: 'no_kintone_auth' }
  }
  if (!kintoneCaseId) {
    return { status: 'skipped', reason: 'no_kintone_link' }
  }
  // 対象が空と分かっているならDBにもkintoneにも触れない。
  if (documentCodes && documentCodes.length === 0) {
    return { status: 'skipped', reason: 'nothing_to_push' }
  }

  try {
    const service = getServiceClient()
    const requirements = await loadOfficeRequirements(service, caseId)
    const targets = requirements.filter((r) => {
      if (documentCodes && !documentCodes.includes(r.documentCode)) {
        return false
      }
      if (skipDocumentCodes?.includes(r.documentCode)) {
        return false
      }
      return true
    })

    const payload = buildOfficeDocStatusPayload(targets)
    const fields = Object.keys(payload).length
    if (fields === 0) {
      return { status: 'skipped', reason: 'nothing_to_push' }
    }

    await client.updateRecord(CASE_HUB_APP_ID, kintoneCaseId, payload)
    return { status: 'pushed', fields }
  } catch (error) {
    console.error('Office doc status push failed:', error)
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}

/**
 * app296 の doc_status_* を FunBase の要件ステータスへ反映する（受信）。
 * 差分のみ更新するため、FunBase 起因の書き込みで返ってくる Webhook は no-op になる。
 */
export async function applyKintoneOfficeDocStatuses(params: {
  caseId: string
  record: Record<string, { value: unknown } | undefined>
}): Promise<OfficeDocApplyResult> {
  const entries = extractOfficeDocStatuses(params.record)
  if (entries.length === 0) {
    return { status: 'skipped', reason: 'no_status' }
  }

  try {
    const service = getServiceClient()
    const requirements = await loadOfficeRequirements(service, params.caseId)
    const updates = diffOfficeDocStatuses(entries, requirements)
    if (updates.length === 0) {
      return { status: 'skipped', reason: 'no_change' }
    }

    // 監査イベントの tenant_id は NOT NULL のため案件から引く。
    const { data: caseData } = await service
      .from('visa_application_cases')
      .select('tenant_id')
      .eq('id', params.caseId)
      .maybeSingle()
    const tenantId = (caseData as { tenant_id: string } | null)?.tenant_id ?? null

    let updated = 0
    for (const update of updates) {
      const { error } = await service
        .from('case_document_requirements')
        .update({
          status: update.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', update.id)
      if (error) {
        console.error('Office doc status update failed:', error)
        continue
      }
      updated += 1

      const eventType = EVENT_TYPE_BY_STATUS[update.status]
      if (eventType && tenantId) {
        // 監査用。kintone 操作のため actor は null（FunBase ユーザーではない）。
        const { error: eventError } = await service.from('case_document_events').insert({
          case_id: params.caseId,
          tenant_id: tenantId,
          requirement_id: update.id,
          event_type: eventType,
          comment: 'kintone で更新',
        })
        if (eventError) {
          console.error('Office doc status event insert failed:', eventError)
        }
      }
    }

    return { status: 'applied', updated }
  } catch (error) {
    console.error('Office doc status apply failed:', error)
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}

/**
 * 提出された書類1件を app296 の doc_status_* へ反映する（アップロードAPIからの結線用）。
 * 要件から document_code、案件から kintone_record_id を解決して push に委譲する。
 * 対象外の書類（Excel・人材書類）は skip。
 */
export async function pushRequirementStatusToKintone(params: {
  caseId: string
  requirementId: string
  client: KintoneWriteClient | null
}): Promise<OfficeDocPushResult> {
  const { caseId, requirementId, client } = params
  if (!client) {
    return { status: 'skipped', reason: 'no_kintone_auth' }
  }

  try {
    const service = getServiceClient()
    const { data: reqData } = await service
      .from('case_document_requirements')
      .select('document_code, scope')
      .eq('id', requirementId)
      .maybeSingle()
    const req = reqData as { document_code: string; scope: string } | null
    if (!req || req.scope !== 'office') {
      return { status: 'skipped', reason: 'not_office_document' }
    }
    if (!OFFICE_DOC_STATUS_FIELDS[req.document_code]) {
      return { status: 'skipped', reason: 'not_synced_document' }
    }

    const { data: caseData } = await service
      .from('visa_application_cases')
      .select('kintone_record_id')
      .eq('id', caseId)
      .maybeSingle()
    const kintoneCaseId =
      (caseData as { kintone_record_id: string | null } | null)?.kintone_record_id ?? null

    return await pushOfficeDocStatuses({
      caseId,
      kintoneCaseId,
      client,
      documentCodes: [req.document_code],
    })
  } catch (error) {
    console.error('Requirement status push failed:', error)
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}
