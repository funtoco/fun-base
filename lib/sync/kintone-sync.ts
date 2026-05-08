/**
 * Kintone to Supabase data synchronization service
 * Syncs people and visa data from Kintone apps to our database
 */

import { createClient } from '@supabase/supabase-js'
import { KintoneApiClient, type KintoneRecord } from '@/lib/kintone/api-client'
import { getConnector, addLog } from '@/lib/db/connectors'
import { getCredential } from '@/lib/db/connectors'
import { decryptJson } from '@/lib/security/crypto'
// import { loadKintoneClientConfig } from '@/lib/db/credential-loader'
import { SyncLogger, createSyncLogger } from './sync-logger'
import { getUpdateKeysByConnector, buildConflictColumns, buildUpdateCondition } from './update-key-utils'
import { uploadFileToStorage } from '@/lib/storage/file-uploader'
import { getDataMappings, mapFieldValues, type DataMapping } from '@/lib/mappings/value-mapper'
// import { getKintoneMapping, type KintoneMapping } from './mapping-loader'

// Types for field mappings
interface FieldMapping {
  source_field_code: string
  source_field_type?: string
  target_field_id: string
  is_required: boolean
  sort_order: number
}

// Decode MIME Encoded-Word strings in filenames (RFC 2047)
// Supports UTF-8 with Base64 (B) or Quoted-Printable (Q)
function decodeMimeEncodedWord(input: string | undefined | null): string {
  if (!input) return ''
  try {
    const regex = /=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g
    let result = input
    let match: RegExpExecArray | null
    while ((match = regex.exec(input)) !== null) {
      const charset = match[1].toLowerCase()
      const encoding = match[2].toUpperCase()
      const encodedText = match[3]
      let decoded = ''
      if (encoding === 'B') {
        const buff = Buffer.from(encodedText, 'base64')
        decoded = buff.toString('utf8')
      } else {
        // Q-encoding: underscore treated as space; =XX hex bytes
        const q = encodedText.replace(/_/g, ' ')
        decoded = q.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
      }
      // Replace this encoded word in the original string
      result = result.replace(match[0], decoded)
    }
    return result
  } catch {
    return input
  }
}

