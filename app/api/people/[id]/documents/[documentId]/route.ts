import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { deleteFileFromStorage } from '@/lib/storage/file-uploader'

const BUCKET_NAME = 'person-documents'

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

    // Delete file from storage
    await deleteFileFromStorage(BUCKET_NAME, document.storage_path)

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
