"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { Search, Calendar, FileText, CheckSquare, ChevronRight } from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { getRegularInterviews, getDailySupportRecords } from "@/lib/kintone-data"
import type { Person, Visa, EnhancedActivityItem, TimelineActivityType } from "@/lib/models"
import { cn } from "@/lib/utils"

// Type icons and colors
const typeConfig: Record<TimelineActivityType, { icon: typeof Calendar; color: string; label: string }> = {
  visa: { icon: FileText, color: "text-emerald-600 bg-emerald-100", label: "ビザ" },
  regular_interview: { icon: Calendar, color: "text-blue-600 bg-blue-100", label: "定期面談" },
  daily_support: { icon: CheckSquare, color: "text-orange-600 bg-orange-100", label: "日々対応" },
}

// Timeline Item Component - links to person detail page (not individual record detail)
function TimelineItem({ item, isLast }: { item: EnhancedActivityItem; isLast: boolean }) {
  const config = typeConfig[item.type]
  const Icon = config.icon

  return (
    <div className="flex gap-4">
      {/* Timeline line and icon */}
      <div className="flex flex-col items-center">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full shrink-0", config.color)}>
          <Icon className="h-5 w-5" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-2 min-h-[2rem]" />}
      </div>

      {/* Content - links to person detail page */}
      <Link href={item.link} className="flex-1 pb-6 group">
        <Card className="transition-colors hover:bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {config.label}
                  </Badge>
                  <h4 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                </div>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  <span>{item.personName}</span>
                  {item.companyName && (
                    <>
                      <span className="text-muted-foreground/50">|</span>
                      <span>{item.companyName}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <time className="text-xs text-muted-foreground">{formatDate(item.datetime)}</time>
                {item.status && (
                  <Badge variant="secondary" className="text-xs">
                    {item.status}
                  </Badge>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

export default function TimelinePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [personFilter, setPersonFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [people, setPeople] = useState<Person[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [allActivities, setAllActivities] = useState<EnhancedActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch data from Supabase and async data adapters
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const [peopleData, visasData, regularInterviewsData, dailySupportData] = await Promise.all([
          getPeople(),
          getVisas(),
          getRegularInterviews(),
          getDailySupportRecords(),
        ])

        setPeople(peopleData)
        setVisas(visasData)

        // Build activities from all data sources
        const activities: EnhancedActivityItem[] = []

        // Add visa activities from status history dates
        visasData.forEach((visa) => {
          const person = peopleData.find((p) => p.id === visa.personId)
          if (!person) return

          const statusDates = [
            { date: visa.documentPreparationDate, status: "書類準備中" },
            { date: visa.documentCreationDate, status: "書類作成中" },
            { date: visa.documentConfirmationDate, status: "書類確認中" },
            { date: visa.applicationPreparationDate, status: "申請準備中" },
            { date: visa.visaApplicationPreparationDate, status: "ビザ申請準備中" },
            { date: visa.applicationDate, status: "申請中" },
            { date: visa.additionalDocumentsDate, status: "追加書類" },
            { date: visa.visaAcquiredDate, status: "ビザ取得済み" },
          ]

          statusDates.forEach(({ date, status }) => {
            if (date) {
              activities.push({
                id: `visa-${visa.id}-${status}`,
                type: "visa",
                title: `ビザ ${visa.type}: ${status}`,
                personId: person.id,
                personName: person.name,
                companyName: person.company,
                datetime: date,
                status,
                link: `/people/${person.id}`, // Link to person detail
              })
            }
          })
        })

        // Add regular interviews (定期面談)
        regularInterviewsData.forEach((interview) => {
          activities.push({
            id: `interview-${interview.id}`,
            type: "regular_interview",
            title: `${interview.targetQuarter} 定期面談`,
            personId: interview.personId,
            personName: interview.personName,
            companyName: interview.companyName,
            datetime: interview.interviewDate,
            link: `/people/${interview.personId}`, // Link to person detail
          })
        })

        // Add daily support records (日々の面談)
        dailySupportData.forEach((record) => {
          const categories = record.dailyEntries.map((e) => e.shou).join(", ")
          activities.push({
            id: `support-${record.id}`,
            type: "daily_support",
            title: categories || "日々対応",
            personId: record.personId,
            personName: record.personName,
            companyName: record.companyName,
            datetime: record.supportDate,
            link: `/people/${record.personId}`, // Link to person detail
          })
        })

        // Sort by datetime (newest first)
        activities.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())
        setAllActivities(activities)
      } catch (err) {
        console.error("Error fetching timeline data:", err)
        setError(err instanceof Error ? err.message : "データの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Filter activities
  const filteredActivities = useMemo(() => {
    return allActivities.filter((activity) => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch =
          activity.title.toLowerCase().includes(searchLower) ||
          activity.personName.toLowerCase().includes(searchLower) ||
          (activity.companyName?.toLowerCase().includes(searchLower))
        if (!matchesSearch) return false
      }

      // Type filter
      if (typeFilter !== "all") {
        if (activity.type !== typeFilter) return false
      }

      // Person filter
      if (personFilter !== "all" && activity.personId !== personFilter) return false

      // Date filter
      if (dateFilter !== "all") {
        const activityDate = new Date(activity.datetime)
        const now = new Date()
        const daysAgo = Number.parseInt(dateFilter)
        const filterDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
        if (activityDate < filterDate) return false
      }

      return true
    })
  }, [allActivities, searchTerm, typeFilter, personFilter, dateFilter])

  // Get unique people for filter
  const uniquePeople = useMemo(() => {
    const peopleMap = new Map<string, { id: string; name: string }>()
    allActivities.forEach((activity) => {
      if (!peopleMap.has(activity.personId)) {
        peopleMap.set(activity.personId, { id: activity.personId, name: activity.personName })
      }
    })
    return Array.from(peopleMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allActivities])

  // Activity type counts
  const typeCounts = useMemo(() => ({
    regularInterview: filteredActivities.filter((a) => a.type === "regular_interview").length,
    visa: filteredActivities.filter((a) => a.type === "visa").length,
    dailySupport: filteredActivities.filter((a) => a.type === "daily_support").length,
  }), [filteredActivities])

  if (loading) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
            <p className="text-muted-foreground mt-2">すべての活動を時系列で確認</p>
          </div>
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">読み込み中...</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
            <p className="text-muted-foreground mt-2">すべての活動を時系列で確認</p>
          </div>
          <div className="flex items-center justify-center py-8">
            <p className="text-red-500">{error}</p>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
          <p className="text-muted-foreground mt-2">ビザ進捗、定期面談、日々対応を時系列で確認</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="タイトル、人材名、法人名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="種別" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="regular_interview">定期面談</SelectItem>
              <SelectItem value="daily_support">日々対応</SelectItem>
              <SelectItem value="visa">ビザ</SelectItem>
            </SelectContent>
          </Select>

          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="対象者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {uniquePeople.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="期間" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="7">過去7日</SelectItem>
              <SelectItem value="30">過去30日</SelectItem>
              <SelectItem value="90">過去90日</SelectItem>
            </SelectContent>
          </Select>

          <Badge variant="secondary">{filteredActivities.length} 件</Badge>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-3">
            {filteredActivities.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">
                    {allActivities.length === 0
                      ? "活動がありません"
                      : "該当する活動がありません"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-0">
                {filteredActivities.slice(0, 50).map((activity, index) => (
                  <TimelineItem
                    key={activity.id}
                    item={activity}
                    isLast={index === Math.min(filteredActivities.length, 50) - 1}
                  />
                ))}
                {filteredActivities.length > 50 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    他 {filteredActivities.length - 50} 件のアクティビティがあります
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            {/* Activity Type Stats */}
            <Card>
              <CardHeader>
                <CardTitle>活動種別</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="text-sm">定期面談</span>
                  </div>
                  <Badge variant="secondary">{typeCounts.regularInterview}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="h-4 w-4 text-orange-600" />
                    <span className="text-sm">日々対応</span>
                  </div>
                  <Badge variant="secondary">{typeCounts.dailySupport}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm">ビザ</span>
                  </div>
                  <Badge variant="secondary">{typeCounts.visa}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle>最近の活動</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {filteredActivities.filter((activity) => {
                        const activityDate = new Date(activity.datetime)
                        const now = new Date()
                        const daysDiff = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24)
                        return daysDiff <= 7
                      }).length}
                    </div>
                    <p className="text-xs text-muted-foreground">過去7日間</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {filteredActivities.filter((activity) => {
                        const activityDate = new Date(activity.datetime)
                        const now = new Date()
                        return (
                          activityDate.getMonth() === now.getMonth() && activityDate.getFullYear() === now.getFullYear()
                        )
                      }).length}
                    </div>
                    <p className="text-xs text-muted-foreground">今月</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Filters */}
            <Card>
              <CardHeader>
                <CardTitle>クイックフィルタ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => setTypeFilter("regular_interview")}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  定期面談のみ表示
                </button>
                <button
                  onClick={() => setTypeFilter("daily_support")}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  日々対応のみ表示
                </button>
                <button
                  onClick={() => setTypeFilter("visa")}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  ビザ更新のみ表示
                </button>
                <button
                  onClick={() => {
                    setTypeFilter("all")
                    setPersonFilter("all")
                    setDateFilter("all")
                    setSearchTerm("")
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  フィルタをリセット
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}
