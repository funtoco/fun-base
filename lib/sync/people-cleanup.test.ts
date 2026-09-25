import assert from 'node:assert/strict'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCredential: vi.fn(),
  updateCredential: vi.fn(),
  kintoneClientConstructor: vi.fn(),
}))

vi.mock('@/lib/db/connectors', () => ({
  getCredential: mocks.getCredential,
  updateCredential: mocks.updateCredential,
}))

vi.mock('@/lib/kintone/api-client', () => ({
  KintoneApiClient: vi.fn().mockImplementation(function (this: any, config) {
    mocks.kintoneClientConstructor(config)
    this.getRecords = vi.fn()
  }),
}))

import {
  REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST,
  assertStableKintoneIdSets,
  buildExpectedTenantCoidQuery,
  createKintoneClientForPeopleCleanup,
  determinePeopleCleanupPlan,
  ensureDeleteSafety,
  ensureDeleteLimit,
  extractCurrentKintoneRecordIds,
  runPeopleCleanup,
  selectActiveApp13PeopleMapping,
  validateExpectedTenantCoidFilters,
} from './people-cleanup'

type TableName =
  | 'connectors'
  | 'tenants'
  | 'connector_app_mappings'
  | 'connector_app_filters'
  | 'people'
  | 'visas'
  | 'meetings'
  | 'support_actions'
  | 'person_documents'
  | 'interview_records'
  | 'visa_application_case_members'
  | 'case_document_requirements'

type MockDb = Record<TableName, any[]> & {
  deleteCalls: Array<{ table: string; tenantId: string | null; ids: string[] }>
  queryCalls: Array<{ table: string; selectColumns?: string; filters: Array<{ type: string; column: string; value: any }> }>
}

class MockQuery {
  private filters: Array<{ type: 'eq' | 'not' | 'in' | 'lte' | 'or'; column: string; value: any }> = []
  private operation: 'select' | 'delete' = 'select'
  private selectColumns?: string
  private selectOptions: any
  private singleResult = false

  constructor(private db: MockDb, private table: TableName) {}

