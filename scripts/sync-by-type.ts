import { createClient } from '@supabase/supabase-js'
import { createSyncService } from '@/lib/sync/kintone-sync'

type SyncTargetType = 'people' | 'visas'
type CliSyncType = SyncTargetType | 'both'

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) {
    return undefined
  }

  return process.argv[index + 1]
}

function parseSyncType(): CliSyncType {
  const rawType = getArgValue('--type') || process.env.SYNC_TYPE

  if (!rawType) {
    throw new Error('Missing sync type. Use --type people|visas|both')
  }

  if (rawType !== 'people' && rawType !== 'visas' && rawType !== 'both') {
    throw new Error(`Invalid sync type "${rawType}". Use people, visas, or both`)
  }

  return rawType
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

async function fetchConnectors(targetAppType: SyncTargetType) {
  const supabase = getServerClient()

  const { data, error } = await supabase
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

  if (error) {
    throw new Error(`Failed to fetch connectors: ${error.message}`)
  }

  return data || []
}

async function runSyncByType(targetAppType: SyncTargetType) {
  console.log(`🕐 Starting direct GitHub Actions sync for ${targetAppType}`)

  const connectors = await fetchConnectors(targetAppType)

  if (connectors.length === 0) {
    const emptySummary = {
      success: true,
      targetAppType,
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

      const result = await syncService.syncAll(undefined, targetAppType)

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
    connectorCount: connectors.length,
    successCount,
    failedCount,
    totalSynced,
    results,
  }

  console.log(JSON.stringify(summary, null, 2))

  return summary
}

async function main() {
  const syncType = parseSyncType()
  const targetTypes: SyncTargetType[] =
    syncType === 'both' ? ['people', 'visas'] : [syncType]

  let hasFailure = false

  for (const targetType of targetTypes) {
    const summary = await runSyncByType(targetType)
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
