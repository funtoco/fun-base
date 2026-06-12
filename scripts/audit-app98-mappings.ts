import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type ConnectorRow = {
  id: string
  tenant_id: string | null
  display_name: string | null
  provider: string
  created_at: string | null
}

type TenantRow = {
  id: string
  name: string | null
  slug: string | null
}

type MappingRow = {
  id: string
  connector_id: string
  source_app_id: string | null
  source_app_name: string | null
  target_app_type: string | null
  target_table: string | null
  is_active: boolean | null
  created_at: string | null
}

type FilterRow = {
  id: string
  connector_id: string
  app_mapping_id: string
  field_code: string | null
  field_name: string | null
  field_type: string | null
  filter_value: string | null
  is_active: boolean | null
}

type UserTenantRow = {
  tenant_id: string
  email: string | null
  status: string | null
}

type Candidate = {
  connector: ConnectorRow
  tenant: TenantRow
  peopleCount: number
  activeExternalUserCount: number
  app98Mappings: MappingRow[]
  selectedMapping: MappingRow | null
  filters: FilterRow[]
  issues: string[]
  plannedActions: string[]
}

const APP98_SOURCE_APP_ID = '98'
const APP98_SOURCE_APP_NAME = '就労_面談記録'
const TARGET_APP_TYPE = 'interview_records'
const TARGET_TABLE = 'interview_records'

function getArgValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

function parseSlugFilter(): Set<string> | null {
  const rawSingle = getArgValue('--slug') || process.env.APP98_MAPPING_SLUG
  const rawMany = getArgValue('--slugs') || process.env.APP98_MAPPING_SLUGS
  const raw = rawMany || rawSingle

  if (!raw) return null

  const values = raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (values.length === 0) return null

  for (const value of values) {
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid slug filter "${value}". Slugs must be digits only.`)
    }
  }

  return new Set(values)
}

function parseNonNegativeIntegerOption(name: string, rawValue: string | undefined, defaultValue: number): number {
  if (rawValue === undefined || rawValue === '') {
    return defaultValue
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a non-negative integer`)
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe non-negative integer`)
  }

  return value
}

function getServerClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

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

async function fetchAllPages<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`)
    }

    rows.push(...((data || []) as T[]))

    if (!data || data.length < pageSize) {
      return rows
    }
  }
}

async function getPeopleCount(supabase: SupabaseClient, tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (error) {
    throw new Error(`Failed to count people for tenant ${tenantId}: ${error.message}`)
  }

  return count || 0
}

function chooseMapping(mappings: MappingRow[]): MappingRow | null {
  if (mappings.length === 0) return null

  return [...mappings].sort((a, b) => {
    if (!!a.is_active !== !!b.is_active) return a.is_active ? -1 : 1
    return (a.created_at || '').localeCompare(b.created_at || '')
  })[0]
}

