import { describe, expect, it } from "vitest"

import {
  getSafeAuthNextPath,
  shouldActivateMembershipAfterPasswordSet,
} from "./auth-next-path"

describe("shouldActivateMembershipAfterPasswordSet", () => {
  it("skips generic membership activation when returning to a token-scoped invite", () => {
    expect(shouldActivateMembershipAfterPasswordSet("/invite/token")).toBe(false)
  })

  it("keeps generic membership activation for normal password setup", () => {
    expect(shouldActivateMembershipAfterPasswordSet("/admin/tenants")).toBe(true)
  })
})

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
