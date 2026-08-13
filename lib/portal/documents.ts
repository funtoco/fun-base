import { createClient } from '@/lib/supabase/server'
import type { DocumentKind } from './types'
import {
  OFFICE_BUCKET,
  PERSON_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  buildOfficeObjectKey,
  buildPersonObjectKey,
  getServiceClient,
  validateUploadFile,
} from './storage'

// すべての mutation はサーバAPI経由でここを通す。
// アクセス確認はユーザーセッション（RLS）で行い、確認後の storage 操作・
// 監査イベント追記はサービスロール（RLSバイパス）で行う。

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

type RequirementContext = {
  id: string
  case_id: string
  tenant_id: string
  /** office 書類(office_documents)の格納先事業所＝案件の代表事業所。アクセス境界ではない。 */
  filing_tenant_office_id: string
  scope: 'office' | 'person'
  person_id: string | null
  document_code: string
  name: string
  status: string
  office_document_id: string | null
  person_document_id: string | null
}

/**
 * 案件+要件をユーザーセッション（RLS）で取得する。RLS（portal_can_access_case）が
 * 案件境界に絞るため、行が返れば「この要件へのアクセス権あり」と判断できる。
 */
async function loadRequirementContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string,
  requirementId: string
): Promise<RequirementContext | null> {
  const { data, error } = await supabase
    .from('case_document_requirements')
    .select(
      'id, case_id, tenant_id, filing_tenant_office_id, scope, person_id, document_code, name, status, office_document_id, person_document_id'
    )
    .eq('id', requirementId)
    .eq('case_id', caseId)
    .maybeSingle()

  if (error) {
    console.error('Error loading requirement context:', error)
    return null
  }
  return (data as RequirementContext | null) ?? null
}

/**
 * 会社/企業ユーザーが必要書類を1件アップロードする。
 * office 項目 → office_documents、person 項目 → person_documents に行を作り、
 * 要件を紐付け＋status='reviewing' に更新し、'submitted' イベントを記録する。
 */
export async function uploadRequirementDocument(params: {
  caseId: string
  requirementId: string
  file: File
}): Promise<ActionResult<{ kind: DocumentKind; documentId: string }>> {
  const { caseId, requirementId, file } = params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 401, error: 'ログインが必要です' }
  }

  const validationError = validateUploadFile({ size: file.size, type: file.type })
  if (validationError) {
    return { ok: false, status: 400, error: validationError }
  }

  const requirement = await loadRequirementContext(supabase, caseId, requirementId)
  if (!requirement) {
    return { ok: false, status: 404, error: '対象の書類が見つかりません' }
  }

  const service = getServiceClient()
  const contentType = file.type
  const buffer = Buffer.from(await file.arrayBuffer())

  if (requirement.scope === 'office') {
    const objectKey = buildOfficeObjectKey({
      tenantId: requirement.tenant_id,
      officeId: requirement.filing_tenant_office_id,
      caseId: requirement.case_id,
      requirementId: requirement.id,
      fileName: file.name,
    })

    // 差し替え時に消す旧オブジェクトのパスを控える（office は uq_od_office_code で1件/コード）
    const { data: existingDoc } = await service
      .from('office_documents')
      .select('id, storage_path')
      .eq('tenant_office_id', requirement.filing_tenant_office_id)
      .eq('document_code', requirement.document_code)
      .maybeSingle()

    // 差し替えで同名ファイルを上げ直しても同一パスを上書きできるよう upsert:true。
    const { error: uploadError } = await service.storage
      .from(OFFICE_BUCKET)
      .upload(objectKey, buffer, { contentType, upsert: true })
    if (uploadError) {
      console.error('Office storage upload error:', uploadError)
      return { ok: false, status: 500, error: 'ファイルのアップロードに失敗しました' }
    }

    const { data: upserted, error: upsertError } = await service
      .from('office_documents')
      .upsert(
        {
          ...(existingDoc ? { id: (existingDoc as { id: string }).id } : {}),
          tenant_id: requirement.tenant_id,
          // office_documents は UNIQUE(tenant_office_id, document_code) のまま（列名は据え置き）。
          tenant_office_id: requirement.filing_tenant_office_id,
          document_code: requirement.document_code,
          storage_path: objectKey,
          file_name: file.name,
          content_type: contentType,
          file_size_bytes: file.size,
          uploaded_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_office_id,document_code' }
      )
      .select('id')
      .single()

    if (upsertError || !upserted) {
      await service.storage.from(OFFICE_BUCKET).remove([objectKey])
      console.error('office_documents upsert error:', upsertError)
      return { ok: false, status: 500, error: '書類の保存に失敗しました' }
    }

    const documentId = (upserted as { id: string }).id
    const linkResult = await linkAndSubmit(service, {
      requirementId: requirement.id,
      caseId: requirement.case_id,
      tenantId: requirement.tenant_id,
      column: 'office_document_id',
      documentId,
      actorId: user.id,
    })
    if (!linkResult.ok) {
      await service.storage.from(OFFICE_BUCKET).remove([objectKey])
      return linkResult
    }

    // 旧オブジェクトの掃除（パスが変わった場合のみ）
    const oldPath = existingDoc
      ? (existingDoc as { storage_path: string }).storage_path
      : null
    if (oldPath && oldPath !== objectKey) {
      await service.storage.from(OFFICE_BUCKET).remove([oldPath])
    }

    return { ok: true, data: { kind: 'office', documentId } }
  }

  // scope === 'person'
  if (!requirement.person_id) {
    return { ok: false, status: 400, error: '人材が特定できません' }
  }

  const objectKey = buildPersonObjectKey({
    tenantId: requirement.tenant_id,
    personId: requirement.person_id,
    caseId: requirement.case_id,
    requirementId: requirement.id,
    fileName: file.name,
  })

  // 差し替えで同名ファイルを上げ直しても同一パスを上書きできるよう upsert:true。
  const { error: uploadError } = await service.storage
    .from(PERSON_BUCKET)
    .upload(objectKey, buffer, { contentType, upsert: true })
  if (uploadError) {
    console.error('Person storage upload error:', uploadError)
    return { ok: false, status: 500, error: 'ファイルのアップロードに失敗しました' }
  }

  // 一意制約 UNIQUE(person_id, document_type) WHERE document_type<>'other' を避けるため
  // document_type='other' を使い、ポータル用途は note で区別する。
  const { data: insertedDoc, error: insertError } = await service
    .from('person_documents')
    .insert({
      person_id: requirement.person_id,
      tenant_id: requirement.tenant_id,
      // person_documents.tenant_office_id は変更なし。値だけ案件の代表事業所から取る。
      tenant_office_id: requirement.filing_tenant_office_id,
      document_type: 'other',
      storage_path: objectKey,
      title: requirement.name,
      file_name: file.name,
      content_type: contentType,
      file_size_bytes: file.size,
      uploaded_by: user.id,
      note: `portal:${requirement.document_code}`,
    })
    .select('id')
    .single()

  if (insertError || !insertedDoc) {
    await service.storage.from(PERSON_BUCKET).remove([objectKey])
    console.error('person_documents insert error:', insertError)
    return { ok: false, status: 500, error: '書類の保存に失敗しました' }
  }

  const documentId = (insertedDoc as { id: string }).id
  const linkResult = await linkAndSubmit(service, {
    requirementId: requirement.id,
    caseId: requirement.case_id,
    tenantId: requirement.tenant_id,
    column: 'person_document_id',
    documentId,
    actorId: user.id,
  })
  if (!linkResult.ok) {
    await service.storage.from(PERSON_BUCKET).remove([objectKey])
    await service.from('person_documents').delete().eq('id', documentId)
    return linkResult
  }

  // 旧 person_document（差戻し後の再提出など）を掃除
  const oldDocId = requirement.person_document_id
  if (oldDocId && oldDocId !== documentId) {
    const { data: oldDoc } = await service
      .from('person_documents')
      .select('storage_path')
      .eq('id', oldDocId)
      .maybeSingle()
    const oldPath = (oldDoc as { storage_path: string } | null)?.storage_path
    await service.from('person_documents').delete().eq('id', oldDocId)
    if (oldPath) {
      await service.storage.from(PERSON_BUCKET).remove([oldPath])
    }
  }

  return { ok: true, data: { kind: 'person', documentId } }
}

