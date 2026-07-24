import { describe, expect, test } from "vitest"

import {
  canManageCompanyContacts,
  hasTenantFeatureAccess,
  isCompanyContactEmail,
  isCompanyContactRole,
  isInternalStaffEmail,
  isVisibleCompanyTenantMember,
  normalizeTenantFeaturePermissions,
} from "./tenant-access"

describe("tenant access", () => {
  test("member cannot manage company contacts without admin role", () => {
    const result = canManageCompanyContacts([{ role: "member" }], "sales@funtoco.jp")

    expect(result).toBe(false)
  })

  test("external member cannot manage company contacts", () => {
    const result = canManageCompanyContacts([{ role: "member" }], "pic@company.jp")

    expect(result).toBe(false)
  })

  test("guest cannot manage company contacts even with internal email", () => {
    const result = canManageCompanyContacts([{ role: "guest" }], "sales@funtoco.jp")

    expect(result).toBe(false)
  })

  test("owner and admin retain company contact management access", () => {
    expect(canManageCompanyContacts([{ role: "owner" }], "owner@funtoco.jp")).toBe(true)
    expect(canManageCompanyContacts([{ role: "admin" }], "admin@funtoco.jp")).toBe(true)
  })

  test("company contact detection distinguishes internal and external emails", () => {
    expect(isInternalStaffEmail("member@funtoco.jp")).toBe(true)
    expect(isInternalStaffEmail(" Member@FUNToco.jp ")).toBe(true)
    expect(isCompanyContactEmail("member@funtoco.jp")).toBe(false)
    expect(isCompanyContactEmail("contact@example.com")).toBe(true)
    expect(isCompanyContactEmail(" contact@example.com ")).toBe(true)
  })

  test("company contact role is limited to member and guest", () => {
    expect(isCompanyContactRole("member")).toBe(true)
    expect(isCompanyContactRole("guest")).toBe(true)
    expect(isCompanyContactRole("admin")).toBe(false)
    expect(isCompanyContactRole("supporter")).toBe(false)
  })

  test("company tenant member visibility hides internal and email-less rows", () => {
    expect(isVisibleCompanyTenantMember({ email: "contact@example.com" })).toBe(true)
    expect(isVisibleCompanyTenantMember({ email: " ", user: { email: "contact@example.com" } })).toBe(true)
    expect(isVisibleCompanyTenantMember({ email: "staff@funtoco.jp" })).toBe(false)
    expect(isVisibleCompanyTenantMember({ user: { email: "staff@funtoco.jp" } })).toBe(false)
    expect(isVisibleCompanyTenantMember({ email: null })).toBe(false)
  })

  test("feature permissions default to allowed for backward compatibility", () => {
    expect(hasTenantFeatureAccess({ role: "member" }, "people")).toBe(true)
    expect(hasTenantFeatureAccess({ role: "guest", feature_permissions: {} }, "meetings")).toBe(true)
  })

  test("feature permissions can deny individual features", () => {
    expect(
      hasTenantFeatureAccess(
        { role: "member", feature_permissions: { people: false, meetings: true } },
        "people"
      )
    ).toBe(false)
    expect(
      hasTenantFeatureAccess(
        { role: "member", feature_permissions: { people: false, meetings: true } },
        "meetings"
      )
    ).toBe(true)
  })

  test("owner and admin always keep feature access", () => {
    expect(hasTenantFeatureAccess({ role: "owner", feature_permissions: { people: false } }, "people")).toBe(true)
    expect(hasTenantFeatureAccess({ role: "admin", feature_permissions: { funedu: false } }, "funedu")).toBe(true)
  })

  test("normalizes persisted feature permission values", () => {
    expect(normalizeTenantFeaturePermissions('{"people":false,"unknown":true}')).toEqual({ people: false })
    expect(normalizeTenantFeaturePermissions({ documents: true, visas: "no" } as any)).toEqual({ documents: true })
  })
})
