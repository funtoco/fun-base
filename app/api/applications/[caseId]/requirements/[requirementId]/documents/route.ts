import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadRequirementDocument } from '@/lib/portal/documents'

// POST /api/applications/[caseId]/requirements/[requirementId]/documents
// multipart/form-data の file を受け取り、要件に紐付けてアップロードする。
export async function POST(
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

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'ファイルの受信に失敗しました' },
        { status: 400 }
      )
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 })
    }

    const result = await uploadRequirementDocument({
      caseId: params.caseId,
      requirementId: params.requirementId,
      file,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (error) {
    console.error('Error uploading requirement document:', error)
    return NextResponse.json(
      { error: 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