/** 要件へのドキュメント紐付け＋reviewing 化＋submitted イベント（サービスロール）。 */
async function linkAndSubmit(
  service: ReturnType<typeof getServiceClient>,
  params: {
    requirementId: string
    caseId: string
    tenantId: string
    column: 'office_document_id' | 'person_document_id'
    documentId: string
    actorId: string
  }
): Promise<ActionResult<null>> {
  const { error: updateError } = await service
    .from('case_document_requirements')
    .update({
      [params.column]: params.documentId,
      status: 'reviewing',
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.requirementId)

  if (updateError) {
    console.error('requirement link/update error:', updateError)
    return { ok: false, status: 500, error: '書類の紐付けに失敗しました' }
  }

  const { error: eventError } = await service.from('case_document_events').insert({
    case_id: params.caseId,
    tenant_id: params.tenantId,
    requirement_id: params.requirementId,
    event_type: 'submitted',
    actor: params.actorId,
  })
  if (eventError) {
    // イベントは監査用途。失敗しても致命ではないためログのみ。
    console.error('submitted event insert error:', eventError)
  }

  return { ok: true, data: null }
}

/**
 * アップロード済み書類の署名URL（60分）を返す。
 * この案件の要件に紐づく書類のみが対象で、要件への RLS アクセス確認をもって認可とする。
 */
export async function createRequirementDocumentSignedUrl(params: {
  kind: DocumentKind
  documentId: string
}): Promise<ActionResult<{ url: string }>> {
  const { kind, documentId } = params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 401, error: 'ログインが必要です' }
  }

  const linkColumn =
    kind === 'office' ? 'office_document_id' : 'person_document_id'

  // ユーザーセッション（RLS=案件境界）で「この書類を参照する要件」を確認 → 認可
  const { data: reqRow, error: reqError } = await supabase
    .from('case_document_requirements')
    .select('id')
    .eq(linkColumn, documentId)
    .limit(1)
    .maybeSingle()

  if (reqError) {
    console.error('signed url access check error:', reqError)
    return { ok: false, status: 500, error: 'アクセス確認に失敗しました' }
  }
  if (!reqRow) {
    return { ok: false, status: 404, error: '書類が見つかりません' }
  }

  const service = getServiceClient()
  const table = kind === 'office' ? 'office_documents' : 'person_documents'
  const bucket = kind === 'office' ? OFFICE_BUCKET : PERSON_BUCKET

  const { data: doc, error: docError } = await service
    .from(table)
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle()

  if (docError || !doc) {
    console.error('signed url doc fetch error:', docError)
    return { ok: false, status: 404, error: '書類が見つかりません' }
  }

  const storagePath = (doc as { storage_path: string }).storage_path
  const { data: signed, error: signError } = await service.storage
    .from(bucket)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed) {
    console.error('createSignedUrl error:', signError)
    return { ok: false, status: 500, error: '表示URLの発行に失敗しました' }
  }

  return { ok: true, data: { url: signed.signedUrl } }
}
