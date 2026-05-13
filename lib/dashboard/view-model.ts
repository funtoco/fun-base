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

export type DashboardAttentionItem = {
  id: string
  type: "visa_expiry" | "residence_card_expiry" | "support" | "meeting"
  label: string
  personName: string
  personId: string
  detail: string
  urgency: "high" | "medium" | "low"
}

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
  attentionItems: DashboardAttentionItem[]
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

function formatDaysDetail(days: number): string {
  if (days < 0) return `${Math.abs(days)}日超過`
  if (days === 0) return "今日"
  return `${days}日後`
}

function getUrgency(days: number): "high" | "medium" | "low" {
  if (days <= 7) return "high"
  if (days <= 14) return "medium"
  return "low"
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

  const attentionItems: DashboardAttentionItem[] = []

  visas
    .filter((visa) => isWithinDays(visa.expiryDate, 30, now))
    .forEach((visa) => {
      const person = personMap.get(visa.personId)
      if (!person || !visa.expiryDate) return
      const days = getDaysUntil(visa.expiryDate, now)
      attentionItems.push({
        id: visa.id,
        type: "visa_expiry",
        label: "ビザ期限",
        personName: person.name,
        personId: person.id,
        detail: formatDaysDetail(days),
        urgency: getUrgency(days),
      })
    })

  people
    .filter((person) => isWithinDays(person.residenceCardExpiryDate, 30, now))
    .forEach((person) => {
      if (!person.residenceCardExpiryDate) return
      const days = getDaysUntil(person.residenceCardExpiryDate, now)
      attentionItems.push({
        id: person.id,
        type: "residence_card_expiry",
        label: "在留カード期限",
        personName: person.name,
        personId: person.id,
        detail: formatDaysDetail(days),
        urgency: getUrgency(days),
      })
    })

  supportActions
    .filter((action) => action.status === "open" || action.status === "in_progress")
    .forEach((action) => {
      const person = personMap.get(action.personId)
      if (!person) return
      attentionItems.push({
        id: action.id,
        type: "support",
        label: action.category,
        personName: person.name,
        personId: person.id,
        detail: action.status === "open" ? "未対応" : "対応中",
        urgency: action.status === "open" ? "high" : "medium",
      })
    })

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  meetings
    .filter((meeting) => {
      const meetingDate = new Date(meeting.datetime)
      return meetingDate >= sevenDaysAgo && meetingDate <= now
    })
    .forEach((meeting) => {
      const person = personMap.get(meeting.personId)
      if (!person) return
      attentionItems.push({
        id: meeting.id,
        type: "meeting",
        label: "最近の面談",
        personName: person.name,
        personId: person.id,
        detail: meeting.kind,
        urgency: "low",
      })
    })

  const urgencyOrder: Record<DashboardAttentionItem["urgency"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  }

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
    attentionItems: attentionItems
      .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
      .slice(0, 8),
  }
}
