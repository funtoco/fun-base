import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRequirementDocumentSignedUrl } from '@/lib/portal/documents'
import type { DocumentKind } from '@/lib/portal/types'

// GET /api/documents/[kind]/[docId]/url — 署名URL（60分）を返す。kind=office|person
export async function GET(
  _request: NextRequest,
  { params }: { params: { kind: string; docId: string } }
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

    if (params.kind !== 'office' && params.kind !== 'person') {
      return NextResponse.json({ error: '不正な種別です' }, { status: 400 })
    }

    const result = await createRequirementDocumentSignedUrl({
      kind: params.kind as DocumentKind,
      documentId: params.docId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ url: result.data.url })
  } catch (error) {
    console.error('Error creating document signed URL:', error)
    return NextResponse.json({ error: '表示URLの発行に失敗しました' }, { status: 500 })
  }
}
