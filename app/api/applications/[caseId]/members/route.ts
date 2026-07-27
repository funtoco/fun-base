import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addMember, getCase, getRequirements } from '@/lib/portal/applications'

// POST /api/applications/[caseId]/members — 人材追加 → materialize 再実行 → 更新後の要件を返す
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
    const personId =
      body && typeof body.person_id === 'string' ? body.person_id.trim() : ''
    const visaId =
      body && typeof body.visa_id === 'string' && body.visa_id.trim()
        ? body.visa_id.trim()
        : null

    if (!personId) {
      return NextResponse.json({ error: 'person_id is required' }, { status: 400 })
    }

    try {
      await addMember(params.caseId, personId, visaId)
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === '42501') {
        return NextResponse.json(
          { error: 'この案件に人材を追加する権限がありません' },
          { status: 403 }
        )
      }
      const message = error instanceof Error ? error.message : ''
      if (message.includes('not found or not accessible')) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      // 外部キー違反（people 未存在/越境）などは 400
      if (code === '23503') {
        return NextResponse.json(
          { error: '指定した人材を追加できません' },
          { status: 400 }
        )
      }
      console.error('Error adding member:', error)
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
    }

    const detail = await getCase(params.caseId)
    const requirements = await getRequirements(params.caseId)
    return NextResponse.json({ case: detail, requirements }, { status: 201 })
  } catch (error) {
    console.error('Error adding member:', error)
    return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
  }
}
