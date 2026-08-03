import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCase, isPortalWriter } from '@/lib/portal/applications'
import { loadApplicationWorkbook } from '@/lib/portal/kintone-sync/source'
import { transcribeWorkbook } from '@/lib/portal/kintone-sync/transcribe'
import type { TranscribeTargets } from '@/lib/portal/kintone-sync/transcribe'
import { createKintoneWriteClientFromEnv } from '@/lib/portal/kintone-sync/kintone-write-client'
import { loadCaseHubLinks, writeBackSyncStatus } from '@/lib/portal/kintone-sync/case-hub'

// POST /api/applications/[caseId]/kintone-transcribe
// 提出Excel（申請書類作成フォーム）を読み、kintone app34（マスタ_法人）と app55（雇用条件書）へ
// 転記する（app36 は対象外）。
//
// Aモデル: 反映先は kintone「ビザ案件管理」(app296) の事前紐付け（company_ref / koyou_ref）で確定。
//   クエリ ?kintoneCaseId=<app296レコード番号> を渡すと、そのハブから反映先レコードIDを解決し、
//   照合せず直接 update する（重複ゼロ）。結果は app296 の sync_*_status / synced_at / sync_log に
//   書き戻す。
//
// 既定は dryRun（本番kintoneに書かない）。実書き込みは以下がすべて揃うときのみ:
//   - クエリ ?dryRun=false（明示）
//   - kintone 書込の認証が env に設定済み（KINTONE_BASE_URL + トークン or ユーザー/パス）
//   - 呼び出しユーザーが writer（OP など）
//   - app55 の実書き込みは ?kintoneCaseId 経由で koyou_ref（紐付け先）が解決できたときのみ。
export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  // catch でのエラー書き戻しに使うため try の外で保持。
  let client = createKintoneWriteClientFromEnv()
  let kintoneCaseId: string | null = null
  let requestedRealWrite = false

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 案件アクセス確認（RLS）。返れば閲覧権あり。
    const detail = await getCase(params.caseId)
    if (!detail) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 転記は master への書込を伴うため writer 限定。
    const writer = await isPortalWriter(detail.tenantId)
    if (!writer) {
      return NextResponse.json(
        { error: 'この操作を行う権限がありません' },
        { status: 403 }
      )
    }

    // dryRun 判定（既定 true）。?dryRun=false のときだけ実書き込みを試みる。
    const dryRunParam = request.nextUrl.searchParams.get('dryRun')
    requestedRealWrite = dryRunParam === 'false'
    // ?kintoneCaseId 明示 → 無ければ案件の永続リンク（kintone_record_id）をフォールバック。
    kintoneCaseId =
      request.nextUrl.searchParams.get('kintoneCaseId')?.trim() ||
      detail.kintoneRecordId ||
      null

    // 実書き込み要求なのに認証未設定なら 400（サイレントに書かない）。
    if (requestedRealWrite && !client) {
      return NextResponse.json(
        {
          error:
            'kintone書込の認証が未設定のため実書き込みできません（dryRunのみ可能です）',
        },
        { status: 400 }
      )
    }

    // app296（案件ハブ）から反映先レコードを解決（＝照合レスの肝）。
    // client があり kintoneCaseId 指定時のみ。dryRun でも解決してプレビューに反映する。
    let targets: TranscribeTargets = {}
    let links = null
    if (client && kintoneCaseId) {
      links = await loadCaseHubLinks(client, kintoneCaseId)
      if (!links) {
        return NextResponse.json(
          {
            error: `ビザ案件管理(app296)にレコード「${kintoneCaseId}」が見つかりません`,
          },
          { status: 404 }
        )
      }
      targets = {
        app34RecordId: links.app34RecordId,
        app55RecordId: links.app55RecordId,
      }
    }

    // 提出Excel（application_workbook）を取得。
    const workbook = await loadApplicationWorkbook(params.caseId)
    if (!workbook.ok) {
      return NextResponse.json({ error: workbook.error }, { status: workbook.status })
    }

    const result = await transcribeWorkbook({
      buffer: workbook.data.buffer,
      dryRun: !requestedRealWrite,
      client,
      targets,
    })

    // 実書き込み時のみ、結果を app296 に書き戻す（成功サマリ）。
    if (requestedRealWrite && client && kintoneCaseId) {
      const companyStatus =
        result.app34.plan.action === 'dry-run' ? '未反映' : '反映済'
      const koyouStatus =
        result.app55.plan.action === 'update' ? '反映済' : '未反映'
      await writeBackSyncStatus(client, kintoneCaseId, {
        companyStatus,
        koyouStatus,
        syncedAt: new Date().toISOString(),
        log:
          `法人(app34)=${result.app34.plan.action}/rec ${result.app34.plan.recordId ?? '-'} / ` +
          `雇用条件書(app55)=${result.app55.plan.action}/rec ${result.app55.plan.recordId ?? '-'}`,
      })
    }

    return NextResponse.json({
      success: true,
      dryRun: !requestedRealWrite,
      kintoneCaseId,
      links,
      sourceFileName: workbook.data.fileName,
      plans: result.plans,
      app34: result.app34,
      app55: result.app55,
    })
  } catch (error) {
    console.error('Error transcribing application workbook to kintone:', error)
    const message =
      error instanceof Error ? error.message : 'kintone転記に失敗しました'

    // 実書き込み中の失敗は app296 にエラーを書き戻す（可能なら）。書き戻し失敗は無視。
    if (requestedRealWrite && client && kintoneCaseId) {
      try {
        await writeBackSyncStatus(client, kintoneCaseId, {
          companyStatus: 'エラー',
          koyouStatus: 'エラー',
          syncedAt: new Date().toISOString(),
          log: `エラー: ${message}`,
        })
      } catch (writebackError) {
        console.error('Error writing back sync error to app296:', writebackError)
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
