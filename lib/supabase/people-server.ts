import { createClient } from './server'
import type { Person } from '@/lib/models'

export async function getPersonById(id: string): Promise<Person | null> {
  const supabase = await createClient()

  console.log('Fetching person with ID:', id)

  const { data, error } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .single()

  console.log('Query result:', { data, error })

  if (error) {
    console.error('Error fetching person:', error)
    return null
  }

  if (!data) {
    console.log('No person found with ID:', id)
    return null
  }

  // Fetch tenant name separately if available
  let tenantName: string | undefined
  if (data.tenant_id) {
    try {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', data.tenant_id)
        .single()
      tenantName = tenantData?.name
    } catch (err) {
      console.error('Error fetching tenant name:', err)
    }
  }

  return {
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
    tenantName: tenantName,
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
}


