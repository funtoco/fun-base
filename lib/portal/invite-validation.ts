export type InviteRole = 'owner' | 'admin' | 'member' | 'guest' | 'supporter'

export type OfficeIdsParseResult =
  | { ok: true; officeIds: string[] }
  | { ok: false; error: string }

export function parseOfficeIds(value: unknown): OfficeIdsParseResult {
  if (typeof value === 'undefined') {
    return { ok: true, officeIds: [] }
  }

  if (value === null || !Array.isArray(value)) {
    return { ok: false, error: 'Invalid officeIds' }
  }

  const officeIds: string[] = []
  for (const id of value) {
    if (typeof id !== 'string') {
      return { ok: false, error: 'Invalid officeIds' }
    }

    const trimmed = id.trim()
    if (!trimmed) {
      return { ok: false, error: 'Invalid officeIds' }
    }
    officeIds.push(trimmed)
  }

  return { ok: true, officeIds: Array.from(new Set(officeIds)) }
}

export function validateInviteOffices(
  _role: InviteRole,
  _officeIds: string[] | undefined | null,
): { ok: true } | { ok: false; error: string } {
  // 所属先未選択は「全所属先」スコープとして扱う。
  return { ok: true }
}

export async function resolveOfficeIdsForScope(
  supabase: {
    from: (table: string) => any
  },
  tenantId: string,
  officeIds: string[],
): Promise<{ ok: true; officeIds: string[] } | { ok: false; error: string; status: number }> {
  const query = supabase
    .from('tenant_offices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  const { data: offices, error: officesError } = officeIds.length > 0
    ? await query.in('id', officeIds)
    : await query

  if (officesError) {
    console.error('Error resolving invitation offices:', officesError)
    return { ok: false, error: 'Failed to verify affiliations', status: 500 }
  }

  const resolvedOfficeIds = Array.from(
    new Set(((offices || []) as Array<{ id: string }>).map((office) => office.id)),
  )

  if (officeIds.length > 0 && resolvedOfficeIds.length !== officeIds.length) {
    return { ok: false, error: 'Invalid officeIds', status: 400 }
  }

  return { ok: true, officeIds: resolvedOfficeIds }
}
