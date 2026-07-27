import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateNewCase } from '@/lib/portal/case-validation'
import { createCase, listCases } from '@/lib/portal/applications'

// GET /api/applications — アクセス可能な案件一覧（RLS が office 境界に絞る）
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cases = await listCases()
    return NextResponse.json({ cases })
  } catch (error) {
    console.error('Error listing applications:', error)
    return NextResponse.json({ error: 'Failed to list applications' }, { status: 500 })
  }
}

// POST /api/applications — 案件作成 → materialize
export async function POST(request: NextRequest) {
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
    const validation = validateNewCase(body)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    try {
      const caseId = await createCase(validation.value)
      return NextResponse.json({ id: caseId }, { status: 201 })
    } catch (error) {
      // RLS 違反や未認可（office 越境等）は 403 として返す
      const code = (error as { code?: string })?.code
      if (code === '42501') {
        return NextResponse.json(
          { error: 'この事業所で案件を作成する権限がありません' },
          { status: 403 }
        )
      }
      const message = error instanceof Error ? error.message : ''
      if (
        message.includes('not authorized') ||
        message.includes('office not found or not accessible')
      ) {
        return NextResponse.json(
          { error: 'この事業所で案件を作成する権限がありません' },
          { status: 403 }
        )
      }
      console.error('Error creating application:', error)
      return NextResponse.json({ error: 'Failed to create application' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error creating application:', error)
    return NextResponse.json({ error: 'Failed to create application' }, { status: 500 })
  }
}
