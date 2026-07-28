import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { remindCase } from '@/lib/portal/documents'

// POST /api/applications/[caseId]/remind — リマインドを記録（writerのみ）。
// メール送信は未実装（nodemailer 未導入）。将来ここから通知を送る。
export async function POST(
  _request: NextRequest,
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

    const result = await remindCase({ caseId: params.caseId })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (error) {
    console.error('Error reminding case:', error)
    return NextResponse.json({ error: 'リマインドに失敗しました' }, { status: 500 })
  }
}