// Sanitize a filename for Supabase Storage key
// - remove path separators and control chars
// - replace all whitespace (incl. full-width spaces) with single underscore
// - remove characters that storage rejects (# ?)
// - trim and ensure not empty
function sanitizeStorageKey(input: string): string {
  let name = input || ''
  // Normalize Unicode
  name = name.normalize('NFC')
  // Remove path separators
  name = name.replace(/[\\/]/g, '-')
  // Remove control chars
  name = name.replace(/[\u0000-\u001F\u007F]/g, '')
  // Replace full-width spaces and any whitespace runs with underscore
  name = name.replace(/[\u3000\s]+/g, '_')
  // Remove forbidden characters
  name = name.replace(/[?#]/g, '')
  // Trim underscores and dots at ends
  name = name.replace(/^[_\.]+|[_\.]+$/g, '')
  if (!name) name = 'file'
  return name
}

// Encode only the filename (basename) portion with URL-safe Base64, keep extension as-is
function encodeFilenameBase64Url(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  const hasExt = lastDot > 0 && lastDot < filename.length - 1
  const base = hasExt ? filename.slice(0, lastDot) : filename
  const ext = hasExt ? filename.slice(lastDot) : ''
  const b64 = Buffer.from(base, 'utf8').toString('base64')
  // URL-safe: replace +/ with -_ and strip =
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  return `${b64url}${ext}`
}

export function buildPeopleImageStoragePath({
  tenantId,
  recordId,
  fieldCode,
  fileName
}: {
  tenantId?: string | null
  recordId: string
  fieldCode: string
  fileName: string
}): string {
  const tenantScope = sanitizeStorageKey(tenantId || 'global')
  const safeRecordId = sanitizeStorageKey(recordId)
  const safeFieldCode = sanitizeStorageKey(fieldCode)
  const safeFileName = sanitizeStorageKey(encodeFilenameBase64Url(fileName))

  return `${tenantScope}/people_image/${safeRecordId}/${safeFieldCode}/${safeFileName}`
}

interface AppMapping {
  id: string
  source_app_id: string
  target_app_type: string
  target_table?: string
  skip_tenant_filter?: boolean
  omit_tenant_on_write?: boolean
  skip_if_no_update_target: boolean
  field_mappings: FieldMapping[]
}

interface FileFieldProcessResult {
  shouldUpdate: boolean
  path: string | null
}

export function applyFileFieldProcessResult(
  data: Record<string, any>,
  targetFieldId: string,
  result: FileFieldProcessResult
): void {
  if (result.shouldUpdate) {
    data[targetFieldId] = result.path
  }
}

export function shouldSkipMissingUpdateTarget(
  targetAppType: string,
  skipIfNoUpdateTarget: boolean
): boolean {
  return skipIfNoUpdateTarget || targetAppType === 'people_image'
}

export interface KintoneSyncOptions {
  recordId?: string
  recordIdFrom?: string
  recordIdTo?: string
}

function assertKintoneRecordId(value: string, label: string): string {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${label}: Kintone record id must be numeric`)
  }
  return trimmed
}

export function buildRecordIdQuery(options: KintoneSyncOptions = {}): string {
  if (options.recordId) {
    return `$id = ${assertKintoneRecordId(options.recordId, 'recordId')}`
  }

  const conditions: string[] = []
  if (options.recordIdFrom) {
    conditions.push(`$id >= ${assertKintoneRecordId(options.recordIdFrom, 'recordIdFrom')}`)
  }
  if (options.recordIdTo) {
    conditions.push(`$id <= ${assertKintoneRecordId(options.recordIdTo, 'recordIdTo')}`)
  }

  return conditions.join(' and ')
}

export function combineKintoneQueries(...queries: Array<string | null | undefined>): string {
  return queries
    .map((query) => query?.trim())
    .filter((query): query is string => !!query)
    .join(' and ')
}

/**
 * Process FILE type field - download from Kintone and upload to Supabase Storage
 */
async function processFileField(
  kintoneClient: KintoneApiClient,
  record: KintoneRecord,
  fieldMapping: FieldMapping,
  tenantId: string
): Promise<FileFieldProcessResult> {
  try {
    const sourceValue = record[fieldMapping.source_field_code]?.value
    
    if (!sourceValue || !Array.isArray(sourceValue) || sourceValue.length === 0) {
      console.log(`[file] no-data field=%s`, fieldMapping.source_field_code)
      return { shouldUpdate: true, path: null }
    }

    // Get the first file (Kintone FILE fields can have multiple files)
    const fileInfo = sourceValue[0]
    if (!fileInfo || !fileInfo.fileKey) {
      console.log(`[file] no-key field=%s`, fieldMapping.source_field_code)
      return { shouldUpdate: false, path: null }
    }

    // Download file from Kintone
    const fileData = await kintoneClient.downloadFile(fileInfo.fileKey)
    
    // Use the original filename (decode MIME Encoded-Word if necessary)
    const decodedName = decodeMimeEncodedWord(fileData.fileName) || fileData.fileName
    const recordIdValue = record.$id?.value
    if (recordIdValue === undefined || recordIdValue === null) {
      console.log(`[file] no-record-id field=%s`, fieldMapping.source_field_code)
      return { shouldUpdate: false, path: null }
    }

    const filePath = buildPeopleImageStoragePath({
      tenantId,
      recordId: String(recordIdValue),
      fieldCode: fieldMapping.source_field_code,
      fileName: decodedName
    })

    // Upload to Supabase Storage
    const uploadResult = await uploadFileToStorage(
      'people-images', // Use the configured bucket
      filePath,
      fileData.data,
      fileData.contentType,
      { upsert: true }
    )

    if (!uploadResult.success) {
      console.error(`[file] upload-failed field=%s path=%s err=%s`, fieldMapping.source_field_code, filePath, uploadResult.error)
      return { shouldUpdate: false, path: null }
    }

    console.log(`[file] uploaded field=%s path=%s`, fieldMapping.source_field_code, uploadResult.path || filePath)
    return { shouldUpdate: true, path: uploadResult.path || null }

  } catch (error) {
    console.error(`[file] error field=%s err=%o`, fieldMapping.source_field_code, error)
    return { shouldUpdate: false, path: null }
  }
}

/**
 * Get field mappings from database for a specific app mapping
 */
async function getFieldMappings(
  supabase: any,
  appMappingId: string
): Promise<FieldMapping[]> {
  const { data, error } = await supabase
    .from('connector_field_mappings')
    .select('source_field_code, source_field_type, target_field_id, is_required, sort_order')
    .eq('app_mapping_id', appMappingId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Error fetching field mappings:', error)
    return []
  }

  return data || []
}

/**
 * Get app mapping configurations from database
 */
async function getAppMappings(
  supabase: any,
  connectorId: string,
  targetAppType: string
): Promise<AppMapping[]> {
  const { data, error } = await supabase
    .from('connector_app_mappings')
    .select('id, source_app_id, target_app_type, target_table, skip_tenant_filter, omit_tenant_on_write, skip_if_no_update_target')
    .eq('connector_id', connectorId)
    .eq('target_app_type', targetAppType)
    .eq('is_active', true)

  if (error || !data) {
    console.error('Error fetching app mappings:', error)
    return []
  }

  // Process each mapping and get field mappings
  const mappings: AppMapping[] = []
  for (const mapping of data) {
    const fieldMappings = await getFieldMappings(supabase, mapping.id)
    const appMapping = {
      id: mapping.id,
      source_app_id: mapping.source_app_id,
      target_app_type: mapping.target_app_type,
      target_table: mapping.target_table,
      skip_tenant_filter: mapping.skip_tenant_filter,
      omit_tenant_on_write: mapping.omit_tenant_on_write,
      skip_if_no_update_target: mapping.skip_if_no_update_target || false,
      field_mappings: fieldMappings
    }
    
    mappings.push(appMapping)
  }
  
  return mappings
}

/**
 * Get specific app mapping by ID
 */
async function getAppMappingById(
  supabase: any,
  appMappingId: string
): Promise<AppMapping | null> {
  const { data, error } = await supabase
    .from('connector_app_mappings')
    .select('id, source_app_id, target_app_type, target_table, connector_id, skip_if_no_update_target')
    .eq('id', appMappingId)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    console.error('Error fetching app mapping by ID:', error)
    return null
  }

  const fieldMappings = await getFieldMappings(supabase, data.id)
  
  return {
    id: data.id,
    source_app_id: data.source_app_id,
    target_app_type: data.target_app_type,
    target_table: data.target_table,
    skip_if_no_update_target: data.skip_if_no_update_target || false,
    field_mappings: fieldMappings
  }
}

/**
 * Refresh Kintone access token using refresh token
 * Based on https://cybozu.dev/ja/common/docs/oauth-client/add-client/
 */
async function refreshKintoneToken(
  subdomain: string, 
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}> {
  // Create Basic Auth header with client credentials
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  
  const response = await fetch(`https://${subdomain}.cybozu.com/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh token: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
  }
}

// Server-side Supabase client
function getServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase configuration')
  }
  
  return createClient(supabaseUrl, serviceKey)
}

