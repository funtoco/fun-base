import assert from 'node:assert/strict'
import { describe, test, vi } from 'vitest'

import {
  applyFileFieldProcessResult,
  buildRecordIdQuery,
  buildRecordIdTailQuery,
  buildTenantPeopleHridKintoneQueries,
  combineKintoneQueries,
  createTenantPeopleExternalIdPageQuery,
  buildPeopleImageStoragePath,
  escapeKintoneStringLiteral,
  getApp30PeopleEnrichmentSkipError,
  KintoneDataSync,
  markSuccessfulPeopleBaseMapping,
  orderAppMappingsForSync,
  parseKintoneSyncOptions,
  requireResolvedApp30PeopleExternalId,
  resolveApp30PeopleExternalId,
  shouldOmitApp30PeopleHridExternalIdFromWritePayload,
  shouldRunApp30PeopleEnrichmentMapping,
  shouldLimitApp30PeopleSyncToTenantExternalIds,
  shouldSkipMissingUpdateTarget,
} from './kintone-sync'
import { buildUpdateCondition, getKintoneRecordValue } from './update-key-utils'

test('buildPeopleImageStoragePath keeps same filenames isolated per Kintone record', () => {
  const first = buildPeopleImageStoragePath({
    tenantId: '',
    recordId: '1382',
    fieldCode: 'image',
    fileName: '2.png',
  })
  const second = buildPeopleImageStoragePath({
    tenantId: '',
    recordId: '1729',
    fieldCode: 'image',
    fileName: '2.png',
  })

  assert.equal(first, 'global/people_image/1382/image/Mg.png')
  assert.equal(second, 'global/people_image/1729/image/Mg.png')
  assert.notEqual(first, second)
})

test('buildPeopleImageStoragePath includes tenant scope when connector is tenant-bound', () => {
  const path = buildPeopleImageStoragePath({
    tenantId: 'tenant-123',
    recordId: '1382',
    fieldCode: 'image',
    fileName: '2.png',
  })

  assert.equal(path, 'tenant-123/people_image/1382/image/Mg.png')
})

test('applyFileFieldProcessResult does not clear existing image when file processing failed', () => {
  const data: Record<string, unknown> = { image_path: 'old/path.png' }

  applyFileFieldProcessResult(data, 'image_path', {
    shouldUpdate: false,
    path: null,
  })

  assert.equal(data.image_path, 'old/path.png')
})

test('applyFileFieldProcessResult clears image when Kintone FILE field is intentionally empty', () => {
  const data: Record<string, unknown> = { image_path: 'old/path.png' }

  applyFileFieldProcessResult(data, 'image_path', {
    shouldUpdate: true,
    path: null,
  })

  assert.equal(data.image_path, null)
})

test('buildUpdateCondition treats __ID__ mapping as Kintone record id', () => {
  const condition = buildUpdateCondition(
    {
      $id: { value: '2447' },
      image: { value: [{ fileKey: 'file-key' }] },
    },
    [
      {
        source_field_code: '__ID__',
        target_field_id: 'external_id',
        is_required: true,
        sort_order: 0,
        is_update_key: true,
      },
    ],
    '',
    false
  )

  assert.deepEqual(condition, { external_id: '2447' })
})

test('getKintoneRecordValue resolves Kintone record id aliases consistently', () => {
  assert.equal(getKintoneRecordValue({ $id: { value: '2447' } }, '$id'), '2447')
  assert.equal(getKintoneRecordValue({ __ID__: { value: '2447' } }, '__ID__'), '2447')
})

test('people_image sync always skips records without an existing target person', () => {
  assert.equal(shouldSkipMissingUpdateTarget('people_image', false), true)
  assert.equal(shouldSkipMissingUpdateTarget('people_image', true), true)
  assert.equal(shouldSkipMissingUpdateTarget('people', false), false)
  assert.equal(shouldSkipMissingUpdateTarget('people', true), true)
})

