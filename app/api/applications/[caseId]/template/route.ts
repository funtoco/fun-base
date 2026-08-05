import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCase } from '@/lib/portal/applications'
import { generateApplicationWorkbook } from '@/lib/portal/template-source'

// GET /api/applications/[caseId]/template
// 案件の事業所名を差し込んだ申請書類作成フォーム（.xlsx）をダウンロードさせる。
// 認可は getCase（RLS=案件アクセス境界）に委ねる。行が返れば閲覧権あり。

export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function GET(
  request: Request,
  { params }: { params: { caseId: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const detail = await getCase(params.caseId)
  if (!detail) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const workbook = await generateApplicationWorkbook(detail)
    return new NextResponse(new Uint8Array(workbook.buffer), {
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(workbook.fileName)}`,
        'Cache-Control': 'no-store',
        // 記入欄(5行)に収まらなかった事業所は企業が手入力する必要がある。UI が拾って知らせる。
        'X-Office-Overflow-Count': String(workbook.overflow.length),
      },
    })
  } catch (error) {
    console.error('Error generating application workbook template:', error)
    return NextResponse.json(
      { error: 'テンプレートの生成に失敗しました' },
      { status: 500 }
    )
  }
}
