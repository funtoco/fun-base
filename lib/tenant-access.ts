export type TenantAccessRole =
  | "owner"
  | "admin"
  | "member"
  | "guest"
  | "supporter"

export type TenantFeaturePermission =
  | "people"
  | "visas"
  | "meetings"
  | "support_actions"
  | "documents"
  | "funedu"

export type TenantFeaturePermissions = Partial<Record<TenantFeaturePermission, boolean>>

export interface TenantRoleMembership {
  role: TenantAccessRole | null
  status?: string | null
  feature_permissions?: TenantFeaturePermissions | string | null
}

export const TENANT_MANAGEABLE_ROLES = [
  "owner",
  "admin",
  "member",
  "guest",
] as const satisfies readonly Exclude<TenantAccessRole, "supporter">[]

export const TENANT_INVITABLE_ROLES = [
  "admin",
  "member",
  "guest",
] as const satisfies readonly Exclude<TenantAccessRole, "owner" | "supporter">[]

export const TENANT_FEATURE_PERMISSION_KEYS = [
  "people",
  "visas",
  "meetings",
  "support_actions",
  "documents",
  "funedu",
] as const satisfies readonly TenantFeaturePermission[]

export const TENANT_FEATURE_PERMISSION_LABELS: Record<TenantFeaturePermission, string> = {
  people: "人材一覧",
  visas: "ビザ",
  meetings: "面談",
  support_actions: "サポート記録",
  documents: "書類",
  funedu: "FunEdu",
}

const INTERNAL_STAFF_EMAIL_DOMAIN = "@funtoco.jp"

function normalizeEmailForClassification(email?: string | null): string | null {
  if (typeof email !== "string") {
    return null
  }

  const normalizedEmail = email.trim().toLowerCase()
  return normalizedEmail.length > 0 ? normalizedEmail : null
}

export function canManageTenant(memberships: TenantRoleMembership[]): boolean {
  return memberships.some(
    (membership) =>
      membership.role === "owner" || membership.role === "admin"
  )
}

export function normalizeTenantFeaturePermissions(
  permissions: TenantRoleMembership["feature_permissions"]
): TenantFeaturePermissions {
  if (!permissions) {
    return {}
  }

  if (typeof permissions === "string") {
    try {
      return normalizeTenantFeaturePermissions(JSON.parse(permissions))
    } catch {
      return {}
    }
  }

  const normalized: TenantFeaturePermissions = {}
  for (const key of TENANT_FEATURE_PERMISSION_KEYS) {
    const value = permissions[key]
    if (typeof value === "boolean") {
      normalized[key] = value
    }
  }

  return normalized
}

export function hasTenantFeatureAccess(
  membership: TenantRoleMembership,
  feature: TenantFeaturePermission
): boolean {
  if (membership.status && membership.status !== "active") {
    return false
  }

  if (membership.role === "owner" || membership.role === "admin") {
    return true
  }

  const permissions = normalizeTenantFeaturePermissions(membership.feature_permissions)
  return permissions[feature] !== false
}

export function hasAnyTenantFeatureAccess(
  memberships: TenantRoleMembership[],
  feature: TenantFeaturePermission
): boolean {
  return memberships.some((membership) => hasTenantFeatureAccess(membership, feature))
}

export function isInternalStaffEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmailForClassification(email)
  return normalizedEmail?.endsWith(INTERNAL_STAFF_EMAIL_DOMAIN) ?? false
}

export function isCompanyContactEmail(email?: string | null): boolean {
  const normalizedEmail = normalizeEmailForClassification(email)
  return normalizedEmail !== null && !isInternalStaffEmail(normalizedEmail)
}

export function isVisibleCompanyTenantMember(input: {
  email?: string | null
  user?: { email?: string | null } | null
}): boolean {
  const email =
    normalizeEmailForClassification(input.email)
    ?? normalizeEmailForClassification(input.user?.email)

  if (!email) {
    return false
  }

  return !isInternalStaffEmail(email)
}

export function isCompanyContactRole(role: TenantAccessRole | null): boolean {
  return role === "member" || role === "guest"
}

export function canManageCompanyContacts(
  memberships: TenantRoleMembership[],
  _actorEmail?: string | null
): boolean {
  return canManageTenant(memberships)
}

export function isTenantOwner(memberships: TenantRoleMembership[]): boolean {
  return memberships.some((membership) => membership.role === "owner")
}

interface TenantMemberMutationInput {
  currentUserId: string
  targetUserId: string
  targetRole: TenantAccessRole | null
  actorMemberships: TenantRoleMembership[]
}

interface TenantMemberRoleUpdateInput extends TenantMemberMutationInput {
  nextRole: Exclude<TenantAccessRole, "supporter">
  activeOwnerCount: number
}

export function getTenantMemberRoleUpdateError(
  input: TenantMemberRoleUpdateInput
): string | null {
  const {
    currentUserId,
    targetUserId,
    targetRole,
    actorMemberships,
    nextRole,
    activeOwnerCount,
  } = input

  if (!canManageTenant(actorMemberships)) {
    return "ロールを変更する権限がありません"
  }

  if (targetRole === "supporter") {
    return "supporter ロールはこの画面から変更できません"
  }

  if (targetUserId === currentUserId) {
    return "自分のロールは変更できません"
  }

  if (targetRole === "owner" && !isTenantOwner(actorMemberships)) {
    return "オーナーのロールは変更できません"
  }

  if (targetRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1) {
    return "最後のオーナーは削除・降格できません"
  }

  return null
}

export function getTenantMemberRemovalError(
  input: TenantMemberMutationInput
): string | null {
  const { currentUserId, targetUserId, targetRole, actorMemberships } = input

  if (!canManageTenant(actorMemberships)) {
    return "メンバーを削除する権限がありません"
  }

  if (targetRole === "supporter") {
    return "supporter ロールはこの画面から削除できません"
  }

  if (targetUserId === currentUserId) {
    return "自分自身を削除することはできません"
  }

  if (targetRole === "owner") {
    return "オーナーは削除できません"
  }

  return null
}
