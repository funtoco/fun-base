import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listCases } from '@/lib/portal/applications'

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
