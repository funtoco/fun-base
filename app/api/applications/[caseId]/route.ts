import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCase, getRequirements } from '@/lib/portal/applications'

// GET /api/applications/[caseId] — 案件 + 要件（グループ化）+ メンバー
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

    const detail = await getCase(params.caseId)
    if (!detail) {
      // アクセス不可 or 存在しない（RLS が区別しないため 404 で統一）
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const requirements = await getRequirements(params.caseId)
    return NextResponse.json({ case: detail, requirements })
  } catch (error) {
    console.error('Error fetching application:', error)
    return NextResponse.json({ error: 'Failed to fetch application' }, { status: 500 })
  }
}
