import { OFFICE_BUCKET, getServiceClient } from '../storage'
import type { ActionResult } from '../documents'

// 提出Excel（office_documents の document_code='application_workbook'）を Storage から取得する。
// 呼び出し側で案件アクセスを確認（getCase など）してから使う。ダウンロードは
// サービスロール（RLSバイパス）で行うが、対象は事前に確認済みの1案件の office 書類に限定する。
//
// このモジュールは supabase/next に依存するため、純粋オーケストレータ（transcribe.ts）からは
// import しない（テストがサーバ依存を持ち込まないよう分離する）。

export const APPLICATION_WORKBOOK_CODE = 'application_workbook'

export interface WorkbookSource {
  buffer: Buffer
  fileName: string | null
  officeDocumentId: string
}

/**
 * 指定案件に紐づく提出Excelのバッファを取得する。
 * 未提出（office_document_id 未設定）や書類欠落は ok:false を返す。
 */
export async function loadApplicationWorkbook(
  caseId: string
): Promise<ActionResult<WorkbookSource>> {
  // service-role（RLSバイパス）で取得する。呼び出し側で案件アクセスを確認してから使う
  // 前提のため（getCase / isPortalWriter 済、または Webhook/自動トリガーのシステム実行）。
  const service = getServiceClient()

  // application_workbook 要件（office 書類）を取得。office_document_id があれば提出済み。
  const { data: reqRow, error: reqError } = await service
    .from('case_document_requirements')
    .select('office_document_id')
    .eq('case_id', caseId)
    .eq('scope', 'office')
    .eq('document_code', APPLICATION_WORKBOOK_CODE)
    .maybeSingle()

  if (reqError) {
    console.error('Error loading application_workbook requirement:', reqError)
    return { ok: false, status: 500, error: '提出Excelの確認に失敗しました' }
  }
  const officeDocumentId = (reqRow as { office_document_id: string | null } | null)
    ?.office_document_id
  if (!officeDocumentId) {
    return {
      ok: false,
      status: 404,
      error: '提出Excel（申請書類作成フォーム）がまだアップロードされていません',
    }
  }

  const { data: doc, error: docError } = await service
    .from('office_documents')
    .select('storage_path, file_name')
    .eq('id', officeDocumentId)
    .maybeSingle()

  if (docError || !doc) {
    console.error('Error fetching office_documents for workbook:', docError)
    return { ok: false, status: 404, error: '提出Excelが見つかりません' }
  }

  const storagePath = (doc as { storage_path: string }).storage_path
  const { data: blob, error: downloadError } = await service.storage
    .from(OFFICE_BUCKET)
    .download(storagePath)

  if (downloadError || !blob) {
    console.error('Error downloading workbook from storage:', downloadError)
    return { ok: false, status: 500, error: '提出Excelの取得に失敗しました' }
  }

  const arrayBuffer = await blob.arrayBuffer()
  return {
    ok: true,
    data: {
      buffer: Buffer.from(arrayBuffer),
      fileName: (doc as { file_name: string | null }).file_name ?? null,
      officeDocumentId,
    },
  }
}
