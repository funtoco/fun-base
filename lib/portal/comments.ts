import { createClient } from '@/lib/supabase/server'
import type { CaseComment } from './types'
import type { ActionResult } from './documents'
import { getServiceClient } from './storage'
import { createKintoneWriteClientFromEnv } from './kintone-sync/kintone-write-client'
import {
  pushCommentToKintone,
  resolveKintoneRecordId,
} from './kintone-sync/comment-sync'

type CommentRow = {
  id: string
  case_id: string
  requirement_id: string | null
  author: string | null
  body: string
  source: 'funbase' | 'kintone'
  kintone_author: string | null
  created_at: string
}

const COMMENT_COLUMNS =
  'id, case_id, requirement_id, author, body, source, kintone_author, created_at'

/**
 * 投稿者 id → 表示ラベル（email）を解決する。auth.users には RLS 経由で触れないため、
 * サービスロールで user_tenants の email を引く（メンバーは必ず行を持つ）。
 */
async function resolveAuthorLabels(
  authorIds: string[]
): Promise<Map<string, string | null>> {
  const labels = new Map<string, string | null>()
  const ids = Array.from(new Set(authorIds.filter(Boolean)))
  if (ids.length === 0) {
    return labels
  }
  const service = getServiceClient()
  const { data, error } = await service
    .from('user_tenants')
    .select('user_id, email')
    .in('user_id', ids)
  if (error) {
    console.error('Error resolving comment author labels:', error)
    return labels
  }
  for (const row of (data || []) as Array<{ user_id: string; email: string | null }>) {
    if (!labels.has(row.user_id)) {
      labels.set(row.user_id, row.email ?? null)
    }
  }
  return labels
}

function mapComment(row: CommentRow, label: string | null): CaseComment {
  return {
    id: row.id,
    caseId: row.case_id,
    requirementId: row.requirement_id,
    authorId: row.author,
    // kintone 由来は kintone_author を表示ラベルに使う。
    authorLabel: row.source === 'kintone' ? row.kintone_author : label,
    body: row.body,
    source: row.source,
    createdAt: row.created_at,
  }
}

/**
 * 案件のコメント一覧（古い順）。RLS が office 境界に絞る。
 */
export async function listComments(caseId: string): Promise<CaseComment[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('case_comments')
    .select(COMMENT_COLUMNS)
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error listing case comments:', error)
    return []
  }

  const rows = (data || []) as CommentRow[]
  const labels = await resolveAuthorLabels(
    rows.map((r) => r.author).filter((a): a is string => Boolean(a))
  )
  return rows.map((r) => mapComment(r, r.author ? labels.get(r.author) ?? null : null))
}

/**
 * 案件にコメントを投稿する。RLS（portal_can_upload + author=auth.uid()）で認可。
 */
export async function addComment(params: {
  caseId: string
  body: string
  requirementId?: string | null
}): Promise<ActionResult<CaseComment>> {
  const body = params.body.trim()
  if (!body) {
    return { ok: false, status: 400, error: 'コメントを入力してください' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 401, error: 'ログインが必要です' }
  }

  const { data: caseRow, error: caseError } = await supabase
    .from('visa_application_cases')
    .select('id, tenant_id, tenant_office_id')
    .eq('id', params.caseId)
    .maybeSingle()

  if (caseError || !caseRow) {
    return { ok: false, status: 404, error: '案件が見つかりません' }
  }
  const c = caseRow as { id: string; tenant_id: string; tenant_office_id: string }

  const { data: inserted, error: insertError } = await supabase
    .from('case_comments')
    .insert({
      case_id: c.id,
      tenant_id: c.tenant_id,
      tenant_office_id: c.tenant_office_id,
      requirement_id: params.requirementId ?? null,
      author: user.id,
      body,
    })
    .select(COMMENT_COLUMNS)
    .single()

  if (insertError || !inserted) {
    console.error('Error inserting case comment:', insertError)
    return { ok: false, status: 500, error: 'コメントの投稿に失敗しました' }
  }

  const labels = await resolveAuthorLabels([user.id])
  const authorLabel = labels.get(user.id) ?? null

  // kintone（app296）へ push（紐付け＋認証があれば・ベストエフォート）。
  // 接頭辞 [FunBase] を付けて出すため、戻ってくる Webhook は取り込み側でループ除外される。
  const insertedRow = inserted as CommentRow
  try {
    const client = createKintoneWriteClientFromEnv()
    if (client) {
      const service = getServiceClient()
      const kintoneRecordId = await resolveKintoneRecordId(service, c.id)
      if (kintoneRecordId) {
        const { kintoneCommentId } = await pushCommentToKintone({
          client,
          kintoneRecordId,
          authorLabel,
          body,
        })
        await service
          .from('case_comments')
          .update({
            kintone_comment_id: kintoneCommentId,
            synced_to_kintone_at: new Date().toISOString(),
          })
          .eq('id', insertedRow.id)
      }
    }
  } catch (pushError) {
    console.error('Error pushing comment to kintone:', pushError)
  }

  return {
    ok: true,
    data: mapComment(insertedRow, authorLabel),
  }
}
