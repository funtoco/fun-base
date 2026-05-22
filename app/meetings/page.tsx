"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ResultCountBadge } from "@/components/ui/result-count-badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterMultiSelectPopover } from "@/components/ui/filter-multi-select-popover"
import { getRegularInterviews } from "@/lib/kintone-data"
import { getInterviewRecordDetailPath } from "@/lib/interview-record-links"
import {
  buildInterviewListQueryString,
  getQueryMultiValues,
  getQuerySingleValue,
  toggleQueryMultiValue,
} from "@/lib/interview-list-query"
import { formatDate } from "@/lib/utils"
import type { RegularInterview } from "@/lib/models"
import {
  ArrowUpRight,
  Search,
  FilterIcon,
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [interviews, setInterviews] = useState<RegularInterview[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "")
  const [quarterFilter, setQuarterFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "quarter")
  )
  const [companyFilter, setCompanyFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "company")
  )
  const [staffFilter, setStaffFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "staff")
  )
  const [methodFilter, setMethodFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "method")
  )
  const [dateFilter, setDateFilter] = useState<string>(() =>
    getQuerySingleValue(new URLSearchParams(searchParams.toString()), "date")
  )

  const replaceUrl = ({
    search = searchTerm,
    quarter = quarterFilter,
    company = companyFilter,
    staff = staffFilter,
    method = methodFilter,
    date = dateFilter,
  }: {
    search?: string
    quarter?: string[]
    company?: string[]
    staff?: string[]
    method?: string[]
    date?: string
  }) => {
    const query = buildInterviewListQueryString({
      search,
      multi: { quarter, company, staff, method },
      single: { date },
    })
    router.replace(`/meetings${query ? `?${query}` : ""}`, { scroll: false })
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    replaceUrl({ search: value })
  }

  const handleMultiFilterToggle = (
    value: string,
    currentValues: string[],
    setValues: (values: string[]) => void,
    key: "quarter" | "company" | "staff" | "method"
  ) => {
    const nextValues = toggleQueryMultiValue(currentValues, value)
    setValues(nextValues)
    replaceUrl({ [key]: nextValues })
  }

  const handleDateFilterChange = (value: string) => {
    setDateFilter(value)
    replaceUrl({ date: value })
  }

  const resetFilters = () => {
    setSearchTerm("")
    setQuarterFilter([])
    setCompanyFilter([])
    setStaffFilter([])
    setMethodFilter([])
    setDateFilter("all")
    replaceUrl({
      search: "",
      quarter: [],
      company: [],
      staff: [],
      method: [],
      date: "all",
    })
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    setSearchTerm(params.get("search") ?? "")
    setQuarterFilter(getQueryMultiValues(params, "quarter"))
    setCompanyFilter(getQueryMultiValues(params, "company"))
    setStaffFilter(getQueryMultiValues(params, "staff"))
    setMethodFilter(getQueryMultiValues(params, "method"))
    setDateFilter(getQuerySingleValue(params, "date"))
  }, [searchParams])

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
      if (quarterFilter.length > 0 && !quarterFilter.includes(interview.targetQuarter ?? "")) return false

      // Company filter
      if (companyFilter.length > 0 && !companyFilter.includes(interview.companyName ?? "")) return false

      // Staff filter
      if (staffFilter.length > 0 && !staffFilter.includes(interview.supportStaffName ?? "")) return false

      // Method filter
      if (methodFilter.length > 0 && !methodFilter.includes(interview.interviewMethod ?? "")) return false

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
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <FilterMultiSelectPopover
            label="対象四半期"
            options={filterOptions.quarters.map((quarter) => ({ value: quarter, label: quarter }))}
            selectedValues={quarterFilter}
            onToggle={(value) => handleMultiFilterToggle(value, quarterFilter, setQuarterFilter, "quarter")}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="法人"
            options={filterOptions.companies.map((company) => ({ value: company, label: company }))}
            selectedValues={companyFilter}
            onToggle={(value) => handleMultiFilterToggle(value, companyFilter, setCompanyFilter, "company")}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="支援担当者"
            options={filterOptions.staff.map((staff) => ({ value: staff, label: staff }))}
            selectedValues={staffFilter}
            onToggle={(value) => handleMultiFilterToggle(value, staffFilter, setStaffFilter, "staff")}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <FilterMultiSelectPopover
            label="面談方法"
            options={filterOptions.methods.map((method) => ({ value: method, label: method }))}
            selectedValues={methodFilter}
            onToggle={(value) => handleMultiFilterToggle(value, methodFilter, setMethodFilter, "method")}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <Select value={dateFilter} onValueChange={handleDateFilterChange}>
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

          <ResultCountBadge count={filteredInterviews.length} total={interviews.length} />
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
                    const currentQuarter = `${now.getFullYear()}年第${Math.ceil((now.getMonth() + 1) / 3)}四半期`
                    setQuarterFilter([currentQuarter])
                    replaceUrl({ quarter: [currentQuarter] })
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今四半期のみ表示
                </button>
                <button
                  onClick={resetFilters}
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
