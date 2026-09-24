import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { getCredential, updateCredential } from '@/lib/db/connectors'
import { KintoneApiClient, type KintoneRecord } from '@/lib/kintone/api-client'

export type PeopleCleanupMode = 'dry-run' | 'apply'

export type CleanupConnectorRow = {
  id: string
  tenant_id: string | null
  display_name: string | null
  provider?: string | null
  created_at?: string | null
}

export type CleanupTenantRow = {
  id: string
  name: string | null
  slug: string | null
}

export type CleanupMappingRow = {
  id: string
  source_app_id: string | null
  target_app_type: string | null
  target_table: string | null
  is_active: boolean | null
}

export type CleanupFilterRow = {
  id: string
  app_mapping_id: string
  field_code: string | null
  filter_value: string | null
  is_active: boolean | null
}

export type CleanupPeopleRow = {
  id: string
  tenant_id: string | null
  updated_at: string | null
}

export type PeopleCleanupPlan = {
  tenantId: string
  cutoffIso: string
  numericDbCount: number
  currentKintoneIdCount: number
  candidateIds: string[]
  skippedNonNumericCount: number
  skippedOtherTenantCount: number
  skippedAfterCutoffCount: number
}

// Reviewed on 2026-09-24: these person_id dependencies are confirmed
// ON DELETE CASCADE and are the only non-blocking dependency counts allowed
// for the explicitly chosen physical cleanup path.
export const REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST = [
  'visas',
  'meetings',
  'support_actions',
  'person_documents',
  'interview_records',
  'visa_application_case_members',
  'case_document_requirements',
] as const
export type PeopleCleanupDependencyTable = typeof REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST[number]
export type PeopleCleanupDependentCounts = Record<PeopleCleanupDependencyTable, number>

export type PeopleCleanupTenantResult = {
  success: boolean
  mode: PeopleCleanupMode
  connectorId: string
  connectorName: string | null
  tenantId: string | null
  tenantSlug: string | null
  appMappingId: string | null
  cutoffIso: string | null
  numericDbCount: number
  currentKintoneIdCount: number
  candidateCount: number
  deletedCount: number
  candidateIds: string[]
  deletedIds: string[]
  dependentCounts: PeopleCleanupDependentCounts
  error?: string
}

export type RunPeopleCleanupOptions = {
  apply: boolean
  maxDeletePerTenant: number
  now?: () => Date
  createKintoneClient?: (connectorId: string) => Promise<KintoneApiClient>
}

const APP13_SOURCE_APP_ID = '13'
const TARGET_APP_TYPE = 'people'
const TARGET_TABLE = 'people'
const PAGE_SIZE = 1000
const MAX_DELETE_PER_TENANT = 100
const CANDIDATE_COVERAGE_GUARD_MIN_DB_ROWS = 10
const MAX_CANDIDATE_NUMERATOR = 1
const MAX_CANDIDATE_DENOMINATOR = 5
const KINTONE_TOKEN_REFRESH_BUFFER_MS = 60 * 1000

function emptyDependentCounts(): PeopleCleanupDependentCounts {
  return {
    visas: 0,
    meetings: 0,
    support_actions: 0,
    person_documents: 0,
    interview_records: 0,
    visa_application_case_members: 0,
    case_document_requirements: 0,
  }
}

function addDependentCounts(
  left: PeopleCleanupDependentCounts,
  right: PeopleCleanupDependentCounts
): PeopleCleanupDependentCounts {
  return {
    visas: left.visas + right.visas,
    meetings: left.meetings + right.meetings,
    support_actions: left.support_actions + right.support_actions,
    person_documents: left.person_documents + right.person_documents,
    interview_records: left.interview_records + right.interview_records,
    visa_application_case_members: left.visa_application_case_members + right.visa_application_case_members,
    case_document_requirements: left.case_document_requirements + right.case_document_requirements,
  }
}

function isNumericId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d+$/.test(value.trim())
}

function compareIsoTimestamp(value: string | null, cutoffIso: string): number {
  if (!value) {
    return 1
  }

  const timestamp = Date.parse(value)
  const cutoff = Date.parse(cutoffIso)
  if (Number.isNaN(timestamp)) {
    return 1
  }

  return timestamp - cutoff
}

