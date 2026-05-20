"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getRegularInterviews } from "@/lib/kintone-data"
import { getInterviewRecordDetailPath } from "@/lib/interview-record-links"
import { formatDate } from "@/lib/utils"
import type { RegularInterview } from "@/lib/models"
import {
  ArrowUpRight,
  Search,
  Calendar,
  Clock,
  User,
  Building2,
  MapPin,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react"

// Interview Card Component - read-only, links to person and record detail
function InterviewCard({ interview }: { interview: RegularInterview }) {
  const [expanded, setExpanded] = useState(false)
  const detailHref = getInterviewRecordDetailPath(interview.id)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href={`/people/${interview.personId}`}
                className="font-semibold text-base hover:text-primary hover:underline"
              >
                {interview.personName}
              </Link>
              {interview.nickName && (
                <span className="text-sm text-muted-foreground">({interview.nickName})</span>
              )}
              <Badge variant="outline">{interview.targetQuarter}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(interview.interviewDate)}
              </span>
              {interview.companyName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {interview.companyName}
                </span>
              )}
              {interview.interviewMethod && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {interview.interviewMethod}
                </span>
              )}
              {interview.supportStaffName && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {interview.supportStaffName}
                </span>
              )}
              {interview.interviewDuration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {interview.interviewDuration}分
                </span>
              )}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={detailHref} aria-label={`${interview.personName}の面談詳細`}>
              詳細
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 企業提出用レポート Preview - Main content for 定期面談 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">企業提出用レポート</span>
          </div>
          <div className={`bg-muted/30 rounded-lg p-3 text-sm whitespace-pre-wrap ${!expanded ? "line-clamp-3" : ""}`}>
            {interview.companyReport}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                閉じる
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                全文を表示
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MeetingsPage() {
  const [interviews, setInterviews] = useState<RegularInterview[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [quarterFilter, setQuarterFilter] = useState<string>("all")
  const [companyFilter, setCompanyFilter] = useState<string>("all")
  const [staffFilter, setStaffFilter] = useState<string>("all")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")

  // Fetch data from async data adapter
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const data = await getRegularInterviews()
        setInterviews(data)
      } catch (err) {
        console.error("Error fetching interviews:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Get unique filter options from loaded data
  const filterOptions = useMemo(() => {
    const quarters = new Set<string>()
    const companies = new Set<string>()
    const staff = new Set<string>()
    const methods = new Set<string>()

    interviews.forEach((interview) => {
      if (interview.targetQuarter) quarters.add(interview.targetQuarter)
      if (interview.companyName) companies.add(interview.companyName)
      if (interview.supportStaffName) staff.add(interview.supportStaffName)
      if (interview.interviewMethod) methods.add(interview.interviewMethod)
    })

    return {
      quarters: Array.from(quarters).sort().reverse(),
      companies: Array.from(companies).sort(),
      staff: Array.from(staff).sort(),
      methods: Array.from(methods),
    }
  }, [interviews])

  // Filter interviews
  const filteredInterviews = useMemo(() => {
    return interviews.filter((interview) => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch =
          interview.personName.toLowerCase().includes(searchLower) ||
          (interview.nickName?.toLowerCase().includes(searchLower)) ||
          (interview.companyName?.toLowerCase().includes(searchLower)) ||
          interview.personId.toLowerCase().includes(searchLower) ||
          (interview.companyId?.toLowerCase().includes(searchLower))
        if (!matchesSearch) return false
      }

      // Quarter filter
      if (quarterFilter !== "all" && interview.targetQuarter !== quarterFilter) return false

      // Company filter
      if (companyFilter !== "all" && interview.companyName !== companyFilter) return false

      // Staff filter
      if (staffFilter !== "all" && interview.supportStaffName !== staffFilter) return false

      // Method filter
      if (methodFilter !== "all" && interview.interviewMethod !== methodFilter) return false

      // Date filter
      if (dateFilter !== "all") {
        const interviewDate = new Date(interview.interviewDate)
        const now = new Date()
        const daysAgo = Number.parseInt(dateFilter)
        const filterDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
        if (interviewDate < filterDate) return false
      }

      return true
    }).sort((a, b) => new Date(b.interviewDate).getTime() - new Date(a.interviewDate).getTime())
  }, [interviews, searchTerm, quarterFilter, companyFilter, staffFilter, methodFilter, dateFilter])

  // Statistics
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = filteredInterviews.filter((i) => {
      const date = new Date(i.interviewDate)
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()
    }).length

    return { thisMonth }
  }, [filteredInterviews])

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">面談一覧</h1>
          <p className="text-muted-foreground mt-2">定期面談の記録と企業提出用レポートを管理</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="人材名、呼び名、法人名、ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={quarterFilter} onValueChange={setQuarterFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="対象四半期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.quarters.map((quarter) => (
                <SelectItem key={quarter} value={quarter}>{quarter}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="法人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.companies.map((company) => (
                <SelectItem key={company} value={company}>{company}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="支援担当者" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.staff.map((staff) => (
                <SelectItem key={staff} value={staff}>{staff}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="面談方法" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.methods.map((method) => (
                <SelectItem key={method} value={method}>{method}</SelectItem>
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

          <Badge variant="secondary">{filteredInterviews.length} 件</Badge>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Interview List */}
          <div className="lg:col-span-3 space-y-4">
            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">読み込み中...</p>
                </CardContent>
              </Card>
            ) : filteredInterviews.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">
                    {interviews.length === 0
                      ? "面談記録がありません"
                      : "該当する面談記録がありません"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredInterviews.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))
            )}
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            {/* Summary Stats */}
            <Card>
              <CardHeader>
                <CardTitle>サマリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">総件数</span>
                  <Badge variant="secondary">{filteredInterviews.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">今月</span>
                  <Badge variant="secondary">{stats.thisMonth}</Badge>
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
                  onClick={() => {
                    const now = new Date()
                    const currentQuarter = `${now.getFullYear()}年Q${Math.ceil((now.getMonth() + 1) / 3)}`
                    setQuarterFilter(currentQuarter)
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今四半期のみ表示
                </button>
                <button
                  onClick={() => {
                    setSearchTerm("")
                    setQuarterFilter("all")
                    setCompanyFilter("all")
                    setStaffFilter("all")
                    setMethodFilter("all")
                    setDateFilter("all")
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
