export type InviteRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter'

export function validateInviteOffices(
  _role: InviteRole,
  _officeIds: string[] | undefined | null,
): { ok: true } | { ok: false; error: string } {
  // 所属先未選択は user_tenant_offices 0件のまま「全所属先」として扱う。
  return { ok: true }
}
