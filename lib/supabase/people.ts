import { createClient } from './client'
import type { Person } from '@/lib/models'

export async function getPeople(): Promise<Person[]> {
  const supabase = createClient()
  
  console.log('getPeople: Starting query...')
  
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      tenant:tenant_id (id, name)
    `)
    .order('created_at', { ascending: false })
  
  console.log('getPeople: Query result:', { data, error, count: data?.length })
  
  if (error) {
    console.error('Error fetching people:', error)
    throw error
  }
  
  if (!data || data.length === 0) {
    console.log('getPeople: No data found')
    return []
  }
  
  return data.map((person: any) => ({
      id: person.id,
      name: person.name,
      kana: person.kana,
      nationality: person.nationality,
      dob: person.dob,
      specificSkillField: person.specific_skill_field,
      phone: person.phone,
      employeeNumber: person.employee_number,
      workingStatus: person.working_status,
      residenceCardNo: person.residence_card_no,
      residenceCardExpiryDate: person.residence_card_expiry_date,
      residenceCardIssuedDate: person.residence_card_issued_date,
      email: person.email,
      address: person.address,
      tenantName: person.tenant?.name,
      company: person.company,
      note: person.note,
      visaId: person.visa_id,
      externalId: person.external_id,
      imagePath: person.image_path,
      employmentNotificationDate: person.employment_notification_date,
      employmentChangeNotificationDate: person.employment_change_notification_date,
      createdAt: person.created_at,
      updatedAt: person.updated_at
  }))
}

export async function getPersonById(id: string): Promise<Person | null> {
  const supabase = createClient()
  
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
  
  // Get tenant name separately if tenant_id exists
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
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function createPerson(person: Omit<Person, 'createdAt' | 'updatedAt'>): Promise<Person> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('people')
    .insert({
      id: person.id,
      name: person.name,
      kana: person.kana,
      nationality: person.nationality,
      dob: person.dob,
      specific_skill_field: person.specificSkillField,
      phone: person.phone,
      employee_number: person.employeeNumber,
      working_status: person.workingStatus,
      residence_card_no: person.residenceCardNo,
      residence_card_expiry_date: person.residenceCardExpiryDate,
      residence_card_issued_date: person.residenceCardIssuedDate,
      email: person.email,
      address: person.address,
      company: person.company,
      note: person.note,
      visa_id: person.visaId,
      external_id: person.externalId,
      employment_notification_date: person.employmentNotificationDate,
      employment_change_notification_date: person.employmentChangeNotificationDate
    })
    .select(`
      *,
      tenant:tenant_id (id, name)
    `)
    .single()
  
  if (error) {
    console.error('Error creating person:', error)
    throw error
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
    tenantName: data.tenant?.name,
    company: data.company,
    note: data.note,
    visaId: data.visa_id,
    externalId: data.external_id,
    imagePath: data.image_path,
    employmentNotificationDate: data.employment_notification_date,
    employmentChangeNotificationDate: data.employment_change_notification_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function updatePerson(id: string, updates: Partial<Omit<Person, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Person> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('people')
    .update({
      name: updates.name,
      kana: updates.kana,
      nationality: updates.nationality,
      dob: updates.dob,
      specific_skill_field: updates.specificSkillField,
      phone: updates.phone,
      employee_number: updates.employeeNumber,
      working_status: updates.workingStatus,
      residence_card_no: updates.residenceCardNo,
      residence_card_expiry_date: updates.residenceCardExpiryDate,
      residence_card_issued_date: updates.residenceCardIssuedDate,
      email: updates.email,
      address: updates.address,
      company: updates.company,
      note: updates.note,
      visa_id: updates.visaId,
      external_id: updates.externalId,
      employment_notification_date: updates.employmentNotificationDate,
      employment_change_notification_date: updates.employmentChangeNotificationDate
    })
    .eq('id', id)
    .select(`
      *,
      tenant:tenant_id (id, name)
    `)
    .single()
  
  if (error) {
    console.error('Error updating person:', error)
    throw error
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
    tenantName: data.tenant?.name,
    company: data.company,
    note: data.note,
    visaId: data.visa_id,
    externalId: data.external_id,
    imagePath: data.image_path,
    employmentNotificationDate: data.employment_notification_date,
    employmentChangeNotificationDate: data.employment_change_notification_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

export async function getPersonByExternalId(externalId: string): Promise<Person | null> {
  const supabase = createClient()
  
  console.log('Fetching person with external_id:', externalId)
  
  const { data, error } = await supabase
    .from('people')
    .select(`
      *,
      tenant:tenant_id (id, name)
    `)
    .eq('external_id', externalId)
    .limit(1)
    .maybeSingle()

  console.log('Query result:', { data, error })
  
  if (error) {
    console.error('Error fetching person by external_id:', error)
    return null
  }
  
  if (!data) {
    console.log('No person found with external_id:', externalId)
    return null
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
    tenantName: data.tenant?.name,
    company: data.company,
    note: data.note,
    visaId: data.visa_id,
    externalId: data.external_id,
    imagePath: data.image_path,
    employmentNotificationDate: data.employment_notification_date,
    employmentChangeNotificationDate: data.employment_change_notification_date,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
}

// updatePersonByExternalId is deprecated - use KintoneDataSync for data synchronization

export async function deletePerson(id: string): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('people')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting person:', error)
    throw error
  }
}
