import {
  hasTenantFeatureAccess,
  type TenantFeaturePermission,
} from "@/lib/tenant-access"

type TenantMembership = {
  id?: string | null
  tenant_id?: string | null
  role?: string | null
  status?: string | null
  feature_permissions?: unknown
  offices?: Array<{ name?: string | null }> | null
  [key: string]: unknown
}

export type CompanyAccess = {
  fullTenantIds: Set<string>
  restrictedTenantCompanies: Map<string, Set<string>>
  hasActiveMembership: boolean
}

const FULL_ACCESS_ROLES = new Set(["owner", "admin", "supporter"])

const COMPANY_ACCESS_KEYS = [
  "accessible_companies",
  "accessible_company_names",
  "allowed_companies",
  "allowed_company_names",
  "assigned_companies",
  "assigned_company_names",
  "permitted_companies",
  "permitted_company_names",
  "viewable_companies",
  "viewable_company_names",
  "visible_companies",
  "visible_company_names",
  "accessible_offices",
  "accessible_office_names",
  "allowed_offices",
  "allowed_office_names",
  "assigned_offices",
  "assigned_office_names",
  "permitted_offices",
  "permitted_office_names",
  "viewable_offices",
  "viewable_office_names",
  "visible_offices",
  "visible_office_names",
  "company_access_scope",
  "office_access_scope",
  "visible_company_scope",
  "visible_office_scope",
  "settings",
] as const

function normalizeCompanyName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function extractCompanyNames(value: unknown): string[] {
  if (!value) return []

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed || trimmed === "all") return []

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return extractCompanyNames(JSON.parse(trimmed))
      } catch {
        // Fall through to comma-separated parsing.
      }
    }

    return trimmed
      .split(",")
      .map(normalizeCompanyName)
      .filter((name): name is string => Boolean(name))
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") return extractCompanyNames(item)
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>
        return extractCompanyNames(
          record.name ??
            record.company ??
            record.companyName ??
            record.company_name ??
            record.office ??
            record.officeName ??
            record.office_name
        )
      }
      return []
    })
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return [
      "companies",
      "companyNames",
      "company_names",
      "offices",
      "officeNames",
      "office_names",
      "accessibleCompanies",
      "accessible_companies",
      "allowedCompanies",
      "allowed_companies",
      "viewableCompanies",
      "viewable_companies",
      "viewableOffices",
      "viewable_offices",
      "visibleCompanies",
      "visible_companies",
      "visibleOffices",
      "visible_offices",
    ].flatMap((key) => extractCompanyNames(record[key]))
  }

  return []
}

function membershipHasAllCompanyAccess(membership: TenantMembership): boolean {
  return COMPANY_ACCESS_KEYS.some((key) => {
    const value = membership[key]
    return value === "all" || value === "*" || (value && typeof value === "object" && (value as Record<string, unknown>).mode === "all")
  })
}

export function buildCompanyAccess(
  memberships: TenantMembership[],
  feature: TenantFeaturePermission = "people"
): CompanyAccess {
  const access: CompanyAccess = {
    fullTenantIds: new Set(),
    restrictedTenantCompanies: new Map(),
    hasActiveMembership: false,
  }

  memberships
    .filter((membership) => membership.status === "active" && membership.tenant_id)
    .forEach((membership) => {
      access.hasActiveMembership = true
      const tenantId = membership.tenant_id as string

      if (
        !hasTenantFeatureAccess(
          {
            role: membership.role as any,
            status: membership.status,
            feature_permissions: membership.feature_permissions as any,
          },
          feature
        )
      ) {
        return
      }

      if (FULL_ACCESS_ROLES.has(membership.role ?? "") || membershipHasAllCompanyAccess(membership)) {
        access.fullTenantIds.add(tenantId)
        return
      }

      const officeNames = (membership.offices || [])
        .map((office) => normalizeCompanyName(office.name))
        .filter((name): name is string => Boolean(name))
      const companyNames = [
        ...officeNames,
        ...COMPANY_ACCESS_KEYS.flatMap((key) => extractCompanyNames(membership[key])),
      ]

      if (companyNames.length === 0) {
        access.fullTenantIds.add(tenantId)
        return
      }

      const companies = access.restrictedTenantCompanies.get(tenantId) ?? new Set<string>()
      companyNames.forEach((name) => companies.add(name))
      access.restrictedTenantCompanies.set(tenantId, companies)
    })

  return access
}

