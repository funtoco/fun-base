import { createClient } from './client'
import type { Visa, VisaStatus } from '@/lib/models'

export interface VisaListResponse {
  visas: Visa[]
  totalCount: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface VisaStatusCounts {
  [key: string]: number
}

const EXCLUDED_VISA_STATUSES = ["内定取消", "内定辞退", "退職"]

const applyVisaStatusExclusions = (query: ReturnType<typeof createClient>["from"]) => {
  return query.not('status', 'in', `(${EXCLUDED_VISA_STATUSES.map((status) => `"${status}"`).join(',')})`)
}

export async function getVisas(): Promise<Visa[]> {
  const supabase = createClient()
  
  const { data, error } = await applyVisaStatusExclusions(
    supabase
    .from('visas')
    .select()
    .order('updated_at', { ascending: false })
  )
  
  if (error) {
    console.error('Error fetching visas:', error)
    throw error
  }
  
  // SupabaseのデータをVisa型に変換
  return data.map(visa => ({
    id: visa.id,
    personId: visa.person_id,
    status: visa.status,
    type: visa.type,
    expiryDate: visa.expiry_date,
    submittedAt: visa.submitted_at,
    resultAt: visa.result_at,
    manager: visa.manager,
    updatedAt: visa.updated_at,
    documentPreparationDate: visa.document_preparation_date,
    documentCreationDate: visa.document_creation_date,
    documentConfirmationDate: visa.document_confirmation_date,
    applicationPreparationDate: visa.application_preparation_date,
    visaApplicationPreparationDate: visa.visa_application_preparation_date,
    applicationDate: visa.application_date,
    additionalDocumentsDate: visa.additional_documents_date,
    visaAcquiredDate: visa.visa_acquired_date,
    receptionNumber: visa.reception_number,
    receptionDate: visa.reception_date,
    receptionApplicationNumber: visa.reception_application_number
  }))
}

export async function getVisaById(id: string): Promise<Visa | null> {
  const supabase = createClient()
  
  const { data, error } = await applyVisaStatusExclusions(
    supabase
    .from('visas')
    .select()
    .eq('id', id)
    .single()
  )
  
  if (error) {
    console.error('Error fetching visa:', error)
    return null
  }
  
  return {
    id: data.id,
    personId: data.person_id,
    status: data.status,
    type: data.type,
    expiryDate: data.expiry_date,
    submittedAt: data.submitted_at,
    resultAt: data.result_at,
    manager: data.manager,
    updatedAt: data.updated_at,
    documentPreparationDate: data.document_preparation_date,
    documentCreationDate: data.document_creation_date,
    documentConfirmationDate: data.document_confirmation_date,
    applicationPreparationDate: data.application_preparation_date,
    visaApplicationPreparationDate: data.visa_application_preparation_date,
    applicationDate: data.application_date,
    additionalDocumentsDate: data.additional_documents_date,
    visaAcquiredDate: data.visa_acquired_date
  }
}

export async function getVisasByPersonId(personId: string): Promise<Visa[]> {
  const supabase = createClient()
  
  const { data, error } = await applyVisaStatusExclusions(
    supabase
    .from('visas')
    .select()
    .eq('person_id', personId)
    .order('updated_at', { ascending: false })
  )
  
  if (error) {
    console.error('Error fetching visas by person ID:', error)
    throw error
  }
  
  return data.map((visa: any) => ({
    id: visa.id,
    personId: visa.person_id,
    status: visa.status,
    type: visa.type,
    expiryDate: visa.expiry_date,
    submittedAt: visa.submitted_at,
    resultAt: visa.result_at,
    manager: visa.manager,
    updatedAt: visa.updated_at,
    documentPreparationDate: visa.document_preparation_date,
    documentCreationDate: visa.document_creation_date,
    documentConfirmationDate: visa.document_confirmation_date,
    applicationPreparationDate: visa.application_preparation_date,
    visaApplicationPreparationDate: visa.visa_application_preparation_date,
    applicationDate: visa.application_date,
    additionalDocumentsDate: visa.additional_documents_date,
    visaAcquiredDate: visa.visa_acquired_date,
    receptionNumber: visa.reception_number,
    receptionDate: visa.reception_date,
    receptionApplicationNumber: visa.reception_application_number
  }))
}

export async function createVisa(visa: Omit<Visa, 'updatedAt'>): Promise<Visa> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('visas')
    .insert({
      id: visa.id,
      person_id: visa.personId,
      status: visa.status,
      type: visa.type,
      expiry_date: visa.expiryDate,
      submitted_at: visa.submittedAt,
      result_at: visa.resultAt,
      manager: visa.manager,
      document_preparation_date: visa.documentPreparationDate,
      document_creation_date: visa.documentCreationDate,
      document_confirmation_date: visa.documentConfirmationDate,
      application_preparation_date: visa.applicationPreparationDate,
      visa_application_preparation_date: visa.visaApplicationPreparationDate,
      application_date: visa.applicationDate,
      additional_documents_date: visa.additionalDocumentsDate,
      visa_acquired_date: visa.visaAcquiredDate,
      reception_number: visa.receptionNumber,
      reception_date: visa.receptionDate,
      reception_application_number: visa.receptionApplicationNumber
    })
    .select()
    .single()
  
