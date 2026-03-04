import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/client'
import type { AccessLogEventType } from '@/lib/access-logger'

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  )
}

function getSessionClient(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
}

// POST /api/access-logs — record a single access event
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event_type, pathname, page_title, metadata } = body as {
      event_type: AccessLogEventType
      pathname?: string
      page_title?: string
      metadata?: Record<string, unknown>
    }

    const validEventTypes: AccessLogEventType[] = ['login', 'logout', 'login_failed', 'page_view']
    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
    }

    // Get authenticated user from session cookie (may be null for login_failed)
    const supabase = getSessionClient(req)
    const { data: { user } } = await supabase.auth.getUser()

    // Resolve active tenant_id for the user
    let tenantId: string | null = null
    if (user?.id) {
      const adminClient = createAdminClient()
      const { data: ut } = await adminClient
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
      tenantId = ut?.tenant_id ?? null
    }

    // Write log using service role client (bypasses RLS)
    const adminClient = createAdminClient()
    const { error } = await adminClient.from('access_logs').insert({
      user_id: user?.id ?? null,
      tenant_id: tenantId,
      email: user?.email ?? null,
      event_type,
      pathname: pathname ?? null,
      page_title: page_title ?? null,
      ip_address: getClientIp(req),
      user_agent: req.headers.get('user-agent'),
      metadata: metadata ?? null,
    })

    if (error) {
      console.error('[access-logs] insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[access-logs] POST unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/access-logs — fetch logs for admin UI
export async function GET(req: NextRequest) {
  try {
    // Auth check
    const supabase = getSessionClient(req)
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createAdminClient()

    // Verify caller is admin/owner of at least one tenant
    const { data: adminTenants } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .eq('status', 'active')

    if (!adminTenants || adminTenants.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tenantIds = adminTenants.map((r) => r.tenant_id)

    // Parse query params
    const { searchParams } = req.nextUrl
    const eventType = searchParams.get('event_type')
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 500)
    const offset = Number(searchParams.get('offset') ?? 0)
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    let query = adminClient
      .from('access_logs')
      .select('*', { count: 'exact' })
      .in('tenant_id', tenantIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (eventType) query = query.eq('event_type', eventType)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)

    const { data, error, count } = await query

    if (error) {
      console.error('[access-logs] GET error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, count, limit, offset })
  } catch (err) {
    console.error('[access-logs] GET unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
