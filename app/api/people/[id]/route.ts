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

    const { employeeNumber, employmentNotificationDate, employmentChangeNotificationDate } = body

    // 入力型バリデーション
    if (employeeNumber !== undefined && employeeNumber !== null && typeof employeeNumber !== 'string') {
      return NextResponse.json({ error: 'employeeNumber must be a string or null' }, { status: 400 })
    }
    if (employmentNotificationDate !== undefined && employmentNotificationDate !== null && typeof employmentNotificationDate !== 'string') {
      return NextResponse.json({ error: 'employmentNotificationDate must be a string or null' }, { status: 400 })
    }
    if (employmentChangeNotificationDate !== undefined && employmentChangeNotificationDate !== null && typeof employmentChangeNotificationDate !== 'string') {
      return NextResponse.json({ error: 'employmentChangeNotificationDate must be a string or null' }, { status: 400 })
    }

    // サーバー側のSupabaseクライアントを使用
    const supabase = await createClient()

    // 更新対象のフィールドを構築
    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (employeeNumber !== undefined) {
      updateFields.employee_number = employeeNumber ? employeeNumber.trim() : null
    }
    if (employmentNotificationDate !== undefined) {
      updateFields.employment_notification_date = employmentNotificationDate || null
    }
    if (employmentChangeNotificationDate !== undefined) {
      updateFields.employment_change_notification_date = employmentChangeNotificationDate || null
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

