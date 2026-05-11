import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSyncService } from '@/lib/sync/kintone-sync'
import { getConnector, setConnectorStatus } from '@/lib/db/connectors'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

// Use Node.js runtime for crypto operations
export const runtime = 'nodejs'
const MAX_DURATION_SECONDS = 300
export const maxDuration = MAX_DURATION_SECONDS

// Validation schema
const kintoneRecordIdSchema = z.string().trim().regex(/^\d+$/, {
  message: 'Kintone record id must be numeric'
})

const syncMetadataQuerySchema = z.object({
  appMappingId: z.string().min(1),
  metric: z.literal('maxRecordId').default('maxRecordId')
})

const syncRequestSchema = z.object({
  force: z.boolean().optional(),
  appMappingId: z.string().optional(),
  recordId: kintoneRecordIdSchema.optional(),
  recordIdFrom: kintoneRecordIdSchema.optional(),
  recordIdTo: kintoneRecordIdSchema.optional()
}).superRefine((body, ctx) => {
  const hasRecordFilter = Boolean(body.recordId || body.recordIdFrom || body.recordIdTo)

  if (hasRecordFilter && !body.appMappingId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'appMappingId is required when syncing a specific Kintone record id',
      path: ['appMappingId']
    })
  }

  if (body.recordId && (body.recordIdFrom || body.recordIdTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'recordId cannot be combined with recordIdFrom or recordIdTo',
      path: ['recordId']
    })
  }

  if (body.recordIdFrom && body.recordIdTo && Number(body.recordIdFrom) > Number(body.recordIdTo)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'recordIdFrom must be less than or equal to recordIdTo',
      path: ['recordIdFrom']
    })
  }
})

function getServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase configuration')
  }

  return createClient(supabaseUrl, serviceKey)
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const connectorId = params.id
    const { searchParams } = new URL(request.url)
    const { appMappingId } = syncMetadataQuerySchema.parse({
      appMappingId: searchParams.get('appMappingId'),
      metric: searchParams.get('metric') || 'maxRecordId'
    })

    const connector = await getConnector(connectorId)

    if (!connector) {
      return NextResponse.json(
        { error: 'Connector not found' },
        { status: 404 }
      )
    }

    if (connector.provider !== 'kintone') {
      return NextResponse.json(
        { error: 'Only Kintone connectors support data sync' },
        { status: 400 }
      )
    }

    const supabase = getServerClient()
    const { data: appMapping, error: appMappingError } = await supabase
      .from('connector_app_mappings')
      .select('source_app_id')
      .eq('id', appMappingId)
      .eq('connector_id', connectorId)
      .eq('is_active', true)
      .single()

    if (appMappingError || !appMapping) {
      return NextResponse.json(
        { error: 'Active app mapping not found' },
        { status: 404 }
      )
    }

    const effectiveTenantId = connector.tenant_id || ''
    const syncService = await createSyncService(connectorId, effectiveTenantId, 'manual')
    const maxRecordId = await syncService.getMaxRecordId(appMapping.source_app_id)

    return NextResponse.json({
      success: true,
      appMappingId,
      sourceAppId: appMapping.source_app_id,
      maxRecordId
    })
  } catch (error) {
    console.error('Sync metadata request error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.errors
        },
        { status: 400 }
      )
    }

    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const connectorId = params.id
    const body = await request.json()
    
    // Validate input
    const { force, appMappingId, recordId, recordIdFrom, recordIdTo } = syncRequestSchema.parse(body)
    
    // Get and validate connector
    const connector = await getConnector(connectorId)
    
    if (!connector) {
      return NextResponse.json(
        { error: 'Connector not found' },
        { status: 404 }
      )
    }
    
    // Use tenant_id from connector
    const tenantId = connector.tenant_id
    
    // Temporarily disable status check for testing
    // if (connector.status !== 'connected') {
    //   return NextResponse.json(
    //     { error: 'Connector must be connected to sync data' },
    //     { status: 400 }
    //   )
    // }
    
    if (connector.provider !== 'kintone') {
      return NextResponse.json(
        { error: 'Only Kintone connectors support data sync' },
        { status: 400 }
      )
    }

    // Real sync
    try {
      // If tenantId is not provided, fall back to connector.tenant_id for tenantless/global connectors
      const effectiveTenantId = tenantId || connector.tenant_id || ''
      const syncOptions = { recordId, recordIdFrom, recordIdTo }
      console.log('[sync-api] start manual sync', {
        connectorId,
        tenantId,
        connectorTenant: connector.tenant_id,
        effectiveTenantId,
        appMappingId,
        force,
        ...syncOptions
      })
      const syncService = await createSyncService(
        connectorId,
        effectiveTenantId,
        'manual',
        request.headers.get('x-user-id') || undefined
      )
      const result = await syncService.syncAll(appMappingId, undefined, syncOptions)
      console.log('[sync-api] result', result)
      
      // Update connector status if there were errors
      if (result.errors.length > 0) {
        await setConnectorStatus(
          connectorId, 
          'error', 
          `Sync completed with ${result.errors.length} errors`
        )
      }
      
      // Revalidate data pages
      revalidatePath('/people', 'page')
      revalidatePath('/visas', 'page')
      revalidatePath(`/admin/connectors/${connectorId}`, 'page')
      
      return NextResponse.json({
        ...result,
        message: result.success 
          ? 'Data synchronization completed successfully'
          : 'Data synchronization completed with errors'
      })
      
    } catch (syncError) {
      console.error('Sync error:', syncError)
      
      const errorMessage = syncError instanceof Error 
        ? syncError.message 
        : 'Sync failed'
      
      // Update connector status
      await setConnectorStatus(connectorId, 'error', errorMessage)
      
      return NextResponse.json(
        { 
          success: false,
          error: errorMessage,
          synced: {},
          errors: [errorMessage],
          duration: 0
        },
        { status: 500 }
      )
    }
    
  } catch (error) {
    console.error('Sync request error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
