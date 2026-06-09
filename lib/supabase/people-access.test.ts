import { describe, expect, test } from "vitest"
import { buildCompanyAccess, canAccessPersonByCompany } from "./people-access"

describe("people company access", () => {
  test("allows owner-like roles to see every company in their tenant", () => {
    const access = buildCompanyAccess([
      {
        tenant_id: "tenant-1",
        role: "admin",
        status: "active",
      },
    ])

    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "名谷病院" }, access)).toBe(true)
    expect(canAccessPersonByCompany({ tenant_id: "tenant-2", company: "名谷病院" }, access)).toBe(false)
  })

  test("limits scoped members to their assigned tenant offices", () => {
    const access = buildCompanyAccess([
      {
        id: "membership-1",
        tenant_id: "tenant-1",
        role: "member",
        status: "active",
        offices: [
          { name: "名谷病院" },
          { name: "スーパー・コート東大阪新石切" },
        ],
      },
    ])

    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "名谷病院" }, access)).toBe(true)
    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "天王寺特別養護老人ホーム" }, access)).toBe(false)
  })

  test("extracts company names from settings objects and comma-separated strings", () => {
    const access = buildCompanyAccess([
      {
        tenant_id: "tenant-1",
        role: "guest",
        status: "active",
        settings: {
          company_names: "名谷病院, 医療法人鴻池会 秋津鴻池病院",
        },
      },
    ])

    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "医療法人鴻池会 秋津鴻池病院" }, access)).toBe(true)
    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "柏原マルタマフーズ株式会社" }, access)).toBe(false)
  })

  test("keeps unassigned members at full tenant scope", () => {
    const access = buildCompanyAccess([
      {
        id: "membership-1",
        tenant_id: "tenant-1",
        role: "member",
        status: "active",
        offices: [],
      },
    ])

    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "名谷病院" }, access)).toBe(true)
    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "天王寺特別養護老人ホーム" }, access)).toBe(true)
  })

  test("denies access when the user has no active tenant membership", () => {
    const access = buildCompanyAccess([])

    expect(canAccessPersonByCompany({ tenant_id: "tenant-1", company: "名谷病院" }, access)).toBe(false)
  })
})
