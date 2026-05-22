import { describe, expect, test } from "vitest"

import { buildPeopleSearchHref } from "@/lib/header-search"

describe("buildPeopleSearchHref", () => {
  test("routes global search to the people list", () => {
    expect(buildPeopleSearchHref("  SU SU  ", "/dashboard", "")).toBe("/people?search=SU+SU")
  })

  test("preserves existing people filters when searching from the people list", () => {
    const href = buildPeopleSearchHref("bista", "/people", "?tenantName=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE")

    expect(href).toBe("/people?tenantName=%E6%A0%AA%E5%BC%8F%E4%BC%9A%E7%A4%BE&search=bista")
  })

  test("clears only the search query when the submitted value is blank", () => {
    const href = buildPeopleSearchHref("  ", "/people", "?tenantName=A&search=bista")

    expect(href).toBe("/people?tenantName=A")
  })
})
