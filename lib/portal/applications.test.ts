import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  memberships: [] as Array<{
    id: string
    tenant_id: string
    role: string
    tenant: { name: string | null } | null
  }>,
  assignments: [] as Array<{ user_tenant_id: string; tenant_office_id: string }>,
  assignmentsError: null as null | { message: string },
  offices: [] as Array<{ id: string; tenant_id: string; name: string }>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

function createQuery(table: string): any {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    then(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) {
      if (table === 'user_tenants') {
        return Promise.resolve({ data: mocks.memberships, error: null }).then(resolve, reject)
      }
      if (table === 'user_tenant_offices') {
        return Promise.resolve({ data: mocks.assignments, error: mocks.assignmentsError }).then(resolve, reject)
      }
      if (table === 'tenant_offices') {
        return Promise.resolve({ data: mocks.offices, error: null }).then(resolve, reject)
      }
      return Promise.reject(new Error(`Unexpected table ${table}`)).then(resolve, reject)
    },
  }
  return query
}

function setupClient() {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn((table: string) => createQuery(table)),
  })
}

describe('getAccessibleOffices', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.memberships = [
      { id: 'membership-1', tenant_id: 'tenant-1', role: 'member', tenant: { name: 'テナントA' } },
    ]
    mocks.assignments = []
    mocks.assignmentsError = null
    mocks.offices = [
      { id: 'office-2', tenant_id: 'tenant-1', name: '所属先B' },
      { id: 'office-1', tenant_id: 'tenant-1', name: '所属先A' },
    ]
    setupClient()
  })

  it('memberで所属先割当が0件の場合は空配列を返す', async () => {
    const { getAccessibleOffices } = await import('./applications')

    await expect(getAccessibleOffices()).resolves.toEqual([])
  })

  it('memberで所属先割当がある場合は割当先だけ返す', async () => {
    mocks.assignments = [{ user_tenant_id: 'membership-1', tenant_office_id: 'office-2' }]
    const { getAccessibleOffices } = await import('./applications')

    await expect(getAccessibleOffices()).resolves.toEqual([
      { id: 'office-2', tenantId: 'tenant-1', tenantName: 'テナントA', name: '所属先B' },
    ])
  })

  it('所属先割当の取得に失敗した場合は全所属先扱いにせず空配列を返す', async () => {
    mocks.assignmentsError = { message: 'permission denied' }
    const { getAccessibleOffices } = await import('./applications')

    await expect(getAccessibleOffices()).resolves.toEqual([])
  })
})
