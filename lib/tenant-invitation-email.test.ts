import { describe, expect, it } from "vitest"

import { buildTenantInvitationEmail, buildTenantInviteUrl } from "./tenant-invitation-email"

describe("tenant invitation email", () => {
  it("builds a reusable app invite URL instead of a Supabase one-time auth link", () => {
    expect(buildTenantInviteUrl("https://funbase.funtoco.jp", "token-123")).toBe(
      "https://funbase.funtoco.jp/invite/token-123"
    )
  })

  it("includes the reusable invite URL in text and html bodies", () => {
    const email = buildTenantInvitationEmail({
      tenantName: "株式会社テスト",
      inviteUrl: "https://funbase.funtoco.jp/invite/token-123",
    })

    expect(email.subject).toBe("FunBaseへの招待: 株式会社テスト")
    expect(email.text).toContain("https://funbase.funtoco.jp/invite/token-123")
    expect(email.html).toContain("https://funbase.funtoco.jp/invite/token-123")
  })
})
