import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addComment, listComments } from '@/lib/portal/comments'

// GET /api/applications/[caseId]/comments — コメント一覧（古い順、RLSでoffice境界に絞る）
export async function GET(
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

    const comments = await listComments(params.caseId)
    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error listing comments:', error)
    return NextResponse.json({ error: 'コメントの取得に失敗しました' }, { status: 500 })
  }
}

// POST /api/applications/[caseId]/comments — コメント投稿
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

    const body = await request.json().catch(() => null)
    const text = typeof body?.body === 'string' ? body.body : ''
    const requirementId =
      typeof body?.requirementId === 'string' ? body.requirementId : null

    const result = await addComment({
      caseId: params.caseId,
      body: text,
      requirementId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, comment: result.data }, { status: 201 })
  } catch (error) {
    console.error('Error posting comment:', error)
    return NextResponse.json({ error: 'コメントの投稿に失敗しました' }, { status: 500 })
  }
}