// Field mappings are now loaded from database dynamically

export interface SyncResult {
  success: boolean
  synced: Record<string, number> // app_type -> count
  errors: string[]
  duration: number
  sessionId?: string
}

export class KintoneDataSync {
  private connectorId: string
  private kintoneClient: KintoneApiClient
  private supabase: ReturnType<typeof getServerClient>
  private syncLogger: SyncLogger
  private tenantId: string
  private syncType: 'manual' | 'scheduled'
  private runBy?: string

  constructor(
    connectorId: string, 
    kintoneClient: KintoneApiClient,
    tenantId: string,
    syncType: 'manual' | 'scheduled' = 'manual',
    runBy?: string
  ) {
    this.connectorId = connectorId
    this.kintoneClient = kintoneClient
    this.supabase = getServerClient()
    this.syncLogger = createSyncLogger()
    this.tenantId = tenantId
    this.syncType = syncType
    this.runBy = runBy
    
  }

  /**
   * Build Kintone query from filter conditions
   */
  private async buildFilterQuery(appType: 'people' | 'visas', appMappingId?: string): Promise<string> {
    try {
      let mappingId: string

      if (appMappingId) {
        // Use specific mapping ID if provided
        mappingId = appMappingId
      } else {
        // Get active mappings for this connector
        const { data: mappings, error: mappingsError } = await this.supabase
          .from('connector_app_mappings')
          .select('id, target_app_type, source_app_id')
          .eq('connector_id', this.connectorId)
          .eq('is_active', true)

        if (mappingsError || !mappings || mappings.length === 0) {
          console.log('🔍 No active mappings found, using empty query')
          return ''
        }

        // Find mapping for the target app type
        const mapping = mappings.find(m => m.target_app_type === appType)
        if (!mapping) {
          console.log(`🔍 No mapping found for ${appType}, using empty query`)
          return ''
        }

        mappingId = mapping.id
      }

      // Get filter conditions for this mapping
      const { data: filters, error: filtersError } = await this.supabase
        .from('connector_app_filters')
        .select('field_code, filter_value')
        .eq('app_mapping_id', mappingId)
        .eq('is_active', true)

      if (filtersError) {
        console.error('Error fetching filters:', filtersError)
        return ''
      }

      if (!filters || filters.length === 0) {
        console.log(`🔍 No filter conditions found for mapping ${mappingId}, using empty query`)
        return ''
      }

      // Build query conditions (simple approach without validation)
      const conditions = filters
        .filter(f => f.field_code && f.filter_value)
        .map(f => `${f.field_code} = "${f.filter_value}"`)
        .join(' AND ')

      return conditions
    } catch (error) {
      console.error('Error building filter query:', error)
      return ''
    }
  }

