import { createClient } from './client'
import type { PersonDocument } from '@/lib/models'

export async function getPersonDocuments(personId: string): Promise<PersonDocument[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('person_documents')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching person documents:', error)
    return []
  }

  return (data || []).map(mapToPersonDocument)
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

function mapToPersonDocument(data: any): PersonDocument {
  return {
    id: data.id,
    personId: data.person_id,
    tenantId: data.tenant_id,
    documentType: data.document_type,
    storagePath: data.storage_path,
    fileName: data.file_name,
    contentType: data.content_type,
    fileSizeBytes: data.file_size_bytes,
    uploadedBy: data.uploaded_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}
