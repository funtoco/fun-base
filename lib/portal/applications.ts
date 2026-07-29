import { createClient } from '@/lib/supabase/server'
import { groupRequirements, type MemberNameRef } from './requirements'
import type {
  AccessibleOffice,
  CaseDetail,
  CaseDocumentRequirement,
  CaseMember,
  GroupedRequirements,
  VisaApplicationCase,
} from './types'

const TENANT_WIDE_ROLES = new Set(['owner', 'admin', 'supporter'])

type CaseRow = {
  id: string
  tenant_id: string
  tenant_office_id: string
  entity_type: string
  application_category: string
  field: string
  application_type: string | null
  management_number: string | null
  status: string
  title: string | null
  note: string | null
  created_at: string
  updated_at: string
}

type RequirementRow = {
  id: string
  case_id: string
  document_code: string
  name: string
  scope: string
  person_id: string | null
  is_required: boolean
  copy_type: string | null
  issuer: string | null
  validity_months: number | null
  status: string
  rejection_reason: string | null
  office_document_id: string | null
  person_document_id: string | null
  sort_order: number
}

const REQUIREMENT_COLUMNS =
  'id, case_id, document_code, name, scope, person_id, is_required, copy_type, issuer, validity_months, status, rejection_reason, office_document_id, person_document_id, sort_order'

type MemberRow = {
  id: string
  case_id: string
  person_id: string
  visa_id: string | null
  created_at: string
}

function mapCase(row: CaseRow, officeName: string | null): VisaApplicationCase {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantOfficeId: row.tenant_office_id,
    officeName,
    entityType: row.entity_type as VisaApplicationCase['entityType'],
    applicationCategory:
      row.application_category as VisaApplicationCase['applicationCategory'],
    field: row.field as VisaApplicationCase['field'],
    applicationType: row.application_type,
    managementNumber: row.management_number,
    status: row.status as VisaApplicationCase['status'],
    title: row.title,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRequirement(row: RequirementRow): CaseDocumentRequirement {
  return {
    id: row.id,
    caseId: row.case_id,
    documentCode: row.document_code,
    name: row.name,
    scope: row.scope as CaseDocumentRequirement['scope'],
    personId: row.person_id,
    isRequired: row.is_required,
    copyType: row.copy_type as CaseDocumentRequirement['copyType'],
    issuer: row.issuer,
    validityMonths: row.validity_months,
    status: row.status as CaseDocumentRequirement['status'],
    rejectionReason: row.rejection_reason,
    officeDocumentId: row.office_document_id,
    personDocumentId: row.person_document_id,
    sortOrder: row.sort_order,
  }
}

/**
 * ログインユーザーのセッションで、案件作成に使える事業所を返す。
 * portal_can_access_office と同じ境界:
 *  - owner/admin/supporter は所属テナントの全事業所
 *  - member/guest は割当のある事業所のみ
 */
export async function getAccessibleOffices(): Promise<AccessibleOffice[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('user_tenants')
    .select('id, tenant_id, role, tenant:tenant_id (name)')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (membershipError) {
    console.error('Error fetching memberships for accessible offices:', membershipError)
    return []
  }

  const rows = (memberships || []) as Array<{
    id: string
    tenant_id: string
    role: string
    tenant: { name: string | null } | { name: string | null }[] | null
  }>
  if (rows.length === 0) {
    return []
  }

  const tenantNameById = new Map<string, string | null>()
  const wideTenantIds = new Set<string>()
  const membershipIds: string[] = []
  for (const row of rows) {
    const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant
    tenantNameById.set(row.tenant_id, tenant?.name ?? null)
    membershipIds.push(row.id)
    if (TENANT_WIDE_ROLES.has(row.role)) {
      wideTenantIds.add(row.tenant_id)
    }
  }

  // 割当ベース（member/guest 用）
  const assignedOfficeIds = new Set<string>()
  if (membershipIds.length > 0) {
    const { data: assignments, error: assignError } = await supabase
      .from('user_tenant_offices')
      .select('tenant_office_id')
      .in('user_tenant_id', membershipIds)
    if (assignError) {
      console.error('Error fetching office assignments:', assignError)
    } else {
      for (const a of assignments || []) {
        assignedOfficeIds.add((a as { tenant_office_id: string }).tenant_office_id)
      }
    }
  }

  const tenantIds = Array.from(tenantNameById.keys())
  const { data: offices, error: officesError } = await supabase
    .from('tenant_offices')
    .select('id, tenant_id, name')
    .in('tenant_id', tenantIds)
    .eq('is_active', true)

  if (officesError) {
    console.error('Error fetching tenant offices:', officesError)
    return []
  }

  const accessible: AccessibleOffice[] = []
  for (const office of (offices || []) as Array<{
    id: string
    tenant_id: string
    name: string
  }>) {
    const isWide = wideTenantIds.has(office.tenant_id)
    if (isWide || assignedOfficeIds.has(office.id)) {
      accessible.push({
        id: office.id,
        tenantId: office.tenant_id,
        tenantName: tenantNameById.get(office.tenant_id) ?? null,
        name: office.name,
      })
    }
  }

  accessible.sort((a, b) => a.name.localeCompare(b.name, 'ja-JP'))
  return accessible
}

async function resolveOfficeNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  officeIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const unique = Array.from(new Set(officeIds)).filter(Boolean)
  if (unique.length === 0) {
    return map
  }
  const { data, error } = await supabase
    .from('tenant_offices')
    .select('id, name')
    .in('id', unique)
  if (error) {
    console.error('Error resolving office names:', error)
    return map
  }
  for (const o of (data || []) as Array<{ id: string; name: string | null }>) {
    map.set(o.id, o.name ?? null)
  }
  return map
}

