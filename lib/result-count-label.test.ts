import assert from "node:assert/strict"
import { test } from "vitest"

import { formatResultCountLabel } from "@/lib/result-count-label"

test("formatResultCountLabel shows only count when unfiltered", () => {
  assert.equal(formatResultCountLabel(885, 885), "885 件")
  assert.equal(formatResultCountLabel(885), "885 件")
})

test("formatResultCountLabel shows filtered count and total when narrowed", () => {
  assert.equal(formatResultCountLabel(11, 1000), "11 / 1000 件")
})
