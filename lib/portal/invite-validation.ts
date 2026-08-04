export type InviteRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter'

export function validateInviteOffices(
  role: InviteRole,
  officeIds: string[] | undefined | null,
): { ok: true } | { ok: false; error: string } {
  const needsOffice = role === 'member' || role === 'guest'
  if (needsOffice && (!officeIds || officeIds.length === 0)) {
    return { ok: false, error: 'officeIds required for member/guest' }
  }
  return { ok: true }
}
