import assert from 'node:assert/strict'
import { describe, test } from 'vitest'

import {
  applyFileFieldProcessResult,
  buildRecordIdQuery,
  buildRecordIdTailQuery,
  buildTenantPeopleHridKintoneQueries,
  combineKintoneQueries,
  createTenantPeopleExternalIdPageQuery,
  buildPeopleImageStoragePath,
  escapeKintoneStringLiteral,
  parseKintoneSyncOptions,
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

  test('既存filterとrecordId条件を維持して100件ずつ分割する', () => {
    const externalIds = Array.from({ length: 101 }, (_, index) => String(index + 1))

    const queries = buildTenantPeopleHridKintoneQueries({
      baseQuery: combineKintoneQueries('COID = "tenant-17614"', buildRecordIdQuery({ recordIdFrom: '2400' })),
      externalIds,
    })

    assert.equal(queries.length, 2)
    assert.match(queries[0], /^COID = "tenant-17614" and \$id >= 2400 and HRID in \("1", "2"/)
    assert.match(queries[0], /"100"\)$/)
    assert.equal(queries[1], 'COID = "tenant-17614" and $id >= 2400 and HRID in ("101")')
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
      ['HRID in ("123", "hr\\"id\\\\line\\nnext")']
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
})
