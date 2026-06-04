"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Button } from "@/components/ui/button"
import { FunBaseLoading } from "@/components/ui/funbase-loading"
import { 
  RefreshCw, 
  Clock, 
  AlertTriangle, 
  FileText,
  MessageSquare,
  Megaphone,
  ChevronRight,
  Briefcase,
  Building2,
  UserCheck,
  UserX
} from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { getMeetings } from "@/lib/supabase/meetings"
import { getSupportActions } from "@/lib/supabase/support-actions"
import { getPublishedAnnouncements, getReadAnnouncementIds } from "@/lib/supabase/announcements"
import { buildDashboardViewModel } from "@/lib/dashboard/view-model"
import { formatDate, formatDateTime } from "@/lib/utils"
import type { Announcement, Meeting, Person, SupportAction, Visa } from "@/lib/models"

type DashboardData = {
  people: Person[]
  visas: Visa[]
  meetings: Meeting[]
  supportActions: SupportAction[]
  announcements: Announcement[]
  readAnnouncementIds: string[]
}

function buildFilteredHref(path: string, params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params)
  const query = searchParams.toString()
  return query ? `${path}?${query}` : path
}

function DashboardContent({
  data,
  loadedAt,
  loading,
  onRefresh,
}: {
  data: DashboardData
  loadedAt: Date
  loading: boolean
  onRefresh: () => void
}) {
  const viewModel = buildDashboardViewModel({ ...data, now: loadedAt })
  const formattedTimestamp = formatDateTime(loadedAt)

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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only">更新</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title="入社待ち"
          count={viewModel.kpis.waitingCount}
          icon={<Briefcase className="h-4 w-4" />}
          href={buildFilteredHref("/people", { workingStatus: "入社待ち" })}
        />
        <KPICard
          title="在籍中"
          count={viewModel.kpis.activeCount}
          icon={<UserCheck className="h-4 w-4" />}
          href={buildFilteredHref("/people", { workingStatus: "在籍中" })}
        />
        <KPICard
          title="退職"
          count={viewModel.kpis.retiredCount}
          icon={<UserX className="h-4 w-4" />}
          href={buildFilteredHref("/people", { workingStatus: "退職" })}
        />
        <KPICard
          title="ビザ申請中"
          count={viewModel.kpis.applicationInProgressCount}
          icon={<FileText className="h-4 w-4" />}
          href={buildFilteredHref("/people", { visaStatus: "申請中" })}
          highlight
        />
        <KPICard
          title="期限30日以内"
          count={viewModel.kpis.expiringCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          href={buildFilteredHref("/visas", { expiry: "30" })}
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
            {viewModel.visaStatusCounts.map(({ status, count }) => (
              <Link
                key={status}
                href={buildFilteredHref("/people", { visaStatus: status })}
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
            {viewModel.latestMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">面談記録はまだありません</p>
            ) : (
              <div className="space-y-3">
                {viewModel.latestMeetings.map((meeting) => (
                  <Link
                    key={meeting.id}
                    href={`/people/${meeting.personId}`}
                    className="block p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{meeting.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{meeting.person?.name ?? "-"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="secondary" className="text-xs">{meeting.kind}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(meeting.datetime)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
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
            {viewModel.supportActions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">サポート記録はまだありません</p>
            ) : (
              <div className="space-y-3">
                {viewModel.supportActions.map((action) => (
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
                        <p className="text-xs text-muted-foreground truncate">{action.person?.name ?? "-"}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <StatusBadge status={action.status} type="support" />
                        {action.due && (
                          <span className="text-xs text-muted-foreground">{formatDate(action.due)}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
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
            {viewModel.announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">お知らせはありません</p>
            ) : (
              <div className="space-y-3">
                {viewModel.announcements.map((announcement) => (
                  <Link
                    key={announcement.id}
                    href={buildFilteredHref("/announcements", { id: announcement.id })}
                    className="block p-2 rounded-lg hover:bg-muted/50 transition-colors -mx-2"
                  >
                    <div className="flex items-start gap-2">
                      {announcement.isUnread && (
                        <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm truncate ${announcement.isUnread ? "font-medium" : ""}`}>
                          {announcement.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(announcement.createdAt)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom section: Nationality Report + Business Location Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Nationality Report */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">国籍別レポート</CardTitle>
            <CardDescription className="text-xs">人材の国籍分布</CardDescription>
          </CardHeader>
          <CardContent>
            {viewModel.nationalities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">国籍データはまだありません</p>
            ) : (
              <div className="space-y-3">
                {viewModel.nationalities.map(({ nationality, count, percentage }) => (
                  <Link
                    key={nationality}
                    href={buildFilteredHref("/people", { nationality })}
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
                ))}
                {viewModel.otherNationalityCount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">その他</span>
                    <span className="text-sm text-muted-foreground">
                      {viewModel.otherNationalityCount}人 ({viewModel.otherNationalityPercentage}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Business Location Report */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">事業所別レポート</CardTitle>
            </div>
            <CardDescription className="text-xs">所属先ごとの人数</CardDescription>
          </CardHeader>
          <CardContent>
            {viewModel.businessLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">事業所データはまだありません</p>
            ) : (
              <div className="space-y-3">
                {viewModel.businessLocations.map(({ name, count, percentage }) => {
                  const content = (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm group-hover:text-primary transition-colors truncate">{name}</span>
                        <span className="text-sm text-muted-foreground shrink-0">
                          {count}人 ({percentage}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/60 group-hover:bg-primary transition-colors rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </>
                  )

                  if (name === "未定") {
                    return (
                      <div key={name} className="block">
                        {content}
                      </div>
                    )
                  }

                  return (
                    <Link
                      key={name}
                      href={buildFilteredHref("/people", { company: name })}
                      className="block group"
                    >
                      {content}
                    </Link>
                  )
                })}
                {viewModel.otherBusinessLocationCount > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">その他</span>
                    <span className="text-sm text-muted-foreground">
                      {viewModel.otherBusinessLocationCount}人 ({viewModel.otherBusinessLocationPercentage}%)
                    </span>
                  </div>
                )}
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
  icon: ReactNode
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
      <FunBaseLoading
        variant="inline"
        title="ホームを読み込み中"
        description="今日見るべき状況を集計しています"
      />
    </div>
  )
}

function DashboardError({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ホーム</h1>
        <p className="text-muted-foreground text-sm mt-1">今日見るべき状況をまとめて確認</p>
      </div>
      <Card className="border-destructive/30">
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">ダッシュボードデータの取得に失敗しました</p>
              <p className="text-sm text-muted-foreground mt-1">
                接続状況または権限を確認して、もう一度読み込んでください。
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onRetry} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              再読み込み
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadDashboardData = useCallback(async () => {
    setLoading(true)
    try {
      const [people, visas, meetings, supportActions, announcements, readAnnouncementIds] = await Promise.all([
        getPeople(),
        getVisas(),
        getMeetings(),
        getSupportActions(),
        getPublishedAnnouncements(),
        getReadAnnouncementIds(),
      ])
      setData({ people, visas, meetings, supportActions, announcements, readAnnouncementIds })
      setLoadedAt(new Date())
      setError(false)
    } catch (err) {
      console.error("Failed to load dashboard data", err)
      setData(null)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  if (loading && !data) return <DashboardLoading />
  if (error || !data || !loadedAt) return <DashboardError onRetry={loadDashboardData} loading={loading} />

  return <DashboardContent data={data} loadedAt={loadedAt} loading={loading} onRefresh={loadDashboardData} />
}
