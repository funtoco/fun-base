import { createClient } from './server'
import type { Visa } from '@/lib/models'

/**
 * Server-side only function to get visas by person ID
 * This uses the server client which has proper authentication context
 */
export async function getVisasByPersonId(personId: string): Promise<Visa[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('visas')
    .select()
    .eq('person_id', personId)
    .order('updated_at', { ascending: false })
  
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

