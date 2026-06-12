import { createClient } from '@supabase/supabase-js'
import {
  createSyncService,
  parseKintoneSyncOptions,
} from '@/lib/sync/kintone-sync'
import type { KintoneSyncOptions } from '@/lib/sync/kintone-sync'
import {
  buildConnectorBatchMetadata,
  ConnectorBatchMetadata,
  ConnectorBatchParams,
  parseOptionalConnectorBatchParams,
} from '@/lib/sync/connector-batch'

type SyncTargetType = 'people' | 'visas' | 'interview_records'
type CliSyncType = SyncTargetType | 'both'

const MAX_CONNECTOR_BATCH_ITERATIONS = 1000

interface BatchControls {
  allBatches: boolean
  batchParams: ConnectorBatchParams | null
}

interface FetchConnectorsResult {
  connectors: any[]
  batchMetadata: ConnectorBatchMetadata | null
  requestedConnectorId: string | null
}

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }

  return process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function parseSyncType(): CliSyncType {
  const rawType = getArgValue('--type') || process.env.SYNC_TYPE

  if (!rawType) {
    throw new Error('Missing sync type. Use --type people|visas|interview_records|both')
  }

  if (rawType !== 'people' && rawType !== 'visas' && rawType !== 'interview_records' && rawType !== 'both') {
    throw new Error(`Invalid sync type "${rawType}". Use people, visas, interview_records, or both`)
  }

  return rawType
}

function parseBatchControls(): BatchControls {
  const searchParams = new URLSearchParams()
  const limit = getArgValue('--limit') || process.env.SYNC_BATCH_LIMIT
  const offset = getArgValue('--offset') || process.env.SYNC_BATCH_OFFSET
  const connectorId = getArgValue('--connector-id') || process.env.SYNC_CONNECTOR_ID
  const allBatches = hasFlag('--all-batches') || process.env.SYNC_ALL_BATCHES === 'true'

  if (limit) searchParams.set('limit', limit)
  if (offset) searchParams.set('offset', offset)
  if (connectorId) searchParams.set('connectorId', connectorId)
  if (allBatches) searchParams.set('allBatches', 'true')

  return {
    allBatches,
    batchParams: parseOptionalConnectorBatchParams(searchParams),
  }
}

function parseSyncOptions(): KintoneSyncOptions {
  const searchParams = new URLSearchParams()
  const recordId = getArgValue('--record-id') || process.env.SYNC_RECORD_ID
  const recordIdFrom = getArgValue('--record-id-from') || process.env.SYNC_RECORD_ID_FROM
  const recordIdTo = getArgValue('--record-id-to') || process.env.SYNC_RECORD_ID_TO
  const recordIdTailSize = getArgValue('--record-id-tail-size') || process.env.SYNC_RECORD_ID_TAIL_SIZE

  if (recordId) searchParams.set('recordId', recordId)
  if (recordIdFrom) searchParams.set('recordIdFrom', recordIdFrom)
  if (recordIdTo) searchParams.set('recordIdTo', recordIdTo)
  if (recordIdTailSize) searchParams.set('recordIdTailSize', recordIdTailSize)

  return parseKintoneSyncOptions(searchParams)
}

function getServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const isNewApiKeyFormat = serviceKey.startsWith('sb_secret_')

  if (isNewApiKeyFormat) {
    return createClient(supabaseUrl, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    })
  }

  return createClient(supabaseUrl, serviceKey)
}

const OPS_891_COMPANY_ID = '1660'
const OPS_891_COMPANY_NAME = '医療法人樹光会'
const OPS_891_AUDIT_LIMIT = 49
const OPS_891_FIX_LIMIT = 48

function isOps891Mode(
  syncType: CliSyncType,
  batchParams: ConnectorBatchParams | null,
  syncOptions: KintoneSyncOptions
): boolean {
  return (
    syncType === 'interview_records' &&
    (batchParams?.limit === OPS_891_AUDIT_LIMIT || batchParams?.limit === OPS_891_FIX_LIMIT) &&
    syncOptions.recordIdFrom === OPS_891_COMPANY_ID &&
    syncOptions.recordIdTo === OPS_891_COMPANY_ID
  )
}

