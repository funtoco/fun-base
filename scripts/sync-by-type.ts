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