  select(columns?: string, options?: any) {
    this.selectColumns = columns
    this.selectOptions = options
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  eq(column: string, value: any) {
    this.filters.push({ type: 'eq', column, value })
    return this
  }

  not(column: string, _operator: string, value: any) {
    this.filters.push({ type: 'not', column, value })
    return this
  }

  in(column: string, value: any[]) {
    this.filters.push({ type: 'in', column, value })
    return this
  }

  lte(column: string, value: any) {
    this.filters.push({ type: 'lte', column, value })
    return this
  }

  or(value: string, options?: { referencedTable?: string }) {
    this.filters.push({ type: 'or', column: options?.referencedTable || 'or', value })
    return this
  }

  order() {
    return this
  }

  range() {
    return this
  }

  single() {
    this.singleResult = true
    return this
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute() {
    let rows = [...this.db[this.table]]
    this.db.queryCalls.push({
      table: this.table,
      selectColumns: this.selectColumns,
      filters: this.filters.map((filter) => ({ ...filter })),
    })

    for (const filter of this.filters) {
      if (this.table === 'connectors' && filter.column.startsWith('connector_app_mappings.')) {
        continue
      }
      if (this.table === 'connectors' && filter.type === 'or' && filter.column === 'connector_app_mappings') {
        continue
      }

      if (filter.type === 'eq') {
        rows = rows.filter((row) => {
          if (filter.column === 'connection_status.status') return row.connection_status?.status === filter.value
          return row[filter.column] === filter.value
        })
      } else if (filter.type === 'not') {
        rows = rows.filter((row) => row[filter.column] !== valueForNot(filter.value))
      } else if (filter.type === 'in') {
        rows = rows.filter((row) => filter.value.includes(row[filter.column]))
      } else if (filter.type === 'lte') {
        rows = rows.filter((row) => !row[filter.column] || row[filter.column] <= filter.value)
      }
    }

    if (this.table === 'connectors') {
      rows = rows.filter((connector) => this.hasMatchingConnectorAppMapping(connector.id))
    }

    if (this.selectOptions?.count === 'exact' && this.selectOptions?.head === true) {
      return { data: null, error: null, count: rows.length }
    }

    if (this.operation === 'delete') {
      const tenantId = this.filters.find((filter) => filter.type === 'eq' && filter.column === 'tenant_id')?.value ?? null
      const ids = rows.map((row) => row.id)
      this.db.deleteCalls.push({ table: this.table, tenantId, ids })
      this.db[this.table] = this.db[this.table].filter((row) => !ids.includes(row.id))
      return { data: rows.map((row) => ({ id: row.id })), error: null }
    }

    if (this.singleResult) {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { code: 'PGRST116', message: 'not found' } }
    }

    return { data: rows, error: null }
  }

  private hasMatchingConnectorAppMapping(connectorId: string): boolean {
    const mappingFilters = this.filters.filter((filter) => {
      return filter.column.startsWith('connector_app_mappings.') || filter.column === 'connector_app_mappings'
    })

    if (mappingFilters.length === 0) {
      return true
    }

    return this.db.connector_app_mappings.some((mapping) => {
      if (mapping.connector_id !== connectorId) return false

      return mappingFilters.every((filter) => {
        if (filter.type === 'eq') {
          return mapping[filter.column.replace('connector_app_mappings.', '')] === filter.value
        }
        if (filter.type === 'or' && filter.column === 'connector_app_mappings') {
          return filter.value === 'target_table.eq.people,target_table.is.null'
            && (mapping.target_table === 'people' || mapping.target_table === null)
        }
        return true
      })
    })
  }
}

function valueForNot(value: any) {
  return value
}

function createMockSupabase(overrides: Partial<Record<TableName, any[]>> = {}) {
  const db: MockDb = {
    connectors: [],
    tenants: [],
    connector_app_mappings: [],
    connector_app_filters: [],
    people: [],
    visas: [],
    meetings: [],
    support_actions: [],
    person_documents: [],
    interview_records: [],
    visa_application_case_members: [],
    case_document_requirements: [],
    deleteCalls: [],
    queryCalls: [],
    ...overrides,
  }

  return {
    db,
    client: {
      from(table: TableName) {
        return new MockQuery(db, table)
      },
    },
  }
}

function baseConnector(id: string, tenantId: string) {
  return {
    id,
    tenant_id: tenantId,
    display_name: id,
    provider: 'kintone',
    created_at: id,
    connection_status: { status: 'connected' },
  }
}

function baseTenant(id: string, slug: string) {
  return { id, name: slug, slug }
}

function baseMapping(id: string, connectorId: string) {
  return {
    id,
    connector_id: connectorId,
    source_app_id: '13',
    target_app_type: 'people',
    target_table: 'people',
    is_active: true,
  }
}

function baseFilter(id: string, mappingId: string, slug: string) {
  return {
    id,
    app_mapping_id: mappingId,
    field_code: 'COID',
    filter_value: slug,
    is_active: true,
  }
}

function kintoneClientWithReads(reads: string[][]) {
  const getRecords = vi.fn()
  for (const read of reads) {
    getRecords.mockResolvedValueOnce(read.map((id) => ({ $id: { value: id }, $revision: { value: '1' } })))
  }
  return { getRecords }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCredential.mockImplementation(async (_connectorId: string, type: string) => {
    if (type === 'kintone_config') {
      return {
        domain: 'https://funtoco.cybozu.com',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }
    }
    if (type === 'kintone_token') {
      return {
        access_token: 'old-access-token',
        refresh_token: 'old-refresh-token',
      }
    }
    return null
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    })
  )
})

