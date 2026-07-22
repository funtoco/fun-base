import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'actor-user' },
  targetMember: {
    id: 'member-row',
    user_id: 'pending-auth-user',
    role: 'member',
    email: 'pending@example.com',
    status: 'pending',
  },
  actorMemberships: [{ role: 'admin' }],
  otherMembershipCount: 0,
  deleteMembershipError: null as null | { message: string },
  otherMembershipsError: null as null | { message: string },
  deleteAuthUserError: null as null | { message: string },
  deleteUser: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}))

type QueryState = {
  client: 'user' | 'admin'
  table: string
  action?: 'select' | 'delete'
  selectColumns?: string
  selectOptions?: Record<string, unknown>
  filters: Array<{ method: string; args: unknown[] }>
}

function createQuery(state: QueryState): any {
  const query: any = {
    select(columns?: string, options?: Record<string, unknown>) {
      state.action = 'select'
      state.selectColumns = columns
      state.selectOptions = options
      return query
    },
    delete() {
      state.action = 'delete'
      return query
    },
    eq(...args: unknown[]) {
      state.filters.push({ method: 'eq', args })
      return query
    },
    neq(...args: unknown[]) {
      state.filters.push({ method: 'neq', args })
      return query
    },
    single() {
      return Promise.resolve(resolveQuery(state, 'single'))
    },
    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      return Promise.resolve(resolveQuery(state, 'then')).then(resolve, reject)
    },
  }
  return query
}

function resolveQuery(state: QueryState, terminal: 'single' | 'then') {
  if (state.client === 'user' && state.table === 'user_tenants') {
    if (terminal === 'single' && state.selectColumns?.includes('id, user_id')) {
      return { data: mocks.targetMember, error: null }
    }
    if (terminal === 'then' && state.action === 'select' && state.selectColumns === 'role') {
      return { data: mocks.actorMemberships, error: null }
    }
    if (terminal === 'then' && state.action === 'delete') {
      return { error: mocks.deleteMembershipError }
    }
  }

  if (state.client === 'admin' && state.table === 'user_tenants') {
    if (terminal === 'then' && state.action === 'select' && state.selectOptions?.head === true) {
      return { count: mocks.otherMembershipCount, error: mocks.otherMembershipsError }
    }
  }

  throw new Error(`Unhandled query: ${JSON.stringify(state)}`)
}

function createSupabaseClient(client: 'user' | 'admin') {
  return {
    auth: client === 'user'
      ? { getUser: vi.fn().mockResolvedValue({ data: { user: mocks.currentUser }, error: null }) }
      : { admin: { deleteUser: mocks.deleteUser } },
    from: vi.fn((table: string) => createQuery({ client, table, filters: [] })),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/client', () => ({
  createAdminClient: mocks.createAdminClient,
}))

describe('DELETE /api/tenants/[tenantId]/members/[memberId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.currentUser = { id: 'actor-user' }
    mocks.targetMember = {
      id: 'member-row',
      user_id: 'pending-auth-user',
      role: 'member',
      email: 'pending@example.com',
      status: 'pending',
    }
    mocks.actorMemberships = [{ role: 'admin' }]
    mocks.otherMembershipCount = 0
    mocks.deleteMembershipError = null
    mocks.otherMembershipsError = null
    mocks.deleteAuthUserError = null
    mocks.deleteUser.mockResolvedValue({ error: null })
    mocks.createClient.mockImplementation(() => createSupabaseClient('user'))
    mocks.createAdminClient.mockImplementation(() => createSupabaseClient('admin'))
  })

  it('deletes the Supabase Auth user when deleting an orphan pending invitation', async () => {
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost') as any, {
      params: { tenantId: 'tenant-1', memberId: 'member-row' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(2)
    expect(mocks.deleteUser).toHaveBeenCalledWith('pending-auth-user')
  })

  it('still removes the pending membership when Auth cleanup fails', async () => {
    mocks.deleteUser.mockResolvedValue({ error: { message: 'Auth user not found' } })
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost') as any, {
      params: { tenantId: 'tenant-1', memberId: 'member-row' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.deleteUser).toHaveBeenCalledWith('pending-auth-user')
  })

  it('keeps the Supabase Auth user when the invitee has another app membership', async () => {
    mocks.otherMembershipCount = 1
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost') as any, {
      params: { tenantId: 'tenant-1', memberId: 'member-row' },
    })

    expect(response.status).toBe(200)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('does not delete Auth users for active member removal', async () => {
    mocks.targetMember = { ...mocks.targetMember, status: 'active' }
    const { DELETE } = await import('./route')

    const response = await DELETE(new Request('http://localhost') as any, {
      params: { tenantId: 'tenant-1', memberId: 'member-row' },
    })

    expect(response.status).toBe(200)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
})
