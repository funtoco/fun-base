import { getServiceClient } from '../storage'
import { CASE_HUB_APP_ID } from './case-hub'
import type { KintoneWriteClient } from './kintone-write-client'

// Phase6: コメント双方向連携（FunBase case_comments ⇄ kintone app296 レコードコメント）。
// ループ防止は三重: (1) 接頭辞 [FunBase] 判定 (2) (case_id, kintone_comment_id) 一意 (3) source フラグ。

type ServiceClient = ReturnType<typeof getServiceClient>

export const FUNBASE_COMMENT_PREFIX = '[FunBase]'

/** FunBase 投稿を kintone へ出すときの本文（誰の投稿かを接頭辞で明示）。 */
export function buildKintoneCommentText(
  authorLabel: string | null,
  body: string
): string {
  const who = authorLabel ? ` ${authorLabel}` : ''
  return `${FUNBASE_COMMENT_PREFIX}${who}: ${body}`
}

/** 受信時、自分（FunBase）が出したコメントの echo かどうか（ループ防止）。 */
export function isFunbaseOriginText(text: string): boolean {
  return text.trimStart().startsWith(FUNBASE_COMMENT_PREFIX)
}

/** FunBase→kintone: app296 レコードへコメント投稿。返り id を保存に使う。 */
export async function pushCommentToKintone(args: {
  client: KintoneWriteClient
  kintoneRecordId: string
  authorLabel: string | null
  body: string
}): Promise<{ kintoneCommentId: string }> {
  const text = buildKintoneCommentText(args.authorLabel, args.body)
  const res = await args.client.postRecordComment(
    CASE_HUB_APP_ID,
    args.kintoneRecordId,
    text
  )
  return { kintoneCommentId: res.id }
}

/** caseId → app296 レコード番号（未紐付けは null）。 */
export async function resolveKintoneRecordId(
  service: ServiceClient,
  caseId: string
): Promise<string | null> {
  const { data } = await service
    .from('visa_application_cases')
    .select('kintone_record_id')
    .eq('id', caseId)
    .maybeSingle()
  return (
    (data as { kintone_record_id?: string | null } | null)?.kintone_record_id ??
    null
  )
}

export interface CaseKey {
  caseId: string
  tenantId: string
  tenantOfficeId: string
}

/** app296 レコード番号 → 案件キー（case_comments 挿入に必要な3列）。 */
export async function resolveCaseByKintoneRecord(
  service: ServiceClient,
  kintoneRecordId: string
): Promise<CaseKey | null> {
  const { data } = await service
    .from('visa_application_cases')
    .select('id, tenant_id, tenant_office_id')
    .eq('kintone_record_id', kintoneRecordId)
    .maybeSingle()
  if (!data) {
    return null
  }
  const row = data as { id: string; tenant_id: string; tenant_office_id: string }
  return {
    caseId: row.id,
    tenantId: row.tenant_id,
    tenantOfficeId: row.tenant_office_id,
  }
}

export interface KintoneCommentForImport {
  id: string
  text: string
  creatorName: string | null
}

/**
 * kintone→FunBase: レコードコメントを case_comments に取り込む（service-role）。
 * ループ（接頭辞）と重複（同一 kintone_comment_id）はスキップ。
 */
export async function importKintoneComment(args: {
  service: ServiceClient
  caseKey: CaseKey
  comment: KintoneCommentForImport
}): Promise<{ imported: boolean; reason?: 'loop' | 'duplicate' }> {
  if (isFunbaseOriginText(args.comment.text)) {
    return { imported: false, reason: 'loop' }
  }
  const { data: existing } = await args.service
    .from('case_comments')
    .select('id')
    .eq('case_id', args.caseKey.caseId)
    .eq('kintone_comment_id', args.comment.id)
    .maybeSingle()
  if (existing) {
    return { imported: false, reason: 'duplicate' }
  }
  await args.service.from('case_comments').insert({
    case_id: args.caseKey.caseId,
    tenant_id: args.caseKey.tenantId,
    tenant_office_id: args.caseKey.tenantOfficeId,
    author: null,
    body: args.comment.text,
    source: 'kintone',
    kintone_comment_id: args.comment.id,
    kintone_author: args.comment.creatorName,
  })
  return { imported: true }
}
