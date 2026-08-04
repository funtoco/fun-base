import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { uploadRequirementDocument } from '@/lib/portal/documents'
import { maybeAutoTranscribeOnUpload } from '@/lib/portal/kintone-sync/run-transcription'
import { createKintoneWriteClientFromEnv } from '@/lib/portal/kintone-sync/kintone-write-client'
import { mirrorRequirementDocumentToDrive } from '@/lib/portal/drive/mirror'
import { createDriveClientFromEnv } from '@/lib/portal/drive/drive-client'

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

    // 提出Excel（application_workbook）＋案件が app296 と紐付いていれば、アップロード完了後に
    // 自動転記（実書き込み）する。失敗しても提出自体は成功扱い（エラーは app296 に記録）。
    let autoTranscribe: { triggered: boolean; reason?: string } | undefined
    try {
      autoTranscribe = await maybeAutoTranscribeOnUpload({
        caseId: params.caseId,
        requirementId: params.requirementId,
      })
    } catch (autoError) {
      console.error('Auto-transcribe on upload failed:', autoError)
      autoTranscribe = { triggered: false, reason: 'error' }
    }

    // その他書類（application_workbook 以外）は Google Drive の案件フォルダへミラー（ベストエフォート）。
    // application_workbook はミラー側で自動 skip されるので条件分岐は不要。
    let driveMirror: { status: string; reason?: string } | undefined
    try {
      driveMirror = await mirrorRequirementDocumentToDrive({
        caseId: params.caseId,
        requirementId: params.requirementId,
        driveClient: createDriveClientFromEnv(),
        hubClient: createKintoneWriteClientFromEnv(),
      })
    } catch (driveError) {
      console.error('Drive mirror on upload failed:', driveError)
      driveMirror = { status: 'error' }
    }

    return NextResponse.json({ success: true, ...result.data, autoTranscribe, driveMirror })
  } catch (error) {
    console.error('Error uploading requirement document:', error)
    return NextResponse.json(
      { error: 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
