import assert from 'node:assert/strict'
import test from 'node:test'

import { buildKintoneRecordsQuery } from './api-client'

test('buildKintoneRecordsQuery adds default ordering and pagination to filter queries', () => {
  assert.equal(
    buildKintoneRecordsQuery('$id >= 1 and $id <= 100', 500, 0),
    '$id >= 1 and $id <= 100 order by $id asc limit 500 offset 0'
  )
})

test('buildKintoneRecordsQuery preserves explicit order and limit queries', () => {
  assert.equal(
    buildKintoneRecordsQuery('order by $id desc limit 1', 500, 0),
    'order by $id desc limit 1'
  )
})

test('buildKintoneRecordsQuery adds pagination after explicit ordering without limit', () => {
  assert.equal(
    buildKintoneRecordsQuery('status = "active" order by $id desc', 100, 200),
    'status = "active" order by $id desc limit 100 offset 200'
  )
})