  /**
   * Sync all data from Kintone to Supabase based on connector_app_mappings
   * @param appMappingId Optional specific app mapping ID to sync. If not provided, syncs all active mappings.
   * @param targetAppType Optional target app type to filter mappings. If not provided, syncs all target app types.
   */
  async syncAll(
    appMappingId?: string,
    targetAppType?: string,
    options: KintoneSyncOptions = {}
  ): Promise<SyncResult> {
    if (process.env.ALLOW_LEGACY_IMPORTS === 'false' || process.env.IMPORTS_DISABLED_UNTIL_MAPPING_ACTIVE === 'true') {
      // Check active mapping exists for this connector
      const { data: activeMappings } = await this.supabase
        .from('connector_app_mappings')
        .select('id')
        .eq('connector_id', this.connectorId)
        .eq('is_active', true)

      if (!activeMappings || activeMappings.length === 0) {
        console.log('[GUARD] reject write: no active mapping')
        return { success: false, synced: {}, errors: ['no active mapping'], duration: 0 }
      }
    }

    const startTime = Date.now()
    const synced: Record<string, number> = {}
    const errors: string[] = []
    let sessionId: string | undefined

    try {
      console.log('[sync] syncAll:start', {
        connectorId: this.connectorId,
        tenantId: this.tenantId,
        targetAppType,
        appMappingId,
        recordId: options.recordId,
        recordIdFrom: options.recordIdFrom,
        recordIdTo: options.recordIdTo
      })
      // Start sync session
      sessionId = await this.syncLogger.startSession(
        this.tenantId,
        this.connectorId,
        this.syncType,
        this.runBy
      )

      // Get app mappings for this connector
      let query = this.supabase
        .from('connector_app_mappings')
        .select('id, target_app_type, source_app_id')
        .eq('connector_id', this.connectorId)
        .eq('is_active', true)

      // If specific app mapping ID is provided, filter by it
      if (appMappingId) {
        query = query.eq('id', appMappingId)
      }

      // If specific target app type is provided, filter by it
      if (targetAppType) {
        query = query.eq('target_app_type', targetAppType)
      }

      const { data: appMappings, error: mappingsError } = await query

      if (mappingsError || !appMappings || appMappings.length === 0) {
        let error: string
        if (appMappingId) {
          error = `No active app mapping found with ID: ${appMappingId}`
        } else if (targetAppType) {
          error = `No active app mappings found for target app type: ${targetAppType}`
        } else {
          error = 'No active app mappings found'
        }
        errors.push(error)
        console.log('[sync] syncAll:early-exit', { reason: error })
        return { success: false, synced: {}, errors, duration: Date.now() - startTime, sessionId }
      }

      // Sync each app mapping
      console.log('[sync] syncAll:mappings', appMappings.map(m => ({ id: m.id, target_app_type: m.target_app_type, source_app_id: m.source_app_id })))
      for (const appMapping of appMappings) {
        try {
          const syncedCount = await this.syncAppData(appMapping.target_app_type, appMapping.source_app_id, appMapping.id, options)
          synced[appMapping.target_app_type] = syncedCount
        } catch (err) {
          const error = `${appMapping.target_app_type} sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`
          errors.push(error)
          synced[appMapping.target_app_type] = 0
        }
      }

      const duration = Date.now() - startTime
      const success = errors.length === 0
      const totalCount = Object.values(synced).reduce((sum, count) => sum + count, 0)

      // Complete sync session
      await this.syncLogger.completeSession(
        success ? 'success' : 'failed',
        totalCount,
        totalCount,
        0, // failedCount - individual failures are logged separately
        success ? undefined : errors.join('; ')
      )

      return {
        success,
        synced,
        errors,
        duration,
        sessionId
      }

    } catch (err) {
      const duration = Date.now() - startTime
      const error = err instanceof Error ? err.message : 'Unknown sync error'
      
      // Complete session with error if session was started
      if (sessionId) {
        try {
          await this.syncLogger.completeSession('failed', 0, 0, 0, error)
        } catch (logError) {
          console.error('Failed to complete sync session:', logError)
        }
      }

      return {
        success: false,
        synced,
        errors: [error],
        duration,
        sessionId
      }
    }
  }

