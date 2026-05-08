import { createClient } from '@/lib/supabase/client'
import type { MappingField } from '@/lib/types/mappings'

// Types for field mappings
interface FieldMapping {
  source_field_code: string
  target_field_id: string
  is_required: boolean
  sort_order: number
  is_update_key: boolean
}

/**
 * Get update key field mappings for a specific app mapping
 * @param appMappingId - The app mapping ID
 * @returns Array of field mappings that should be used as update keys
 */
export async function getUpdateKeys(appMappingId: string): Promise<FieldMapping[]> {
  const supabase = createClient()
  
  const { data: fieldMappings, error } = await supabase
    .from('connector_field_mappings')
    .select('source_field_code, target_field_id, is_required, sort_order, is_update_key')
    .eq('app_mapping_id', appMappingId)
    .eq('is_update_key', true)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  
  if (error) {
    console.error('Error fetching update keys:', error)
    // Fallback to default id field mapping
    return [{
      source_field_code: '$id',
      target_field_id: 'id',
      is_required: true,
      sort_order: 0,
      is_update_key: true
    }]
  }
  
  const updateKeys = fieldMappings || []
  
  // If no update keys are configured, fallback to 'id'
  if (updateKeys.length === 0) {
    console.warn('No update keys configured, falling back to "id"')
    return [{
      source_field_code: '$id',
      target_field_id: 'id',
      is_required: true,
      sort_order: 0,
      is_update_key: true
    }]
  }
  
  return updateKeys
}

/**
 * Get update key field mappings for a specific connector and target app type
 * @param connectorId - The connector ID
 * @param targetAppType - The target app type (people, visas, meetings)
 * @param appMappingId - Optional app mapping ID to use directly
 * @returns Array of field mappings that should be used as update keys
 */
export async function getUpdateKeysByConnector(
  connectorId: string, 
  targetAppType: string,
  appMappingId?: string
): Promise<FieldMapping[]> {
  const supabase = createClient()
  
  // If appMappingId is provided, use it directly
  if (appMappingId) {
    return getUpdateKeys(appMappingId)
  }
  
  // Otherwise, get the app mapping for this connector and target type
  const { data: appMappings, error: appError } = await supabase
    .from('connector_app_mappings')
    .select('id')
    .eq('connector_id', connectorId)
    .eq('target_app_type', targetAppType)
    .eq('is_active', true)
  
  if (appError || !appMappings || appMappings.length === 0) {
    console.error('Error fetching app mappings:', appError)
    // Fallback to default id field mapping
    return [{
      source_field_code: '$id',
      target_field_id: 'id',
      is_required: true,
      sort_order: 0,
      is_update_key: true
    }]
  }
  
  // Use the first mapping found
  const appMapping = appMappings[0]
  return getUpdateKeys(appMapping.id)
}

/**
 * Build upsert conflict columns string for Supabase
 * @param updateKeys - Array of field mappings to use as update keys
 * @returns Comma-separated string of conflict columns
 */
export function buildConflictColumns(updateKeys: FieldMapping[]): string {
  return updateKeys.map(fm => fm.target_field_id).join(',')
}

/**
 * Build update condition object for Supabase where clause
 * @param record - The Kintone record containing source field values
 * @param updateKeys - Array of field mappings to use as update keys
 * @param tenantId - The tenant ID to include in the condition
 * @returns Object with update key conditions including tenant_id
 */
export function buildUpdateCondition(
  record: Record<string, any>,
  updateKeys: FieldMapping[],
  tenantId?: string,
  includeTenant: boolean = true
): Record<string, any> {
  const condition: Record<string, any> = {}
  
  // Always include tenant_id in the condition for proper tenant isolation
  if (includeTenant && tenantId) {
    condition.tenant_id = tenantId
  }
  
  for (const fieldMapping of updateKeys) {
    const sourceValue = getKintoneRecordValue(record, fieldMapping.source_field_code)
    const targetKey = fieldMapping.target_field_id
    
    if (sourceValue !== undefined && sourceValue !== null) {
      condition[targetKey] = sourceValue
    }
  }
  
  return condition
}

function getKintoneRecordValue(record: Record<string, any>, sourceFieldCode: string): any {
  if (sourceFieldCode === '$id' || sourceFieldCode === '__ID__') {
    return record.$id?.value ?? record.__ID__?.value
  }

  if (sourceFieldCode === '$revision' || sourceFieldCode === '__REVISION__') {
    return record.$revision?.value ?? record.__REVISION__?.value
  }

  return record[sourceFieldCode]?.value
}