describe('同期対象アプリの実行順', () => {
  test('既存行を補完する同期より先に基幹同期を実行する', () => {
    const enrichment = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }
    const primary = {
      id: 'app13',
      target_app_type: 'people',
      source_app_id: '13',
      skip_if_no_update_target: false,
    }

    assert.deepEqual(orderAppMappingsForSync([enrichment, primary]), [primary, enrichment])
  })

  test('app30人材補完だけをapp13基幹人材同期の後ろへ移動し他の同期順は維持する', () => {
    const visa = {
      id: 'visa',
      target_app_type: 'visas',
      source_app_id: '50',
      skip_if_no_update_target: false,
    }
    const unrelatedPeople = {
      id: 'unrelated-people',
      target_app_type: 'people',
      source_app_id: '99',
      skip_if_no_update_target: false,
    }
    const enrichment = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }
    const app13 = {
      id: 'app13',
      target_app_type: 'people',
      source_app_id: '13',
      skip_if_no_update_target: false,
    }
    const meeting = {
      id: 'meeting',
      target_app_type: 'meetings',
      source_app_id: '90',
      skip_if_no_update_target: false,
    }

    assert.deepEqual(
      orderAppMappingsForSync([visa, unrelatedPeople, enrichment, app13, meeting]),
      [visa, unrelatedPeople, app13, enrichment, meeting]
    )
  })

  test('app13基幹人材同期がない場合は無関係な同期を並べ替えない', () => {
    const first = {
      id: 'first',
      target_app_type: 'people',
      source_app_id: '99',
      skip_if_no_update_target: false,
    }
    const second = {
      id: 'second',
      target_app_type: 'visas',
      source_app_id: '50',
      skip_if_no_update_target: false,
    }

    assert.deepEqual(orderAppMappingsForSync([first, second]), [first, second])
  })
})

describe('app30人材補完同期の実行制御', () => {
  test('同じsyncAllでapp13基幹人材同期が1件以上成功するまでapp30人材補完を実行しない', () => {
    const enrichment = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }
    const primary = {
      id: 'app13',
      target_app_type: 'people',
      source_app_id: '13',
      skip_if_no_update_target: false,
    }
    const unrelatedPeople = {
      id: 'unrelated-people',
      target_app_type: 'people',
      source_app_id: '99',
      skip_if_no_update_target: false,
    }
    const initialState = { completedPeopleBaseMapping: false }

    assert.equal(shouldRunApp30PeopleEnrichmentMapping(enrichment, initialState), false)
    assert.equal(
      shouldRunApp30PeopleEnrichmentMapping(
        enrichment,
        markSuccessfulPeopleBaseMapping(unrelatedPeople, initialState, 10)
      ),
      false
    )
    assert.equal(
      shouldRunApp30PeopleEnrichmentMapping(
        enrichment,
        markSuccessfulPeopleBaseMapping(primary, initialState, 0)
      ),
      false
    )

    const afterBaseSuccess = markSuccessfulPeopleBaseMapping(primary, initialState, 1)

    assert.equal(shouldRunApp30PeopleEnrichmentMapping(enrichment, afterBaseSuccess), true)
  })

  test('依存未解決のapp30人材補完skipはsyncAll失敗用の明確なerrorを返す', () => {
    const enrichment = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }

    const error = getApp30PeopleEnrichmentSkipError(enrichment, { completedPeopleBaseMapping: false })

    assert.ok(error)
    assert.match(error, /app13.*syncedCount > 0/)
  })

  test('recordId境界付きのapp30人材補完はKintone id空間が違うため閉じてskipする', () => {
    const enrichment = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }

    const error = getApp30PeopleEnrichmentSkipError(
      enrichment,
      { completedPeopleBaseMapping: true },
      { recordId: '2447' }
    )

    assert.ok(error)
    assert.match(error, /app13 and app30 \$id namespaces differ/)
  })
})

