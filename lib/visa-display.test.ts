import { describe, expect, it } from "vitest"

import { getLatestVisaActivityDate, selectPrimaryVisa } from "./visa-display"
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

describe("selectPrimaryVisa", () => {
  it("prefers an active application over a historically completed visa", () => {
    const activeVisa: Visa = {
      ...baseVisa,
      id: "current-application",
      status: "申請中",
      type: "更新申請",
      updatedAt: "2026-09-01T03:07:57.467Z",
    }
    const historicalVisa: Visa = {
      ...baseVisa,
      id: "historical-visa",
      status: "ビザ取得済み",
      type: "認定申請",
      visaAcquiredDate: "2025-04-24",
      updatedAt: "2026-09-01T03:07:57.470Z",
    }

    expect(selectPrimaryVisa([historicalVisa, activeVisa])?.id).toBe("current-application")
  })

  it("returns the latest visa when every application is completed", () => {
    const olderVisa: Visa = {
      ...baseVisa,
      id: "older-visa",
      status: "ビザ取得済み",
      visaAcquiredDate: "2024-04-24",
    }
    const latestVisa: Visa = {
      ...baseVisa,
      id: "latest-visa",
      status: "ビザ取得済み",
      visaAcquiredDate: "2025-04-24",
    }

    expect(selectPrimaryVisa([olderVisa, latestVisa])?.id).toBe("latest-visa")
  })

  it("returns undefined when there are no visas", () => {
    expect(selectPrimaryVisa([])).toBeUndefined()
  })
})
