import { describe, expect, test } from "vitest"
import { navigation } from "./sidebar"

describe("サイドバーのメニュー順", () => {
  test("住まいはタイムラインの直下に表示される", () => {
    const names = navigation.map((item) => item.name)
    expect(names.indexOf("住まい")).toBe(names.indexOf("タイムライン") + 1)
  })
})
