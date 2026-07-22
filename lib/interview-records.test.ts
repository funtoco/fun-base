import { describe, expect, it } from "vitest"

import { getCategoryColor } from "./interview-records"

describe("getCategoryColor", () => {
  it("returns distinct readable colors for common daily support categories", () => {
    const categories = [
      "ビザ更新対応",
      "ライフライン対応",
      "SIMカード・インターネット対応",
      "パスポート更新案内",
      "日々の対応報告",
    ]

    const colors = categories.map((category) => getCategoryColor(category))

    expect(new Set(colors).size).toBe(categories.length)
    colors.forEach((color) => {
      expect(color).toContain("ring-1")
      expect(color).toContain("text-")
    })
  })
})
