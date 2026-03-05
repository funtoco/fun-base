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

/** Parse an integer query param safely. Returns `fallback` on NaN / missing. */
function parseIntParam(value: string | null, fallback: number): number {
  if (value === null) return fallback
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
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

    // Only login_failed is allowed without authentication.
    // login / logout / page_view must come from an active session.
    if (!user && event_type !== 'login_failed') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Resolve tenant_id for the user.
    // If the user belongs to multiple active tenants, set to null to avoid
    // misattribution. A warning is logged so ops can investigate.
    let tenantId: string | null = null
    if (user?.id) {
      const adminClient = createAdminClient()
      const { data: tenants } = await adminClient
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (tenants && tenants.length === 1) {
        tenantId = tenants[0].tenant_id
      } else if (tenants && tenants.length > 1) {
        console.warn(
          `[access-logs] user ${user.id} belongs to ${tenants.length} active tenants; tenant_id set to null to avoid misattribution`
        )
      }
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
    const { data: adminTenants, error: adminTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .eq('status', 'active')

    if (adminTenantsError) {
      console.error('[access-logs] admin tenant lookup error:', adminTenantsError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    if (!adminTenants || adminTenants.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const tenantIds = adminTenants.map((r) => r.tenant_id)

    // Get all user_ids that belong to the admin's tenants (to catch null-tenant logs
    // from multi-tenant users whose tenant_id was unresolvable at write time)
    const { data: tenantMembers } = await adminClient
      .from('user_tenants')
      .select('user_id')
      .in('tenant_id', tenantIds)
      .eq('status', 'active')

    const memberUserIds = [...new Set((tenantMembers ?? []).map((r) => r.user_id))]

    // Parse & validate query params
    const { searchParams } = req.nextUrl
    const eventType = searchParams.get('event_type')
    const email = searchParams.get('email')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    const rawLimit = parseIntParam(searchParams.get('limit'), 50)
    const limit = Math.min(Math.max(rawLimit, 1), 500) // clamp [1, 500]
    const offset = Math.max(parseIntParam(searchParams.get('offset'), 0), 0) // clamp >= 0

    // Show logs that either:
    // 1. Have a matching tenant_id (normal case)
    // 2. Have null tenant_id but user_id belongs to the tenant (multi-tenant user edge case)
    // 3. Have null tenant_id and are login_failed (unauthenticated failures)
    const orFilter = memberUserIds.length > 0
      ? `tenant_id.in.(${tenantIds.join(',')}),and(tenant_id.is.null,user_id.in.(${memberUserIds.join(',')})),and(event_type.eq.login_failed,tenant_id.is.null)`
      : `tenant_id.in.(${tenantIds.join(',')}),and(event_type.eq.login_failed,tenant_id.is.null)`

    let query = adminClient
      .from('access_logs')
      .select('*', { count: 'exact' })
      .or(orFilter)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (eventType) query = query.eq('event_type', eventType)
    if (email) query = query.ilike('email', `%${email}%`)
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
