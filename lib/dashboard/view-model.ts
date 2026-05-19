import type { Announcement, DailySupportRecord, Person, RegularInterview, Visa, VisaStatus } from "@/lib/models"

export const VISA_STATUS_ORDER: VisaStatus[] = [
  "書類準備中",
  "書類作成中",
  "書類確認中",
  "申請準備中",
  "ビザ申請準備中",
  "申請中",
  "ビザ取得済み",
]

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T\s]/
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i

export type DashboardViewModel = {
  kpis: {
    waitingCount: number
    activeCount: number
    retiredCount: number
    applicationInProgressCount: number
    expiringCount: number
  }
  visaStatusCounts: Array<{ status: VisaStatus; count: number }>
  latestRegularInterviews: Array<RegularInterview & { person?: Person }>
  latestDailySupportRecords: Array<DailySupportRecord & { person?: Person }>
  announcements: Array<Announcement & { isUnread: boolean }>
  nationalities: Array<{ nationality: string; count: number; percentage: number }>
  otherNationalityCount: number
  otherNationalityPercentage: number
  businessLocations: Array<{ name: string; count: number; percentage: number }>
  otherBusinessLocationCount: number
  otherBusinessLocationPercentage: number
}

type BuildDashboardViewModelInput = {
  people: Person[]
  visas: Visa[]
  regularInterviews: RegularInterview[]
  dailySupportRecords: DailySupportRecord[]
  announcements: Announcement[]
  readAnnouncementIds: string[]
  now?: Date
}

function parseDashboardDate(date: string): Date {
  const dateOnlyMatch = date.match(DATE_ONLY_PATTERN)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  if (DATE_TIME_PATTERN.test(date) && !TIMEZONE_SUFFIX_PATTERN.test(date)) {
    return new Date(`${date.replace(" ", "T")}Z`)
  }

  return new Date(date)
}

function getDaysUntil(date: string, now: Date): number {
  return Math.ceil((parseDashboardDate(date).getTime() - now.getTime()) / MS_PER_DAY)
}

function isWithinDays(date: string | undefined, days: number, now: Date): boolean {
  if (!date) return false
  const daysUntil = getDaysUntil(date, now)
  return daysUntil >= 0 && daysUntil <= days
}

export function buildDashboardViewModel({
  people,
  visas,
  regularInterviews,
  dailySupportRecords,
  announcements,
  readAnnouncementIds,
  now = new Date(),
}: BuildDashboardViewModelInput): DashboardViewModel {
  const personMap = new Map(people.map((person) => [person.id, person]))
  const expiringPersonIds = new Set<string>()

  visas.forEach((visa) => {
    if (isWithinDays(visa.expiryDate, 30, now)) {
      expiringPersonIds.add(visa.personId)
    }
  })
  people.forEach((person) => {
    if (isWithinDays(person.residenceCardExpiryDate, 30, now)) {
      expiringPersonIds.add(person.id)
    }
  })

  const visaStatusCounts = VISA_STATUS_ORDER.map((status) => ({
    status,
    count: visas.filter((visa) => visa.status === status).length,
  }))

  const latestRegularInterviews = [...regularInterviews]
    .sort((a, b) => parseDashboardDate(b.interviewDate).getTime() - parseDashboardDate(a.interviewDate).getTime())
    .slice(0, 5)
    .map((interview) => ({ ...interview, person: personMap.get(interview.personId) }))

  const latestDailySupportRecords = [...dailySupportRecords]
    .sort((a, b) => parseDashboardDate(b.supportDate).getTime() - parseDashboardDate(a.supportDate).getTime())
    .slice(0, 5)
    .map((record) => ({ ...record, person: personMap.get(record.personId) }))

  const latestAnnouncements = [...announcements]
    .sort((a, b) => parseDashboardDate(b.createdAt).getTime() - parseDashboardDate(a.createdAt).getTime())
    .slice(0, 3)
    .map((announcement) => ({
      ...announcement,
      isUnread: !readAnnouncementIds.includes(announcement.id),
    }))

  const nationalityCounts = people.reduce<Record<string, number>>((acc, person) => {
    const nationality = person.nationality || "不明"
    acc[nationality] = (acc[nationality] || 0) + 1
    return acc
  }, {})
  const sortedNationalities = Object.entries(nationalityCounts).sort((a, b) => b[1] - a[1])
  const totalPeople = people.length
  const topNationalities = sortedNationalities.slice(0, 5).map(([nationality, count]) => ({
    nationality,
    count,
    percentage: totalPeople > 0 ? Math.round((count / totalPeople) * 100) : 0,
  }))
  const otherNationalityCount = sortedNationalities.slice(5).reduce((sum, [, count]) => sum + count, 0)

  const businessLocationCounts = people.reduce<Record<string, number>>((acc, person) => {
    const locationName = person.company || "未定"
    acc[locationName] = (acc[locationName] || 0) + 1
    return acc
  }, {})
  const sortedBusinessLocations = Object.entries(businessLocationCounts).sort((a, b) => b[1] - a[1])
  const topBusinessLocations = sortedBusinessLocations.slice(0, 5).map(([name, count]) => ({
    name,
    count,
    percentage: totalPeople > 0 ? Math.round((count / totalPeople) * 100) : 0,
  }))
  const otherBusinessLocationCount = sortedBusinessLocations
    .slice(5)
    .reduce((sum, [, count]) => sum + count, 0)

  return {
    kpis: {
      waitingCount: people.filter((person) => person.workingStatus === "入社待ち").length,
      activeCount: people.filter((person) => person.workingStatus === "在籍中").length,
      retiredCount: people.filter((person) => person.workingStatus === "退職").length,
      applicationInProgressCount: visas.filter((visa) => visa.status === "申請中").length,
      expiringCount: expiringPersonIds.size,
    },
    visaStatusCounts,
    latestRegularInterviews,
    latestDailySupportRecords,
    announcements: latestAnnouncements,
    nationalities: topNationalities,
    otherNationalityCount,
    otherNationalityPercentage:
      totalPeople > 0 ? Math.round((otherNationalityCount / totalPeople) * 100) : 0,
    businessLocations: topBusinessLocations,
    otherBusinessLocationCount,
    otherBusinessLocationPercentage:
      totalPeople > 0 ? Math.round((otherBusinessLocationCount / totalPeople) * 100) : 0,
  }
}
