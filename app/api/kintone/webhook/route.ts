import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret, parseVisaCaseWebhook } from '@/lib/portal/kintone-sync/webhook'
import { mirrorCaseFromKintone } from '@/lib/portal/kintone-sync/case-mirror'
import {
  extractKintoneStatusLabel,
  applyKintoneStatusToCase,
} from '@/lib/portal/kintone-sync/status-sync'
import {
  resolveCaseByKintoneRecord,
  importKintoneComment,
} from '@/lib/portal/kintone-sync/comment-sync'
import {
  applyKintoneOfficeDocStatuses,
  pushOfficeDocStatuses,
} from '@/lib/portal/kintone-sync/office-doc-sync'
import { listFilledOfficeDocCodes } from '@/lib/portal/kintone-sync/office-doc-status'
import { createKintoneWriteClientFromEnv } from '@/lib/portal/kintone-sync/kintone-write-client'
import { getServiceClient } from '@/lib/portal/storage'

export const runtime = 'nodejs'

// POST /api/kintone/webhook?secret=...
// kintone「就労_ビザ案件管理」(app296) の Webhook 受信口。
// 共有シークレット(?secret=)を検証し、レコード追加/更新/削除を FunBase 案件へミラーする。
// ステータス変更(UPDATE_STATUS)・コメント(ADD_RECORD_COMMENT)は Phase5/6 で処理（当面は受けて no-op）。
// kintone Webhook はリトライが弱く30sタイムアウトのため、極力軽く 200 を返す。
export async function POST(request: NextRequest) {
  // 共有シークレット検証（URL クエリ）。
  const secret = request.nextUrl.searchParams.get('secret')
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // app296 以外・不正 payload は 200 no-op（kintone のリトライを誘発しない）。
  const event = parseVisaCaseWebhook(payload)
  if (!event) {
    return NextResponse.json({ ok: true, skipped: 'not_target' })
  }

  try {
    switch (event.type) {
      case 'ADD_RECORD':
      case 'UPDATE_RECORD':
      case 'DELETE_RECORD': {
        const result = await mirrorCaseFromKintone(event)
        if (!result.caseId) {
          return NextResponse.json({ ok: true, event: event.type, ...result })
        }
        // 事業所書類ステータス（doc_status_*）: kintone が正。
        // まず OP の変更を FunBase へ反映し、次に kintone 側が空欄の書類だけ初期化する。
        // 初期化で発火する Webhook は2周目に空欄が無くなるため停止する。
        const docStatus = await applyKintoneOfficeDocStatuses({
          caseId: result.caseId,
          record: event.record,
        })
        const docStatusInit = await pushOfficeDocStatuses({
          caseId: result.caseId,
          kintoneCaseId: event.recordId,
          client: createKintoneWriteClientFromEnv(),
          skipDocumentCodes: listFilledOfficeDocCodes(event.record),
        })
        return NextResponse.json({
          ok: true,
          event: event.type,
          ...result,
          docStatus,
          docStatusInit,
        })
      }
      // Phase5: ステータス変更を Supabase に反映（kintone へは再送しない＝ループ防止）。
      case 'UPDATE_STATUS': {
        const label = extractKintoneStatusLabel(event.record)
        if (!label) {
          return NextResponse.json({ ok: true, event: 'UPDATE_STATUS', skipped: 'no_status' })
        }
        const result = await applyKintoneStatusToCase(event.recordId, label)
        return NextResponse.json({ ok: true, event: 'UPDATE_STATUS', ...result })
      }
      // Phase6: kintone レコードコメントを FunBase 案件コメントへ取り込む。
      case 'ADD_RECORD_COMMENT': {
        const raw = event.raw as {
          comment?: { id?: unknown; text?: unknown; creator?: { name?: unknown } }
        }
        const comment = raw.comment
        if (comment?.id == null || comment.text == null) {
          return NextResponse.json({ ok: true, event: 'ADD_RECORD_COMMENT', skipped: 'no_comment' })
        }
        const service = getServiceClient()
        const caseKey = await resolveCaseByKintoneRecord(service, event.recordId)
        if (!caseKey) {
          return NextResponse.json({ ok: true, event: 'ADD_RECORD_COMMENT', skipped: 'case_not_found' })
        }
        const result = await importKintoneComment({
          service,
          caseKey,
          comment: {
            id: String(comment.id),
            text: String(comment.text),
            creatorName: comment.creator?.name != null ? String(comment.creator.name) : null,
          },
        })
        return NextResponse.json({ ok: true, event: 'ADD_RECORD_COMMENT', ...result })
      }
      default:
        return NextResponse.json({ ok: true, skipped: 'unhandled_type' })
    }
  } catch (error) {
    // 失敗をログしつつ 200 を返す（kintone の再送ストームを避ける）。
    console.error('kintone webhook mirror failed:', error)
    const message = error instanceof Error ? error.message : 'mirror failed'
    return NextResponse.json({ ok: false, error: message })
  }
}
