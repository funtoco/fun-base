"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { AuthGuard } from "@/components/auth-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getDailySupportRecords } from "@/lib/kintone-data"
import {
  getCategoryColor,
  getCompanyConfirmationStatusColor,
  getKintoneInterviewRecordUrl,
} from "@/lib/interview-records"
import { formatDate } from "@/lib/utils"
import type { DailySupportRecord } from "@/lib/models"
import {
  Search,
  Calendar,
  Clock,
  User,
  Building2,
  ExternalLink
} from "lucide-react"

// Support Record Card Component - read-only, links to person detail or external Kintone
function SupportRecordCard({ record }: { record: DailySupportRecord }) {
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
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getCompanyConfirmationStatusColor(record.companyConfirmationStatus)}`}>
                {record.companyConfirmationStatus}
              </span>
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
          <div className="flex items-center gap-2">
            {record.kintoneRecordId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                asChild
              >
                <a
                  href={getKintoneInterviewRecordUrl(record.kintoneRecordId)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="sr-only">Kintoneで開く</span>
                </a>
              </Button>
            )}
          </div>
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
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(entry.dai)}`}>
                  {entry.dai}
                </span>
                <Badge variant="outline" className="text-xs">
                  {entry.chu}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {entry.shou}
                </Badge>
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
  const [records, setRecords] = useState<DailySupportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [companyFilter, setCompanyFilter] = useState<string>("all")
  const [staffFilter, setStaffFilter] = useState<string>("all")
  const [confirmationStatusFilter, setConfirmationStatusFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [dateFilter, setDateFilter] = useState<string>("all")

  // Fetch data from async data adapter
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const data = await getDailySupportRecords()
        setRecords(data)
      } catch (err) {
        console.error("Error fetching support records:", err)
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
    const confirmationStatuses = new Set<string>()
    const categories = new Set<string>()

    records.forEach((record) => {
      if (record.companyName) companies.add(record.companyName)
      if (record.supportStaffName) staff.add(record.supportStaffName)
      confirmationStatuses.add(record.companyConfirmationStatus)
      record.dailyEntries.forEach((entry) => {
        categories.add(entry.dai)
      })
    })

    return {
      companies: Array.from(companies).sort(),
      staff: Array.from(staff).sort(),
      confirmationStatuses: Array.from(confirmationStatuses),
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
      if (companyFilter !== "all" && record.companyName !== companyFilter) return false

      // Staff filter
      if (staffFilter !== "all" && record.supportStaffName !== staffFilter) return false

      // Company confirmation status filter
      if (confirmationStatusFilter !== "all" && record.companyConfirmationStatus !== confirmationStatusFilter) return false

      // Category filter (dai)
      if (categoryFilter !== "all") {
        const hasCategory = record.dailyEntries.some((entry) => entry.dai === categoryFilter)
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
  }, [records, searchTerm, companyFilter, staffFilter, confirmationStatusFilter, categoryFilter, dateFilter])

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
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <Select value={dateFilter} onValueChange={setDateFilter}>
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

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.categories.map((category) => (
                <SelectItem key={category} value={category}>{category}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={confirmationStatusFilter} onValueChange={setConfirmationStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="企業確認" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              {filterOptions.confirmationStatuses.map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="secondary">{filteredRecords.length} 件</Badge>
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
                    setCompanyFilter("all")
                    setStaffFilter("all")
                    setCategoryFilter("all")
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今日の対応のみ
                </button>
                <button
                  onClick={() => {
                    setDateFilter("week")
                    setCompanyFilter("all")
                    setStaffFilter("all")
                    setCategoryFilter("all")
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  今週の対応のみ
                </button>
                <button
                  onClick={() => {
                    setCategoryFilter("ビザ関連")
                    setDateFilter("all")
                  }}
                  className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm"
                >
                  ビザ関連のみ
                </button>
                <button
                  onClick={() => {
                    setSearchTerm("")
                    setCompanyFilter("all")
                    setStaffFilter("all")
                    setConfirmationStatusFilter("all")
                    setCategoryFilter("all")
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