describe('syncAllのapp30人材補完依存制御', () => {
  function createAppMappingQuery(mappings: unknown[]) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then(resolve: (value: unknown) => void) {
        resolve({ data: mappings, error: null })
      },
    }
  }

  function createSyncWithMappings(mappings: unknown[], syncedCounts: Record<string, number>) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

    const sync = new KintoneDataSync('connector-1', { getRecords: vi.fn() } as any, 'tenant-1')
    const query = createAppMappingQuery(mappings)
    const syncAppData = vi.fn(async (_targetAppType: string, _sourceAppId: string, appMappingId: string) => {
      return syncedCounts[appMappingId] ?? 0
    })

    ;(sync as any).supabase = {
      from: vi.fn(() => query),
    }
    ;(sync as any).syncLogger = {
      startSession: vi.fn(async () => 'session-1'),
      completeSession: vi.fn(async () => undefined),
    }
    ;(sync as any).syncAppData = syncAppData

    return { sync, syncAppData }
  }

  test('app13基幹人材同期が0件ならapp30人材補完を実行せずsuccess falseにする', async () => {
    const app13 = {
      id: 'app13',
      target_app_type: 'people',
      source_app_id: '13',
      skip_if_no_update_target: false,
    }
    const app30 = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }
    const { sync, syncAppData } = createSyncWithMappings([app13, app30], { app13: 0, app30: 1 })

    const result = await sync.syncAll(undefined, 'people')

    assert.equal(result.success, false)
    assert.deepEqual(result.synced, { people: 0 })
    assert.match(result.errors.join('\n'), /app13.*syncedCount > 0/)
    assert.deepEqual(syncAppData.mock.calls.map((call) => call[2]), ['app13'])
  })

  test('boundedなtype=people同期ではapp13だけ実行しapp30人材補完をskipしてsuccess falseにする', async () => {
    const app13 = {
      id: 'app13',
      target_app_type: 'people',
      source_app_id: '13',
      skip_if_no_update_target: false,
    }
    const app30 = {
      id: 'app30',
      target_app_type: 'people',
      source_app_id: '30',
      skip_if_no_update_target: true,
    }
    const { sync, syncAppData } = createSyncWithMappings([app13, app30], { app13: 1, app30: 1 })

    const result = await sync.syncAll(undefined, 'people', { recordId: '2447' })

    assert.equal(result.success, false)
    assert.deepEqual(result.synced, { people: 1 })
    assert.match(result.errors.join('\n'), /app13 and app30 \$id namespaces differ/)
    assert.deepEqual(syncAppData.mock.calls.map((call) => call[2]), ['app13'])
  })
})

test('buildRecordIdQuery targets one Kintone record by numeric id', () => {
  assert.equal(buildRecordIdQuery({ recordId: '2447' }), '$id = 2447')
})

test('buildRecordIdQuery supports bounded Kintone record id ranges', () => {
  assert.equal(
    buildRecordIdQuery({ recordIdFrom: '2400', recordIdTo: '2500' }),
    '$id >= 2400 and $id <= 2500'
  )
})

test('buildRecordIdQuery rejects conflicting Kintone record filters', () => {
  assert.throws(
    () => buildRecordIdQuery({ recordId: '2447', recordIdFrom: '2400' }),
    /recordId cannot be combined/
  )
  assert.throws(
    () => buildRecordIdQuery({ recordIdFrom: '2500', recordIdTo: '2400' }),
    /recordIdFrom must be less than or equal to recordIdTo/
  )
  assert.throws(
    () => buildRecordIdQuery({ recordIdFrom: '2400', recordIdTailSize: 1000 }),
    /recordIdTailSize cannot be combined/
  )
})

test('buildRecordIdQuery rejects non-numeric record ids', () => {
  assert.throws(
    () => buildRecordIdQuery({ recordId: '2447 or status = "x"' }),
    /Kintone record id must be numeric/
  )
})

test('combineKintoneQueries preserves existing filters and adds record id filter', () => {
  assert.equal(
    combineKintoneQueries('status = "在籍中"', buildRecordIdQuery({ recordId: '2447' })),
    'status = "在籍中" and $id = 2447'
  )
})

test('parseKintoneSyncOptions accepts newest record tail window', () => {
  assert.deepEqual(
    parseKintoneSyncOptions(new URLSearchParams({ recordIdTailSize: '2000' })),
    { recordIdTailSize: 2000 }
  )
})

test('parseKintoneSyncOptions rejects unsafe newest record tail window', () => {
  assert.throws(
    () => parseKintoneSyncOptions(new URLSearchParams({ recordIdTailSize: '0' })),
    /recordIdTailSize must be between 1 and 5000/
  )
  assert.throws(
    () => parseKintoneSyncOptions(new URLSearchParams({ recordIdTailSize: '5001' })),
    /recordIdTailSize must be between 1 and 5000/
  )
})

test('buildRecordIdTailQuery creates a bounded newest-record window', () => {
  assert.equal(
    buildRecordIdTailQuery(9288, 2000),
    '$id >= 7289 and $id <= 9288'
  )
  assert.equal(
    buildRecordIdTailQuery(1200, 2000),
    '$id >= 1 and $id <= 1200'
  )
})

