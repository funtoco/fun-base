import { describe, expect, it } from "vitest"

import { getSafeAuthNextPath } from "./auth-next-path"

describe("getSafeAuthNextPath", () => {
  it("allows an app-relative invite path", () => {
    expect(getSafeAuthNextPath("/invite/token", "/admin/tenants")).toBe("/invite/token")
  })

  it("rejects absolute external URLs", () => {
    expect(getSafeAuthNextPath("https://example.com/invite/token", "/admin/tenants")).toBe("/admin/tenants")
  })

  it("rejects protocol-relative URLs", () => {
    expect(getSafeAuthNextPath("//example.com/invite/token", "/admin/tenants")).toBe("/admin/tenants")
  })

  it("uses the fallback when the next path is missing", () => {
    expect(getSafeAuthNextPath(null, "/admin/tenants")).toBe("/admin/tenants")
  })
})