function buildCandidate(
  connector: ConnectorRow,
  tenant: TenantRow,
  peopleCount: number,
  activeExternalUserCount: number,
  allMappings: MappingRow[],
  allFilters: FilterRow[]
): Candidate {
  const app98Mappings = allMappings.filter(mapping => {
    return mapping.connector_id === connector.id
      && mapping.source_app_id === APP98_SOURCE_APP_ID
  })
  const selectedMapping = chooseMapping(app98Mappings)
  const filters = selectedMapping
    ? allFilters.filter(filter => filter.app_mapping_id === selectedMapping.id)
    : []
  const issues: string[] = []
  const plannedActions: string[] = []

  if (!tenant.slug) {
    issues.push('missing_tenant_slug')
  }

  if (app98Mappings.length === 0) {
    issues.push('missing_app98_mapping')
    plannedActions.push('create_app98_mapping')
  } else {
    if (app98Mappings.length > 1) {
      issues.push('duplicate_app98_mapping')
    }

    if (!selectedMapping?.is_active) {
      issues.push('inactive_app98_mapping')
      plannedActions.push('activate_app98_mapping')
    }

    if (selectedMapping?.target_app_type !== TARGET_APP_TYPE) {
      issues.push('wrong_target_app_type')
      plannedActions.push('normalize_target_app_type')
    }

    if (selectedMapping?.target_table !== TARGET_TABLE) {
      issues.push('wrong_target_table')
      plannedActions.push('normalize_target_table')
    }
  }

  if (selectedMapping && tenant.slug) {
    const activeCoidFilters = filters.filter(filter => filter.field_code === 'COID' && filter.is_active)
    const hasCorrectCoidFilter = activeCoidFilters.some(filter => filter.filter_value === tenant.slug)
    const hasWrongActiveCoidFilter = activeCoidFilters.some(filter => filter.filter_value !== tenant.slug)
    const activeStatusFilters = filters.filter(filter => filter.field_code === 'Status' && filter.is_active)

    if (!hasCorrectCoidFilter) {
      issues.push('missing_active_coid_filter')
      plannedActions.push('ensure_coid_filter')
    }

    if (hasWrongActiveCoidFilter) {
      issues.push('wrong_active_coid_filter')
      plannedActions.push('normalize_coid_filter')
    }

    if (activeStatusFilters.length > 0) {
      issues.push('active_status_filter')
      plannedActions.push('disable_status_filter')
    }
  }

  return {
    connector,
    tenant,
    peopleCount,
    activeExternalUserCount,
    app98Mappings,
    selectedMapping,
    filters,
    issues: [...new Set(issues)],
    plannedActions: [...new Set(plannedActions)],
  }
}

async function ensureApp98Mapping(
  supabase: SupabaseClient,
  candidate: Candidate
): Promise<MappingRow> {
  if (candidate.selectedMapping) {
    const { data, error } = await supabase
      .from('connector_app_mappings')
      .update({
        source_app_name: APP98_SOURCE_APP_NAME,
        target_app_type: TARGET_APP_TYPE,
        target_table: TARGET_TABLE,
        is_active: true,
      })
      .eq('id', candidate.selectedMapping.id)
      .select('id, connector_id, source_app_id, source_app_name, target_app_type, target_table, is_active, created_at')
      .single()

    if (error || !data) {
      throw new Error(`Failed to update App98 mapping for connector ${candidate.connector.id}: ${error?.message || 'no row returned'}`)
    }

    return data as MappingRow
  }

  const { data, error } = await supabase
    .from('connector_app_mappings')
    .insert({
      connector_id: candidate.connector.id,
      source_app_id: APP98_SOURCE_APP_ID,
      source_app_name: APP98_SOURCE_APP_NAME,
      target_app_type: TARGET_APP_TYPE,
      target_table: TARGET_TABLE,
      is_active: true,
    })
    .select('id, connector_id, source_app_id, source_app_name, target_app_type, target_table, is_active, created_at')
    .single()

  if (error || !data) {
    throw new Error(`Failed to create App98 mapping for connector ${candidate.connector.id}: ${error?.message || 'no row returned'}`)
  }

  return data as MappingRow
}

