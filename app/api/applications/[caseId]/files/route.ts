import { NextRequest, NextResponse } from 'next/server'
import { uploadCaseFiles } from '@/lib/portal/case-files'

// POST /api/applications/[caseId]/files
// multipart/form-data の files[] を受け取り、案件の「その他ファイル」として
// kintone 案件レコードの添付ファイルフィールドへ追記する。
export async function POST(
  request: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'ファイルの受信に失敗しました' },
        { status: 400 }
      )
    }

    const files = formData
      .getAll('files')
      .filter((entry): entry is File => entry instanceof File)

    const result = await uploadCaseFiles({ caseId: params.caseId, files })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true, ...result.data })
  } catch (error) {
    console.error('Error uploading case files:', error)
    return NextResponse.json(
      { error: 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
