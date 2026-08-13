import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCase, isPortalWriter } from '@/lib/portal/applications'
import { createKintoneWriteClientFromEnv } from '@/lib/portal/kintone-sync/kintone-write-client'
import { runCaseTranscription } from '@/lib/portal/kintone-sync/run-transcription'

// POST /api/applications/[caseId]/kintone-transcribe
// 提出Excel（申請書類作成フォーム）を読み、kintone app34（マスタ_法人）・app36（マスタ_事業所）・
// app55（雇用条件書）へ転記する。
//
// Aモデル: 反映先は kintone「ビザ案件管理」(app296) の事前紐付けで確定。
//   ?kintoneCaseId=<app296レコード番号>（無ければ案件の kintone_record_id）から反映先を解決し、
//   照合せず直接 update する（重複ゼロ）。app55（雇用条件書）は koyou_details サブテーブルの
//   各人へ、app36（事業所マスタ）は office_details の各事業所へ同一payloadを fan-out。
//   app36 には所定労働時間数など「app55 では OFID ルックアップのコピー先＝書込ロック」の項目を書く。
//   結果は app296 の sync_*_status / synced_at / sync_log に書き戻す。
//   実書き込みの中核・書き戻し・エラー処理は runCaseTranscription に集約している。
//
// 既定は dryRun（本番kintoneに書かない）。実書き込みは以下がすべて揃うときのみ:
//   - クエリ ?dryRun=false（明示）
//   - kintone 書込の認証が env に設定済み（KINTONE_BASE_URL + トークン or ユーザー/パス）
//   - 呼び出しユーザーが writer（OP など）
export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
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
    const requestedRealWrite = dryRunParam === 'false'
    // ?kintoneCaseId 明示 → 無ければ案件の永続リンク（kintone_record_id）をフォールバック。
    const kintoneCaseId =
      request.nextUrl.searchParams.get('kintoneCaseId')?.trim() ||
      detail.kintoneRecordId ||
      null

    // 実書き込み要求なのに認証未設定なら 400（サイレントに書かない）。
    if (requestedRealWrite && !createKintoneWriteClientFromEnv()) {
      return NextResponse.json(
        {
          error:
            'kintone書込の認証が未設定のため実書き込みできません（dryRunのみ可能です）',
        },
        { status: 400 }
      )
    }

    // 転記の中核（紐付け解決・app34 update・app55 fan-out・app296書き戻し・エラー書き戻し）を委譲。
    const result = await runCaseTranscription({
      caseId: params.caseId,
      kintoneCaseId,
      dryRun: !requestedRealWrite,
    })

    return NextResponse.json({
      success: true,
      dryRun: result.dryRun,
      kintoneCaseId: result.kintoneCaseId,
      links: result.links,
      sourceFileName: result.sourceFileName,
      app34: result.app34,
      app55Record: result.app55Record,
      app55Writes: result.app55Writes,
      app36Record: result.app36Record,
      app36Writes: result.app36Writes,
    })
  } catch (error) {
    console.error('Error transcribing application workbook to kintone:', error)
    const message =
      error instanceof Error ? error.message : 'kintone転記に失敗しました'
    // 案件ハブ(app296)にレコードが無い場合は 404（それ以外は 500）。
    const status = message.startsWith('ビザ案件管理(app296)') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
