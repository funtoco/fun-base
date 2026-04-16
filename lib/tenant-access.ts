export type TenantAccessRole =
  | "owner"
  | "admin"
  | "member"
  | "guest"
  | "supporter"

export interface TenantRoleMembership {
  role: TenantAccessRole | null
}

export function canManageTenant(memberships: TenantRoleMembership[]): boolean {
  return memberships.some(
    (membership) =>
      membership.role === "owner" || membership.role === "admin"
  )
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
