/**
 * Scheduled data synchronization endpoint by target app type
 * POST /api/cron/sync-by-type?type=people|people_image|visas|interview_records
 * This endpoint is called by Vercel Cron Jobs for scheduled syncs by type
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSyncService, parseKintoneSyncOptions } from '@/lib/sync/kintone-sync'
import type { KintoneSyncOptions } from '@/lib/sync/kintone-sync'
import { getConnector, setConnectorStatus } from '@/lib/db/connectors'
import { buildConnectorBatchMetadata, parseConnectorBatchParams } from '@/lib/sync/connector-batch'
import type { ConnectorBatchParams } from '@/lib/sync/connector-batch'
import { createClient } from '@supabase/supabase-js'

// Use Node.js runtime for crypto operations
export const runtime = 'nodejs'
export const maxDuration = 300

// Server-side Supabase client
function getServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase configuration')
  }
  
  return createClient(supabaseUrl, serviceKey)
}

// Common sync logic for both GET and POST methods
async function handleSyncByType(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (skip auth in local development)
    const isLocal = process.env.NODE_ENV === 'development'
    
    if (!isLocal) {
      // Check secret query parameter
      const { searchParams } = new URL(request.url)
      const secret = searchParams.get('secret')
      const expectedToken = process.env.CRON_SECRET
      
      if (!expectedToken || secret !== expectedToken) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid secret' },
          { status: 401 }
        )
      }
    } else {
      console.log('🔓 Local development mode - skipping authentication')
    }

    // Get target app type from query parameters
    const { searchParams } = new URL(request.url)
    const targetAppType = searchParams.get('type')
    let batchParams: ConnectorBatchParams
    let syncOptions: KintoneSyncOptions

    try {
      batchParams = parseConnectorBatchParams(searchParams)
      syncOptions = parseKintoneSyncOptions(searchParams)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid batch parameters' },
        { status: 400 }
      )
    }
    
    if (!targetAppType || !['people', 'people_image', 'visas', 'interview_records'].includes(targetAppType)) {
      return NextResponse.json(
        { error: 'Invalid or missing type parameter. Must be "people", "people_image", "visas", or "interview_records"' },
        { status: 400 }
      )
    }

    console.log(`🕐 Starting scheduled sync process for ${targetAppType}`, {
      recordId: syncOptions.recordId || null,
      recordIdFrom: syncOptions.recordIdFrom || null,
      recordIdTo: syncOptions.recordIdTo || null,
      recordIdTailSize: syncOptions.recordIdTailSize || null,
    })
    
    const supabase = getServerClient()
    
    // Get all connected Kintone connectors that have active mappings for the target app type
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

    const effectiveOffset = batchParams.connectorId ? 0 : batchParams.offset
    if (batchParams.connectorId) {
      connectorsQuery = connectorsQuery
        .eq('id', batchParams.connectorId)
        .limit(1)
    } else {
      // Fetch one extra connector to detect whether the workflow should request the next batch.
      connectorsQuery = connectorsQuery
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(batchParams.offset, batchParams.offset + batchParams.limit)
    }

    const { data: connectorRows, error: connectorsError } = await connectorsQuery
    const batchMetadata = buildConnectorBatchMetadata({
      fetchedCount: connectorRows?.length || 0,
      limit: batchParams.limit,
      offset: effectiveOffset,
    })
    const connectors = (connectorRows || []).slice(0, batchParams.limit)
    
    if (connectorsError) {
      throw new Error(`Failed to fetch connectors: ${connectorsError.message}`)
    }
    
    if (!connectors || connectors.length === 0) {
      console.log(`ℹ️ No connected Kintone connectors found with active ${targetAppType} mappings`)
      return NextResponse.json({
        success: true,
        message: `No connectors to sync for ${targetAppType}`,
        synced: 0,
        targetAppType,
        requestedConnectorId: batchParams.connectorId,
        ...batchMetadata,
      })
    }
    
    const results = []
    
    // Sync each connector for the specific target app type
    for (const connector of connectors) {
      try {
        
        // Create sync service for scheduled sync
        const syncService = await createSyncService(
          connector.id,
          connector.tenant_id,
          'scheduled'
        )
        
        // Perform sync for specific target app type
        const result = await syncService.syncAll(undefined, targetAppType, syncOptions)
        
        console.log(`✅ Scheduled sync completed for ${connector.name} (${targetAppType}):`, result)
        
        // Update connector status if there were errors
        if (result.errors.length > 0) {
          await setConnectorStatus(
            connector.id, 
            'error', 
            `Scheduled ${targetAppType} sync completed with ${result.errors.length} errors`
          )
        }
        
        results.push({
          connectorId: connector.id,
          connectorName: connector.name,
          tenantId: connector.tenant_id,
          targetAppType,
          ...result
        })
        
      } catch (error) {
        console.error(`❌ Scheduled sync failed for connector ${connector.id} (${targetAppType}):`, error)
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Update connector status
        await setConnectorStatus(connector.id, 'error', errorMessage)
        
        results.push({
          connectorId: connector.id,
          connectorName: connector.name,
          tenantId: connector.tenant_id,
          targetAppType,
          success: false,
          error: errorMessage,
          synced: {},
          errors: [errorMessage],
          duration: 0
        })
      }
    }
    
    const totalSynced = results.reduce((sum, r) => {
      return sum + ((r.synced as Record<string, number>)[targetAppType] || 0)
    }, 0)
    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount
    
    console.log(`🏁 Scheduled ${targetAppType} sync process completed: ${successCount} successful, ${failedCount} failed, ${totalSynced} total records synced`)
    
    return NextResponse.json({
      success: failedCount === 0,
      message: `Scheduled ${targetAppType} sync completed: ${successCount} successful, ${failedCount} failed`,
      targetAppType,
      totalSynced,
      requestedConnectorId: batchParams.connectorId,
      recordId: syncOptions.recordId,
      recordIdFrom: syncOptions.recordIdFrom,
      recordIdTo: syncOptions.recordIdTo,
      recordIdTailSize: syncOptions.recordIdTailSize,
      ...batchMetadata,
      successCount,
      failedCount,
      results
    })
    
  } catch (error) {
    console.error('❌ Scheduled sync process error:', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    return NextResponse.json(
      { 
        success: false,
        error: errorMessage,
        targetAppType: null,
        totalSynced: 0,
        connectorCount: 0,
        successCount: 0,
        failedCount: 0,
        results: []
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleSyncByType(request)
}

export async function POST(request: NextRequest) {
  return handleSyncByType(request)
}
