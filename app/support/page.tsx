"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ResultCountBadge } from "@/components/ui/result-count-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterMultiSelectPopover } from "@/components/ui/filter-multi-select-popover"
import { getDailySupportRecords } from "@/lib/kintone-data"
import { getInterviewRecordDetailPath } from "@/lib/interview-record-links"
import {
  buildInterviewListQueryString,
  getQueryMultiValues,
  getQuerySingleValue,
  toggleQueryMultiValue,
} from "@/lib/interview-list-query"
import { getCategoryColor } from "@/lib/interview-records"
import { formatDate } from "@/lib/utils"
import type { DailySupportRecord } from "@/lib/models"
import {
  ArrowUpRight,
  Search,
  FilterIcon,
  Calendar,
  Clock,
  User,
  Building2
} from "lucide-react"

// Support Record Card Component - read-only, links to person and record detail
function SupportRecordCard({ record }: { record: DailySupportRecord }) {
  const detailHref = getInterviewRecordDetailPath(record.id)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href={`/people/${record.personId}`}
                className="font-semibold text-base hover:text-primary hover:underline"
              >
                {record.personName}
              </Link>
              {record.nickName && (
                <span className="text-sm text-muted-foreground">({record.nickName})</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(record.supportDate)}
              </span>
              {record.companyName && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {record.companyName}
                </span>
              )}
              {record.supportStaffName && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {record.supportStaffName}
                </span>
              )}
              {record.startTime && record.endTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {record.startTime} - {record.endTime}
                </span>
              )}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={detailHref} aria-label={`${record.personName}のサポート詳細`}>
              詳細
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* tableStorageDaily - Main Content (dai/chu/shou categories) */}
        <div className="space-y-2">
          {record.dailyEntries.map((entry, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
            >
              <div className="flex flex-wrap gap-1.5 flex-1">
                {entry.dai && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(entry.dai)}`}>
                    {entry.dai}
                  </span>
                )}
                {entry.chu && (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(entry.chu)}`}>
                    {entry.chu}
                  </span>
                )}
                {entry.shou && (
                  <Badge variant="secondary" className="text-xs">
                    {entry.shou}
                  </Badge>
                )}
                {entry.notes && (
                  <span className="text-sm text-muted-foreground ml-2">
                    {entry.notes}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function SupportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [records, setRecords] = useState<DailySupportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "")
  const [companyFilter, setCompanyFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "company")
  )
  const [staffFilter, setStaffFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "staff")
  )
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() =>
    getQueryMultiValues(new URLSearchParams(searchParams.toString()), "category")
  )
  const [dateFilter, setDateFilter] = useState<string>(() =>
    getQuerySingleValue(new URLSearchParams(searchParams.toString()), "date")
  )

  const replaceUrl = ({
    search = searchTerm,
    company = companyFilter,
    staff = staffFilter,
    category = categoryFilter,
    date = dateFilter,
  }: {
    search?: string
    company?: string[]
    staff?: string[]
    category?: string[]
    date?: string
  }) => {
    const query = buildInterviewListQueryString({
      search,
      multi: { company, staff, category },
      single: { date },
    })
    router.replace(`/support${query ? `?${query}` : ""}`, { scroll: false })
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    replaceUrl({ search: value })
  }

  const handleMultiFilterToggle = (
    value: string,
    currentValues: string[],
    setValues: (values: string[]) => void,
    key: "company" | "staff" | "category"
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
    setCompanyFilter([])
    setStaffFilter([])
    setCategoryFilter([])
    setDateFilter("all")
    replaceUrl({
      search: "",
      company: [],
      staff: [],
      category: [],
      date: "all",
    })
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    setSearchTerm(params.get("search") ?? "")
    setCompanyFilter(getQueryMultiValues(params, "company"))
    setStaffFilter(getQueryMultiValues(params, "staff"))
    setCategoryFilter(getQueryMultiValues(params, "category"))
    setDateFilter(getQuerySingleValue(params, "date"))
  }, [searchParams])

  // Fetch data from async data adapter
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setError(null)
        const data = await getDailySupportRecords()
        setRecords(data)
      } catch (err) {
        console.error("Error fetching support records:", err)
        setError("サポート記録の取得に失敗しました")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Get unique filter options from loaded data
  const filterOptions = useMemo(() => {
    const companies = new Set<string>()
    const staff = new Set<string>()
    const categories = new Set<string>()

    records.forEach((record) => {
      if (record.companyName) companies.add(record.companyName)
      if (record.supportStaffName) staff.add(record.supportStaffName)
      record.dailyEntries.forEach((entry) => {
        categories.add(entry.dai)
      })
    })

    return {
      companies: Array.from(companies).sort(),
      staff: Array.from(staff).sort(),
      categories: Array.from(categories).sort(),
    }
  }, [records])

  // Filter records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase()
        const matchesSearch =
          record.personName.toLowerCase().includes(searchLower) ||
          (record.nickName?.toLowerCase().includes(searchLower)) ||
          (record.companyName?.toLowerCase().includes(searchLower)) ||
          record.dailyEntries.some((entry) =>
            entry.dai.toLowerCase().includes(searchLower) ||
            entry.chu.toLowerCase().includes(searchLower) ||
            entry.shou.toLowerCase().includes(searchLower) ||
            (entry.notes?.toLowerCase().includes(searchLower))
          )
        if (!matchesSearch) return false
      }

      // Company filter
      if (companyFilter.length > 0 && !companyFilter.includes(record.companyName ?? "")) return false

      // Staff filter
      if (staffFilter.length > 0 && !staffFilter.includes(record.supportStaffName ?? "")) return false

      // Category filter (dai)
      if (categoryFilter.length > 0) {
        const hasCategory = record.dailyEntries.some((entry) => categoryFilter.includes(entry.dai))
        if (!hasCategory) return false
      }

      // Date filter
      if (dateFilter !== "all") {
        const supportDate = new Date(record.supportDate)
        const now = new Date()

        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

        if (dateFilter === "today") {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          if (supportDate < today || supportDate >= tomorrow) return false
        } else if (dateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (supportDate < weekAgo || supportDate >= tomorrow) return false
        } else {
          const daysAgo = Number.parseInt(dateFilter)
          const filterDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
          if (supportDate < filterDate || supportDate >= tomorrow) return false
        }
      }

      return true
    }).sort((a, b) => new Date(b.supportDate).getTime() - new Date(a.supportDate).getTime())
  }, [records, searchTerm, companyFilter, staffFilter, categoryFilter, dateFilter])

  // Statistics
  const stats = useMemo(() => {
    const now = new Date()
    const today = filteredRecords.filter((r) => {
      const date = new Date(r.supportDate)
      return date.toDateString() === now.toDateString()
    }).length

    const thisWeek = filteredRecords.filter((r) => {
      const date = new Date(r.supportDate)
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return date >= weekAgo
    }).length

    const byCategory = filteredRecords.reduce((acc, r) => {
      r.dailyEntries.forEach((entry) => {
        acc[entry.dai] = (acc[entry.dai] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>)

    const byStaff = filteredRecords.reduce((acc, r) => {
      if (r.supportStaffName) {
        acc[r.supportStaffName] = (acc[r.supportStaffName] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    return { today, thisWeek, byCategory, byStaff }
  }, [filteredRecords])

  return (
    <AuthGuard>
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">サポート記録</h1>
          <p className="text-muted-foreground mt-2">日々のサポート対応記録を管理</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="人材名、法人名、カテゴリ..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={dateFilter} onValueChange={handleDateFilterChange}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="期間" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="today">今日</SelectItem>
              <SelectItem value="week">今週</SelectItem>
              <SelectItem value="30">過去30日</SelectItem>
              <SelectItem value="90">過去90日</SelectItem>
            </SelectContent>
          </Select>

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
            label="カテゴリ"
            options={filterOptions.categories.map((category) => ({ value: category, label: category }))}
            selectedValues={categoryFilter}
            onToggle={(value) => handleMultiFilterToggle(value, categoryFilter, setCategoryFilter, "category")}
            triggerIcon={<FilterIcon className="mr-2 h-4 w-4 flex-shrink-0" />}
          />

          <ResultCountBadge count={filteredRecords.length} total={records.length} />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Record List */}
          <div className="lg:col-span-3 space-y-4">
            {loading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">読み込み中...</p>
                </CardContent>
              </Card>
            ) : error ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-destructive">{error}</p>
                </CardContent>
              </Card>
            ) : filteredRecords.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <p className="text-muted-foreground">
                    {records.length === 0
                      ? "サポート記録がありません"
                      : "該当するサポート記録がありません"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredRecords.map((record) => (
                <SupportRecordCard key={record.id} record={record} />
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
                  <Badge variant="secondary">{filteredRecords.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">今日</span>
                  <Badge variant="secondary">{stats.today}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">今週</span>
                  <Badge variant="secondary">{stats.thisWeek}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            {Object.keys(stats.byCategory).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>カテゴリ別</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(stats.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, count]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(category)}`}>
                          {category}
                        </span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* Staff Breakdown */}
            {Object.keys(stats.byStaff).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>担当者別</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(stats.byStaff)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([staff, count]) => (
                      <div key={staff} className="flex items-center justify-between text-sm">
                        <span>{staff}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {/* Quick Filters */}
            <Card>
              <CardHeader>
                <CardTitle>クイックフィルタ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => {
                    setDateFilter("today")
                    setCompanyFilter([])
                    setStaffFilter([])
                    setCategoryFilter([])
                    replaceUrl({
                      date: "today",
                      company: [],
                      staff: [],
                      category: [],
                    })
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今日の対応のみ
                </button>
                <button
                  onClick={() => {
                    setDateFilter("week")
                    setCompanyFilter([])
                    setStaffFilter([])
                    setCategoryFilter([])
                    replaceUrl({
                      date: "week",
                      company: [],
                      staff: [],
                      category: [],
                    })
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今週の対応のみ
                </button>
                <button
                  onClick={() => {
                    setCategoryFilter(["ビザ関連"])
                    setDateFilter("all")
                    replaceUrl({
                      category: ["ビザ関連"],
                      date: "all",
                    })
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  ビザ関連のみ
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
