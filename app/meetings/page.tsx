"use client"

import { useState, useEffect } from "react"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { TreeNoteView } from "@/components/ui/tree-note-view"
import { ListPanelLoadingSkeleton } from "@/components/ui/funbase-loading"
import { Calendar, List, Search, Filter, Clock, User } from "lucide-react"
import { getPeople } from "@/lib/supabase/people"
import { getMeetings } from "@/lib/supabase/meetings"
import { formatDateTime } from "@/lib/utils"
import { meetingTaxonomy } from "@/constants/meeting-taxonomy"
import type { Person, Meeting } from "@/lib/models"

export default function MeetingsPage() {
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list")
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [personFilter, setPersonFilter] = useState<string>("all")
  const [sectionFilter, setSectionFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")
  const [people, setPeople] = useState<Person[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const [peopleData, meetingsData] = await Promise.all([
          getPeople(),
          getMeetings()
        ])
        setPeople(peopleData)
        setMeetings(meetingsData)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Filter meetings
  const filteredMeetings = meetings.filter((meeting) => {
    const person = people.find((p) => p.id === meeting.personId)
    if (!person) return false

    // Search filter
    if (searchTerm) {
      const searchMatch =
        meeting.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        person.name.toLowerCase().includes(searchTerm.toLowerCase())
      if (!searchMatch) return false
    }

    // Type filter
    if (typeFilter !== "all" && meeting.kind !== typeFilter) return false

    // Person filter
    if (personFilter !== "all" && meeting.personId !== personFilter) return false

    // Section filter
    if (sectionFilter !== "all") {
      const hasSection = meeting.notes.some((note) => note.section === sectionFilter)
      if (!hasSection) return false
    }

    // Date filter
    if (dateFilter !== "all") {
      const meetingDate = new Date(meeting.datetime)
      const now = new Date()
      const daysAgo = Number.parseInt(dateFilter)
      const filterDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
      if (meetingDate < filterDate) return false
    }

    return true
  })

  // Sort meetings by date (newest first)
  const sortedMeetings = filteredMeetings.sort(
    (a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime(),
  )

  // Get unique values for filters
  const uniquePeople = Array.from(new Set(meetings.map((m) => m.personId)))
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean)

  const uniqueSections = Object.keys(meetingTaxonomy)

  if (loading) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">面談記録</h1>
            <p className="text-muted-foreground mt-2">面談の記録と内容を管理</p>
          </div>
          <ListPanelLoadingSkeleton />
        </div>
      </AuthGuard>
    )
  }

  if (error) {
    return (
      <AuthGuard>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">面談記録</h1>
            <p className="text-muted-foreground mt-2">面談の記録と内容を管理</p>
          </div>
          <div className="flex items-center justify-center py-8">
            <div className="text-red-500">{error}</div>
          </div>
        </div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">面談記録</h1>
            <p className="text-muted-foreground mt-2">面談の記録と内容を管理</p>
          </div>

          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "list" | "calendar")}>
            <TabsList>
              <TabsTrigger value="list" className="gap-2">
                <List className="h-4 w-4" />
                リスト
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <Calendar className="h-4 w-4" />
                カレンダー
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="面談タイトル、人材名で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue placeholder="面談種別" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="仕事">仕事</SelectItem>
              <SelectItem value="プライベート">プライベート</SelectItem>
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

          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="セクション" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {uniqueSections.map((section) => (
                <SelectItem key={section} value={section}>
                  {section}
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
          <Badge variant="secondary">{sortedMeetings.length} 件</Badge>
        </div>

        {/* Content */}
        <Tabs value={viewMode}>
          <TabsContent value="list">
            <div className="space-y-4">
              {sortedMeetings.length === 0 ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-8">
                    <p className="text-muted-foreground">面談記録がありません</p>
                  </CardContent>
                </Card>
              ) : (
                sortedMeetings.map((meeting) => {
                  const person = people.find((p) => p.id === meeting.personId)
                  if (!person) return null

                  return (
                    <Card key={meeting.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{meeting.title}</CardTitle>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-4 w-4" />
                                {person.name}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {formatDateTime(meeting.datetime)}
                              </span>
                              {meeting.durationMin && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  {meeting.durationMin}分
                                </span>
                              )}
                              <Badge variant="outline">{meeting.kind}</Badge>
                            </div>
                            {meeting.attendees && meeting.attendees.length > 0 && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                参加者: {meeting.attendees.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <TreeNoteView notes={meeting.notes} />
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="calendar">
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">カレンダービューは今後実装予定です</p>
                  <p className="text-sm text-muted-foreground mt-2">現在はリストビューをご利用ください</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">面談種別</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">仕事</span>
                  <Badge variant="secondary">{sortedMeetings.filter((m) => m.kind === "仕事").length}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">プライベート</span>
                  <Badge variant="secondary">{sortedMeetings.filter((m) => m.kind === "プライベート").length}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">今月の面談</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {
                  sortedMeetings.filter((meeting) => {
                    const meetingDate = new Date(meeting.datetime)
                    const now = new Date()
                    return meetingDate.getMonth() === now.getMonth() && meetingDate.getFullYear() === now.getFullYear()
                  }).length
                }
              </div>
              <p className="text-xs text-muted-foreground">実施済み</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">平均面談時間</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(
                  sortedMeetings.reduce((sum, m) => sum + (m.durationMin || 0), 0) / sortedMeetings.length || 0,
                )}
                分
              </div>
              <p className="text-xs text-muted-foreground">1回あたり</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthGuard>
  )
}
