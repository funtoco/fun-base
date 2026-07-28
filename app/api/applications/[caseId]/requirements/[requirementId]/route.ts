import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reviewRequirement, type ReviewAction } from '@/lib/portal/documents'

const VALID_ACTIONS: ReviewAction[] = ['approve', 'reject', 'reset']

// PATCH /api/applications/[caseId]/requirements/[requirementId]
// { action: 'approve' | 'reject' (reason必須) | 'reset' }。承認/差戻しは writer のみ。
export async function PATCH(
  request: NextRequest,
  { params }: { params: { caseId: string; requirementId: string } }
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
    const action = body?.action as ReviewAction | undefined
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: '不正な操作です' }, { status: 400 })
    }

    const result = await reviewRequirement({
      caseId: params.caseId,
      requirementId: params.requirementId,
      action,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (error) {
    console.error('Error reviewing requirement:', error)
    return NextResponse.json({ error: 'レビューに失敗しました' }, { status: 500 })
  }
}
