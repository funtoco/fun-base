import { createClient } from './server'
import type { PersonDocument } from '@/lib/models'

export async function getPersonDocumentsByPersonId(personId: string): Promise<PersonDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('person_documents')
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching person documents:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    personId: row.person_id,
    tenantId: row.tenant_id,
    documentType: row.document_type,
    storagePath: row.storage_path,
    fileName: row.file_name,
    contentType: row.content_type,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