export async function getCompanyAccessForUser(
  supabase: any,
  userId: string,
  feature: TenantFeaturePermission = "people"
): Promise<CompanyAccess> {
  const { data: memberships, error: membershipsError } = await supabase
    .from("user_tenants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")

  if (membershipsError) {
    throw membershipsError
  }

  const membershipRecords = (memberships || []) as TenantMembership[]
  const membershipIds = membershipRecords
    .map((membership) => membership.id)
    .filter((id): id is string => Boolean(id))

  if (membershipIds.length === 0) {
    return buildCompanyAccess(membershipRecords, feature)
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("user_tenant_offices")
    .select("user_tenant_id, tenant_office_id")
    .in("user_tenant_id", membershipIds)

  if (assignmentsError) {
    throw assignmentsError
  }

  const assignmentRecords = (assignments || []) as Array<{
    user_tenant_id: string
    tenant_office_id: string
  }>
  const officeIds = Array.from(
    new Set(assignmentRecords.map((assignment) => assignment.tenant_office_id))
  )

  const officesById = new Map<string, { name?: string | null }>()
  if (officeIds.length > 0) {
    const { data: offices, error: officesError } = await supabase
      .from("tenant_offices")
      .select("id, name")
      .eq("is_active", true)
      .in("id", officeIds)

    if (officesError) {
      throw officesError
    }

    for (const office of offices || []) {
      officesById.set(office.id, office)
    }
  }

  const officeNamesByMembershipId = new Map<string, Array<{ name?: string | null }>>()
  for (const assignment of assignmentRecords) {
    const office = officesById.get(assignment.tenant_office_id)
    if (!office) continue

    const current = officeNamesByMembershipId.get(assignment.user_tenant_id) || []
    current.push(office)
    officeNamesByMembershipId.set(assignment.user_tenant_id, current)
  }

  return buildCompanyAccess(
    membershipRecords.map((membership) => ({
      ...membership,
      offices: membership.id
        ? officeNamesByMembershipId.get(membership.id) || []
        : [],
    })),
    feature
  )
}

export function canAccessPersonByCompany(person: { tenant_id?: string | null; company?: string | null }, access: CompanyAccess): boolean {
  if (!access.hasActiveMembership) return false
  if (!person.tenant_id) return false
  if (access.fullTenantIds.has(person.tenant_id)) return true

  const allowedCompanies = access.restrictedTenantCompanies.get(person.tenant_id)
  if (!allowedCompanies || allowedCompanies.size === 0) return false

  const company = normalizeCompanyName(person.company)
  return Boolean(company && allowedCompanies.has(company))
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function buildPeopleAccessOrFilter(access: CompanyAccess): string | null {
  if (!access.hasActiveMembership) return null

  const clauses: string[] = []
  const fullTenantIds = Array.from(access.fullTenantIds)

  if (fullTenantIds.length > 0) {
    clauses.push(`tenant_id.in.(${fullTenantIds.join(",")})`)
  }

  access.restrictedTenantCompanies.forEach((companies, tenantId) => {
    if (access.fullTenantIds.has(tenantId) || companies.size === 0) return

    clauses.push(
      `and(tenant_id.eq.${tenantId},company.in.(${Array.from(companies).map(quotePostgrestValue).join(",")}))`
    )
  })

  return clauses.length > 0 ? clauses.join(",") : null
}

export function applyPeopleAccessFilter<TQuery extends { or: (filters: string) => TQuery }>(
  query: TQuery,
  access: CompanyAccess
): TQuery | null {
  const filter = buildPeopleAccessOrFilter(access)
  if (!filter) return null
  return query.or(filter)
}

export async function getAccessiblePersonIdsForUser(
  supabase: any,
  userId: string,
  feature: TenantFeaturePermission = "people"
): Promise<string[]> {
  const access = await getCompanyAccessForUser(supabase, userId, feature)
  const query = applyPeopleAccessFilter(
    supabase
      .from("people")
      .select("id, tenant_id, company"),
    access
  )

  if (!query) {
    return []
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return (data || [])
    .filter((person: any) => canAccessPersonByCompany(person, access))
    .map((person: any) => person.id)
    .filter((id: unknown): id is string => typeof id === "string")
}

export async function getAccessiblePersonIdsForCurrentUser(
  supabase: any,
  feature: TenantFeaturePermission = "people"
): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  return getAccessiblePersonIdsForUser(supabase, user.id, feature)
}