function escapeKintoneStringLiteral(value: string): string {
  return JSON.stringify(value)
}

function cleanToken(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u3000\u00A0]/g, ' ').trim()
    : ''
}

function parseTokenExpiryMs(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return null
  }

  const expiryMs = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(expiryMs) ? expiryMs : null
}

function shouldRefreshKintoneToken(tokenCredential: Record<string, unknown>): boolean {
  if (!cleanToken(tokenCredential.access_token)) {
    return true
  }

  const expiryMs = parseTokenExpiryMs(tokenCredential.expires_at)
  if (expiryMs === null) {
    return true
  }

  return expiryMs <= Date.now() + KINTONE_TOKEN_REFRESH_BUFFER_MS
}

export function buildExpectedTenantCoidQuery(tenantSlug: string): string {
  const normalizedSlug = tenantSlug.trim()
  if (!normalizedSlug) {
    throw new Error('tenant slug is required for COID filter')
  }

  return `COID = ${escapeKintoneStringLiteral(normalizedSlug)}`
}

export function selectActiveApp13PeopleMapping(mappings: CleanupMappingRow[]): CleanupMappingRow {
  const activeMappings = mappings.filter((mapping) => {
    return mapping.is_active === true
      && String(mapping.source_app_id) === APP13_SOURCE_APP_ID
      && mapping.target_app_type === TARGET_APP_TYPE
      && (mapping.target_table === TARGET_TABLE || mapping.target_table === null)
  })

  if (activeMappings.length !== 1) {
    throw new Error(`expected exactly one active app13 people mapping, got ${activeMappings.length}`)
  }

  return activeMappings[0]
}

export function validateExpectedTenantCoidFilters(
  filters: CleanupFilterRow[],
  appMappingId: string,
  tenantSlug: string
): void {
  const normalizedSlug = tenantSlug.trim()
  const activeFilters = filters.filter((filter) => {
    return filter.app_mapping_id === appMappingId && filter.is_active === true
  })

  if (activeFilters.length !== 1) {
    throw new Error(`expected exactly one active COID filter for mapping ${appMappingId}, got ${activeFilters.length}`)
  }

  const [filter] = activeFilters
  if (filter.field_code !== 'COID' || filter.filter_value !== normalizedSlug) {
    throw new Error(`expected active COID filter value ${normalizedSlug} for mapping ${appMappingId}`)
  }
}

export function extractCurrentKintoneRecordIds(records: KintoneRecord[]): Set<string> {
  const ids = new Set<string>()

  for (const record of records) {
    const value = record.$id?.value?.trim()
    if (isNumericId(value)) {
      ids.add(value.trim())
    }
  }

  return ids
}

function sortedIds(ids: Set<string>): string[] {
  return [...ids].sort((a, b) => Number(a) - Number(b))
}

export function assertStableKintoneIdSets(firstRead: Set<string>, secondRead: Set<string>): void {
  const firstIds = sortedIds(firstRead)
  const secondIds = sortedIds(secondRead)

  if (firstIds.length !== secondIds.length || firstIds.some((id, index) => id !== secondIds[index])) {
    throw new Error(`unstable Kintone app13 ID set: firstRead=${firstIds.join(',')} secondRead=${secondIds.join(',')}`)
  }
}