describe('app30人材同期のHRID絞り込み', () => {
  test('app30人材補完ではHRID→external_id更新キーを更新payloadから除外しapp13基幹同期では通常通り残す', () => {
    const hridExternalIdMapping = {
      source_field_code: 'HRID',
      target_field_id: 'external_id',
      is_required: true,
      sort_order: 1,
      is_update_key: true,
    }
    const enrichmentMapping = {
      targetAppType: 'people',
      sourceAppId: '30',
      fieldMapping: hridExternalIdMapping,
    }
    const baseMapping = {
      targetAppType: 'people',
      sourceAppId: '13',
      fieldMapping: hridExternalIdMapping,
    }
    const otherUpdateKey = {
      targetAppType: 'people',
      sourceAppId: '30',
      fieldMapping: {
        ...hridExternalIdMapping,
        source_field_code: '$id',
        target_field_id: 'legacy_record_id',
      },
    }

    assert.equal(shouldOmitApp30PeopleHridExternalIdFromWritePayload(enrichmentMapping), true)
    assert.equal(shouldOmitApp30PeopleHridExternalIdFromWritePayload(baseMapping), false)
    assert.equal(shouldOmitApp30PeopleHridExternalIdFromWritePayload(otherUpdateKey), false)
  })

  test('recordId指定のapp30同期でも安全なHRIDへ解決できないレコードは拒否する', () => {
    const whereCondition = { tenant_id: 'tenant-17614', external_id: 'PE-2906' }

    assert.equal(requireResolvedApp30PeopleExternalId(whereCondition, []), false)
    assert.equal(whereCondition.external_id, 'PE-2906')
  })

  test('安全なHRIDへ解決できた場合だけ更新条件を書き換える', () => {
    const whereCondition = { tenant_id: 'tenant-17614', external_id: 'PE-1926' }

    assert.equal(requireResolvedApp30PeopleExternalId(whereCondition, ['1926']), true)
    assert.equal(whereCondition.external_id, '1926')
  })

  test('HRIDからexternal_idへの更新キーのときだけ絞り込みを有効にする', () => {
    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        targetAppType: 'people',
        sourceAppId: '30',
        skipIfNoUpdateTarget: true,
        tenantId: 'tenant-17614',
        updateKeys: [
          {
            source_field_code: 'HRID',
            target_field_id: 'external_id',
            is_required: true,
            sort_order: 1,
            is_update_key: true,
          },
        ],
      }),
      true
    )
  })

  const app30HridExternalIdUpdateKeyOptions = {
    targetAppType: 'people',
    sourceAppId: '30',
    skipIfNoUpdateTarget: true,
    tenantId: 'tenant-17614',
    updateKeys: [
      {
        source_field_code: 'HRID',
        target_field_id: 'external_id',
        is_required: true,
        sort_order: 1,
        is_update_key: true,
      },
    ],
  }

  test('明示的なrecordId指定があるとHRID絞り込みのfan outをしない', () => {
    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...app30HridExternalIdUpdateKeyOptions,
        syncOptions: { recordId: '2447' },
      }),
      false
    )
  })

  test('明示的なrecordId範囲指定があるとHRID絞り込みのfan outをしない', () => {
    const common = {
      ...app30HridExternalIdUpdateKeyOptions,
    }

    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...common,
        syncOptions: { recordIdFrom: '2400' },
      }),
      false
    )
    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...common,
        syncOptions: { recordIdTo: '2500' },
      }),
      false
    )
  })

  test('recordIdTailSize指定があるとHRID絞り込みのfan outをしない', () => {
    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...app30HridExternalIdUpdateKeyOptions,
        syncOptions: { recordIdTailSize: 100 },
      }),
      false
    )
  })

  test('HRID以外の更新キーでは絞り込みを有効にしない', () => {
    const common = {
      targetAppType: 'people',
      sourceAppId: '30',
      skipIfNoUpdateTarget: true,
      tenantId: 'tenant-17614',
    }

    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...common,
        updateKeys: [
          {
            source_field_code: '$id',
            target_field_id: 'external_id',
            is_required: true,
            sort_order: 1,
            is_update_key: true,
          },
        ],
      }),
      false
    )
    assert.equal(
      shouldLimitApp30PeopleSyncToTenantExternalIds({
        ...common,
        updateKeys: [
          {
            source_field_code: 'HRID',
            target_field_id: 'id',
            is_required: true,
            sort_order: 1,
            is_update_key: true,
          },
        ],
      }),
      false
    )
  })

  test('既存filterとrecordId条件を維持して展開後100件ずつ分割する', () => {
    const externalIds = Array.from({ length: 101 }, (_, index) => String(index + 1))

    const queries = buildTenantPeopleHridKintoneQueries({
      baseQuery: combineKintoneQueries('COID = "tenant-17614"', buildRecordIdQuery({ recordIdFrom: '2400' })),
      externalIds,
    })

    assert.equal(queries.length, 3)
    assert.match(queries[0], /^COID = "tenant-17614" and \$id >= 2400 and HRID in \("1", "PE-1", "2", "PE-2"/)
    assert.match(queries[0], /"50", "PE-50"\)$/)
    assert.match(queries[1], /^COID = "tenant-17614" and \$id >= 2400 and HRID in \("51", "PE-51"/)
    assert.match(queries[1], /"100", "PE-100"\)$/)
    assert.equal(queries[2], 'COID = "tenant-17614" and $id >= 2400 and HRID in ("101", "PE-101")')
  })

  test('tenant external_idごとにrawとPE-prefix HRIDを検索し、展開後にdedupeと100件分割をする', () => {
    const externalIds = Array.from({ length: 51 }, (_, index) => String(index + 1))
    externalIds.push('PE-1', '1', ' hr"id\\line\nnext ')

    const queries = buildTenantPeopleHridKintoneQueries({
      baseQuery: 'COID = "tenant-17614"',
      externalIds,
    })

    assert.equal(queries.length, 2)
    assert.match(queries[0], /^COID = "tenant-17614" and HRID in \("1", "PE-1", "2", "PE-2"/)
    assert.match(queries[0], /"50", "PE-50"\)$/)
    assert.equal(
      queries[1],
      'COID = "tenant-17614" and HRID in ("51", "PE-51", "hr\\"id\\\\line\\nnext", "PE-hr\\"id\\\\line\\nnext")'
    )
  })

  test('空のexternal_idならKintone全件検索を作らない', () => {
    assert.deepEqual(
      buildTenantPeopleHridKintoneQueries({
        baseQuery: 'COID = "tenant-17614"',
        externalIds: ['', '   ', null, undefined],
      }),
      []
    )
  })

  test('Kintone文字列リテラルを安全にエスケープする', () => {
    assert.equal(escapeKintoneStringLiteral('hr"id\\line\nnext'), '"hr\\"id\\\\line\\nnext"')
    assert.deepEqual(
      buildTenantPeopleHridKintoneQueries({
        baseQuery: '',
        externalIds: ['123', 'hr"id\\line\nnext'],
      }),
      ['HRID in ("123", "PE-123", "hr\\"id\\\\line\\nnext", "PE-hr\\"id\\\\line\\nnext")']
    )
  })

  test('people.external_idのrangeページングはid昇順で固定する', async () => {
    const calls: unknown[][] = []
    const query = {
      from(table: string) {
        calls.push(['from', table])
        return this
      },
      select(columns: string) {
        calls.push(['select', columns])
        return this
      },
      eq(column: string, value: unknown) {
        calls.push(['eq', column, value])
        return this
      },
      not(column: string, operator: string, value: unknown) {
        calls.push(['not', column, operator, value])
        return this
      },
      neq(column: string, value: unknown) {
        calls.push(['neq', column, value])
        return this
      },
      order(column: string, options: unknown) {
        calls.push(['order', column, options])
        return this
      },
      async range(from: number, to: number) {
        calls.push(['range', from, to])
        return { data: [], error: null }
      },
    }

    await createTenantPeopleExternalIdPageQuery(query, 'tenant-17614', 1000, 1000)

    assert.deepEqual(calls, [
      ['from', 'people'],
      ['select', 'id, external_id'],
      ['eq', 'tenant_id', 'tenant-17614'],
      ['not', 'external_id', 'is', null],
      ['neq', 'external_id', ''],
      ['order', 'id', { ascending: true }],
      ['range', 1000, 1999],
    ])
  })

  test('app30 HRIDがPE-付きでtenant側external_idがlegacy値ならactual external_idへ解決する', () => {
    assert.equal(
      resolveApp30PeopleExternalId('PE-2173', ['2173', '2447']),
      '2173'
    )
  })

  test('exact matchをnormalized matchより優先する', () => {
    assert.equal(
      resolveApp30PeopleExternalId('PE-2173', ['2173', 'PE-2173']),
      'PE-2173'
    )
  })

  test('一致するtenant external_idがない場合はnullを返す', () => {
    assert.equal(
      resolveApp30PeopleExternalId('PE-9999', ['2173', '2447']),
      null
    )
  })
})
