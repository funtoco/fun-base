import type { Announcement, Meeting, Person, SupportAction, Visa, VisaStatus } from "@/lib/models"

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

export type DashboardViewModel = {
  kpis: {
    waitingCount: number
    activeCount: number
    retiredCount: number
    applicationInProgressCount: number
    expiringCount: number
  }
  visaStatusCounts: Array<{ status: VisaStatus; count: number }>
  latestMeetings: Array<Meeting & { person?: Person }>
  supportActions: Array<SupportAction & { person?: Person }>
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
  meetings: Meeting[]
  supportActions: SupportAction[]
  announcements: Announcement[]
  readAnnouncementIds: string[]
  now?: Date
}

function getDaysUntil(date: string, now: Date): number {
  return Math.ceil((new Date(date).getTime() - now.getTime()) / MS_PER_DAY)
}

function isWithinDays(date: string | undefined, days: number, now: Date): boolean {
  if (!date) return false
  return getDaysUntil(date, now) <= days
}

export function buildDashboardViewModel({
  people,
  visas,
  meetings,
  supportActions,
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

  const latestMeetings = [...meetings]
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
    .slice(0, 5)
    .map((meeting) => ({ ...meeting, person: personMap.get(meeting.personId) }))

  const supportActionStatusOrder: Record<SupportAction["status"], number> = {
    open: 0,
    in_progress: 1,
    done: 2,
  }
  const sortedSupportActions = [...supportActions]
    .sort((a, b) => {
      const statusDiff = supportActionStatusOrder[a.status] - supportActionStatusOrder[b.status]
      if (statusDiff !== 0) return statusDiff
      if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime()
      if (a.due) return -1
      if (b.due) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, 5)
    .map((action) => ({ ...action, person: personMap.get(action.personId) }))

  const latestAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
    latestMeetings,
    supportActions: sortedSupportActions,
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