  /**
   * Sync app data from Kintone based on app mapping configuration
   */
  private async syncAppData(
    targetAppType: string,
    sourceAppId: string,
    appMappingId?: string,
    options: KintoneSyncOptions = {}
  ): Promise<number> {
    if (process.env.ALLOW_LEGACY_IMPORTS === 'false' || process.env.IMPORTS_DISABLED_UNTIL_MAPPING_ACTIVE === 'true') {
      const { data: active } = await this.supabase
        .from('connector_app_mappings')
        .select('id')
        .eq('connector_id', this.connectorId)
        .eq('is_active', true)
      if (!active || active.length === 0) {
        console.log('[GUARD] reject write: no active mapping')
        return 0
      }
    }

    try {
      let appMappings: AppMapping[]
      
      // If specific app mapping ID is provided, get only that mapping
      if (appMappingId) {
        const appMapping = await getAppMappingById(this.supabase, appMappingId)
        if (!appMapping) {
          console.error(`❌ No active mapping found with ID: ${appMappingId}`)
          return 0
        }
        appMappings = [appMapping]
      } else {
        // Get all mappings for the target app type
        appMappings = await getAppMappings(this.supabase, this.connectorId, targetAppType)
        if (!appMappings || appMappings.length === 0) {
          console.error(`❌ No active ${targetAppType} mappings found`)
          return 0
        }
      }
      
      let totalSyncedCount = 0

      // Simple concurrency limiter (promise pool)
      const runWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
        const results: any[] = []
        let index = 0
        const runners: Promise<void>[] = []
        const runNext = async (): Promise<void> => {
          if (index >= items.length) return
          const current = index++
          try {
            const res = await worker(items[current])
            results[current] = res
          } finally {
            await runNext()
          }
        }
        const size = Math.min(limit, items.length)
        for (let i = 0; i < size; i++) runners.push(runNext())
        await Promise.all(runners)
        return results as R[]
      }
      
      // Process each mapping
      for (const appMapping of appMappings) {
        // Build query using only database filter conditions
        const filterQuery = await this.buildFilterQuery(targetAppType as 'people' | 'visas', appMappingId)
        const recordIdQuery = buildRecordIdQuery(options)
        const query = combineKintoneQueries(filterQuery, recordIdQuery)
        console.log('[sync] kintone-query', {
          targetAppType,
          sourceAppId,
          appMappingId: appMapping.id,
          query
        })
        
        // Get records from Kintone
        const records = await this.kintoneClient.getRecords(appMapping.source_app_id, query, [])
        let syncedCount = 0

        // Fetch update keys once per appMapping and reuse inside the loop
        const updateKeys = await getUpdateKeysByConnector(this.connectorId, targetAppType, appMapping.id)

        // Fetch data mappings once per appMapping and reuse inside the loop
        let dataMappings: DataMapping[] = []
        try {
          dataMappings = await getDataMappings(appMapping.id)
        } catch (valueMappingError) {
          console.warn(`  ⚠️ Value mapping load failed (continuing without mappings):`, valueMappingError)
          dataMappings = []
        }

        // Process records with limited concurrency to speed up while avoiding timeouts
        const CONCURRENCY_LIMIT = Number(process.env.SYNC_CONCURRENCY || 6)
        await runWithConcurrency(records, CONCURRENCY_LIMIT, async (record) => {
          try {
            // Transform Kintone record to our format using database field mappings
            // Determine target table based on app type
            const resolvedTargetTable = appMapping.target_table || this.getTargetTable(targetAppType)
            const targetTable = resolvedTargetTable
            if (!targetTable) {
              throw new Error(`Unknown target app type: ${targetAppType}`)
            }
            console.log(`[sync] rec=${record.$id?.value} appType=%s target_table=%s`, targetAppType, targetTable)

            // Check if record exists using update keys
            const includeTenant = !!this.tenantId
            const whereCondition = buildUpdateCondition(record, updateKeys, this.tenantId, includeTenant)
            console.log(`[sync] where=${JSON.stringify(whereCondition)}`)

            const missingUpdateKeys = updateKeys.filter((fieldMapping) => {
              return whereCondition[fieldMapping.target_field_id] === undefined || whereCondition[fieldMapping.target_field_id] === null
            })
            if (missingUpdateKeys.length > 0) {
              console.log(`[sync] skip-missing-update-key rec=${record.$id?.value} keys=%s`, missingUpdateKeys.map((key) => `${key.source_field_code}->${key.target_field_id}`).join(','))
              return
            }

            // Check if we should skip this record when there is no update target
            // We need to know existence cheaply; perform a minimal select when skip flag is on
            let exists: boolean | undefined
            if (shouldSkipMissingUpdateTarget(targetAppType, appMapping.skip_if_no_update_target)) {
              const { data: headCheck, error: headErr } = await this.supabase
                .from(targetTable)
                .select('id')
                .match(whereCondition)
                .limit(1)
              if (headErr && headErr.code !== 'PGRST116') {
                console.error(`[sync] select-error table=%s err=%o`, targetTable, headErr)
                throw headErr
              }
              exists = Array.isArray(headCheck) && headCheck.length > 0
              if (!exists) {
                console.log(`[sync] skip-no-target rec=${record.$id?.value}`)
                return
              }
            }

            // Only process data if we're going to insert or update
            const data: any = {
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }
            if (this.tenantId) {
              data.tenant_id = this.tenantId
            }
            

            // Map fields using database configuration
            for (const fieldMapping of appMapping.field_mappings) {
              if (fieldMapping.source_field_type === 'FILE') {
                const fileResult = await processFileField(this.kintoneClient, record, fieldMapping, this.tenantId)
                applyFileFieldProcessResult(data, fieldMapping.target_field_id, fileResult)
                console.log(`[sync] file-mapped target_field=%s path=%s shouldUpdate=%s`, fieldMapping.target_field_id, fileResult.path, fileResult.shouldUpdate)
              } else {
                // Regular field mapping
                const sourceValue = record[fieldMapping.source_field_code]?.value
                data[fieldMapping.target_field_id] = sourceValue || null
              }
            }

            // Apply value mappings if configured (use pre-fetched mappings)
            if (dataMappings.length > 0) {
              const mappedData = mapFieldValues(data, dataMappings)
              // Update data with mapped values
              for (const [key, value] of Object.entries(mappedData)) {
                if (data[key] !== value) {
                  console.log(`  🔄 Value mapping applied: ${key} "${data[key]}" -> "${value}"`)
                  data[key] = value
                }
              }
            }

            // Prepare insert payload separately to avoid updating primary key on update
            const insertData: any = { ...data }
            if (targetTable === 'people') {
              if (insertData.id === undefined || insertData.id === null) {
                const kintoneId = record.$id?.value
                if (kintoneId !== undefined && kintoneId !== null) {
                  insertData.id = String(kintoneId)
                }
              }
            }

            let error: any = null
            // UPDATE first with minimal payload; do not include primary key fields that could change
            // For safety, ensure we never update people.id
            const updatePayload = { ...data }
            if (targetTable === 'people') {
              delete (updatePayload as any).id
            }
            const { data: updatedRows, error: updateError } = await this.supabase
              .from(targetTable)
              .update(updatePayload)
              .match(whereCondition)
              .select('id')
            if (updateError) {
              error = updateError
            }
            if (!error && (!updatedRows || updatedRows.length === 0)) {
              if (targetAppType === 'people_image') {
                console.log(`[sync] skip-no-target-after-update rec=${record.$id?.value}`)
                return
              }

              // No rows updated -> insert new
              const { error: insertError } = await this.supabase
                .from(targetTable)
                .insert(insertData)
              error = insertError
              console.log(`[sync] op=insert table=%s rec=${record.$id?.value} ok=%s`, targetTable, !insertError)
            } else {
              console.log(`[sync] op=update table=%s rec=${record.$id?.value} ok=%s`, targetTable, !error)
            }

            if (error) {
              console.error(`[sync] db-error table=%s rec=%s err=%o`, targetTable, record.$id?.value, error)
              throw error
            }

            syncedCount++
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error'
            console.error(`❌ Failed to sync ${targetAppType} ${record.$id.value}:`, err)
            
            
            // Continue with other records
          }
        })
        
        totalSyncedCount += syncedCount
      }

      return totalSyncedCount
    } catch (error) {
      console.error(`❌ Error in syncAppData for ${targetAppType}:`, error)
      throw error
    }
  }

  /**
   * Get target table name for app type
   */
  private getTargetTable(targetAppType: string): string | null {
    const tableMap: Record<string, string> = {
      'people': 'people',
      'people_image': 'people',
      'visas': 'visas',
      'meetings': 'meetings'
    }
    return tableMap[targetAppType] || null
  }
}