  if (error) {
    console.error('Error creating visa:', error)
    throw error
  }
  
  return {
    id: data.id,
    personId: data.person_id,
    status: data.status,
    type: data.type,
    expiryDate: data.expiry_date,
    submittedAt: data.submitted_at,
    resultAt: data.result_at,
    manager: data.manager,
    updatedAt: data.updated_at,
    documentPreparationDate: data.document_preparation_date,
    documentCreationDate: data.document_creation_date,
    documentConfirmationDate: data.document_confirmation_date,
    applicationPreparationDate: data.application_preparation_date,
    visaApplicationPreparationDate: data.visa_application_preparation_date,
    applicationDate: data.application_date,
    additionalDocumentsDate: data.additional_documents_date,
    visaAcquiredDate: data.visa_acquired_date
  }
}

export async function updateVisa(id: string, updates: Partial<Omit<Visa, 'id' | 'updatedAt'>>): Promise<Visa> {
  const supabase = createClient()
  
  const { data, error } = await supabase
    .from('visas')
    .update({
      person_id: updates.personId,
      status: updates.status,
      type: updates.type,
      expiry_date: updates.expiryDate,
      submitted_at: updates.submittedAt,
      result_at: updates.resultAt,
      manager: updates.manager,
      document_preparation_date: updates.documentPreparationDate,
      document_creation_date: updates.documentCreationDate,
      document_confirmation_date: updates.documentConfirmationDate,
      application_preparation_date: updates.applicationPreparationDate,
      visa_application_preparation_date: updates.visaApplicationPreparationDate,
      application_date: updates.applicationDate,
      additional_documents_date: updates.additionalDocumentsDate,
      visa_acquired_date: updates.visaAcquiredDate,
      reception_number: updates.receptionNumber,
      reception_date: updates.receptionDate,
      reception_application_number: updates.receptionApplicationNumber
    })
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    console.error('Error updating visa:', error)
    throw error
  }
  
  return {
    id: data.id,
    personId: data.person_id,
    status: data.status,
    type: data.type,
    expiryDate: data.expiry_date,
    submittedAt: data.submitted_at,
    resultAt: data.result_at,
    manager: data.manager,
    updatedAt: data.updated_at,
    documentPreparationDate: data.document_preparation_date,
    documentCreationDate: data.document_creation_date,
    documentConfirmationDate: data.document_confirmation_date,
    applicationPreparationDate: data.application_preparation_date,
    visaApplicationPreparationDate: data.visa_application_preparation_date,
    applicationDate: data.application_date,
    additionalDocumentsDate: data.additional_documents_date,
    visaAcquiredDate: data.visa_acquired_date
  }
}

export async function deleteVisa(id: string): Promise<void> {
  const supabase = createClient()
  
  const { error } = await supabase
    .from('visas')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting visa:', error)
    throw error
  }
}

export async function getVisaStatusCounts(): Promise<VisaStatusCounts> {
  const supabase = createClient()
  
  const { data, error } = await applyVisaStatusExclusions(
    supabase
    .from('visas')
    .select('status')
  )

  if (error) {
    console.error('Error fetching visa status counts:', error)
    throw error
  }
  
  // Count occurrences of each status
  const counts: VisaStatusCounts = {}
  data.forEach(visa => {
    counts[visa.status] = (counts[visa.status] || 0) + 1
  })
  
  return counts
}

export async function getVisasPaginated(
  status?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<VisaListResponse> {
  const supabase = createClient()
  
  const offset = (page - 1) * pageSize
  
  let query = supabase
    .from('visas')
    .select(`
      *,
      people!inner(
        id,
        name,
        kana,
        nationality,
        tenant_id
      )
    `, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  query = applyVisaStatusExclusions(query)
  
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }
  
  const { data, error, count } = await query
  
  if (error) {
    console.error('Error fetching paginated visas:', error)
    throw error
  }
  
  const visas: (Visa & { person: any })[] = data.map(item => ({
    id: item.id,
    personId: item.person_id,
    status: item.status,
    type: item.type,
    expiryDate: item.expiry_date,
    submittedAt: item.submitted_at,
    resultAt: item.result_at,
    manager: item.manager,
    updatedAt: item.updated_at,
    documentPreparationDate: item.document_preparation_date,
    documentCreationDate: item.document_creation_date,
    documentConfirmationDate: item.document_confirmation_date,
    applicationPreparationDate: item.application_preparation_date,
    visaApplicationPreparationDate: item.visa_application_preparation_date,
    applicationDate: item.application_date,
    additionalDocumentsDate: item.additional_documents_date,
    visaAcquiredDate: item.visa_acquired_date,
    receptionNumber: item.reception_number,
    receptionDate: item.reception_date,
    receptionApplicationNumber: item.reception_application_number,
    // Add person data for display
    person: {
      id: item.people.id,
      name: item.people.name,
      kana: item.people.kana,
      nationality: item.people.nationality,
      tenantId: item.people.tenant_id
    }
  }))
  
  const totalCount = count || 0
  const hasNextPage = offset + pageSize < totalCount
  const hasPrevPage = page > 1
  
  return {
    visas: visas as Visa[],
    totalCount,
    hasNextPage,
    hasPrevPage
  }
}
