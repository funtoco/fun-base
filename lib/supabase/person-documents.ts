import { createClient } from './client'
import type { PersonDocument } from '@/lib/models'

const REMOVED_DOCUMENT_TYPE = 'resident_card_copy'
const VALID_DOCUMENT_TYPES = ['passport_front', 'passport_back', 'residence_card_front', 'residence_card_back', 'coe_copy', 'flight_ticket_copy', 'bank_card_copy', 'resume', 'designation_document']

export async function getPersonDocuments(personId: string): Promise<PersonDocument[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('person_documents')
    .select('*')
    .eq('person_id', personId)
    .neq('document_type', REMOVED_DOCUMENT_TYPE)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching person documents:', error)
    return []
  }

  return (data || []).map(mapToPersonDocument)
}

export type PersonDocumentWithPerson = PersonDocument & {
  personName?: string
  personKana?: string
}

export async function getAllPersonDocuments(): Promise<PersonDocumentWithPerson[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('person_documents')
    .select('*, people(name, kana)')
    .neq('document_type', REMOVED_DOCUMENT_TYPE)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching all person documents:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    ...mapToPersonDocument(row),
    personName: row.people?.name,
    personKana: row.people?.kana,
  }))
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('person-documents')
    .createSignedUrl(storagePath, 3600)

  if (error) {
    console.error('Error creating signed URL:', error)
    return null
  }

  return data.signedUrl
}

const VALID_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const BUCKET_NAME = 'person-documents'

export async function uploadDocumentDirect(
  personId: string,
  documentType: string,
  file: File,
  options: { replaceDocumentId?: string | null; title?: string | null } = {}
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_DOCUMENT_TYPES.includes(documentType)) {
    return { success: false, error: '対応していない書類種別です' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'ファイルサイズは10MB以下にしてください' }
  }
  if (!VALID_CONTENT_TYPES.includes(file.type)) {
    return { success: false, error: '対応していないファイル形式です' }
  }

  const supabase = createClient()

  // Get person's tenant_id
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('tenant_id')
    .eq('id', personId)
    .single()

  if (personError || !person) {
    return { success: false, error: '人材情報が見つかりません' }
  }

  const tenantId = person.tenant_id
  const extension = file.name.split('.').pop() || ''
  const timestamp = Date.now()
  const filePath = `${tenantId}/${documentType}/${documentType}_${personId}_${timestamp}.${extension}`
  const allowMultiple = documentType === 'other'
  let documentToReplace: { id: string; storage_path: string; title?: string | null } | null = null

  if (options.replaceDocumentId) {
    const { data: replaceDoc, error: replaceDocError } = await supabase
      .from('person_documents')
      .select('id, storage_path, title')
      .eq('id', options.replaceDocumentId)
      .eq('person_id', personId)
      .eq('document_type', documentType)
      .single()

    if (replaceDocError || !replaceDoc) {
      return { success: false, error: '差し替え対象の書類が見つかりません' }
    }

    documentToReplace = replaceDoc
  } else if (!allowMultiple) {
    // Preserve the existing one-document-per-type behavior for fixed document types.
    const { data: existingDoc } = await supabase
      .from('person_documents')
      .select('id, storage_path, title')
      .eq('person_id', personId)
      .eq('document_type', documentType)
      .maybeSingle()

    documentToReplace = existingDoc
  }

  // Upload file directly to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      contentType: file.type,
      upsert: true,
      cacheControl: '3600',
    })

  if (uploadError) {
    console.error('Storage upload error:', uploadError)
    return { success: false, error: 'ファイルのアップロードに失敗しました' }
  }

  // Delete fixed document types before insert for compatibility with the existing unique constraint.
  if (documentToReplace && !allowMultiple) {
    await supabase.from('person_documents').delete().eq('id', documentToReplace.id)
    await supabase.storage.from(BUCKET_NAME).remove([documentToReplace.storage_path])
  }

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()

  // Insert DB record
  const { error: insertError } = await supabase
    .from('person_documents')
    .insert({
      person_id: personId,
      tenant_id: tenantId,
      document_type: documentType,
      storage_path: filePath,
      title: options.title?.trim() || documentToReplace?.title || null,
      file_name: file.name,
      content_type: file.type,
      file_size_bytes: file.size,
      uploaded_by: user?.id || null,
    })

  if (insertError) {
    // Clean up uploaded file
    await supabase.storage.from(BUCKET_NAME).remove([filePath])
    console.error('DB insert error:', insertError)
    return { success: false, error: 'ドキュメントの保存に失敗しました' }
  }

  if (documentToReplace && allowMultiple) {
    await supabase.from('person_documents').delete().eq('id', documentToReplace.id)
    await supabase.storage.from(BUCKET_NAME).remove([documentToReplace.storage_path])
  }

  return { success: true }
}

function mapToPersonDocument(data: any): PersonDocument {
  return {
    id: data.id,
    personId: data.person_id,
    tenantId: data.tenant_id,
    documentType: data.document_type,
    storagePath: data.storage_path,
    title: data.title,
    fileName: data.file_name,
    contentType: data.content_type,
    fileSizeBytes: data.file_size_bytes,
    uploadedBy: data.uploaded_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
