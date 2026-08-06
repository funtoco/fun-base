import { getServiceClient } from '../storage'
import {
  buildAssigneeMentions,
  extractKintoneAssigneeCodes,
} from './assignee-sync'
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

/**
 * 受信時、自分（FunBase）が出したコメントの echo かどうか（ループ防止）。
 * 宛先（メンション）つきで投稿したコメントは、取得API/Webhook では
 * 「宛先名 + 改行 + 本文」の形で返る（`@` は削除される）ため、先頭行だけでなく
 * 各行の行頭で接頭辞を探す。
 */
export function isFunbaseOriginText(text: string): boolean {
  return text
    .split('\n')
    .some((line) => line.trimStart().startsWith(FUNBASE_COMMENT_PREFIX))
}

/**
 * 作業者キャッシュが空のときに kintone から直接読み直す（ベストエフォート）。
 * Webhook が一度も来ていない既存案件では案件行が空のままのため、ここで取りに行く。
 * 読み取り失敗でコメント投稿ごと落とさない（宛先なしで投稿する）。
 */
async function fetchAssigneeCodes(
  client: KintoneWriteClient,
  kintoneRecordId: string
): Promise<string[]> {
  try {
    const records = await client.getRecords(
      CASE_HUB_APP_ID,
      `$id = "${kintoneRecordId}"`
    )
    if (records.length === 0) {
      return []
    }
    return extractKintoneAssigneeCodes(records[0]) ?? []
  } catch (error) {
    console.error('Error reading kintone assignees for mention:', error)
    return []
  }
}

/**
 * FunBase→kintone: app296 レコードへコメント投稿。返り id を保存に使う。
 * assigneeCodes（app296 プロセス管理の作業者のログイン名）を渡すと、その全員宛の
 * メンションつきで投稿する。kintone は本文中の `@名前` では通知しないため、
 * 宛先は必ず `comment.mentions` で渡す。
 * 空（＝Webhook 未受信でキャッシュが無い）のときだけ kintone を読んで補う。
 */
export async function pushCommentToKintone(args: {
  client: KintoneWriteClient
  kintoneRecordId: string
  authorLabel: string | null
  body: string
  assigneeCodes?: string[]
}): Promise<{ kintoneCommentId: string }> {
  const text = buildKintoneCommentText(args.authorLabel, args.body)
  const codes =
    args.assigneeCodes && args.assigneeCodes.length > 0
      ? args.assigneeCodes
      : await fetchAssigneeCodes(args.client, args.kintoneRecordId)
  const mentions = buildAssigneeMentions(codes)
  const res = await args.client.postRecordComment(
    CASE_HUB_APP_ID,
    args.kintoneRecordId,
    text,
    mentions.length > 0 ? mentions : undefined
  )
  return { kintoneCommentId: res.id }
}

/** コメント投稿先（app296 レコード番号＋メンション宛先の作業者コード）。 */
export interface KintoneCommentTarget {
  kintoneRecordId: string
  /** Webhook 受信時にキャッシュした作業者のログイン名。未同期・未設定なら空。 */
  assigneeCodes: string[]
}

/** caseId → コメント投稿先（未紐付けは null）。 */
export async function resolveKintoneCommentTarget(
  service: ServiceClient,
  caseId: string
): Promise<KintoneCommentTarget | null> {
  const { data } = await service
    .from('visa_application_cases')
    .select('kintone_record_id, kintone_assignee_codes')
    .eq('id', caseId)
    .maybeSingle()
  const row = data as {
    kintone_record_id?: string | null
    kintone_assignee_codes?: string[] | null
  } | null
  if (!row?.kintone_record_id) {
    return null
  }
  return {
    kintoneRecordId: row.kintone_record_id,
    assigneeCodes: row.kintone_assignee_codes ?? [],
  }
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
