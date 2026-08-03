import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateCaseStatus } from '@/lib/portal/applications'
import type { CaseStatus } from '@/lib/portal/types'

// PATCH /api/applications/[caseId]/status
// writer（OP）が案件ステータスを進める入口。Supabase を更新し、app296 紐付けがあれば
// kintone のプロセス管理も前進させる（updateCaseStatus 内）。
const VALID_STATUSES: CaseStatus[] = [
  'draft',
  'collecting',
  'reviewing',
  'ready',
  'synced',
  'completed',
  'archived',
]

export async function PATCH(
  request: NextRequest,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const status = (body as { status?: unknown } | null)?.status
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as CaseStatus)) {
    return NextResponse.json({ error: '不正なステータスです' }, { status: 400 })
  }

  const result = await updateCaseStatus(params.caseId, status as CaseStatus)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus })
  }
  return NextResponse.json({ success: true, status: result.status })
}