export function determinePeopleCleanupPlan({
  tenantId,
  cutoffIso,
  dbPeople,
  currentKintoneIds,
}: {
  tenantId: string
  cutoffIso: string
  dbPeople: CleanupPeopleRow[]
  currentKintoneIds: Set<string>
}): PeopleCleanupPlan {
  const candidateIds: string[] = []
  let numericDbCount = 0
  let skippedNonNumericCount = 0
  let skippedOtherTenantCount = 0
  let skippedAfterCutoffCount = 0

  for (const person of dbPeople) {
    if (person.tenant_id !== tenantId) {
      skippedOtherTenantCount++
      continue
    }

    const id = person.id.trim()
    if (!isNumericId(id)) {
      skippedNonNumericCount++
      continue
    }

    numericDbCount++

    if (compareIsoTimestamp(person.updated_at, cutoffIso) > 0) {
      skippedAfterCutoffCount++
      continue
    }

    if (!currentKintoneIds.has(id)) {
      candidateIds.push(id)
    }
  }

  if (numericDbCount > 0 && currentKintoneIds.size === 0) {
    throw new Error('Kintone returned zero app13 IDs while DB has numeric people rows')
  }

  return {
    tenantId,
    cutoffIso,
    numericDbCount,
    currentKintoneIdCount: currentKintoneIds.size,
    candidateIds,
    skippedNonNumericCount,
    skippedOtherTenantCount,
    skippedAfterCutoffCount,
  }
}

export function ensureDeleteLimit(candidateIds: string[], maxDeletePerTenant: number): void {
  if (!Number.isSafeInteger(maxDeletePerTenant) || maxDeletePerTenant < 0) {
    throw new Error('maxDeletePerTenant must be a safe non-negative integer')
  }

  if (maxDeletePerTenant > MAX_DELETE_PER_TENANT) {
    throw new Error(`maxDeletePerTenant must be ${MAX_DELETE_PER_TENANT} or less`)
  }

  if (candidateIds.length > maxDeletePerTenant) {
    throw new Error(`Refusing to delete ${candidateIds.length} people rows because maxDeletePerTenant is ${maxDeletePerTenant}`)
  }
}

export function ensureDeleteSafety(plan: PeopleCleanupPlan, maxDeletePerTenant: number): void {
  ensureDeleteLimit(plan.candidateIds, maxDeletePerTenant)

  if (
    plan.numericDbCount >= CANDIDATE_COVERAGE_GUARD_MIN_DB_ROWS
    && plan.candidateIds.length * MAX_CANDIDATE_DENOMINATOR > plan.numericDbCount * MAX_CANDIDATE_NUMERATOR
  ) {
    throw new Error(
      `Refusing to delete ${plan.candidateIds.length} people rows for tenant ${plan.tenantId} because candidate count exceeds 20% of ${plan.numericDbCount} numeric DB rows`
    )
  }
}

export function getPeopleCleanupServerClient(): SupabaseClient {
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

async function refreshKintoneAccessToken(
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
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`https://${subdomain}.cybozu.com/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to refresh Kintone token: ${response.status} ${errorText}`)
  }

  const data = await response.json()
  if (!data.access_token) {
    throw new Error('Failed to refresh Kintone token: access_token missing')
  }

  return {
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : undefined,
    expires_in: data.expires_in,
    token_type: data.token_type ? String(data.token_type) : undefined,
  }
}

export async function createKintoneClientForPeopleCleanup(connectorId: string): Promise<KintoneApiClient> {
  const tokenCredential = await getCredential(connectorId, 'kintone_token')
  if (!tokenCredential?.access_token && !tokenCredential?.refresh_token) {
    throw new Error(`Kintone token not found for connector ${connectorId}`)
  }

  const configCredential = await getCredential(connectorId, 'kintone_config')
  if (!configCredential?.domain) {
    throw new Error(`Kintone domain not found for connector ${connectorId}`)
  }

  const domainUrl = String(configCredential.domain)
  const domainMatch = domainUrl.match(/https?:\/\/([^.]+)\.cybozu\.com/)
  if (!domainMatch) {
    throw new Error(`Invalid Kintone domain format: ${domainUrl}`)
  }

  const subdomain = domainMatch[1]
  let accessToken = cleanToken(tokenCredential.access_token)
  const refreshToken = cleanToken(tokenCredential.refresh_token)

  if (
    shouldRefreshKintoneToken(tokenCredential)
    && refreshToken
    && configCredential.clientId
    && configCredential.clientSecret
  ) {
    const refreshed = await refreshKintoneAccessToken(
      subdomain,
      refreshToken,
      String(configCredential.clientId),
      String(configCredential.clientSecret)
    )
    accessToken = refreshed.access_token.replace(/[\u3000\u00A0]/g, ' ').trim()
    await updateCredential(connectorId, 'kintone_token', {
      ...tokenCredential,
      ...refreshed,
      access_token: accessToken,
      refresh_token: refreshed.refresh_token || refreshToken,
      expires_at: new Date(Date.now() + Math.max((Number(refreshed.expires_in) || 0) - 60, 0) * 1000).toISOString(),
    })
  }

  if (!accessToken) {
    throw new Error(`Kintone access token not found for connector ${connectorId}`)
  }

  return new KintoneApiClient({
    domain: `https://${subdomain}.cybozu.com`,
    accessToken,
  })
}

