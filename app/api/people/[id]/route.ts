import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Person } from '@/lib/models'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Person ID is required' },
        { status: 400 }
      )
    }

    const {
      employeeNumber, employmentNotificationDate, employmentChangeNotificationDate,
      interviewDate, jobOfferDate, applicationNumber, departureProcedureStatus,
      entryConfirmedDate, myNumber, joiningDate,
      insuranceNumber, insuranceAcquiredDate, insuranceEnrollmentStatus
    } = body

    // 文字列フィールドのバリデーション
    const stringFields = [
      'employeeNumber', 'employmentNotificationDate', 'employmentChangeNotificationDate',
      'interviewDate', 'jobOfferDate', 'applicationNumber', 'departureProcedureStatus',
      'entryConfirmedDate', 'myNumber', 'joiningDate',
      'insuranceNumber', 'insuranceAcquiredDate'
    ] as const
    for (const field of stringFields) {
      const value = body[field]
      if (value !== undefined && value !== null && typeof value !== 'string') {
        return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 })
      }
    }
    if (insuranceEnrollmentStatus !== undefined && insuranceEnrollmentStatus !== null && typeof insuranceEnrollmentStatus !== 'object') {
      return NextResponse.json({ error: 'insuranceEnrollmentStatus must be an object or null' }, { status: 400 })
    }

    // サーバー側のSupabaseクライアントを使用
    const supabase = await createClient()

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
    for (const [camelKey, snakeKey] of Object.entries(fieldMapping)) {
      const value = body[camelKey]
      if (value !== undefined) {
        updateFields[snakeKey] = (typeof value === 'string' && value.trim()) ? value.trim() : null
      }
    }
    if (insuranceEnrollmentStatus !== undefined) {
      updateFields.insurance_enrollment_status = insuranceEnrollmentStatus || {}
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
      console.error('Error updating person:', error)
      return NextResponse.json(
        { error: 'Failed to update person' },
        { status: 500 }
      )
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

