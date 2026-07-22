import { describe, expect, it } from "vitest"

import { getTenantMembershipIdentityFilter, pickTenantMembershipForInviteAcceptance } from "./tenants"

describe("getTenantMembershipIdentityFilter", () => {
  it("matches both authenticated user id and invited email so reusable invite links activate pending memberships", () => {
    expect(getTenantMembershipIdentityFilter("user-123", " Invited@Example.COM ")).toBe(
      "user_id.eq.user-123,email.eq.invited@example.com"
    )
  })

  it("uses only the authenticated user id when email is missing", () => {
    expect(getTenantMembershipIdentityFilter("user-123", "")).toBe("user_id.eq.user-123")
  })
})

describe("pickTenantMembershipForInviteAcceptance", () => {
  it("prefers the pending invite for the logged-in email over an active auxiliary membership", () => {
    const picked = pickTenantMembershipForInviteAcceptance(
      [
        { id: "active-supporter", status: "active", role: "supporter", email: "invited@example.com" },
        { id: "pending-member", status: "pending", role: "member", email: "Invited@Example.COM" },
      ],
      " invited@example.com "
    )

    expect(picked?.id).toBe("pending-member")
  })

  it("picks a suspended non-supporter membership so invite acceptance can reactivate it", () => {
    const picked = pickTenantMembershipForInviteAcceptance(
      [{ id: "suspended-member", status: "suspended", role: "member", email: "invited@example.com" }],
      "invited@example.com"
    )

    expect(picked?.id).toBe("suspended-member")
  })

  it("does not fall back to a supporter membership when accepting a normal invite", () => {
    const picked = pickTenantMembershipForInviteAcceptance(
      [{ id: "pending-supporter", status: "pending", role: "supporter", email: "invited@example.com" }],
      "invited@example.com"
    )

    expect(picked).toBeUndefined()
  })
})
