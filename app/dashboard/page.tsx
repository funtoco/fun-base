import { Suspense } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { 
  RefreshCw, 
  Users, 
  Clock, 
  AlertTriangle, 
  FileText,
  MessageSquare,
  Megaphone,
  ChevronRight,
  Briefcase,
  UserCheck,
  UserX
} from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { getMeetings } from "@/lib/supabase/meetings"
import { getSupportActions } from "@/lib/supabase/support-actions"
import { getPublishedAnnouncements, getReadAnnouncementIds } from "@/lib/supabase/announcements"
import { formatDate, formatDateTime, isExpiringSoon, getDaysUntilExpiry } from "@/lib/utils"
import type { Person, Visa, Meeting, SupportAction, Announcement, VisaStatus } from "@/lib/models"

const VISA_STATUS_ORDER: VisaStatus[] = [
  "書類準備中",
  "書類作成中",
  "書類確認中",
  "申請準備中",
  "ビザ申請準備中",
  "申請中",
  "ビザ取得済み",
]

// Server component for dashboard data
async function DashboardContent() {
  // Fetch all data in parallel
  const [people, visas, meetings, supportActions, announcements, readAnnouncementIds] = await Promise.all([
    getPeople(),
    getVisas(),
    getMeetings(),
    getSupportActions(),
    getPublishedAnnouncements(),
    getReadAnnouncementIds(),
  ])

  // Create person lookup map
  const personMap = new Map(people.map(p => [p.id, p]))

  // Calculate KPI counts
  const waitingCount = people.filter(p => p.workingStatus === "入社待ち").length
  const activeCount = people.filter(p => p.workingStatus === "在籍中").length
  const retiredCount = people.filter(p => p.workingStatus === "退職").length
  const applicationInProgressCount = visas.filter(v => v.status === "申請中").length
  
  // People/visas with expiry within 30 days
  const expiringItems = [
    ...visas.filter(v => v.expiryDate && isExpiringSoon(v.expiryDate, 30)),
    ...people.filter(p => p.residenceCardExpiryDate && isExpiringSoon(p.residenceCardExpiryDate, 30))
  ]
  const expiringCount = new Set(expiringItems.map(item => 'personId' in item ? item.personId : item.id)).size

  // Visa status counts
  const visaStatusCounts = VISA_STATUS_ORDER.map(status => ({
    status,
    count: visas.filter(v => v.status === status).length,
  }))

  // Latest 5 meetings
  const latestMeetings = [...meetings]
    .sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
    .slice(0, 5)

  // Latest support actions (prioritize open > in_progress > done, then by due date)
  const sortedSupportActions = [...supportActions]
    .sort((a, b) => {
      const statusOrder = { open: 0, in_progress: 1, done: 2 }
      const statusDiff = statusOrder[a.status] - statusOrder[b.status]
      if (statusDiff !== 0) return statusDiff
      if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime()
      if (a.due) return -1
      if (b.due) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, 5)

  // Latest 3 announcements
  const latestAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)

  // Nationality report
  const nationalityCounts = people.reduce<Record<string, number>>((acc, p) => {
    const nationality = p.nationality || "不明"
    acc[nationality] = (acc[nationality] || 0) + 1
    return acc
  }, {})
  const sortedNationalities = Object.entries(nationalityCounts)
    .sort((a, b) => b[1] - a[1])
  const topNationalities = sortedNationalities.slice(0, 5)
  const otherCount = sortedNationalities.slice(5).reduce((sum, [, count]) => sum + count, 0)
  const totalPeople = people.length

  // Attention items (max 8)
  const attentionItems: Array<{
    id: string
    type: "visa_expiry" | "support" | "meeting"
    label: string
    personName: string
    personId: string
    detail: string
    urgency: "high" | "medium" | "low"
  }> = []

  // Visa expiry within 30 days
  visas
    .filter(v => v.expiryDate && isExpiringSoon(v.expiryDate, 30))
    .forEach(v => {
      const person = personMap.get(v.personId)
      if (person) {
        const days = getDaysUntilExpiry(v.expiryDate!)
        attentionItems.push({
          id: v.id,
          type: "visa_expiry",
          label: "在留期限",
          personName: person.name,
          personId: person.id,
          detail: `${days}日後`,
          urgency: days <= 7 ? "high" : days <= 14 ? "medium" : "low",
        })
      }
    })

  // Open or in-progress support actions
  supportActions
    .filter(a => a.status === "open" || a.status === "in_progress")
    .forEach(a => {
      const person = personMap.get(a.personId)
      if (person) {
        attentionItems.push({
          id: a.id,
          type: "support",
          label: a.category,
          personName: person.name,
          personId: person.id,
          detail: a.status === "open" ? "未対応" : "対応中",
          urgency: a.status === "open" ? "high" : "medium",
        })
      }
    })

  // Meetings in last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  meetings
    .filter(m => new Date(m.datetime) >= sevenDaysAgo)
    .forEach(m => {
      const person = personMap.get(m.personId)
      if (person) {
        attentionItems.push({
          id: m.id,
          type: "meeting",
          label: "最近の面談",
          personName: person.name,
          personId: person.id,
          detail: m.kind,
          urgency: "low",
        })
      }
    })

  // Sort by urgency and limit
  const sortedAttentionItems = attentionItems
    .sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 }
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    })
    .slice(0, 8)

  const now = new Date()
  const formattedTimestamp = formatDateTime(now)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ホーム</h1>
          <p className="text-muted-foreground text-sm mt-1">今日見るべき状況をまとめて確認</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>最終更新: {formattedTimestamp}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <Link href="/dashboard">
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="sr-only">更新</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="入社待ち"
          count={waitingCount}
          icon={<Briefcase className="h-4 w-4" />}
          href="/people?workingStatus=入社待ち"
        />
        <KPICard
          title="在籍中"
          count={activeCount}
          icon={<UserCheck className="h-4 w-4" />}
          href="/people?workingStatus=在籍中"
        />
        <KPICard
          title="退職"
          count={retiredCount}
          icon={<UserX className="h-4 w-4" />}
          href="/people?workingStatus=退職"
        />
        <KPICard
          title="ビザ申請中"
          count={applicationInProgressCount}
          icon={<FileText className="h-4 w-4" />}
          href="/people?visaStatus=申請中"
          highlight
        />
        <KPICard
          title="期限30日以内"
          count={expiringCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          href="/visas?expiry=30"
          variant="warning"
        />
      </div>

      {/* Visa Progress Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">ビザ進捗状況</CardTitle>
            <Link href="/visas" className="text-xs text-primary hover:underline flex items-center gap-1">
              詳細を見る
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {visaStatusCounts.map(({ status, count }) => (
              <Link
                key={status}
                href={`/people?visaStatus=${encodeURIComponent(status)}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <StatusBadge status={status} type="visa" />
                <span className="text-sm font-medium">{count}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Latest Information - 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Latest Meetings */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">最近の面談</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {latestMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">面談記録はまだありません</p>
            ) : (
              <div className="space-y-3">
                {latestMeetings.map(meeting => {
                  const person = personMap.get(meeting.personId)
                  return (
                    <Link
                      key={meeting.id}
                      href={`/people/${meeting.personId}`}
                      className="block p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{meeting.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{person?.name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant="secondary" className="text-xs">{meeting.kind}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(meeting.datetime)}</span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Daily Support */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">日々のサポート</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sortedSupportActions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">サポート記録はまだありません</p>
            ) : (
              <div className="space-y-3">
                {sortedSupportActions.map(action => {
                  const person = personMap.get(action.personId)
                  return (
                    <Link
                      key={action.id}
                      href={`/people/${action.personId}`}
                      className="block p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs shrink-0">{action.category}</Badge>
                          </div>
                          <p className="text-sm font-medium truncate mt-1">{action.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{person?.name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={action.status} type="support" />
                          {action.due && (
                            <span className="text-xs text-muted-foreground">{formatDate(action.due)}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Announcements */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">お知らせ</CardTitle>
              </div>
              <Link href="/announcements" className="text-xs text-primary hover:underline flex items-center gap-1">
                すべて見る
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {latestAnnouncements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">お知らせはありません</p>
            ) : (
              <div className="space-y-3">
                {latestAnnouncements.map(announcement => {
                  const isUnread = !readAnnouncementIds.includes(announcement.id)
                  return (
                    <Link
                      key={announcement.id}
                      href={`/announcements?id=${announcement.id}`}
                      className="block p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm truncate ${isUnread ? "font-medium" : ""}`}>
                            {announcement.title}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatDate(announcement.createdAt)}</p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom section: Nationality Report + Attention List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Nationality Report */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">国籍別レポート</CardTitle>
            <CardDescription className="text-xs">人材の国籍分布</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topNationalities.map(([nationality, count]) => {
                const percentage = Math.round((count / totalPeople) * 100)
                return (
                  <Link
                    key={nationality}
                    href={`/people?nationality=${encodeURIComponent(nationality)}`}
                    className="block group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm group-hover:text-primary transition-colors">{nationality}</span>
                      <span className="text-sm text-muted-foreground">{count}人 ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary/60 group-hover:bg-primary transition-colors rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </Link>
                )
              })}
              {otherCount > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">その他</span>
                  <span className="text-sm text-muted-foreground">
                    {otherCount}人 ({Math.round((otherCount / totalPeople) * 100)}%)
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Attention List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">要対応</CardTitle>
            </div>
            <CardDescription className="text-xs">優先度の高い項目</CardDescription>
          </CardHeader>
          <CardContent>
            {sortedAttentionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">対応が必要な項目はありません</p>
            ) : (
              <div className="space-y-2">
                {sortedAttentionItems.map(item => (
                  <Link
                    key={`${item.type}-${item.id}`}
                    href={`/people/${item.personId}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      item.urgency === "high" ? "bg-red-500" :
                      item.urgency === "medium" ? "bg-amber-500" :
                      "bg-blue-500"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs shrink-0">{item.label}</Badge>
                        <span className="text-sm truncate">{item.personName}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{item.detail}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// KPI Card Component
function KPICard({
  title,
  count,
  icon,
  href,
  variant = "default",
  highlight = false,
}: {
  title: string
  count: number
  icon: React.ReactNode
  href: string
  variant?: "default" | "warning"
  highlight?: boolean
}) {
  return (
    <Link href={href}>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer ${
        variant === "warning" ? "border-amber-200 bg-amber-50/30" :
        highlight ? "border-primary/30 bg-primary/5" :
        ""
      }`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className={`${
              variant === "warning" ? "text-amber-600" :
              highlight ? "text-primary" :
              "text-muted-foreground"
            }`}>
              {icon}
            </span>
            <span className={`text-2xl font-bold ${
              variant === "warning" ? "text-amber-600" :
              highlight ? "text-primary" :
              "text-foreground"
            }`}>
              {count}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{title}</p>
        </CardContent>
      </Card>
    </Link>
  )
}

// Loading state
function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ホーム</h1>
        <p className="text-muted-foreground text-sm mt-1">今日見るべき状況をまとめて確認</p>
      </div>
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">読み込み中...</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  )
}