async function fetchAllPages<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  configure?: (query: any) => any
): Promise<T[]> {
  const rows: T[] = []

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(columns)
      .range(offset, offset + PAGE_SIZE - 1)

    if (configure) {
      query = configure(query)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to fetch ${table}: ${error.message}`)
    }

    rows.push(...((data || []) as T[]))

    if (!data || data.length < PAGE_SIZE) {
      return rows
    }
  }
}

async function fetchConnectedKintoneConnectors(supabase: SupabaseClient): Promise<CleanupConnectorRow[]> {
  const { data, error } = await supabase
    .from('connectors')
    .select(`
      id,
      tenant_id,
      display_name,
      provider,
      created_at,
      connection_status!inner(status),
      connector_app_mappings!inner(
        id,
        source_app_id,
        target_app_type,
        target_table,
        is_active
      )
    `)
    .eq('provider', 'kintone')
    .eq('connection_status.status', 'connected')
    .eq('connector_app_mappings.is_active', true)
    .eq('connector_app_mappings.source_app_id', APP13_SOURCE_APP_ID)
    .eq('connector_app_mappings.target_app_type', TARGET_APP_TYPE)
    .or(`target_table.eq.${TARGET_TABLE},target_table.is.null`, { referencedTable: 'connector_app_mappings' })
    .not('tenant_id', 'is', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch connected Kintone connectors: ${error.message}`)
  }

  return (data || []) as CleanupConnectorRow[]
}

async function fetchTenant(supabase: SupabaseClient, tenantId: string): Promise<CleanupTenantRow> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug')
    .eq('id', tenantId)
    .single()

  if (error || !data) {
    throw new Error(`Failed to fetch tenant ${tenantId}: ${error?.message || 'not found'}`)
  }

  return data as CleanupTenantRow
}

async function fetchConnectorMappings(supabase: SupabaseClient, connectorId: string): Promise<CleanupMappingRow[]> {
  const { data, error } = await supabase
    .from('connector_app_mappings')
    .select('id, source_app_id, target_app_type, target_table, is_active')
    .eq('connector_id', connectorId)
    .eq('is_active', true)
    .eq('source_app_id', APP13_SOURCE_APP_ID)
    .eq('target_app_type', TARGET_APP_TYPE)

  if (error) {
    throw new Error(`Failed to fetch app13 people mappings for connector ${connectorId}: ${error.message}`)
  }

  return (data || []) as CleanupMappingRow[]
}

async function fetchMappingFilters(supabase: SupabaseClient, appMappingId: string): Promise<CleanupFilterRow[]> {
  const { data, error } = await supabase
    .from('connector_app_filters')
    .select('id, app_mapping_id, field_code, filter_value, is_active')
    .eq('app_mapping_id', appMappingId)

  if (error) {
    throw new Error(`Failed to fetch filters for mapping ${appMappingId}: ${error.message}`)
  }

  return (data || []) as CleanupFilterRow[]
}

async function fetchTenantPeopleRows(supabase: SupabaseClient, tenantId: string): Promise<CleanupPeopleRow[]> {
  return fetchAllPages<CleanupPeopleRow>(
    supabase,
    'people',
    'id, tenant_id, updated_at',
    (query) => query.eq('tenant_id', tenantId).order('id', { ascending: true })
  )
}

