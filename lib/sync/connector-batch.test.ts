import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildConnectorBatchMetadata,
  parseConnectorBatchParams,
  parseOptionalConnectorBatchParams,
} from './connector-batch'

test('parseConnectorBatchParams applies safe defaults for scheduled syncs', () => {
  const params = parseConnectorBatchParams(new URLSearchParams())

  assert.deepEqual(params, {
    limit: 10,
    offset: 0,
    connectorId: null,
  })
})

test('parseConnectorBatchParams accepts explicit batch controls', () => {
  const params = parseConnectorBatchParams(new URLSearchParams({
    limit: '5',
    offset: '15',
    connectorId: '3fd2b0bf-e863-4e69-bd69-a0052506401d',
  }))

  assert.deepEqual(params, {
    limit: 5,
    offset: 15,
    connectorId: '3fd2b0bf-e863-4e69-bd69-a0052506401d',
  })
})

test('parseOptionalConnectorBatchParams preserves legacy full sync when batch controls are absent', () => {
  assert.equal(parseOptionalConnectorBatchParams(new URLSearchParams()), null)
  assert.equal(parseOptionalConnectorBatchParams(new URLSearchParams({ connectorId: '' })), null)

  assert.deepEqual(parseOptionalConnectorBatchParams(new URLSearchParams({ limit: '25' })), {
    limit: 25,
    offset: 0,
    connectorId: null,
  })

  assert.deepEqual(parseOptionalConnectorBatchParams(new URLSearchParams({ allBatches: 'true' })), {
    limit: 10,
    offset: 0,
    connectorId: null,
  })
})

test('parseConnectorBatchParams rejects unsafe batch values', () => {
  assert.throws(() => parseConnectorBatchParams(new URLSearchParams({ limit: '0' })), /limit must be between 1 and 50/)
  assert.throws(() => parseConnectorBatchParams(new URLSearchParams({ limit: '51' })), /limit must be between 1 and 50/)
  assert.throws(() => parseConnectorBatchParams(new URLSearchParams({ offset: '-1' })), /offset must be 0 or greater/)
  assert.throws(() => parseConnectorBatchParams(new URLSearchParams({ offset: '1.5' })), /offset must be an integer/)
  assert.throws(
    () => parseConnectorBatchParams(new URLSearchParams({ limit: String(Number.MAX_SAFE_INTEGER + 1) })),
    /limit must be a safe integer/
  )
  assert.throws(
    () => parseConnectorBatchParams(new URLSearchParams({ offset: String(Number.MAX_SAFE_INTEGER + 1) })),
    /offset must be a safe integer/
  )
})

test('buildConnectorBatchMetadata uses an extra fetched row as hasMore probe', () => {
  assert.deepEqual(
    buildConnectorBatchMetadata({ fetchedCount: 11, limit: 10, offset: 20 }),
    {
      batchLimit: 10,
      batchOffset: 20,
      connectorCount: 10,
      hasMore: true,
      nextOffset: 30,
    }
  )

  assert.deepEqual(
    buildConnectorBatchMetadata({ fetchedCount: 4, limit: 10, offset: 20 }),
    {
      batchLimit: 10,
      batchOffset: 20,
      connectorCount: 4,
      hasMore: false,
      nextOffset: null,
    }
  )
})
