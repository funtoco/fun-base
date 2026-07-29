import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCase, isPortalWriter } from '@/lib/portal/applications'
import { loadApplicationWorkbook } from '@/lib/portal/kintone-sync/source'
import { transcribeWorkbook } from '@/lib/portal/kintone-sync/transcribe'
import { createKintoneWriteClientFromEnv } from '@/lib/portal/kintone-sync/kintone-write-client'

// POST /api/applications/[caseId]/kintone-transcribe
// 提出Excel（申請書類作成フォーム）を読み、kintone app34（マスタ_法人）と app55（雇用条件書）へ
// 転記する（app36 は対象外）。app34 は法人番号で upsert、app55 は payload 生成（ドライラン）のみ。
//
// 既定は dryRun（本番kintoneに書かない）。app34 の実書き込みは以下がすべて揃うときのみ:
//   - クエリ ?dryRun=false（明示）
//   - kintone 書込の認証が env に設定済み（KINTONE_BASE_URL + トークン or ユーザー/パス）
//   - 呼び出しユーザーが writer（OP など）
// app55 は upsert キー未定のため常にドライラン（実書き込み未対応）。
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

    // 実書き込み要求時のみクライアントを生成。未設定なら 400（サイレントに書かない）。
    let client = null
    if (requestedRealWrite) {
      client = createKintoneWriteClientFromEnv()
      if (!client) {
        return NextResponse.json(
          {
            error:
              'kintone書込の認証が未設定のため実書き込みできません（dryRunのみ可能です）',
          },
          { status: 400 }
        )
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
    })

    return NextResponse.json({
      success: true,
      // app55 は常にドライランのため、実書き込みは app34 のみ（?dryRun=false かつ認証あり）。
      dryRun: !requestedRealWrite,
      sourceFileName: workbook.data.fileName,
      plans: result.plans,
      app34: result.app34,
      app55: result.app55,
    })
  } catch (error) {
    console.error('Error transcribing application workbook to kintone:', error)
    const message =
      error instanceof Error ? error.message : 'kintone転記に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