async function fetchDependentCounts(
  supabase: SupabaseClient,
  candidateIds: string[]
): Promise<PeopleCleanupDependentCounts> {
  if (candidateIds.length === 0) {
    return emptyDependentCounts()
  }

  const counts = emptyDependentCounts()
  for (const table of REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .in('person_id', candidateIds)

    if (error) {
      throw new Error(`Failed to count dependent ${table} rows: ${error.message}`)
    }

    counts[table] = count || 0
  }

  return counts
}

async function deletePeopleByIds(
  supabase: SupabaseClient,
  tenantId: string,
  cutoffIso: string,
  candidateIds: string[]
): Promise<string[]> {
  const { data, error } = await supabase
    .from('people')
    .delete()
    .eq('tenant_id', tenantId)
    .lte('updated_at', cutoffIso)
    .in('id', candidateIds)
    .select('id')

  if (error) {
    throw new Error(`Failed to delete people for tenant ${tenantId}: ${error.message}`)
  }

  return ((data || []) as Array<{ id: string }>).map((row) => row.id)
}

async function cleanupConnector(
  supabase: SupabaseClient,
  connector: CleanupConnectorRow,
  options: RunPeopleCleanupOptions,
  cutoffIso: string
): Promise<PeopleCleanupTenantResult> {
  const tenantId = connector.tenant_id?.trim() || null
  if (!tenantId) {
    throw new Error(`connector ${connector.id} has empty tenant_id`)
  }

  const tenant = await fetchTenant(supabase, tenantId)
  const tenantSlug = tenant.slug?.trim() || ''
  if (!tenantSlug) {
    throw new Error(`tenant ${tenantId} has empty slug`)
  }

  const mapping = selectActiveApp13PeopleMapping(await fetchConnectorMappings(supabase, connector.id))
  validateExpectedTenantCoidFilters(await fetchMappingFilters(supabase, mapping.id), mapping.id, tenantSlug)

  const kintoneClient = await (options.createKintoneClient || createKintoneClientForPeopleCleanup)(connector.id)
  const kintoneQuery = buildExpectedTenantCoidQuery(tenantSlug)
  const firstRecords = await kintoneClient.getRecords(mapping.source_app_id || APP13_SOURCE_APP_ID, kintoneQuery, ['$id'])
  const secondRecords = await kintoneClient.getRecords(mapping.source_app_id || APP13_SOURCE_APP_ID, kintoneQuery, ['$id'])
  const firstKintoneIds = extractCurrentKintoneRecordIds(firstRecords)
  const secondKintoneIds = extractCurrentKintoneRecordIds(secondRecords)
  assertStableKintoneIdSets(firstKintoneIds, secondKintoneIds)

  const dbPeople = await fetchTenantPeopleRows(supabase, tenantId)
  const plan = determinePeopleCleanupPlan({
    tenantId,
    cutoffIso,
    dbPeople,
    currentKintoneIds: firstKintoneIds,
  })
  const dependentCounts = await fetchDependentCounts(supabase, plan.candidateIds)

  if (options.apply) {
    ensureDeleteSafety(plan, options.maxDeletePerTenant)
  }

  return {
    success: true,
    mode: options.apply ? 'apply' : 'dry-run',
    connectorId: connector.id,
    connectorName: connector.display_name,
    tenantId,
    tenantSlug,
    appMappingId: mapping.id,
    cutoffIso,
    numericDbCount: plan.numericDbCount,
    currentKintoneIdCount: plan.currentKintoneIdCount,
    candidateCount: plan.candidateIds.length,
    deletedCount: 0,
    candidateIds: plan.candidateIds,
    deletedIds: [],
    dependentCounts,
  }
}

function authorityKey(result: PeopleCleanupTenantResult): string {
  return `${result.tenantId || ''}:${result.tenantSlug || ''}`
}

function markDuplicateAuthorities(results: PeopleCleanupTenantResult[]): void {
  const successfulByAuthority = new Map<string, PeopleCleanupTenantResult[]>()

  for (const result of results) {
    if (!result.success) continue
    const key = authorityKey(result)
    successfulByAuthority.set(key, [...(successfulByAuthority.get(key) || []), result])
  }

  for (const [key, authorityResults] of successfulByAuthority) {
    if (authorityResults.length === 1) continue
    const connectorIds = authorityResults.map((result) => result.connectorId).join(',')
    for (const result of authorityResults) {
      result.success = false
      result.error = `expected exactly one authoritative app13 people connector for tenant/COID ${key}, got ${authorityResults.length}: ${connectorIds}`
    }
  }
}

