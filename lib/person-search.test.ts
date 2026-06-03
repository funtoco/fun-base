import { describe, expect, test } from "vitest"
import { matchesPersonSearch, PERSON_SEARCH_KEYS } from "./person-search"
import type { Person } from "./models"

const basePerson: Person = {
  id: "person-1",
  name: "Nguyen Van A",
  kana: "グエン ヴァン エー",
  nationality: "ベトナム",
  employeeNumber: "EMP-001",
  tenantName: "社会福祉法人清光会",
  company: "特別養護老人ホーム清光園",
  workingStatus: "在籍中",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
}

describe("person search", () => {
  test("includes legal entity names in shared person search keys", () => {
    expect(PERSON_SEARCH_KEYS).toContain("tenantName")
  })

  test("matches a person by legal entity name", () => {
    expect(matchesPersonSearch(basePerson, "社会福祉法人清光会")).toBe(true)
    expect(matchesPersonSearch(basePerson, "清光会")).toBe(true)
  })

  test("keeps matching existing person and office fields", () => {
    expect(matchesPersonSearch(basePerson, "Nguyen")).toBe(true)
    expect(matchesPersonSearch(basePerson, "清光園")).toBe(true)
  })

  test("does not match unrelated text", () => {
    expect(matchesPersonSearch(basePerson, "社会福祉法人別法人")).toBe(false)
  })
})