describe('人材物理削除クリーンアップの設定検証', () => {
  test('review済みON DELETE CASCADE依存テーブルだけをallowlistにする', () => {
    expect([...REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST]).toEqual([
      'visas',
      'meetings',
      'support_actions',
      'person_documents',
      'interview_records',
      'visa_application_case_members',
      'case_document_requirements',
    ])
  })

  test('activeなapp13→people mappingが1件だけなら選択する', () => {
    const mapping = selectActiveApp13PeopleMapping([
      {
        id: 'map-1',
        source_app_id: '13',
        target_app_type: 'people',
        target_table: 'people',
        is_active: true,
      },
    ])

    assert.equal(mapping.id, 'map-1')
  })

  test('activeなapp13→people mappingが0件または複数件なら曖昧として失敗する', () => {
    assert.throws(
      () => selectActiveApp13PeopleMapping([]),
      /expected exactly one active app13 people mapping/
    )

    assert.throws(
      () => selectActiveApp13PeopleMapping([
        {
          id: 'map-1',
          source_app_id: '13',
          target_app_type: 'people',
          target_table: 'people',
          is_active: true,
        },
        {
          id: 'map-2',
          source_app_id: '13',
          target_app_type: 'people',
          target_table: 'people',
          is_active: true,
        },
      ]),
      /expected exactly one active app13 people mapping/
    )
  })

  test('active filterがtenantのCOID完全一致1件だけならKintone queryを作れる', () => {
    validateExpectedTenantCoidFilters(
      [
        {
          id: 'filter-1',
          app_mapping_id: 'map-1',
          field_code: 'COID',
          filter_value: '17614',
          is_active: true,
        },
        {
          id: 'filter-2',
          app_mapping_id: 'map-1',
          field_code: 'Status',
          filter_value: '退職',
          is_active: false,
        },
      ],
      'map-1',
      '17614'
    )

    assert.equal(buildExpectedTenantCoidQuery('17614'), 'COID = "17614"')
  })

  test('tenant COID以外のactive filterがあると削除対象を確定しない', () => {
    assert.throws(
      () => validateExpectedTenantCoidFilters(
        [
          {
            id: 'filter-1',
            app_mapping_id: 'map-1',
            field_code: 'COID',
            filter_value: '17614',
            is_active: true,
          },
          {
            id: 'filter-2',
            app_mapping_id: 'map-1',
            field_code: 'Status',
            filter_value: '在籍中',
            is_active: true,
          },
        ],
        'map-1',
        '17614'
      ),
      /expected exactly one active COID filter/
    )
  })
})

