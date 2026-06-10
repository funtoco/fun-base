import { describe, expect, it } from "vitest"

import { getLatestVisaActivityDate } from "./visa-display"
import type { Visa } from "./models"

const baseVisa: Visa = {
  id: "visa-1",
  personId: "person-1",
  status: "申請中",
  type: "更新申請",
  updatedAt: "2026-05-01T00:00:00.000Z",
}

describe("getLatestVisaActivityDate", () => {
  it("returns the newest valid activity date from visa status dates", () => {
    const latestDate = getLatestVisaActivityDate({
      ...baseVisa,
      documentPreparationDate: "2026-05-02",
      applicationDate: "2026-05-10",
      visaAcquiredDate: "2026-05-15",
    })

    expect(latestDate).toBe("2026-05-15")
  })

  it("falls back to updatedAt when no status date exists", () => {
    expect(getLatestVisaActivityDate(baseVisa)).toBe("2026-05-01T00:00:00.000Z")
  })

  it("ignores invalid date-like values", () => {
    const latestDate = getLatestVisaActivityDate({
      ...baseVisa,
      documentPreparationDate: "not-a-date",
      applicationDate: "2026-05-10",
    })

    expect(latestDate).toBe("2026-05-10")
  })
})