export async function runPeopleCleanup(
  supabase: SupabaseClient,
  options: RunPeopleCleanupOptions
): Promise<{
  success: boolean
  mode: PeopleCleanupMode
  connectorCount: number
  successCount: number
  failedCount: number
  candidateCount: number
  deletedCount: number
  dependentCounts: PeopleCleanupDependentCounts
  results: PeopleCleanupTenantResult[]
}> {
  ensureDeleteLimit([], options.maxDeletePerTenant)

  const connectors = await fetchConnectedKintoneConnectors(supabase)
  const results: PeopleCleanupTenantResult[] = []
  const cutoffIso = (options.now || (() => new Date()))().toISOString()

  for (const connector of connectors) {
    try {
      const result = await cleanupConnector(supabase, connector, options, cutoffIso)
      results.push(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const failedResult: PeopleCleanupTenantResult = {
        success: false,
        mode: options.apply ? 'apply' : 'dry-run',
        connectorId: connector.id,
        connectorName: connector.display_name,
        tenantId: connector.tenant_id,
        tenantSlug: null,
        appMappingId: null,
        cutoffIso: null,
        numericDbCount: 0,
        currentKintoneIdCount: 0,
        candidateCount: 0,
        deletedCount: 0,
        candidateIds: [],
        deletedIds: [],
        dependentCounts: emptyDependentCounts(),
        error: errorMessage,
      }

      console.error('[people-cleanup] tenant-failed', {
        connectorId: connector.id,
        tenantId: connector.tenant_id,
        error: errorMessage,
      })
      results.push(failedResult)
    }
  }

  markDuplicateAuthorities(results)
  const preflightFailedCount = results.filter((result) => !result.success).length

  if (options.apply && preflightFailedCount === 0) {
    for (const result of results) {
      if (result.candidateIds.length === 0 || !result.tenantId || !result.cutoffIso) {
        continue
      }

      try {
        const deletedIds = await deletePeopleByIds(supabase, result.tenantId, result.cutoffIso, result.candidateIds)
        result.deletedIds = deletedIds
        result.deletedCount = deletedIds.length
      } catch (error) {
        result.success = false
        result.error = error instanceof Error ? error.message : String(error)
        console.error('[people-cleanup] tenant-delete-failed', {
          connectorId: result.connectorId,
          tenantId: result.tenantId,
          error: result.error,
        })
        break
      }
    }
  } else if (options.apply && preflightFailedCount > 0) {
    console.error('[people-cleanup] apply-aborted-before-delete', {
      failedCount: preflightFailedCount,
    })
  }

  for (const result of results) {
    console.log('[people-cleanup] tenant', {
      connectorId: result.connectorId,
      tenantId: result.tenantId,
      tenantSlug: result.tenantSlug,
      mode: result.mode,
      success: result.success,
      appMappingId: result.appMappingId,
      numericDbCount: result.numericDbCount,
      currentKintoneIdCount: result.currentKintoneIdCount,
      candidateCount: result.candidateCount,
      deletedCount: result.deletedCount,
      candidateIds: result.candidateIds,
      deletedIds: result.deletedIds,
      dependentCounts: result.dependentCounts,
      error: result.error,
    })
  }

  const successCount = results.filter((result) => result.success).length
  const failedCount = results.length - successCount
  const dependentCounts = results.reduce(
    (sum, result) => addDependentCounts(sum, result.dependentCounts),
    emptyDependentCounts()
  )

  return {
    success: failedCount === 0,
    mode: options.apply ? 'apply' : 'dry-run',
    connectorCount: connectors.length,
    successCount,
    failedCount,
    candidateCount: results.reduce((sum, result) => sum + result.candidateCount, 0),
    deletedCount: results.reduce((sum, result) => sum + result.deletedCount, 0),
    dependentCounts,
    results,
  }
}
