import assert from "node:assert/strict"
import { test } from "vitest"

import {
  getInterviewRecordDetailPath,
  getInterviewRecordListPath,
} from "@/lib/interview-record-links"

test("getInterviewRecordDetailPath builds a shareable detail URL", () => {
  assert.equal(
    getInterviewRecordDetailPath("record id/with space"),
    "/interview-records/record%20id%2Fwith%20space"
  )
})

test("getInterviewRecordListPath returns the owning list for each record type", () => {
  assert.equal(getInterviewRecordListPath("regular_interview"), "/meetings")
  assert.equal(getInterviewRecordListPath("daily_support"), "/support")
})
