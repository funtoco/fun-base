import { OFFICE_BUCKET, PERSON_BUCKET, getServiceClient } from '../storage'
import { APPLICATION_WORKBOOK_CODE } from '../kintone-sync/source'
import { loadCaseHubLinks } from '../kintone-sync/case-hub'
import type { KintoneWriteClient } from '../kintone-sync/kintone-write-client'
import type { DriveClient } from './drive-client'
import { extractDriveFolderId, buildDriveFileName } from './folder'

// その他書類（application_workbook 以外）を、app296 の drive_folder_url が指す Google Drive
// フォルダへミラーする（ベストエフォート）。Supabase Storage を source of truth のまま、Drive は
// OP の作業コピーとして「追加アップロード」する。失敗しても提出は成功扱い（throw しない）。

export interface DriveMirrorResult {
  status: 'uploaded' | 'skipped' | 'error'
  driveFileId?: string
  reason?: string
}

interface DocFile {
  storagePath: string
  fileName: string | null
  contentType: string | null
  bucket: string
  documentName: string
}

/**
 * 提出書類1件を Drive の案件フォルダへアップロードする。
 * driveClient / kintone紐付け / フォルダURL が無ければ skipped、例外は error（throw しない）。
 */
export async function mirrorRequirementDocumentToDrive(params: {
  caseId: string
  requirementId: string
  driveClient?: DriveClient | null
  hubClient?: KintoneWriteClient | null
}): Promise<DriveMirrorResult> {
  const { driveClient, hubClient } = params
  if (!driveClient) {
    return { status: 'skipped', reason: 'no_drive_auth' }
  }
  if (!hubClient) {
    return { status: 'skipped', reason: 'no_kintone_auth' }
  }

  try {
    const service = getServiceClient()

    // 要件を取得（application_workbook は対象外＝kintone 転記へ回る）。
    const { data: reqData } = await service
      .from('case_document_requirements')
      .select('document_code, name, scope, office_document_id, person_document_id')
      .eq('id', params.requirementId)
      .maybeSingle()
    const req = reqData as {
      document_code: string
      name: string
      scope: string
      office_document_id: string | null
      person_document_id: string | null
    } | null
    if (!req) {
      return { status: 'skipped', reason: 'requirement_not_found' }
    }
    if (req.document_code === APPLICATION_WORKBOOK_CODE) {
      return { status: 'skipped', reason: 'application_workbook' }
    }

    // 実体書類（office / person）を解決。
    const doc = await loadDocFile(service, req)
    if (!doc) {
      return { status: 'skipped', reason: 'no_document' }
    }

    // 案件 → kintone_record_id → app296 の drive_folder_url → フォルダID。
    const { data: caseData } = await service
      .from('visa_application_cases')
      .select('kintone_record_id, title')
      .eq('id', params.caseId)
      .maybeSingle()
    const caseRow = caseData as {
      kintone_record_id: string | null
      title: string | null
    } | null
    const kintoneCaseId = caseRow?.kintone_record_id
    if (!kintoneCaseId) {
      return { status: 'skipped', reason: 'no_kintone_link' }
    }
    const links = await loadCaseHubLinks(hubClient, kintoneCaseId)
    const folderId = extractDriveFolderId(links?.driveFolderUrl)
    if (!folderId) {
      return { status: 'skipped', reason: 'no_drive_folder' }
    }

    // Storage からダウンロード。
    const { data: blob, error: dlError } = await service.storage
      .from(doc.bucket)
      .download(doc.storagePath)
    if (dlError || !blob) {
      return { status: 'error', reason: 'download_failed' }
    }
    const buffer = Buffer.from(await blob.arrayBuffer())

    const name = buildDriveFileName({
      caseTitle: caseRow?.title ?? null,
      documentName: doc.documentName,
      originalFileName: doc.fileName ?? doc.documentName,
    })
    const created = await driveClient.createFile({
      folderId,
      name,
      mimeType: doc.contentType ?? 'application/octet-stream',
      body: buffer,
    })
    return { status: 'uploaded', driveFileId: created.id }
  } catch (error) {
    console.error('Drive mirror failed:', error)
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'unknown',
    }
  }
}

async function loadDocFile(
  service: ReturnType<typeof getServiceClient>,
  req: {
    document_code: string
    name: string
    scope: string
    office_document_id: string | null
    person_document_id: string | null
  }
): Promise<DocFile | null> {
  if (req.scope === 'office' && req.office_document_id) {
    const { data } = await service
      .from('office_documents')
      .select('storage_path, file_name, content_type')
      .eq('id', req.office_document_id)
      .maybeSingle()
    const row = data as {
      storage_path: string
      file_name: string | null
      content_type: string | null
    } | null
    if (!row) return null
    return {
      storagePath: row.storage_path,
      fileName: row.file_name,
      contentType: row.content_type,
      bucket: OFFICE_BUCKET,
      documentName: req.name,
    }
  }
  if (req.scope === 'person' && req.person_document_id) {
    const { data } = await service
      .from('person_documents')
      .select('storage_path, file_name, content_type')
      .eq('id', req.person_document_id)
      .maybeSingle()
    const row = data as {
      storage_path: string
      file_name: string | null
      content_type: string | null
    } | null
    if (!row) return null
    return {
      storagePath: row.storage_path,
      fileName: row.file_name,
      contentType: row.content_type,
      bucket: PERSON_BUCKET,
      documentName: req.name,
    }
  }
  return null
}