/**
 * Create sync service for a connector
 */
export async function createSyncService(
  connectorId: string,
  tenantId: string,
  syncType: 'manual' | 'scheduled' = 'manual',
  runBy?: string
): Promise<KintoneDataSync> {
  try {
    // Get connector
    const connector = await getConnector(connectorId)
    
    if (!connector) {
      throw new Error('Connector not found')
    }
    
    
    if (connector.provider !== 'kintone') {
      throw new Error('Only Kintone connectors support data sync')
    }
  } catch (error) {
    console.error('❌ Error in createSyncService:', error)
    throw error
  }
  
  let credentials = await getCredential(connectorId, 'kintone_token')
  if (!credentials) {
    throw new Error('OAuth credentials not found in credentials table')
  }

  // Get subdomain from connector config
  const configCredential = await getCredential(connectorId, 'kintone_config')
  if (!configCredential || !configCredential.domain) {
    throw new Error('Kintone domain not found in connector config')
  }
  
  // Extract subdomain from domain URL (e.g., "https://funtoco.cybozu.com" -> "funtoco")
  const domainUrl = configCredential.domain
  const domainMatch = domainUrl.match(/https?:\/\/([^.]+)\.cybozu\.com/)
  if (!domainMatch) {
    throw new Error(`Invalid Kintone domain format: ${domainUrl}`)
  }
  const subdomain = domainMatch[1]
  
  // Check if access token is expired and refresh if needed
  // Clean access token by removing full-width spaces and other invalid characters
  let accessToken = credentials.access_token.replace(/[\u3000\u00A0]/g, ' ').trim()
  const refreshToken = credentials.refresh_token?.replace(/[\u3000\u00A0]/g, ' ').trim()
  if (refreshToken) {
    try {
      // Get client credentials from credentials table
      const clientCredentials = await getCredential(connectorId, 'kintone_config')
      
      if (!clientCredentials) {
        throw new Error('OAuth client credentials not found')
      }

      const refreshedCredentials = await refreshKintoneToken(
        subdomain, 
        refreshToken,
        clientCredentials.clientId,
        clientCredentials.clientSecret
      )
      
      accessToken = refreshedCredentials.access_token
    } catch (error) {
      console.error('Failed to refresh access token:', error)
      // Continue with existing token if refresh fails
    }
  }
  
  // Create Kintone client
  const kintoneClient = new KintoneApiClient({
    domain: `https://${subdomain}.cybozu.com`,
    accessToken
  })
  
  
  return new KintoneDataSync(connectorId, kintoneClient, tenantId, syncType, runBy)
}