async function ensureFilters(
  supabase: SupabaseClient,
  connectorId: string,
  appMappingId: string,
  tenantSlug: string
) {
  const { data: filters, error: filterError } = await supabase
    .from('connector_app_filters')
    .select('id, connector_id, app_mapping_id, field_code, field_name, field_type, filter_value, is_active')
    .eq('app_mapping_id', appMappingId)

  if (filterError) {
    throw new Error(`Failed to load filters for mapping ${appMappingId}: ${filterError.message}`)
  }

  const existingFilters = (filters || []) as FilterRow[]
  const existingCoidFilters = existingFilters.filter(filter => filter.field_code === 'COID')
  const exactCoidFilter = existingCoidFilters.find(filter => filter.filter_value === tenantSlug)
  const isNumericSlug = /^\d+$/.test(tenantSlug)

  if (existingCoidFilters.length > 0) {
    const { error } = await supabase
      .from('connector_app_filters')
      .update({ is_active: false })
      .in('id', existingCoidFilters.map(filter => filter.id))

    if (error) {
      throw new Error(`Failed to deactivate duplicate COID filters for mapping ${appMappingId}: ${error.message}`)
    }
  }

  if (exactCoidFilter) {
    const { error } = await supabase
      .from('connector_app_filters')
      .update({
        field_name: '法人ID',
        field_type: isNumericSlug ? 'NUMBER' : 'SINGLE_LINE_TEXT',
        is_active: true,
      })
      .eq('id', exactCoidFilter.id)

    if (error) {
      throw new Error(`Failed to activate COID filter for mapping ${appMappingId}: ${error.message}`)
    }
  } else {
    const { error } = await supabase
      .from('connector_app_filters')
      .insert({
        connector_id: connectorId,
        app_mapping_id: appMappingId,
        field_code: 'COID',
        field_name: '法人ID',
        field_type: isNumericSlug ? 'NUMBER' : 'SINGLE_LINE_TEXT',
        filter_value: tenantSlug,
        is_active: true,
      })

    if (error) {
      throw new Error(`Failed to create COID filter for mapping ${appMappingId}: ${error.message}`)
    }
  }

  const statusFilters = existingFilters.filter(filter => filter.field_code === 'Status' && filter.is_active)
  if (statusFilters.length > 0) {
    const { error } = await supabase
      .from('connector_app_filters')
      .update({ is_active: false })
      .in('id', statusFilters.map(filter => filter.id))

    if (error) {
      throw new Error(`Failed to deactivate Status filters for mapping ${appMappingId}: ${error.message}`)
    }
  }
}

