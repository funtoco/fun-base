import { describe, expect, it } from "vitest"

import { reverseString } from "@/lib/utils"

describe("reverseString", () => {
  it("reverses a string", () => {
    expect(reverseString("hello")).toBe("olleh")
  })

  it("returns an empty string for empty input", () => {
    expect(reverseString("")).toBe("")
  })

  it("preserves whitespace while reversing", () => {
    expect(reverseString("abc def")).toBe("fed cba")
  })

  it("keeps surrogate pairs intact", () => {
    expect(reverseString("a🙂b")).toBe("b🙂a")
  })
})
