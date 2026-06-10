import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { uploadFileToStorage, generateFilePath, deleteFileFromStorage } from '@/lib/storage/file-uploader'
import { normalizeDocumentNote, resolveReplacementDocumentNote } from '@/lib/document-notes'

const VALID_DOCUMENT_TYPES = [
  'passport_front',
  'passport_back',
  'residence_card_front',
  'residence_card_back',
  'coe_copy',
  'flight_ticket_copy',
  'bank_card_copy',
  'resume',
  'designation_document',
  'employment_insurance_notice',
  'other',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const VALID_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const BUCKET_NAME = 'person-documents'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: personId } = params

    if (!personId) {
      return NextResponse.json(
        { error: 'Person ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('person_documents')
      .select('*')
      .eq('person_id', personId)
      .neq('document_type', 'resident_card_copy')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching person documents:', error)
      return NextResponse.json(
        { error: 'Failed to fetch documents' },
        { status: 500 }
      )
    }

    const documents = (data || []).map((row: any) => ({
      id: row.id,
      personId: row.person_id,
      tenantId: row.tenant_id,
      documentType: row.document_type,
      storagePath: row.storage_path,
      title: row.title,
      fileName: row.file_name,
      contentType: row.content_type,
      fileSizeBytes: row.file_size_bytes,
      uploadedBy: row.uploaded_by,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    return NextResponse.json(documents)
  } catch (error) {
    console.error('Error fetching person documents:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch documents' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: personId } = params

    if (!personId) {
      return NextResponse.json(
        { error: 'Person ID is required' },
        { status: 400 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('documentType') as string | null
    const replaceDocumentId = formData.get('replaceDocumentId') as string | null
    const title = formData.get('title') as string | null
    const note = formData.has('note') ? normalizeDocumentNote(formData.get('note')) : undefined

    // Validate file
    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    // Validate document type
    if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
      return NextResponse.json(
        { error: `documentType must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size must be 10MB or less' },
        { status: 400 }
      )
    }

    // Validate content type
    if (!VALID_CONTENT_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type must be one of: ${VALID_CONTENT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get person's tenant_id
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('tenant_id')
      .eq('id', personId)
      .single()

    if (personError || !person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    const tenantId = person.tenant_id
    const allowMultiple = documentType === 'other'
    let documentToReplace: { id: string; storage_path: string; title?: string | null; note?: string | null } | null = null

    if (allowMultiple && !replaceDocumentId && !title?.trim()) {
      return NextResponse.json(
        { error: 'Title is required for other documents' },
        { status: 400 }
      )
    }

    if (replaceDocumentId) {
      const { data: replaceDoc, error: replaceDocError } = await supabase
        .from('person_documents')
        .select('id, storage_path, title, note')
        .eq('id', replaceDocumentId)
        .eq('person_id', personId)
        .eq('document_type', documentType)
        .single()

      if (replaceDocError || !replaceDoc) {
        return NextResponse.json(
          { error: 'Document to replace was not found' },
          { status: 404 }
        )
      }

      documentToReplace = replaceDoc
    } else if (!allowMultiple) {
      // Preserve the existing one-document-per-type behavior for fixed document types.
      const { data: existingDoc } = await supabase
        .from('person_documents')
        .select('id, storage_path, title, note')
        .eq('person_id', personId)
        .eq('document_type', documentType)
        .maybeSingle()

      documentToReplace = existingDoc
    }

    // Upload new file first (before deleting old data to avoid data loss on failure)
    const filePath = generateFilePath(tenantId, personId, documentType, file.name)
    const arrayBuffer = await file.arrayBuffer()
    const contentType = file.type

    const uploadResult = await uploadFileToStorage(BUCKET_NAME, filePath, arrayBuffer, contentType, { upsert: true })

    if (!uploadResult.success) {
      return NextResponse.json(
        { error: uploadResult.error || 'Failed to upload file' },
        { status: 500 }
      )
    }

    if (documentToReplace && !allowMultiple) {
      const storageResult = await deleteFileFromStorage(BUCKET_NAME, documentToReplace.storage_path)
      if (!storageResult.success) {
        console.error('Failed to delete old file from storage:', storageResult.error)
      }

      const { error: deleteError } = await supabase
        .from('person_documents')
        .delete()
        .eq('id', documentToReplace.id)

      if (deleteError) {
        await deleteFileFromStorage(BUCKET_NAME, filePath)
        console.error('Failed to delete old document record:', deleteError)
        return NextResponse.json(
          { error: 'Failed to replace existing document' },
          { status: 500 }
        )
      }
    }

    // Insert new record
    const { data: newDocument, error: insertError } = await supabase
      .from('person_documents')
      .insert({
        person_id: personId,
        tenant_id: tenantId,
        document_type: documentType,
        storage_path: filePath,
        title: title?.trim() || documentToReplace?.title || null,
        file_name: file.name,
        content_type: contentType,
        file_size_bytes: file.size,
        uploaded_by: user.id,
        note: resolveReplacementDocumentNote(note, documentToReplace?.note),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting person document:', insertError)
      // Clean up the uploaded file since DB insert failed
      await deleteFileFromStorage(BUCKET_NAME, filePath)
      return NextResponse.json(
        { error: 'Failed to save document record' },
        { status: 500 }
      )
    }

    if (documentToReplace && allowMultiple) {
      const storageResult = await deleteFileFromStorage(BUCKET_NAME, documentToReplace.storage_path)
      if (!storageResult.success) {
        console.error('Failed to delete old file from storage:', storageResult.error)
      }

      const { error: deleteError } = await supabase
        .from('person_documents')
        .delete()
        .eq('id', documentToReplace.id)

      if (deleteError) {
        console.error('Failed to delete old document record:', deleteError)
      }
    }

    revalidatePath(`/people/${personId}`)

    return NextResponse.json(newDocument, { status: 201 })
  } catch (error) {
    console.error('Error uploading person document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload document' },
      { status: 500 }
    )
  }
}
