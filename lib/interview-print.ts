import type { RegularInterview } from "@/lib/models"

export type InterviewPrintSortMode = "person" | "timeline"

export type InterviewPrintFilters = {
  recordIds?: string[]
  search?: string
  quarter?: string[]
  company?: string[]
  staff?: string[]
  method?: string[]
  date?: string
  from?: string
  to?: string
}

export type PrintableInterviewPersonGroup = {
  personId: string
  personName: string
  nickName?: string
  companyName?: string
  interviews: RegularInterview[]
}

function normalizeText(value?: string): string {
  return (value ?? "").trim().toLowerCase()
}

function isInValues(value: string | undefined, values?: string[]): boolean {
  const normalizedValues = (values ?? []).map((item) => item.trim()).filter(Boolean)
  return normalizedValues.length === 0 || normalizedValues.includes(value ?? "")
}

function parseDateOnly(value?: string): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function isWithinDateRange(interviewDateValue: string, filters: InterviewPrintFilters, now = new Date()): boolean {
  const interviewDate = parseDateOnly(interviewDateValue)
  if (!interviewDate) return false

  const fromDate = parseDateOnly(filters.from)
  if (fromDate && interviewDate < fromDate) return false

  const toDate = parseDateOnly(filters.to)
  if (toDate) {
    const endOfToDate = new Date(toDate)
    endOfToDate.setHours(23, 59, 59, 999)
    if (interviewDate > endOfToDate) return false
  }

  if (filters.date && filters.date !== "all") {
    const daysAgo = Number.parseInt(filters.date, 10)
    if (!Number.isNaN(daysAgo)) {
      const listInterviewDate = new Date(interviewDateValue)
      const filterDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
      if (listInterviewDate < filterDate) return false
    }
  }

  return true
}

export function filterPrintableInterviews(
  interviews: RegularInterview[],
  filters: InterviewPrintFilters,
  now = new Date()
): RegularInterview[] {
  const search = normalizeText(filters.search)

  return interviews.filter((interview) => {
    if (!isInValues(interview.id, filters.recordIds)) return false

    if (search) {
      const haystack = [
        interview.personName,
        interview.nickName,
        interview.companyName,
        interview.personId,
        interview.companyId,
      ].map(normalizeText)

      if (!haystack.some((value) => value.includes(search))) return false
    }

    if (!isInValues(interview.targetQuarter, filters.quarter)) return false
    if (!isInValues(interview.companyName, filters.company)) return false
    if (!isInValues(interview.supportStaffName, filters.staff)) return false
    if (!isInValues(interview.interviewMethod, filters.method)) return false
    if (!isWithinDateRange(interview.interviewDate, filters, now)) return false

    return true
  })
}

function compareInterviewDateDesc(a: RegularInterview, b: RegularInterview): number {
  const dateOrder = new Date(b.interviewDate).getTime() - new Date(a.interviewDate).getTime()
  if (dateOrder !== 0) return dateOrder
  return b.id.localeCompare(a.id)
}

export function sortPrintableInterviews(
  interviews: RegularInterview[],
  sortMode: InterviewPrintSortMode
): RegularInterview[] {
  if (sortMode === "timeline") {
    return [...interviews].sort(compareInterviewDateDesc)
  }

  return [...interviews].sort((a, b) => {
    const personOrder = a.personName.localeCompare(b.personName, "ja")
    if (personOrder !== 0) return personOrder

    const personIdOrder = a.personId.localeCompare(b.personId)
    if (personIdOrder !== 0) return personIdOrder

    return compareInterviewDateDesc(a, b)
  })
}

export function groupPrintableInterviewsByPerson(interviews: RegularInterview[]): PrintableInterviewPersonGroup[] {
  const sortedInterviews = sortPrintableInterviews(interviews, "person")
  const groups = new Map<string, PrintableInterviewPersonGroup>()

  sortedInterviews.forEach((interview) => {
    const group = groups.get(interview.personId)
    if (group) {
      group.interviews.push(interview)
      return
    }

    groups.set(interview.personId, {
      personId: interview.personId,
      personName: interview.personName,
      nickName: interview.nickName,
      companyName: interview.companyName,
      interviews: [interview],
    })
  })

  return Array.from(groups.values())
}
