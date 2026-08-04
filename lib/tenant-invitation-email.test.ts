import { describe, expect, it } from "vitest"

import {
  buildTenantInvitationEmail,
  buildTenantInviteUrl,
  buildTenantLoginUrl,
} from "./tenant-invitation-email"

describe("tenant invitation email", () => {
  it("builds a reusable app invite URL instead of a Supabase one-time auth link", () => {
    expect(buildTenantInviteUrl("https://funbase.funtoco.jp/auth/set-password", "token-123")).toBe(
      "https://funbase.funtoco.jp/invite/token-123"
    )
  })

  it("builds a login URL from the invite URL origin", () => {
    expect(buildTenantLoginUrl("https://funbase.funtoco.jp/invite/token-123")).toBe(
      "https://funbase.funtoco.jp/login"
    )
  })

  it("includes the reusable invite URL and post-registration login URL in text and html bodies", () => {
    const email = buildTenantInvitationEmail({
      tenantName: "株式会社テスト",
      inviteUrl: "https://funbase.funtoco.jp/invite/token-123",
    })

    expect(email.subject).toBe("FunBaseへの招待: 株式会社テスト")
    expect(email.text).toContain("https://funbase.funtoco.jp/invite/token-123")
    expect(email.html).toContain("https://funbase.funtoco.jp/invite/token-123")
    expect(email.text).toContain("参加完了後、次回以降は以下のログインページからFunBaseをご利用ください。")
    expect(email.text).toContain("https://funbase.funtoco.jp/login")
    expect(email.html).toContain("FunBaseにログインする")
    expect(email.html).toContain("https://funbase.funtoco.jp/login")
  })
})
