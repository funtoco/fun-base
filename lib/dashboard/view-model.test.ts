import { describe, expect, it } from "vitest"
import type { Announcement, DailySupportRecord, Person, RegularInterview, Visa } from "@/lib/models"

import { buildDashboardViewModel } from "./view-model"

const basePerson = (overrides: Partial<Person>): Person => ({
  id: "person-1",
  name: "Test Person",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

const baseVisa = (overrides: Partial<Visa>): Visa => ({
  id: "visa-1",
  personId: "person-1",
  status: "申請中",
  type: "更新申請",
  updatedAt: "2026-05-01T00:00:00.000Z",
  ...overrides,
})

const baseRegularInterview = (overrides: Partial<RegularInterview>): RegularInterview => ({
  id: "interview-1",
  personId: "person-1",
  personName: "Test Person",
  interviewDate: "2026-05-10",
  companyConfirmationStatus: "確認待ち",
  companyReport: "report",
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z",
  ...overrides,
})

const baseDailySupportRecord = (overrides: Partial<DailySupportRecord>): DailySupportRecord => ({
  id: "daily-1",
  personId: "person-1",
  personName: "Test Person",
  supportDate: "2026-05-09",
  companyConfirmationStatus: "確認待ち",
  dailyEntries: [],
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z",
  ...overrides,
})

const baseAnnouncement = (overrides: Partial<Announcement>): Announcement => ({
  id: "announcement-1",
  title: "共有事項",
  body: "body",
  published: true,
  createdAt: "2026-05-11T00:00:00.000Z",
  updatedAt: "2026-05-11T00:00:00.000Z",
  ...overrides,
})

describe("buildDashboardViewModel", () => {
  it("builds dashboard counts and latest sections from real data arrays", () => {
    const now = new Date("2026-05-13T00:00:00.000Z")
    const people = [
      basePerson({
        id: "person-1",
        name: "Nguyen A",
        nationality: "ベトナム",
        workingStatus: "入社待ち",
        residenceCardExpiryDate: "2026-05-20T00:00:00.000Z",
      }),
      basePerson({
        id: "person-2",
        name: "Nguyen B",
        nationality: "ベトナム",
        workingStatus: "在籍中",
      }),
      basePerson({
        id: "person-3",
        name: "Smith C",
        nationality: "アメリカ",
        workingStatus: "退職",
      }),
    ]

    const viewModel = buildDashboardViewModel({
      people,
      visas: [
        baseVisa({
          id: "visa-1",
          personId: "person-1",
          status: "申請中",
          expiryDate: "2026-05-18T00:00:00.000Z",
        }),
        baseVisa({
          id: "visa-2",
          personId: "person-2",
          status: "書類準備中",
          expiryDate: "2026-08-01T00:00:00.000Z",
        }),
      ],
      regularInterviews: [
        baseRegularInterview({ id: "recent-interview", personId: "person-1", interviewDate: "2026-05-12" }),
        baseRegularInterview({ id: "future-interview", personId: "person-2", interviewDate: "2026-05-20" }),
      ],
      dailySupportRecords: [
        baseDailySupportRecord({ id: "daily-old", personId: "person-2", supportDate: "2026-05-09" }),
        baseDailySupportRecord({ id: "daily-recent", personId: "person-1", supportDate: "2026-05-14" }),
      ],
      announcements: [
        baseAnnouncement({ id: "read-announcement", createdAt: "2026-05-10T00:00:00.000Z" }),
        baseAnnouncement({ id: "unread-announcement", createdAt: "2026-05-12T00:00:00.000Z" }),
      ],
      readAnnouncementIds: ["read-announcement"],
      now,
    })

    expect(viewModel.kpis).toMatchObject({
      waitingCount: 1,
      activeCount: 1,
      retiredCount: 1,
      applicationInProgressCount: 1,
      expiringCount: 1,
    })
    expect(viewModel.visaStatusCounts.find((item) => item.status === "申請中")?.count).toBe(1)
    expect(viewModel.latestRegularInterviews.map((item) => item.id)).toEqual(["future-interview", "recent-interview"])
    expect(viewModel.latestDailySupportRecords.map((item) => item.id)).toEqual(["daily-recent", "daily-old"])
    expect(viewModel.announcements[0]).toMatchObject({ id: "unread-announcement", isUnread: true })
    expect(viewModel.nationalities[0]).toMatchObject({
      nationality: "ベトナム",
      count: 2,
      percentage: 67,
    })
    expect(viewModel.businessLocations).toEqual([
      { name: "未定", count: 3, percentage: 100 },
    ])
  })

  it("builds a business-location report from the person company field", () => {
    const viewModel = buildDashboardViewModel({
      people: [
        basePerson({ id: "person-1", name: "A", company: "東京事業所" }),
        basePerson({ id: "person-2", name: "B", company: "東京事業所" }),
        basePerson({ id: "person-3", name: "C", company: "大阪事業所" }),
        basePerson({ id: "person-4", name: "D" }),
      ],
      visas: [],
      regularInterviews: [],
      dailySupportRecords: [],
      announcements: [],
      readAnnouncementIds: [],
      now: new Date("2026-05-13T00:00:00.000Z"),
    })

    expect(viewModel.businessLocations).toEqual([
      { name: "東京事業所", count: 2, percentage: 50 },
      { name: "大阪事業所", count: 1, percentage: 25 },
      { name: "未定", count: 1, percentage: 25 },
    ])
    expect(viewModel.otherBusinessLocationCount).toBe(0)
    expect(viewModel.otherBusinessLocationPercentage).toBe(0)
  })

  it("does not count already expired dates as expiring soon", () => {
    const viewModel = buildDashboardViewModel({
      people: [
        basePerson({
          id: "expired-person",
          name: "Expired Person",
          residenceCardExpiryDate: "2026-05-01",
        }),
        basePerson({
          id: "future-person",
          name: "Future Person",
          residenceCardExpiryDate: "2026-05-20",
        }),
      ],
      visas: [
        baseVisa({
          id: "expired-visa",
          personId: "expired-person",
          expiryDate: "2026-05-01",
        }),
      ],
      regularInterviews: [],
      dailySupportRecords: [],
      announcements: [],
      readAnnouncementIds: [],
      now: new Date("2026-05-13T00:00:00.000Z"),
    })

    expect(viewModel.kpis.expiringCount).toBe(1)
  })

  it("sorts date-times without timezone as UTC instants", () => {
    const viewModel = buildDashboardViewModel({
      people: [basePerson({ id: "person-1", name: "A" })],
      visas: [],
      regularInterviews: [
        baseRegularInterview({ id: "utc-interview", interviewDate: "2026-05-13T16:00:00.000Z" }),
        baseRegularInterview({ id: "timezone-less-interview", interviewDate: "2026-05-14T00:00:00.000" }),
      ],
      dailySupportRecords: [],
      announcements: [],
      readAnnouncementIds: [],
      now: new Date("2026-05-13T00:00:00.000Z"),
    })

    expect(viewModel.latestRegularInterviews.map((interview) => interview.id)).toEqual([
      "timezone-less-interview",
      "utc-interview",
    ])
  })

  it("handles empty people data without invalid percentages", () => {
    const viewModel = buildDashboardViewModel({
      people: [],
      visas: [],
      regularInterviews: [],
      dailySupportRecords: [],
      announcements: [],
      readAnnouncementIds: [],
      now: new Date("2026-05-13T00:00:00.000Z"),
    })

    expect(viewModel.kpis.expiringCount).toBe(0)
    expect(viewModel.nationalities).toEqual([])
    expect(viewModel.otherNationalityCount).toBe(0)
    expect(viewModel.otherNationalityPercentage).toBe(0)
    expect(viewModel.businessLocations).toEqual([])
    expect(viewModel.otherBusinessLocationCount).toBe(0)
    expect(viewModel.otherBusinessLocationPercentage).toBe(0)
  })
})
