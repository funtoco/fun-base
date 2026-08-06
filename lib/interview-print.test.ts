import assert from "node:assert/strict"
import { test } from "vitest"

import type { RegularInterview } from "@/lib/models"
import {
  filterPrintableInterviews,
  groupPrintableInterviewsByPerson,
  sortPrintableInterviews,
} from "@/lib/interview-print"

const baseInterview: RegularInterview = {
  id: "base",
  personId: "person-base",
  personName: "Base Person",
  companyName: "Base Company",
  interviewDate: "2026-07-01",
  targetQuarter: "2026年第3四半期",
  supportStaffName: "Base Staff",
  interviewMethod: "対面",
  companyConfirmationStatus: "確認待ち",
  companyReport: "report",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
}

function interview(overrides: Partial<RegularInterview>): RegularInterview {
  return { ...baseInterview, ...overrides }
}

test("filterPrintableInterviews applies search, list filters, relative period, and custom date range", () => {
  const interviews = [
    interview({ id: "1", personId: "p1", personName: "グエン アン", companyName: "光正会", supportStaffName: "伊藤", interviewMethod: "対面", interviewDate: "2026-07-10" }),
    interview({ id: "2", personId: "p2", personName: "Tran Binh", companyName: "豊栄の里", supportStaffName: "長田", interviewMethod: "電話", interviewDate: "2026-07-20" }),
    interview({ id: "3", personId: "p3", personName: "Reno", companyName: "光正会", supportStaffName: "伊藤", interviewMethod: "オンラインMTG", interviewDate: "2026-08-01" }),
  ]

  const result = filterPrintableInterviews(interviews, {
    search: "グエン",
    quarter: [],
    company: ["光正会"],
    staff: ["伊藤"],
    method: ["対面"],
    date: "all",
    from: "2026-07-01",
    to: "2026-07-31",
  })

  assert.deepEqual(result.map((item) => item.id), ["1"])
})

test("filterPrintableInterviews matches the meetings list exact cutoff for relative periods", () => {
  const result = filterPrintableInterviews(
    [
      interview({ id: "cutoff", interviewDate: "2026-07-07" }),
      interview({ id: "before-cutoff", interviewDate: "2026-07-06" }),
    ],
    { date: "30" },
    new Date("2026-08-06T12:00:00+09:00")
  )

  assert.deepEqual(result.map((item) => item.id), [])

  const earlyMorningResult = filterPrintableInterviews(
    [interview({ id: "cutoff", interviewDate: "2026-07-07" })],
    { date: "30" },
    new Date("2026-08-06T08:00:00+09:00")
  )

  assert.deepEqual(earlyMorningResult.map((item) => item.id), ["cutoff"])
})

test("sortPrintableInterviews supports timeline order and person order", () => {
  const interviews = [
    interview({ id: "older-b", personId: "p2", personName: "Bさん", interviewDate: "2026-07-01" }),
    interview({ id: "newer-a", personId: "p1", personName: "Aさん", interviewDate: "2026-07-20" }),
    interview({ id: "older-a", personId: "p1", personName: "Aさん", interviewDate: "2026-07-10" }),
  ]

  assert.deepEqual(sortPrintableInterviews(interviews, "timeline").map((item) => item.id), ["newer-a", "older-a", "older-b"])
  assert.deepEqual(sortPrintableInterviews(interviews, "person").map((item) => item.id), ["newer-a", "older-a", "older-b"])
})

test("groupPrintableInterviewsByPerson keeps one printable section per person with newest records first", () => {
  const grouped = groupPrintableInterviewsByPerson([
    interview({ id: "old", personId: "p1", personName: "Aさん", interviewDate: "2026-07-01" }),
    interview({ id: "other", personId: "p2", personName: "Bさん", interviewDate: "2026-07-15" }),
    interview({ id: "new", personId: "p1", personName: "Aさん", interviewDate: "2026-08-01" }),
  ])

  assert.deepEqual(grouped.map((group) => group.personId), ["p1", "p2"])
  assert.deepEqual(grouped[0].interviews.map((item) => item.id), ["new", "old"])
})
