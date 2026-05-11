import assert from 'node:assert/strict'
import test from 'node:test'

import { buildRecordIdBatches } from './batch-utils'

test('buildRecordIdBatches splits a record id span into inclusive ranges', () => {
  assert.deepEqual(buildRecordIdBatches(1, 250, 100), [
    { from: 1, to: 100 },
    { from: 101, to: 200 },
    { from: 201, to: 250 },
  ])
})

test('buildRecordIdBatches starts from a later record id', () => {
  assert.deepEqual(buildRecordIdBatches(2401, 2555, 50), [
    { from: 2401, to: 2450 },
    { from: 2451, to: 2500 },
    { from: 2501, to: 2550 },
    { from: 2551, to: 2555 },
  ])
})

test('buildRecordIdBatches rejects invalid bounds', () => {
  assert.throws(() => buildRecordIdBatches(0, 100, 50), /from must be greater than 0/)
  assert.throws(() => buildRecordIdBatches(1, 100, 0), /batchSize must be greater than 0/)
  assert.throws(() => buildRecordIdBatches(100, 1, 50), /to must be greater than or equal to from/)
})
