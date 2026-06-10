import assert from "node:assert/strict"
import { test } from "vitest"

import {
  buildInterviewListQueryString,
  getQueryMultiValues,
  getQuerySingleValue,
  toggleQueryMultiValue,
} from "@/lib/interview-list-query"

test("buildInterviewListQueryString omits empty search and default single filters", () => {
  const query = buildInterviewListQueryString({
    search: "  ",
    multi: {
      company: ["株式会社ABC", ""],
      staff: [],
    },
    single: {
      date: "all",
    },
  })

  assert.equal(query, "company=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BEABC")
})

test("query readers restore search-shareable multi and single filters", () => {
  const params = new URLSearchParams("search=Reno&company=A%2CB&date=week")

  assert.deepEqual(getQueryMultiValues(params, "company"), ["A", "B"])
  assert.equal(getQuerySingleValue(params, "date"), "week")
  assert.equal(getQuerySingleValue(params, "missing"), "all")
})

test("toggleQueryMultiValue adds and removes values without mutating input", () => {
  const current = ["A", "B"]

  assert.deepEqual(toggleQueryMultiValue(current, "C"), ["A", "B", "C"])
  assert.deepEqual(toggleQueryMultiValue(current, "B"), ["A"])
  assert.deepEqual(current, ["A", "B"])
})
