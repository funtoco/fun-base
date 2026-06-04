"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Timeline } from "@/components/ui/timeline"
import { FunBaseLoading } from "@/components/ui/funbase-loading"
import { Search, Filter, Calendar, FileText, CheckSquare } from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getVisas } from "@/lib/supabase/visas"
import { getMeetings } from "@/lib/supabase/meetings"
import { getSupportActions } from "@/lib/supabase/support-actions"
import { generateActivityTimeline } from "@/lib/utils"
import type { Person, Visa, Meeting, SupportAction } from "@/lib/models"

export default function TimelinePage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [personFilter, setPersonFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [people, setPeople] = useState<Person[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [supportActions, setSupportActions] = useState<SupportAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch data from Supabase
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        const [peopleData, visasData, meetingsData, supportActionsData] = await Promise.all([
          getPeople(),
          getVisas(),
          getMeetings(),
          getSupportActions(),
        ])
        setPeople(peopleData)
        setVisas(visasData)
        setMeetings(meetingsData)
        setSupportActions(supportActionsData)
      } catch (err) {
        console.error("Error fetching timeline data:", err)
        setError(err instanceof Error ? err.message : "データの取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Generate full activity timeline
  const allActivities = generateActivityTimeline(people, visas, meetings, supportActions)

  // Filter activities
  const filteredActivities = allActivities.filter((activity) => {
    // Search filter
    if (searchTerm) {
      const searchMatch =
        activity.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        activity.personName.toLowerCase().includes(searchTerm.toLowerCase())
      if (!searchMatch) return false
    }

    // Type filter
    if (typeFilter !== "all" && activity.type !== typeFilter) return false

    // Person filter
    if (personFilter !== "all") {
      const person = people.find((p) => p.name === activity.personName)
      if (!person || person.id !== personFilter) return false
    }

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

  // Convert to timeline format
  const timelineItems = filteredActivities.map((activity) => ({
    id: activity.id,
    type: activity.type,
    title: activity.title,
    description: activity.personName,
    datetime: activity.datetime,
    status: activity.status,
    onClick: () => {
      window.location.href = activity.link
    },
  }))

  // Get unique people for filter
  const uniquePeople = Array.from(new Set(allActivities.map((a) => a.personName)))
    .map((name) => people.find((p) => p.name === name))
    .filter(Boolean)

  // Activity type counts
  const typeCounts = {
    meeting: filteredActivities.filter((a) => a.type === "meeting").length,
    visa: filteredActivities.filter((a) => a.type === "visa").length,
    support: filteredActivities.filter((a) => a.type === "support").length,
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
          <p className="text-muted-foreground mt-2">すべての活動を時系列で確認</p>
        </div>
        <FunBaseLoading
          variant="inline"
          title="タイムラインを読み込み中"
          description="活動履歴を時系列に並べています"
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
          <p className="text-muted-foreground mt-2">すべての活動を時系列で確認</p>
        </div>
        <div className="flex items-center justify-center py-8">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">タイムライン</h1>
        <p className="text-muted-foreground mt-2">すべての活動を時系列で確認</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="タイトル、人材名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-64"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <SelectValue placeholder="種別" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="meeting">面談</SelectItem>
            <SelectItem value="visa">ビザ</SelectItem>
            <SelectItem value="support">サポート</SelectItem>
          </SelectContent>
        </Select>

        <Select value={personFilter} onValueChange={setPersonFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="対象者" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {uniquePeople.map((person) => (
              <SelectItem key={person!.id} value={person!.id}>
                {person!.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="期間" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            <SelectItem value="7">過去7日</SelectItem>
            <SelectItem value="30">過去30日</SelectItem>
            <SelectItem value="90">過去90日</SelectItem>
          </SelectContent>
        </Select>

        {/* Results count */}
        <Badge variant="secondary">{filteredActivities.length} 件</Badge>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Timeline */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>活動タイムライン</CardTitle>
            </CardHeader>
            <CardContent>
              {timelineItems.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">該当する活動がありません</p>
                </div>
              ) : (
                <Timeline items={timelineItems} />
              )}
            </CardContent>
          </Card>
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
                  <span className="text-sm">面談</span>
                </div>
                <Badge variant="secondary">{typeCounts.meeting}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="text-sm">ビザ</span>
                </div>
                <Badge variant="secondary">{typeCounts.visa}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">サポート</span>
                </div>
                <Badge variant="secondary">{typeCounts.support}</Badge>
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
                    {
                      filteredActivities.filter((activity) => {
                        const activityDate = new Date(activity.datetime)
                        const now = new Date()
                        const daysDiff = (now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24)
                        return daysDiff <= 7
                      }).length
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">過去7日間</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">
                    {
                      filteredActivities.filter((activity) => {
                        const activityDate = new Date(activity.datetime)
                        const now = new Date()
                        return (
                          activityDate.getMonth() === now.getMonth() && activityDate.getFullYear() === now.getFullYear()
                        )
                      }).length
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">今月</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Active People */}
          <Card>
            <CardHeader>
              <CardTitle>アクティブな人材</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from(new Set(filteredActivities.slice(0, 10).map((a) => a.personName)))
                  .slice(0, 5)
                  .map((personName) => {
                    const person = people.find((p) => p.name === personName)
                    const activityCount = filteredActivities.filter((a) => a.personName === personName).length
                    return (
                      <div key={personName} className="flex items-center justify-between text-sm">
                        <span>{personName}</span>
                        <Badge variant="outline">{activityCount}</Badge>
                      </div>
                    )
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Navigation */}
          <Card>
            <CardHeader>
              <CardTitle>クイックナビ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button
                onClick={() => setTypeFilter("meeting")}
                className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
              >
                面談記録のみ表示
              </button>
              <button
                onClick={() => setTypeFilter("visa")}
                className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
              >
                ビザ更新のみ表示
              </button>
              <button
                onClick={() => setTypeFilter("support")}
                className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
              >
                サポート記録のみ表示
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
  )
}
