import { createClient } from './server'
import type { Person } from '@/lib/models'
import {
  applyPeopleAccessFilter,
  canAccessPersonByCompany,
  getCompanyAccessForUser,
} from './people-access'

export async function getPersonById(id: string): Promise<Person | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  let companyAccess
  try {
    companyAccess = await getCompanyAccessForUser(supabase, user.id)
  } catch (error) {
    console.error("Error fetching current user company access:", error)
    return null
  }

  console.log('Fetching person with ID:', id)

  const query = applyPeopleAccessFilter(
    supabase
      .from('people')
      .select('*')
      .eq('id', id),
    companyAccess
  )

  if (!query) {
    return null
  }

  const { data, error } = await query.single()

  console.log('Query result:', { data, error })

  if (error) {
    console.error('Error fetching person:', error)
    return null
  }

  if (!data) {
    console.log('No person found with ID:', id)
    return null
  }

  if (!canAccessPersonByCompany(data, companyAccess)) {
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
    businessCategory: pickString(data, ['business_category', 'work_category', 'specific_skill_business_category']),
    sex: pickString(data, ['sex', 'gender']),
    phone: data.phone,
    employeeNumber: data.employee_number,
    workingStatus: data.working_status,
    residenceCardNo: data.residence_card_no,
    residenceCardExpiryDate: data.residence_card_expiry_date,
    residenceCardIssuedDate: data.residence_card_issued_date,
    email: data.email,
    address: data.address,
    tenantName: tenantName,
    tenantId: data.tenant_id,
    company: data.company,
    note: data.note,
    visaId: data.visa_id,
    externalId: data.external_id,
    imagePath: data.image_path,
    employmentNotificationDate: data.employment_notification_date,
    employmentChangeNotificationDate: data.employment_change_notification_date,
    employmentContractEndDate: pickString(data, ['employment_contract_end_date', 'contract_end_date', 'retirement_support_end_date']),
    retirementDate: pickString(data, ['retirement_date', 'employment_end_date']),
    supportEndDate: pickString(data, ['support_end_date']),
    companyPostalCode: pickString(data, ['company_postal_code', 'corporate_postal_code']),
    companyAddress: pickString(data, ['company_address', 'corporate_address']),
    companyCorporateNumber: pickString(data, ['company_corporate_number', 'corporate_number']),
    companyPhone: pickString(data, ['company_phone', 'corporate_phone', 'company_tel']),
    employmentContractDate: pickString(data, ['employment_contract_date', 'contract_date']),
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

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}
