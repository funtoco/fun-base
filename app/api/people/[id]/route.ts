import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Person } from '@/lib/models'
import { getAccessiblePersonIdsForCurrentUser } from '@/lib/supabase/people-access'
import { isManualPersonId } from '@/lib/person-source'
import { deleteFileFromStorage, uploadFileToStorage } from '@/lib/storage/file-uploader'

const PEOPLE_IMAGES_BUCKET = 'people-images'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const VALID_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']

function getRequestValue(body: Record<string, unknown> | FormData, field: string): unknown {
  return body instanceof FormData ? body.get(field) : body[field]
}

function getRequestFile(body: Record<string, unknown> | FormData, field: string): File | null {
  if (!(body instanceof FormData)) return null
  const value = body.get(field)
  return value instanceof File && value.size > 0 ? value : null
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getSafeImageExtension(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension

  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'image/heic') return 'heic'
  if (file.type === 'image/heif') return 'heif'
  return 'bin'
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const contentType = request.headers.get('content-type') || ''
    const body = contentType.includes('multipart/form-data')
      ? await request.formData()
      : await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Person ID is required' },
        { status: 400 }
      )
    }

    // 文字列フィールドのバリデーション
    const baseStringFields = [
      'employeeNumber', 'employmentNotificationDate', 'employmentChangeNotificationDate',
      'interviewDate', 'jobOfferDate', 'applicationNumber', 'departureProcedureStatus',
      'entryConfirmedDate', 'myNumber', 'joiningDate',
      'insuranceNumber', 'insuranceAcquiredDate'
    ] as const
    const manualStringFields = [
      'name', 'kana', 'nationality', 'dob', 'specificSkillField', 'phone',
      'workingStatus', 'residenceCardNo', 'residenceCardExpiryDate',
      'residenceCardIssuedDate', 'email', 'address', 'company', 'note',
    ] as const
    const stringFields = isManualPersonId(id)
      ? [...baseStringFields, ...manualStringFields]
      : [...baseStringFields]
    for (const field of stringFields) {
      const value = getRequestValue(body, field)
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
      }
    }
    const insuranceEnrollmentStatus = getRequestValue(body, 'insuranceEnrollmentStatus')
    if (insuranceEnrollmentStatus !== undefined && insuranceEnrollmentStatus !== null && typeof insuranceEnrollmentStatus !== 'object') {
      return NextResponse.json({ error: 'insuranceEnrollmentStatus must be an object or null' }, { status: 400 })
    }

    // サーバー側のSupabaseクライアントを使用
    const supabase = await createClient()
    const accessiblePersonIds = await getAccessiblePersonIdsForCurrentUser(supabase)

    if (!accessiblePersonIds.includes(id)) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    const { data: currentPerson, error: currentPersonError } = await supabase
      .from('people')
      .select('id, tenant_id, image_path')
      .eq('id', id)
      .single()

    if (currentPersonError || !currentPerson) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    const isManual = isManualPersonId(id)
    const imageFile = getRequestFile(body, 'image')

    if (isManual && getRequestValue(body, 'name') !== undefined && !normalizeString(getRequestValue(body, 'name'))) {
      return NextResponse.json({ error: '氏名は必須です' }, { status: 400 })
    }

    if (imageFile && !isManual) {
      return NextResponse.json(
        { error: 'Kintone連携された人材の写真はこの画面では変更できません' },
        { status: 403 }
      )
    }

    if (imageFile) {
      if (imageFile.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: '写真は5MB以下にしてください' }, { status: 400 })
      }

      if (!VALID_IMAGE_CONTENT_TYPES.includes(imageFile.type)) {
        return NextResponse.json({ error: '写真はPNG、JPEG、WebP、HEIC、HEIF形式で登録してください' }, { status: 400 })
      }
    }

    // 更新対象のフィールドを構築
    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    // 文字列→DB列名マッピング
    const fieldMapping: Record<string, string> = {
      employeeNumber: 'employee_number',
      employmentNotificationDate: 'employment_notification_date',
      employmentChangeNotificationDate: 'employment_change_notification_date',
      interviewDate: 'interview_date',
      jobOfferDate: 'job_offer_date',
      applicationNumber: 'application_number',
      departureProcedureStatus: 'departure_procedure_status',
      entryConfirmedDate: 'entry_confirmed_date',
      myNumber: 'my_number',
      joiningDate: 'joining_date',
      insuranceNumber: 'insurance_number',
      insuranceAcquiredDate: 'insurance_acquired_date',
    }
    const manualFieldMapping: Record<string, string> = {
      name: 'name',
      kana: 'kana',
      nationality: 'nationality',
      dob: 'dob',
      specificSkillField: 'specific_skill_field',
      phone: 'phone',
      workingStatus: 'working_status',
      residenceCardNo: 'residence_card_no',
      residenceCardExpiryDate: 'residence_card_expiry_date',
      residenceCardIssuedDate: 'residence_card_issued_date',
      email: 'email',
      address: 'address',
      company: 'company',
      note: 'note',
    }
    const activeFieldMapping = isManual
      ? { ...fieldMapping, ...manualFieldMapping }
      : fieldMapping
    for (const [camelKey, snakeKey] of Object.entries(activeFieldMapping)) {
      const value = getRequestValue(body, camelKey)
      if (value !== undefined) {
        updateFields[snakeKey] = (typeof value === 'string' && value.trim()) ? value.trim() : null
      }
    }
    if (insuranceEnrollmentStatus !== undefined) {
      updateFields.insurance_enrollment_status = insuranceEnrollmentStatus || {}
    }

    let uploadedImagePath: string | null = null
    if (imageFile) {
      const extension = getSafeImageExtension(imageFile)
      const filePath = `${currentPerson.tenant_id}/manual_people_image/${id}/profile.${extension}`
      const uploadResult = await uploadFileToStorage(
        PEOPLE_IMAGES_BUCKET,
        filePath,
        await imageFile.arrayBuffer(),
        imageFile.type,
        { upsert: true }
      )

      if (!uploadResult.success) {
        return NextResponse.json(
          { error: uploadResult.error || '写真のアップロードに失敗しました' },
          { status: 500 }
        )
      }

      uploadedImagePath = uploadResult.path || filePath
      updateFields.image_path = uploadedImagePath
    }

    // 更新処理
    const { data, error } = await supabase
      .from('people')
      .update(updateFields)
      .eq('id', id)
      .select(`
        *,
        tenant:tenant_id (id, name)
      `)
      .single()

    if (error) {
      if (uploadedImagePath) {
        await deleteFileFromStorage(PEOPLE_IMAGES_BUCKET, uploadedImagePath)
      }
      console.error('Error updating person:', error)
      return NextResponse.json(
        { error: 'Failed to update person' },
        { status: 500 }
      )
    }

    if (uploadedImagePath && currentPerson.image_path && currentPerson.image_path !== uploadedImagePath) {
      const storageResult = await deleteFileFromStorage(PEOPLE_IMAGES_BUCKET, currentPerson.image_path)
      if (!storageResult.success) {
        console.error('Failed to delete old person image:', storageResult.error)
      }
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      )
    }

    // Person型に変換
    const updatedPerson: Person = {
      id: data.id,
      name: data.name,
      kana: data.kana,
      nationality: data.nationality,
      dob: data.dob,
      specificSkillField: data.specific_skill_field,
      phone: data.phone,
      employeeNumber: data.employee_number,
      workingStatus: data.working_status,
      residenceCardNo: data.residence_card_no,
      residenceCardExpiryDate: data.residence_card_expiry_date,
      residenceCardIssuedDate: data.residence_card_issued_date,
      email: data.email,
      address: data.address,
      tenantName: (data.tenant as any)?.name,
      company: data.company,
      note: data.note,
      visaId: data.visa_id,
      externalId: data.external_id,
      imagePath: data.image_path,
      employmentNotificationDate: data.employment_notification_date,
      employmentChangeNotificationDate: data.employment_change_notification_date,
      interviewDate: data.interview_date,
      jobOfferDate: data.job_offer_date,
      applicationNumber: data.application_number,
      departureProcedureStatus: data.departure_procedure_status,
      entryConfirmedDate: data.entry_confirmed_date,
      myNumber: data.my_number,
      joiningDate: data.joining_date,
      insuranceNumber: data.insurance_number,
      insuranceAcquiredDate: data.insurance_acquired_date,
      insuranceEnrollmentStatus: data.insurance_enrollment_status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }

    // Next.jsのキャッシュを無効化して、詳細ページと一覧ページを再検証
    revalidatePath(`/people/${id}`, 'page')
    revalidatePath(`/people/${id}/edit`, 'page')
    revalidatePath('/people', 'page')

    return NextResponse.json({
      success: true,
      person: updatedPerson
    })
  } catch (error) {
    console.error('Error updating person:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update person' },
      { status: 500 }
    )
  }
}
