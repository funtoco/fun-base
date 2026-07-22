import assert from "node:assert/strict"
import { test } from "vitest"

import {
  buildTimelineQueryString,
  readTimelineFilters,
  toggleTimelinePerson,
} from "@/lib/timeline-query"

test("buildTimelineQueryString keeps timeline filters shareable in the URL", () => {
  const query = buildTimelineQueryString({
    search: "  NAN  ",
    type: "daily_support",
    persons: ["2664", "2665"],
    date: "30",
  })

  assert.equal(query, "search=NAN&person=2664%2C2665&type=daily_support&date=30")
})

test("readTimelineFilters restores defaults and selected people from query params", () => {
  const filters = readTimelineFilters(new URLSearchParams("search=SU+SU&person=2664%2C2665&type=visa"))

  assert.deepEqual(filters, {
    search: "SU SU",
    type: "visa",
    persons: ["2664", "2665"],
    date: "all",
  })
})

test("toggleTimelinePerson toggles people without mutating the current values", () => {
  const current = ["2664", "2665"]

  assert.deepEqual(toggleTimelinePerson(current, "2666"), ["2664", "2665", "2666"])
  assert.deepEqual(toggleTimelinePerson(current, "2664"), ["2665"])
  assert.deepEqual(current, ["2664", "2665"])
})
