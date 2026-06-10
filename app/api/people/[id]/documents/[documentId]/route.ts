import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { deleteFileFromStorage } from '@/lib/storage/file-uploader'
import { normalizeDocumentNote } from '@/lib/document-notes'

const BUCKET_NAME = 'person-documents'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const { id: personId, documentId } = params

    if (!personId || !documentId) {
      return NextResponse.json(
        { error: 'Person ID and Document ID are required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const hasTitle = Object.prototype.hasOwnProperty.call(body, 'title')
    const hasNote = Object.prototype.hasOwnProperty.call(body, 'note')

    if (!hasTitle && !hasNote) {
      return NextResponse.json(
        { error: 'title or note is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: document, error: fetchError } = await supabase
      .from('person_documents')
      .select('id, document_type')
      .eq('id', documentId)
      .eq('person_id', personId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    const updates: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    }

    if (hasTitle) {
      const title = typeof body.title === 'string' ? body.title.trim() : ''

      if (!title) {
        return NextResponse.json(
          { error: 'Title is required' },
          { status: 400 }
        )
      }

      if (document.document_type !== 'other') {
        return NextResponse.json(
          { error: 'Only other documents can be renamed' },
          { status: 400 }
        )
      }

      updates.title = title
    }

    if (hasNote) {
      updates.note = normalizeDocumentNote(body.note)
    }

    const { data, error: updateError } = await supabase
      .from('person_documents')
      .update(updates)
      .eq('id', documentId)
      .eq('person_id', personId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating person document:', updateError)
      return NextResponse.json(
        { error: 'Failed to update document' },
        { status: 500 }
      )
    }

    revalidatePath(`/people/${personId}`)
    revalidatePath('/documents')

    return NextResponse.json({
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
      note: data.note,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    })
  } catch (error) {
    console.error('Error updating person document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const { id: personId, documentId } = params

    if (!personId || !documentId) {
      return NextResponse.json(
        { error: 'Person ID and Document ID are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Query the document and validate it belongs to the person
    const { data: document, error: fetchError } = await supabase
      .from('person_documents')
      .select('*')
      .eq('id', documentId)
      .eq('person_id', personId)
      .single()

    if (fetchError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Validate storage_path has expected tenant prefix
    const { data: person } = await supabase
      .from('people')
      .select('tenant_id')
      .eq('id', personId)
      .single()

    if (person && !document.storage_path.startsWith(`${person.tenant_id}/`)) {
      console.error('Storage path does not match tenant prefix:', document.storage_path)
      return NextResponse.json(
        { error: 'Invalid storage path' },
        { status: 400 }
      )
    }

    // Delete file from storage
    const storageResult = await deleteFileFromStorage(BUCKET_NAME, document.storage_path)
    if (!storageResult.success) {
      console.error('Failed to delete file from storage:', storageResult.error)
      return NextResponse.json(
        { error: 'Failed to delete file from storage' },
        { status: 500 }
      )
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from('person_documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      console.error('Error deleting person document:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      )
    }

    revalidatePath(`/people/${personId}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting person document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete document' },
      { status: 500 }
    )
  }
}