describe('人材物理削除クリーンアップの候補抽出', () => {
  test('同一tenantのnumericなpeople.idだけをKintone現存IDと比較する', () => {
    const plan = determinePeopleCleanupPlan({
      tenantId: 'tenant-1',
      cutoffIso: '2026-09-24T09:00:00.000Z',
      dbPeople: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:59:59.000Z' },
        { id: '102', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:59:59.000Z' },
        { id: '103', tenant_id: 'tenant-2', updated_at: '2026-09-24T08:59:59.000Z' },
        { id: 'PE-104', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:59:59.000Z' },
      ],
      currentKintoneIds: new Set(['101']),
    })

    assert.deepEqual(plan.candidateIds, ['102'])
    assert.equal(plan.numericDbCount, 2)
  })

  test('cutoffより後に更新されたDB行はKintoneに無くても候補にしない', () => {
    const plan = determinePeopleCleanupPlan({
      tenantId: 'tenant-1',
      cutoffIso: '2026-09-24T09:00:00.000Z',
      dbPeople: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T09:00:00.001Z' },
        { id: '102', tenant_id: 'tenant-1', updated_at: null },
        { id: '103', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:59:59.000Z' },
      ],
      currentKintoneIds: new Set(['999']),
    })

    assert.deepEqual(plan.candidateIds, ['103'])
    assert.equal(plan.skippedAfterCutoffCount, 2)
  })

  test('DBにnumericなpeople行があるのにKintoneが0件ならfail closedにする', () => {
    assert.throws(
      () => determinePeopleCleanupPlan({
        tenantId: 'tenant-1',
        cutoffIso: '2026-09-24T09:00:00.000Z',
        dbPeople: [
          { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:59:59.000Z' },
        ],
        currentKintoneIds: new Set([]),
      }),
      /Kintone returned zero app13 IDs/
    )
  })

  test('予定削除数が上限を超えたらfail closedにする', () => {
    assert.throws(
      () => ensureDeleteLimit(['1', '2', '3'], 2),
      /Refusing to delete 3 people rows/
    )
  })

  test('設定されたtenant削除上限が100件を超えたらfail closedにする', () => {
    assert.throws(
      () => ensureDeleteLimit([], 101),
      /maxDeletePerTenant must be 100 or less/
    )
  })

  test('numeric DB行が10件以上なら候補が20%を超える部分取得をfail closedにする', () => {
    assert.throws(
      () => ensureDeleteSafety({
        tenantId: 'tenant-1',
        cutoffIso: '2026-09-24T09:00:00.000Z',
        numericDbCount: 10,
        currentKintoneIdCount: 7,
        candidateIds: ['1', '2', '3'],
        skippedNonNumericCount: 0,
        skippedOtherTenantCount: 0,
        skippedAfterCutoffCount: 0,
      }, 20),
      /exceeds 20%/
    )
  })

  test('Kintoneレコードからnumericな$idだけを現存IDとして抽出する', () => {
    const ids = extractCurrentKintoneRecordIds([
      { $id: { value: '101' }, $revision: { value: '1' } },
      { $id: { value: ' 102 ' }, $revision: { value: '1' } },
      { $id: { value: 'PE-103' }, $revision: { value: '1' } },
    ])

    assert.deepEqual([...ids], ['101', '102'])
  })

  test('Kintone app13 IDの二重読み取り結果が一致しなければfail closedにする', () => {
    assert.throws(
      () => assertStableKintoneIdSets(new Set(['101', '102']), new Set(['101', '103'])),
      /unstable Kintone app13 ID set/
    )
  })
})

describe('人材物理削除クリーンアップのapply preflight', () => {
  test('connected kintone connectorでもactiveなapp13 people mappingが無ければ候補にしない', async () => {
    const { client, db } = createMockSupabase({
      connectors: [
        baseConnector('connector-1', 'tenant-1'),
        baseConnector('connector-2', 'tenant-2'),
      ],
      tenants: [baseTenant('tenant-1', '17614'), baseTenant('tenant-2', '17615')],
      connector_app_mappings: [
        baseMapping('mapping-1', 'connector-1'),
        { ...baseMapping('mapping-2', 'connector-2'), source_app_id: '98' },
      ],
      connector_app_filters: [
        baseFilter('filter-1', 'mapping-1', '17614'),
        baseFilter('filter-2', 'mapping-2', '17615'),
      ],
      people: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '201', tenant_id: 'tenant-2', updated_at: '2026-09-24T08:00:00.000Z' },
      ],
    })

    const summary = await runPeopleCleanup(client as any, {
      apply: false,
      maxDeletePerTenant: 20,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async () => kintoneClientWithReads([['101'], ['101']]) as any,
    })
    const connectorQuery = db.queryCalls.find((query) => query.table === 'connectors')

    expect(summary.connectorCount).toBe(1)
    expect(summary.results.map((result) => result.connectorId)).toEqual(['connector-1'])
    expect(connectorQuery?.selectColumns).toContain('connector_app_mappings!inner')
    expect(connectorQuery?.filters).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'eq', column: 'connector_app_mappings.is_active', value: true }),
      expect.objectContaining({ type: 'eq', column: 'connector_app_mappings.source_app_id', value: '13' }),
      expect.objectContaining({ type: 'eq', column: 'connector_app_mappings.target_app_type', value: 'people' }),
      expect.objectContaining({ type: 'or', column: 'connector_app_mappings', value: 'target_table.eq.people,target_table.is.null' }),
    ]))
  })

  test('同一tenant/COIDにauthoritativeなconnected app13 connectorが複数あると全体を失敗させる', async () => {
    const { client, db } = createMockSupabase({
      connectors: [
        baseConnector('connector-1', 'tenant-1'),
        baseConnector('connector-2', 'tenant-1'),
      ],
      tenants: [baseTenant('tenant-1', '17614')],
      connector_app_mappings: [
        baseMapping('mapping-1', 'connector-1'),
        baseMapping('mapping-2', 'connector-2'),
      ],
      connector_app_filters: [
        baseFilter('filter-1', 'mapping-1', '17614'),
        baseFilter('filter-2', 'mapping-2', '17614'),
      ],
      people: [{ id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' }],
    })

    const summary = await runPeopleCleanup(client as any, {
      apply: true,
      maxDeletePerTenant: 20,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async () => kintoneClientWithReads([['101'], ['101']]) as any,
    })

    expect(summary.success).toBe(false)
    expect(summary.failedCount).toBe(2)
    expect(summary.results.map((result) => result.error)).toEqual([
      expect.stringContaining('expected exactly one authoritative app13 people connector'),
      expect.stringContaining('expected exactly one authoritative app13 people connector'),
    ])
    expect(db.deleteCalls).toEqual([])
  })

  test('later tenantのpreflight失敗時も先行tenantを削除しない', async () => {
    const { client, db } = createMockSupabase({
      connectors: [
        baseConnector('connector-1', 'tenant-1'),
        baseConnector('connector-2', 'tenant-2'),
      ],
      tenants: [baseTenant('tenant-1', '17614'), baseTenant('tenant-2', '17615')],
      connector_app_mappings: [
        baseMapping('mapping-1', 'connector-1'),
        baseMapping('mapping-2', 'connector-2'),
      ],
      connector_app_filters: [
        baseFilter('filter-1', 'mapping-1', '17614'),
        baseFilter('filter-2', 'mapping-2', '17615'),
      ],
      people: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '102', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '201', tenant_id: 'tenant-2', updated_at: '2026-09-24T08:00:00.000Z' },
      ],
    })
    const clients: Record<string, any> = {
      'connector-1': kintoneClientWithReads([['101'], ['101']]),
      'connector-2': kintoneClientWithReads([['201'], ['202']]),
    }

    const summary = await runPeopleCleanup(client as any, {
      apply: true,
      maxDeletePerTenant: 20,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async (connectorId) => clients[connectorId],
    })

    expect(summary.success).toBe(false)
    expect(summary.deletedCount).toBe(0)
    expect(db.deleteCalls).toEqual([])
    expect(summary.results.find((result) => result.connectorId === 'connector-2')?.error)
      .toContain('unstable Kintone app13 ID set')
  })

  test('cascade対象の依存行数をpreflight結果に含めるが非ゼロでもブロックしない', async () => {
    const { client, db } = createMockSupabase({
      connectors: [baseConnector('connector-1', 'tenant-1')],
      tenants: [baseTenant('tenant-1', '17614')],
      connector_app_mappings: [baseMapping('mapping-1', 'connector-1')],
      connector_app_filters: [baseFilter('filter-1', 'mapping-1', '17614')],
      people: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '102', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
      ],
      visas: [{ id: 'visa-1', person_id: '102' }],
      meetings: [{ id: 'meeting-1', person_id: '102' }, { id: 'meeting-2', person_id: '102' }],
      support_actions: [{ id: 'support-1', person_id: '102' }],
      person_documents: [{ id: 'document-1', person_id: '102' }],
      interview_records: [{ id: 'interview-1', person_id: '102' }, { id: 'interview-2', person_id: '102' }],
      visa_application_case_members: [{ id: 'case-member-1', person_id: '102' }],
      case_document_requirements: [
        { id: 'requirement-1', person_id: '102' },
        { id: 'requirement-2', person_id: '102' },
        { id: 'requirement-3', person_id: '999' },
      ],
      unreviewed_person_notes: [{ id: 'note-1', person_id: '102' }],
    } as any)

    const summary = await runPeopleCleanup(client as any, {
      apply: false,
      maxDeletePerTenant: 20,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async () => kintoneClientWithReads([['101'], ['101']]) as any,
    })

    expect(summary.success).toBe(true)
    expect(summary.results[0].dependentCounts).toEqual({
      visas: 1,
      meetings: 2,
      support_actions: 1,
      person_documents: 1,
      interview_records: 2,
      visa_application_case_members: 1,
      case_document_requirements: 2,
    })
    expect(
      db.queryCalls
        .filter((query) => query.filters.some((filter) => filter.type === 'in' && filter.column === 'person_id'))
        .map((query) => query.table)
    ).toEqual([...REVIEWED_CASCADE_PERSON_DEPENDENCY_ALLOWLIST])
  })

  test('applyではtenantごとに1回のSupabase delete requestだけで削除する', async () => {
    const { client, db } = createMockSupabase({
      connectors: [baseConnector('connector-1', 'tenant-1')],
      tenants: [baseTenant('tenant-1', '17614')],
      connector_app_mappings: [baseMapping('mapping-1', 'connector-1')],
      connector_app_filters: [baseFilter('filter-1', 'mapping-1', '17614')],
      people: [
        { id: '101', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '102', tenant_id: 'tenant-1', updated_at: '2026-09-24T08:00:00.000Z' },
        { id: '103', tenant_id: 'tenant-1', updated_at: '2026-09-24T09:00:01.000Z' },
      ],
    })

    const summary = await runPeopleCleanup(client as any, {
      apply: true,
      maxDeletePerTenant: 100,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async () => kintoneClientWithReads([['999'], ['999']]) as any,
    })

    expect(summary.success).toBe(true)
    expect(summary.deletedCount).toBe(2)
    expect(db.deleteCalls).toEqual([
      { table: 'people', tenantId: 'tenant-1', ids: ['101', '102'] },
    ])
  })

  test('dry-runでも設定されたtenant削除上限が100件を超えたら実行前に拒否する', async () => {
    const { client, db } = createMockSupabase({
      connectors: [baseConnector('connector-1', 'tenant-1')],
    })

    await expect(runPeopleCleanup(client as any, {
      apply: false,
      maxDeletePerTenant: 101,
      now: () => new Date('2026-09-24T09:00:00.000Z'),
      createKintoneClient: async () => kintoneClientWithReads([['999'], ['999']]) as any,
    })).rejects.toThrow(/maxDeletePerTenant must be 100 or less/)
    expect(db.queryCalls).toEqual([])
  })
})

