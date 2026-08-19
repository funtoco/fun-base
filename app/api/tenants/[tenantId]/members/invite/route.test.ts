import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  currentUser: { id: 'actor-user' },
  actorMemberships: [{ role: 'admin' }],
  existingMemberships: [
    { id: 'pending-member-row', role: 'member', status: 'pending' },
  ],
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
}))

type QueryState = {
  table: string
  action?: 'select'
  selectColumns?: string
  filters: Array<{ method: string; args: unknown[] }>
}

function createQuery(state: QueryState): any {
  const query: any = {
    select(columns?: string) {
      state.action = 'select'
      state.selectColumns = columns
      return query
    },
    eq(...args: unknown[]) {
      state.filters.push({ method: 'eq', args })
      return query
    },
    in(...args: unknown[]) {
      state.filters.push({ method: 'in', args })
      return query
    },
    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      return Promise.resolve(resolveQuery(state)).then(resolve, reject)
    },
  }
  return query
}

function resolveQuery(state: QueryState) {
  if (state.table === 'user_tenants' && state.selectColumns === 'role') {
    return { data: mocks.actorMemberships, error: null }
  }

  if (state.table === 'user_tenants' && state.selectColumns === 'id, status, role') {
    return { data: mocks.existingMemberships, error: null }
  }

  throw new Error(`Unhandled query: ${JSON.stringify(state)}`)
}

function createSupabaseClient() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mocks.currentUser }, error: null }) },
    from: vi.fn((table: string) => createQuery({ table, filters: [] })),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/client', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/notifications/email', () => ({
  sendEmail: mocks.sendEmail,
}))

describe('POST /api/tenants/[tenantId]/members/invite', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.currentUser = { id: 'actor-user' }
    mocks.actorMemberships = [{ role: 'admin' }]
    mocks.existingMemberships = [
      { id: 'pending-member-row', role: 'member', status: 'pending' },
    ]
    mocks.createClient.mockImplementation(createSupabaseClient)
  })

  it('returns an operator-friendly message when an email invitation is already pending', async () => {
    const { POST } = await import('./route')
    const request = new Request('https://funbase.funtoco.jp/api/tenants/tenant-1/members/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'pending@example.com',
        role: 'member',
        officeIds: [],
      }),
    })

    const response = await POST(request as any, { params: { tenantId: 'tenant-1' } })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'このメールアドレスはすでに招待中です。既存メンバー行の「再送」ボタンから招待メールを再送してください。',
    })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })
})