/**
 * アクセス可能な案件の一覧（RLS が自動で office 境界に絞る）。
 */
export async function listCases(): Promise<VisaApplicationCase[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('visa_application_cases')
    .select(
      'id, tenant_id, tenant_office_id, entity_type, application_category, field, application_type, management_number, status, title, note, created_at, updated_at'
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error listing cases:', error)
    throw error
  }

  const rows = (data || []) as CaseRow[]
  const officeNames = await resolveOfficeNames(
    supabase,
    rows.map((r) => r.tenant_office_id)
  )
  return rows.map((r) => mapCase(r, officeNames.get(r.tenant_office_id) ?? null))
}

async function fetchMembersWithNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caseId: string
): Promise<CaseMember[]> {
  const { data, error } = await supabase
    .from('visa_application_case_members')
    .select('id, case_id, person_id, visa_id, created_at')
    .eq('case_id', caseId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching case members:', error)
    throw error
  }

  const memberRows = (data || []) as MemberRow[]
  const personIds = Array.from(new Set(memberRows.map((m) => m.person_id)))
  const nameByPerson = new Map<string, string | null>()
  if (personIds.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from('people')
      .select('id, name')
      .in('id', personIds)
    if (peopleError) {
      console.error('Error fetching member names:', peopleError)
    } else {
      for (const p of (people || []) as Array<{ id: string; name: string | null }>) {
        nameByPerson.set(p.id, p.name ?? null)
      }
    }
  }

  return memberRows.map((m) => ({
    id: m.id,
    caseId: m.case_id,
    personId: m.person_id,
    visaId: m.visa_id,
    personName: nameByPerson.get(m.person_id) ?? null,
    createdAt: m.created_at,
  }))
}

/**
 * 案件詳細（案件 + メンバー + people 表示名）。アクセス不可/存在しない場合は null。
 */
export async function getCase(caseId: string): Promise<CaseDetail | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('visa_application_cases')
    .select(
      'id, tenant_id, tenant_office_id, entity_type, application_category, field, application_type, management_number, status, title, note, created_at, updated_at'
    )
    .eq('id', caseId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching case:', error)
    return null
  }
  if (!data) {
    return null
  }

  const row = data as CaseRow
  const officeNames = await resolveOfficeNames(supabase, [row.tenant_office_id])
  const members = await fetchMembersWithNames(supabase, caseId)

  return {
    ...mapCase(row, officeNames.get(row.tenant_office_id) ?? null),
    members,
  }
}

/**
 * 案件の必要書類を取得し office / person（人材ごと）にグループ化して返す。
 */
export async function getRequirements(caseId: string): Promise<GroupedRequirements> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { office: [], persons: [] }
  }

  const { data, error } = await supabase
    .from('case_document_requirements')
    .select(REQUIREMENT_COLUMNS)
    .eq('case_id', caseId)

  if (error) {
    console.error('Error fetching requirements:', error)
    throw error
  }

  const requirements = ((data || []) as RequirementRow[]).map(mapRequirement)
  const members = await fetchMembersWithNames(supabase, caseId)
  const memberRefs: MemberNameRef[] = members.map((m) => ({
    personId: m.personId,
    personName: m.personName,
  }))

  return groupRequirements(requirements, memberRefs)
}

/**
 * 案件のテナントでレビュー権限（承認/差戻し=writer）があるかを判定する。
 * portal_is_writer と同じ境界（owner/admin/supporter/member）。
 */
export async function isPortalWriter(tenantId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('portal_is_writer', {
    p_tenant_id: tenantId,
  })
  if (error) {
    console.error('Error checking portal writer:', error)
    return false
  }
  return data === true
}

/**
 * 案件詳細 + グループ化済み要件 + 閲覧者のレビュー権限をまとめて取得（詳細画面用）。
 */
export async function getCaseWithRequirements(caseId: string): Promise<{
  case: CaseDetail
  requirements: GroupedRequirements
  isWriter: boolean
} | null> {
  const detail = await getCase(caseId)
  if (!detail) {
    return null
  }
  const requirements = await getRequirements(caseId)
  const isWriter = await isPortalWriter(detail.tenantId)
  return { case: detail, requirements, isWriter }
}

/**
 * 指定事業所に所属し、まだ案件に含まれていない人材の候補を返す（AddMembersDialog 用）。
 */
export async function getOfficePeopleForCase(
  officeId: string,
  excludePersonIds: string[] = []
): Promise<Array<{ id: string; name: string | null; visaId: string | null }>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('people')
    .select('id, name, visa_id, tenant_office_id')
    .eq('tenant_office_id', officeId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching office people:', error)
    return []
  }

  const exclude = new Set(excludePersonIds)
  return ((data || []) as Array<{ id: string; name: string | null; visa_id: string | null }>)
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ id: p.id, name: p.name ?? null, visaId: p.visa_id ?? null }))
}