describe('people cleanup Kintone token refresh', () => {
  test('expires_atが将来で60秒以上有効なtokenはrefreshも永続化もしない', async () => {
    mocks.getCredential.mockImplementation(async (_connectorId: string, type: string) => {
      if (type === 'kintone_config') {
        return {
          domain: 'https://funtoco.cybozu.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }
      }
      if (type === 'kintone_token') {
        return {
          access_token: 'old-access-token',
          refresh_token: 'old-refresh-token',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
      }
      return null
    })

    await createKintoneClientForPeopleCleanup('connector-1')

    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.updateCredential).not.toHaveBeenCalled()
    expect(mocks.kintoneClientConstructor).toHaveBeenCalledWith({
      domain: 'https://funtoco.cybozu.com',
      accessToken: 'old-access-token',
    })
  })

  test('refreshしたkintone_tokenをrotated refresh_token込みで永続化してからclientを作る', async () => {
    await createKintoneClientForPeopleCleanup('connector-1')

    expect(fetch).toHaveBeenCalledWith(
      'https://funtoco.cybozu.com/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mocks.updateCredential).toHaveBeenCalledWith(
      'connector-1',
      'kintone_token',
      expect.objectContaining({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
      })
    )
    expect(mocks.kintoneClientConstructor).toHaveBeenCalledWith({
      domain: 'https://funtoco.cybozu.com',
      accessToken: 'new-access-token',
    })
  })

  test.each([
    ['expires_atが期限切れ', new Date(Date.now() - 1000).toISOString()],
    ['expires_atが無い', undefined],
    ['expires_atが不正', 'not-a-date'],
  ])('%sならrefreshして永続化する', async (_label, expiresAt) => {
    mocks.getCredential.mockImplementation(async (_connectorId: string, type: string) => {
      if (type === 'kintone_config') {
        return {
          domain: 'https://funtoco.cybozu.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }
      }
      if (type === 'kintone_token') {
        return {
          access_token: 'old-access-token',
          refresh_token: 'old-refresh-token',
          ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
        }
      }
      return null
    })

    await createKintoneClientForPeopleCleanup('connector-1')

    expect(fetch).toHaveBeenCalledWith(
      'https://funtoco.cybozu.com/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mocks.updateCredential).toHaveBeenCalledWith(
      'connector-1',
      'kintone_token',
      expect.objectContaining({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      })
    )
  })

  test('access_tokenが無ければrefreshして永続化する', async () => {
    mocks.getCredential.mockImplementation(async (_connectorId: string, type: string) => {
      if (type === 'kintone_config') {
        return {
          domain: 'https://funtoco.cybozu.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
        }
      }
      if (type === 'kintone_token') {
        return {
          refresh_token: 'old-refresh-token',
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }
      }
      return null
    })

    await createKintoneClientForPeopleCleanup('connector-1')

    expect(fetch).toHaveBeenCalledWith(
      'https://funtoco.cybozu.com/oauth2/token',
      expect.objectContaining({ method: 'POST' })
    )
    expect(mocks.updateCredential).toHaveBeenCalledWith(
      'connector-1',
      'kintone_token',
      expect.objectContaining({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      })
    )
  })
})
