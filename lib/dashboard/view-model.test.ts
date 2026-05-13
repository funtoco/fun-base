import { describe, expect, it } from "vitest"
import type { Announcement, Meeting, Person, SupportAction, Visa } from "@/lib/models"

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

const baseMeeting = (overrides: Partial<Meeting>): Meeting => ({
  id: "meeting-1",
  personId: "person-1",
  kind: "仕事",
  title: "定期面談",
  datetime: "2026-05-10T00:00:00.000Z",
  notes: [],
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z",
  ...overrides,
})

const baseSupportAction = (overrides: Partial<SupportAction>): SupportAction => ({
  id: "support-1",
  personId: "person-1",
  category: "住居",
  title: "住所確認",
  status: "open",
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
      meetings: [
        baseMeeting({ id: "recent-meeting", personId: "person-1", datetime: "2026-05-12T00:00:00.000Z" }),
        baseMeeting({ id: "future-meeting", personId: "person-2", datetime: "2026-05-20T00:00:00.000Z" }),
      ],
      supportActions: [
        baseSupportAction({ id: "support-done", personId: "person-2", status: "done" }),
        baseSupportAction({ id: "support-open", personId: "person-1", status: "open", due: "2026-05-14" }),
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
    expect(viewModel.latestMeetings.map((item) => item.id)).toEqual(["future-meeting", "recent-meeting"])
    expect(viewModel.supportActions.map((item) => item.id)).toEqual(["support-open", "support-done"])
    expect(viewModel.announcements[0]).toMatchObject({ id: "unread-announcement", isUnread: true })
    expect(viewModel.nationalities[0]).toMatchObject({
      nationality: "ベトナム",
      count: 2,
      percentage: 67,
    })
    expect(viewModel.attentionItems.some((item) => item.id === "recent-meeting")).toBe(true)
    expect(viewModel.attentionItems.some((item) => item.id === "future-meeting")).toBe(false)
  })

  it("handles empty people data without invalid percentages", () => {
    const viewModel = buildDashboardViewModel({
      people: [],
      visas: [],
      meetings: [],
      supportActions: [],
      announcements: [],
      readAnnouncementIds: [],
      now: new Date("2026-05-13T00:00:00.000Z"),
    })

    expect(viewModel.kpis.expiringCount).toBe(0)
    expect(viewModel.nationalities).toEqual([])
    expect(viewModel.otherNationalityCount).toBe(0)
    expect(viewModel.otherNationalityPercentage).toBe(0)
  })
})