async function main() {
  const apply = hasFlag('--apply') || process.env.APP98_MAPPING_APPLY === 'true'
  const slugFilter = parseSlugFilter()
  const maxApply = parseNonNegativeIntegerOption(
    'max-apply',
    getArgValue('--max-apply') || process.env.APP98_MAPPING_MAX_APPLY,
    50
  )
  const limit = parseNonNegativeIntegerOption(
    'limit',
    getArgValue('--limit') || process.env.APP98_MAPPING_LIMIT,
    0
  )
  const includeEmptyPeople = hasFlag('--include-empty-people') || process.env.APP98_MAPPING_INCLUDE_EMPTY_PEOPLE === 'true'
  const requireExternalUsers = hasFlag('--require-external-users') || process.env.APP98_MAPPING_REQUIRE_EXTERNAL_USERS === 'true'
  const supabase = getServerClient()

  const { data: connectedRows, error: connectedError } = await supabase
    .from('connectors')
    .select(`
      id,
      tenant_id,
      display_name,
      provider,
      created_at,
      connection_status!inner(status)
    `)
    .eq('provider', 'kintone')
    .eq('connection_status.status', 'connected')
    .not('tenant_id', 'is', null)
    .order('created_at', { ascending: true })

  if (connectedError) {
    throw new Error(`Failed to fetch connected connectors: ${connectedError.message}`)
  }

  const connectors = (connectedRows || []) as ConnectorRow[]
  const tenantIds = [...new Set(connectors.map(connector => connector.tenant_id).filter(Boolean))] as string[]
  const [tenants, mappings, filters, userTenants] = await Promise.all([
    fetchAllPages<TenantRow>(supabase, 'tenants', 'id, name, slug'),
    fetchAllPages<MappingRow>(
      supabase,
      'connector_app_mappings',
      'id, connector_id, source_app_id, source_app_name, target_app_type, target_table, is_active, created_at'
    ),
    fetchAllPages<FilterRow>(
      supabase,
      'connector_app_filters',
      'id, connector_id, app_mapping_id, field_code, field_name, field_type, filter_value, is_active'
    ),
    fetchAllPages<UserTenantRow>(supabase, 'user_tenants', 'tenant_id, email, status'),
  ])
  const tenantsById = new Map(tenants.filter(tenant => tenantIds.includes(tenant.id)).map(tenant => [tenant.id, tenant]))
  const activeExternalUserCounts = userTenants.reduce<Map<string, number>>((acc, userTenant) => {
    const email = userTenant.email || ''
    const isExternal = email.length > 0 && !email.endsWith('@funtoco.jp')
    if (userTenant.status === 'active' && isExternal) {
      acc.set(userTenant.tenant_id, (acc.get(userTenant.tenant_id) || 0) + 1)
    }
    return acc
  }, new Map())
  const candidates: Candidate[] = []

  for (const connector of connectors) {
    if (!connector.tenant_id) continue

    const tenant = tenantsById.get(connector.tenant_id)
    if (!tenant) continue
    if (slugFilter && (!tenant.slug || !slugFilter.has(tenant.slug))) continue

    const peopleCount = await getPeopleCount(supabase, tenant.id)
    if (!includeEmptyPeople && peopleCount === 0) continue
    const activeExternalUserCount = activeExternalUserCounts.get(tenant.id) || 0
    if (requireExternalUsers && activeExternalUserCount === 0) continue

    candidates.push(buildCandidate(connector, tenant, peopleCount, activeExternalUserCount, mappings, filters))

    if (limit > 0 && candidates.length >= limit) {
      break
    }
  }

  const actionable = candidates.filter(candidate => candidate.plannedActions.length > 0)
  const duplicateMappings = candidates.filter(candidate => candidate.issues.includes('duplicate_app98_mapping'))
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    connectedConnectorCount: connectors.length,
    candidateCount: candidates.length,
    actionableCount: actionable.length,
    duplicateMappingCount: duplicateMappings.length,
    maxApply,
    slugFilter: slugFilter ? [...slugFilter] : null,
    requireExternalUsers,
    issueCounts: candidates.reduce<Record<string, number>>((acc, candidate) => {
      for (const issue of candidate.issues) {
        acc[issue] = (acc[issue] || 0) + 1
      }
      return acc
    }, {}),
    actionableTenants: actionable.map(candidate => ({
      tenant_id: candidate.tenant.id,
      tenant_name: candidate.tenant.name,
      slug: candidate.tenant.slug,
      connector_id: candidate.connector.id,
      connector_name: candidate.connector.display_name,
      people_count: candidate.peopleCount,
      active_external_user_count: candidate.activeExternalUserCount,
      issues: candidate.issues,
      planned_actions: candidate.plannedActions,
    })),
  }

  console.log('[app98-mapping-audit] summary')
  console.log(JSON.stringify(summary, null, 2))

  if (!apply) {
    return
  }

  if (actionable.length > maxApply) {
    throw new Error(`Refusing to apply ${actionable.length} changes because maxApply is ${maxApply}`)
  }

  const applied = []
  for (const candidate of actionable) {
    if (!candidate.tenant.slug) {
      console.warn('[app98-mapping-audit] skip missing tenant slug', {
        tenantId: candidate.tenant.id,
        connectorId: candidate.connector.id,
      })
      continue
    }

    const mapping = await ensureApp98Mapping(supabase, candidate)
    await ensureFilters(supabase, candidate.connector.id, mapping.id, candidate.tenant.slug)

    applied.push({
      tenant_id: candidate.tenant.id,
      tenant_name: candidate.tenant.name,
      slug: candidate.tenant.slug,
      connector_id: candidate.connector.id,
      app_mapping_id: mapping.id,
      actions: candidate.plannedActions,
    })
  }

  console.log('[app98-mapping-audit] applied')
  console.log(JSON.stringify({ appliedCount: applied.length, applied }, null, 2))
}

main().catch(error => {
  console.error('[app98-mapping-audit] failed:', error)
  process.exit(1)
})
