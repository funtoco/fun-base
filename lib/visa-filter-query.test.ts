import { describe, expect, it } from "vitest"

import { buildVisaFilterQuery, parseVisaFilterQuery } from "./visa-filter-query"

describe("visa filter query", () => {
  it("parses comma-separated multi-select filters", () => {
    const params = new URLSearchParams(
      "search=su&type=%E6%9B%B4%E6%96%B0%E7%94%B3%E8%AB%8B,%E5%A4%89%E6%9B%B4%E7%94%B3%E8%AB%8B&expiry=30,90&company=A,B&affiliation=X",
    )

    expect(parseVisaFilterQuery(params)).toEqual({
      search: "su",
      types: ["更新申請", "変更申請"],
      expiries: ["30", "90"],
      companies: ["A", "B"],
      affiliations: ["X"],
    })
  })

  it("builds a shareable query and omits empty filters", () => {
    const query = buildVisaFilterQuery({
      search: "su",
      types: ["更新申請"],
      expiries: [],
      companies: ["有限会社トラストプロパティサービス"],
      affiliations: [],
    })

    expect(query).toBe(
      "search=su&type=%E6%9B%B4%E6%96%B0%E7%94%B3%E8%AB%8B&company=%E6%9C%89%E9%99%90%E4%BC%9A%E7%A4%BE%E3%83%88%E3%83%A9%E3%82%B9%E3%83%88%E3%83%97%E3%83%AD%E3%83%91%E3%83%86%E3%82%A3%E3%82%B5%E3%83%BC%E3%83%93%E3%82%B9",
    )
  })
})
