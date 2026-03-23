import assert from "node:assert/strict"
import test from "node:test"

import { getBatchMeta, normalizeBatchParams } from "../lib/sync/cron-sync-batching"

test("normalizeBatchParams falls back to defaults for invalid inputs", () => {
  const params = normalizeBatchParams({
    cursorParam: "-5",
    batchSizeParam: "abc",
    defaultBatchSize: 10,
    maxBatchSize: 25,
  })

  assert.deepEqual(params, {
    cursor: 0,
    batchSize: 10,
  })
})

test("normalizeBatchParams clamps batch size to the allowed max", () => {
  const params = normalizeBatchParams({
    cursorParam: "20",
    batchSizeParam: "999",
    defaultBatchSize: 10,
    maxBatchSize: 25,
  })

  assert.deepEqual(params, {
    cursor: 20,
    batchSize: 25,
  })
})

test("getBatchMeta returns nextCursor when there are remaining connectors", () => {
  const meta = getBatchMeta({
    cursor: 20,
    batchSize: 10,
    totalCount: 37,
  })

  assert.deepEqual(meta, {
    hasMore: true,
    nextCursor: 30,
    processedRangeEnd: 30,
    remainingCount: 7,
  })
})

test("getBatchMeta marks the final batch correctly", () => {
  const meta = getBatchMeta({
    cursor: 30,
    batchSize: 10,
    totalCount: 37,
  })

  assert.deepEqual(meta, {
    hasMore: false,
    nextCursor: null,
    processedRangeEnd: 37,
    remainingCount: 0,
  })
})