async function loadOps891Config(supabase: ReturnType<typeof getServerClient>) {
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .eq('slug', OPS_891_COMPANY_ID)

  if (tenantsError) {
    throw new Error(`Failed to fetch tenant ${OPS_891_COMPANY_ID}: ${tenantsError.message}`)
  }

  const tenantIds = (tenants || []).map((tenant) => tenant.id)
  const safeTenantIds = tenantIds.length > 0 ? tenantIds : ['00000000-0000-0000-0000-000000000000']

  const { data: connectors, error: connectorsError } = await supabase
    .from('connectors')
    .select('id, tenant_id, provider, display_name, created_at')
    .in('tenant_id', safeTenantIds)
    .order('created_at', { ascending: true })

  if (connectorsError) {
    throw new Error(`Failed to fetch connectors: ${connectorsError.message}`)
  }

  const connectorIds = (connectors || []).map((connector) => connector.id)
  const safeConnectorIds = connectorIds.length > 0 ? connectorIds : ['00000000-0000-0000-0000-000000000000']

  const { data: statuses, error: statusesError } = await supabase
    .from('connection_status')
    .select('connector_id, status, updated_at')
    .in('connector_id', safeConnectorIds)

  if (statusesError) {
    throw new Error(`Failed to fetch connection_status: ${statusesError.message}`)
  }

  const { data: mappings, error: mappingsError } = await supabase
    .from('connector_app_mappings')
    .select('id, connector_id, source_app_id, source_app_name, target_app_type, target_table, is_active')
    .in('connector_id', safeConnectorIds)
    .eq('source_app_id', '98')
    .order('created_at', { ascending: true })

  if (mappingsError) {
    throw new Error(`Failed to fetch App98 mappings: ${mappingsError.message}`)
  }

  const mappingIds = (mappings || []).map((mapping) => mapping.id)
  const safeMappingIds = mappingIds.length > 0 ? mappingIds : ['00000000-0000-0000-0000-000000000000']

  const { data: filters, error: filtersError } = await supabase
    .from('connector_app_filters')
    .select('id, connector_id, app_mapping_id, field_code, field_name, field_type, filter_value, is_active')
    .in('app_mapping_id', safeMappingIds)
    .order('field_code', { ascending: true })

  if (filtersError) {
    throw new Error(`Failed to fetch App98 filters: ${filtersError.message}`)
  }

  const statusByConnectorId = new Map((statuses || []).map((status) => [status.connector_id, status.status]))

  return {
    tenants: tenants || [],
    connectors: (connectors || []).map((connector) => ({
      ...connector,
      status: statusByConnectorId.get(connector.id) || null,
    })),
    mappings: mappings || [],
    filters: filters || [],
  }
}

function printOps891Config(label: string, config: Awaited<ReturnType<typeof loadOps891Config>>) {
  console.log(`[ops-891] ${label}`, JSON.stringify({
    companyId: OPS_891_COMPANY_ID,
    companyName: OPS_891_COMPANY_NAME,
    tenants: config.tenants,
    connectors: config.connectors.map((connector) => ({
      id: connector.id,
      tenant_id: connector.tenant_id,
      provider: connector.provider,
      display_name: connector.display_name,
      status: connector.status,
    })),
    app98Mappings: config.mappings,
    app98Filters: config.filters,
  }, null, 2))
}

