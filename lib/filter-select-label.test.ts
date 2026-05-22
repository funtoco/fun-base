import { describe, expect, it } from "vitest"

import { getFilterSelectDisplayLabel } from "@/lib/filter-select-label"

const options = [
  { value: "all", label: "すべて" },
  { value: "today", label: "今日" },
  { value: "week", label: "今週" },
]

describe("getFilterSelectDisplayLabel", () => {
  it("shows the filter name instead of the reset label for the default value", () => {
    expect(getFilterSelectDisplayLabel({ label: "期間", value: "all", options })).toBe("期間")
  })

  it("shows the selected option label for active filters", () => {
    expect(getFilterSelectDisplayLabel({ label: "期間", value: "week", options })).toBe("今週")
  })

  it("falls back to the filter name when the value is unknown", () => {
    expect(getFilterSelectDisplayLabel({ label: "期間", value: "unknown", options })).toBe("期間")
  })
})
