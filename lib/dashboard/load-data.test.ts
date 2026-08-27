import { describe, expect, it } from "vitest"

import { loadDashboardDataSources, type DashboardDataLoaders } from "./load-data"

const successfulLoaders = (overrides: Partial<DashboardDataLoaders> = {}): DashboardDataLoaders => ({
  people: async () => [{ id: "person-1", name: "Nguyen A" }] as any,
  visas: async () => [{ id: "visa-1", personId: "person-1", status: "申請中" }] as any,
  regularInterviews: async () => [{ id: "interview-1", personId: "person-1" }] as any,
  dailySupportRecords: async () => [{ id: "daily-1", personId: "person-1" }] as any,
  announcements: async () => [{ id: "announcement-1", title: "共有事項" }] as any,
  readAnnouncementIds: async () => ["announcement-1"],
  ...overrides,
})

describe("loadDashboardDataSources", () => {
  it("returns complete dashboard data when every source succeeds", async () => {
    const result = await loadDashboardDataSources(successfulLoaders())

    expect(result.status).toBe("success")
    if (result.status === "fatal") throw new Error("expected dashboard data")
    expect(result.data).toMatchObject({
      people: [{ id: "person-1" }],
      visas: [{ id: "visa-1" }],
      regularInterviews: [{ id: "interview-1" }],
      dailySupportRecords: [{ id: "daily-1" }],
      announcements: [{ id: "announcement-1" }],
      readAnnouncementIds: ["announcement-1"],
    })
    expect(result.failedSources).toEqual([])
  })

  it("keeps available dashboard data when only best-effort sources fail", async () => {
    const result = await loadDashboardDataSources(successfulLoaders({
      regularInterviews: async () => {
        throw new Error("temporary interview timeout")
      },
      readAnnouncementIds: async () => {
        throw Object.assign(new Error("read marker unavailable"), { code: "PGRST000" })
      },
    }))

    expect(result.status).toBe("partial")
    if (result.status === "fatal") throw new Error("expected partial dashboard data")
    expect(result.data.people).toEqual([{ id: "person-1", name: "Nguyen A" }])
    expect(result.data.regularInterviews).toEqual([])
    expect(result.data.readAnnouncementIds).toEqual([])
    expect(result.failedSources.map((source) => source.name)).toEqual([
      "regularInterviews",
      "readAnnouncementIds",
    ])
  })

  it("does not render misleading zero KPIs when people fails", async () => {
    const result = await loadDashboardDataSources(successfulLoaders({
      people: async () => {
        throw { code: "42501", message: "permission denied" }
      },
    }))

    expect(result.status).toBe("fatal")
    expect(result.data).toBeNull()
    expect(result.failedSources.map((source) => source.name)).toEqual(["people"])
  })

  it("does not render misleading zero KPIs when visas fails", async () => {
    const result = await loadDashboardDataSources(successfulLoaders({
      visas: async () => {
        throw new Error("temporary visa timeout")
      },
    }))

    expect(result.status).toBe("fatal")
    expect(result.data).toBeNull()
    expect(result.failedSources.map((source) => source.name)).toEqual(["visas"])
  })

  it("returns fatal when every source fails", async () => {
    const failingLoaders = successfulLoaders({
      people: async () => { throw new Error("failed people") },
      visas: async () => { throw new Error("failed visas") },
      regularInterviews: async () => { throw new Error("failed regular") },
      dailySupportRecords: async () => { throw new Error("failed daily") },
      announcements: async () => { throw new Error("failed announcements") },
      readAnnouncementIds: async () => { throw new Error("failed reads") },
    })

    const result = await loadDashboardDataSources(failingLoaders)

    expect(result.status).toBe("fatal")
    expect(result.data).toBeNull()
    expect(result.failedSources.map((source) => source.name)).toEqual([
      "people",
      "visas",
      "regularInterviews",
      "dailySupportRecords",
      "announcements",
      "readAnnouncementIds",
    ])
  })
})