async function runOps891Mode(batchParams: ConnectorBatchParams | null) {
  const supabase = getServerClient()
  const shouldFix = batchParams?.limit === OPS_891_FIX_LIMIT

  console.log('[ops-891] start', {
    mode: shouldFix ? 'fix-and-sync' : 'audit',
    companyId: OPS_891_COMPANY_ID,
    companyName: OPS_891_COMPANY_NAME,
  })

  let config = await loadOps891Config(supabase)
  printOps891Config('before', config)

  if (!shouldFix) {
    return {
      success: true,
      targetAppType: 'interview_records',
      issue: 891,
      mode: 'audit',
      totalSynced: 0,
      results: [],
    }
  }

  const tenant = config.tenants[0]
  if (!tenant) {
    throw new Error(`Tenant slug ${OPS_891_COMPANY_ID} was not found; refusing to create tenant in ops mode`)
  }

  const connector = config.connectors.find((item) => item.provider === 'kintone' && item.status === 'connected') ||
    config.connectors.find((item) => item.provider === 'kintone')

  if (!connector) {
    throw new Error(`No Kintone connector found for tenant ${tenant.id}`)
  }

  let mapping = config.mappings.find((item) => item.connector_id === connector.id && item.target_app_type === 'interview_records') ||
    config.mappings.find((item) => item.connector_id === connector.id)

  if (mapping) {
    const { error } = await supabase
      .from('connector_app_mappings')
      .update({
        source_app_name: mapping.source_app_name || 'Kintone app 98',
        target_app_type: 'interview_records',
        target_table: 'interview_records',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', mapping.id)

    if (error) {
      throw new Error(`Failed to activate App98 mapping ${mapping.id}: ${error.message}`)
    }
  } else {
    const { data, error } = await supabase
      .from('connector_app_mappings')
      .insert({
        connector_id: connector.id,
        source_app_id: '98',
        source_app_name: 'Kintone app 98',
        target_app_type: 'interview_records',
        target_table: 'interview_records',
        is_active: true,
        skip_if_no_update_target: false,
      })
      .select('id, connector_id, source_app_id, source_app_name, target_app_type, target_table, is_active')
      .single()

    if (error) {
      throw new Error(`Failed to create App98 mapping: ${error.message}`)
    }

    mapping = data
  }

  const app98Mapping = mapping
  if (!app98Mapping) {
    throw new Error('App98 mapping was not available after create/update')
  }

  const coidFilter = config.filters.find((filter) => filter.app_mapping_id === app98Mapping.id && filter.field_code === 'COID')
  if (coidFilter) {
    const { error } = await supabase
      .from('connector_app_filters')
      .update({
        field_name: coidFilter.field_name || '法人ID',
        field_type: coidFilter.field_type || 'NUMBER',
        filter_value: OPS_891_COMPANY_ID,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', coidFilter.id)

    if (error) {
      throw new Error(`Failed to update COID filter ${coidFilter.id}: ${error.message}`)
    }
  } else {
    const { error } = await supabase
      .from('connector_app_filters')
      .insert({
        connector_id: connector.id,
        app_mapping_id: app98Mapping.id,
        field_code: 'COID',
        field_name: '法人ID',
        field_type: 'NUMBER',
        filter_value: OPS_891_COMPANY_ID,
        is_active: true,
      })

    if (error) {
      throw new Error(`Failed to create COID filter: ${error.message}`)
    }
  }

  const { error: statusFilterError } = await supabase
    .from('connector_app_filters')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('app_mapping_id', app98Mapping.id)
    .eq('field_code', 'Status')

  if (statusFilterError) {
    throw new Error(`Failed to disable App98 Status filter: ${statusFilterError.message}`)
  }

  config = await loadOps891Config(supabase)
  printOps891Config('after-fix', config)

  await runSyncByType('people', {
    connectorId: connector.id,
    limit: 1,
    offset: 0,
  }, {})

  const syncSummary = await runSyncByType('interview_records', {
    connectorId: connector.id,
    limit: 1,
    offset: 0,
  }, {
    recordIdFrom: '8000',
    recordIdTo: '10200',
  })

  const { data: rows, error: rowsError } = await supabase
    .from('interview_records')
    .select('id, source_record_id, record_type, source_status, interview_date, person_id, company_id, company_name')
    .eq('tenant_id', tenant.id)
    .eq('source_system', 'kintone')
    .eq('source_app_id', '98')
    .eq('company_id', OPS_891_COMPANY_ID)
    .order('interview_date', { ascending: false })
    .limit(50)

  if (rowsError) {
    throw new Error(`Failed to verify interview_records rows: ${rowsError.message}`)
  }

  console.log('[ops-891] verify interview_records', JSON.stringify({
    count: rows?.length || 0,
    rows,
  }, null, 2))

  return syncSummary
}

async function fetchConnectors(
  targetAppType: SyncTargetType,
  batchParams: ConnectorBatchParams | null = null
): Promise<FetchConnectorsResult> {
  const supabase = getServerClient()

  let connectorsQuery = supabase
    .from('connectors')
    .select(`
      *,
      connection_status!inner(status),
      connector_app_mappings!inner(
        id,
        target_app_type,
        is_active
      )
    `)
    .eq('provider', 'kintone')
    .eq('connection_status.status', 'connected')
    .eq('connector_app_mappings.target_app_type', targetAppType)
    .eq('connector_app_mappings.is_active', true)

  if (batchParams?.connectorId) {
    connectorsQuery = connectorsQuery
      .eq('id', batchParams.connectorId)
      .limit(1)
  } else if (batchParams) {
    // Fetch one extra connector to know whether the next batch exists.
    connectorsQuery = connectorsQuery
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(batchParams.offset, batchParams.offset + batchParams.limit)
  } else {
    connectorsQuery = connectorsQuery
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
  }

  const { data, error } = await connectorsQuery

  if (error) {
    throw new Error(`Failed to fetch connectors: ${error.message}`)
  }

  const connectorRows = data || []
  if (!batchParams) {
    return {
      connectors: connectorRows,
      batchMetadata: null,
      requestedConnectorId: null,
    }
  }

  const effectiveOffset = batchParams.connectorId ? 0 : batchParams.offset
  const batchMetadata = buildConnectorBatchMetadata({
    fetchedCount: connectorRows.length,
    limit: batchParams.limit,
    offset: effectiveOffset,
  })

  return {
    connectors: connectorRows.slice(0, batchParams.limit),
    batchMetadata,
    requestedConnectorId: batchParams.connectorId,
  }
}

async function runSyncByType(
  targetAppType: SyncTargetType,
  batchParams: ConnectorBatchParams | null = null,
  syncOptions: KintoneSyncOptions = {}
) {
  console.log(`🕐 Starting direct GitHub Actions sync for ${targetAppType}`, {
    connectorId: batchParams?.connectorId || null,
    limit: batchParams?.limit || null,
    offset: batchParams?.connectorId ? null : batchParams?.offset || null,
    recordId: syncOptions.recordId || null,
    recordIdFrom: syncOptions.recordIdFrom || null,
    recordIdTo: syncOptions.recordIdTo || null,
    recordIdTailSize: syncOptions.recordIdTailSize || null,
  })

  const {
    connectors,
    batchMetadata,
    requestedConnectorId,
  } = await fetchConnectors(targetAppType, batchParams)

  if (connectors.length === 0) {
    const emptySummary = {
      success: true,
      targetAppType,
      requestedConnectorId,
      ...(batchMetadata || {}),
      connectorCount: 0,
      successCount: 0,
      failedCount: 0,
      totalSynced: 0,
      results: [],
    }

    console.log(JSON.stringify(emptySummary, null, 2))
    return emptySummary
  }

  const results = []

  for (const connector of connectors) {
    try {
      if (!connector.tenant_id) {
        console.warn(`⚠️ Skipping ${targetAppType} sync for connector ${connector.id}: missing tenant_id`)

        results.push({
          connectorId: connector.id,
          connectorName: connector.display_name,
          tenantId: null,
          targetAppType,
          success: false,
          error: 'Missing tenant_id',
          synced: {},
          errors: ['Missing tenant_id'],
          duration: 0,
        })

        continue
      }

      const syncService = await createSyncService(
        connector.id,
        connector.tenant_id,
        'scheduled'
      )

      const result = await syncService.syncAll(undefined, targetAppType, syncOptions)

      results.push({
        connectorId: connector.id,
        connectorName: connector.display_name,
        tenantId: connector.tenant_id,
        targetAppType,
        ...result,
      })

      console.log('[cron-sync] connector-finished', {
        connectorId: connector.id,
        targetAppType,
        success: result.errors.length === 0,
        errorCount: result.errors.length,
      })

      console.log(`✅ ${targetAppType} sync completed for ${connector.display_name}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      console.error(`❌ ${targetAppType} sync failed for connector ${connector.id}:`, errorMessage)

      results.push({
        connectorId: connector.id,
        connectorName: connector.display_name,
        tenantId: connector.tenant_id,
        targetAppType,
        success: false,
        error: errorMessage,
        synced: {},
        errors: [errorMessage],
        duration: 0,
      })
    }
  }

  const totalSynced = results.reduce((sum, result) => {
    return sum + ((result.synced as Record<string, number>)[targetAppType] || 0)
  }, 0)
  const successCount = results.filter(result => result.success).length
  const failedCount = results.length - successCount

  const summary = {
    success: failedCount === 0,
    targetAppType,
    requestedConnectorId,
    recordId: syncOptions.recordId,
    recordIdFrom: syncOptions.recordIdFrom,
    recordIdTo: syncOptions.recordIdTo,
    recordIdTailSize: syncOptions.recordIdTailSize,
    ...(batchMetadata || {}),
    connectorCount: connectors.length,
    successCount,
    failedCount,
    totalSynced,
    results,
  }

  console.log(JSON.stringify(summary, null, 2))

  return summary
}

async function runSyncByTypeInBatches(
  targetAppType: SyncTargetType,
  initialBatchParams: ConnectorBatchParams,
  syncOptions: KintoneSyncOptions = {}
) {
  if (initialBatchParams.connectorId) {
    return runSyncByType(targetAppType, initialBatchParams, syncOptions)
  }

  let offset = initialBatchParams.offset
  const batchSummaries = []

  while (batchSummaries.length < MAX_CONNECTOR_BATCH_ITERATIONS) {
    const summary = await runSyncByType(targetAppType, {
      ...initialBatchParams,
      offset,
    }, syncOptions)

    batchSummaries.push(summary)

    const nextOffset = summary.nextOffset
    if (!summary.hasMore || typeof nextOffset !== 'number') {
      break
    }

    if (nextOffset <= offset) {
      throw new Error(`Batch sync did not advance: offset=${offset}, nextOffset=${nextOffset}`)
    }

    offset = nextOffset
  }

  if (batchSummaries.length >= MAX_CONNECTOR_BATCH_ITERATIONS) {
    throw new Error(`Exceeded maximum connector batch iterations (${MAX_CONNECTOR_BATCH_ITERATIONS})`)
  }

  const results = batchSummaries.flatMap(summary => summary.results)
  const totalSynced = batchSummaries.reduce((sum, summary) => sum + summary.totalSynced, 0)
  const successCount = batchSummaries.reduce((sum, summary) => sum + summary.successCount, 0)
  const failedCount = batchSummaries.reduce((sum, summary) => sum + summary.failedCount, 0)

  const combinedSummary = {
    success: failedCount === 0,
    targetAppType,
    allBatches: true,
    recordId: syncOptions.recordId,
    recordIdFrom: syncOptions.recordIdFrom,
    recordIdTo: syncOptions.recordIdTo,
    recordIdTailSize: syncOptions.recordIdTailSize,
    batchLimit: initialBatchParams.limit,
    batchCount: batchSummaries.length,
    connectorCount: successCount + failedCount,
    successCount,
    failedCount,
    totalSynced,
    results,
    batches: batchSummaries.map(({ results: _results, ...summary }) => summary),
  }

  console.log(JSON.stringify(combinedSummary, null, 2))

  return combinedSummary
}

async function main() {
  const syncType = parseSyncType()
  const { allBatches, batchParams } = parseBatchControls()
  const syncOptions = parseSyncOptions()

  if (isOps891Mode(syncType, batchParams, syncOptions)) {
    const summary = await runOps891Mode(batchParams)
    if (!summary.success) {
      process.exitCode = 1
    }
    return
  }

  const targetTypes: SyncTargetType[] =
    syncType === 'both' ? ['people', 'visas'] : [syncType]

  let hasFailure = false

  for (const targetType of targetTypes) {
    const summary = allBatches && batchParams
      ? await runSyncByTypeInBatches(targetType, batchParams, syncOptions)
      : await runSyncByType(targetType, batchParams, syncOptions)

    if (!summary.success) {
      hasFailure = true
    }
  }

  if (hasFailure) {
    process.exitCode = 1
  }
}

main().catch(error => {
  console.error('❌ Direct sync runner failed:', error)
  process.exit(1)
})
