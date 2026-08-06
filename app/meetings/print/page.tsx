"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Building2, Clock, FilterIcon, Printer } from "lucide-react"

import { AuthGuard } from "@/components/auth-guard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RecordListLoadingSkeleton } from "@/components/ui/funbase-loading"
import { getRegularInterviews } from "@/lib/kintone-data"
import {
  filterPrintableInterviews,
  groupPrintableInterviewsByPerson,
  sortPrintableInterviews,
  type InterviewPrintSortMode,
} from "@/lib/interview-print"
import {
  buildInterviewListQueryString,
  getQueryMultiValues,
  getQuerySingleValue,
} from "@/lib/interview-list-query"
import { formatDate } from "@/lib/utils"
import type { RegularInterview } from "@/lib/models"

const DATE_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "7", label: "過去7日" },
  { value: "30", label: "過去30日" },
  { value: "90", label: "過去90日" },
]

function getQueryCsv(values: string[]): string {
  return values.filter(Boolean).join(",")
}

function parseCommaSeparatedValues(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean)
}

function PrintMetaItem({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <span>{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function InterviewPrintCard({ interview }: { interview: RegularInterview }) {
  return (
    <article className="rounded-lg border bg-card p-4 print:border-gray-300 print:px-4 print:py-3 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold print:text-sm">{interview.targetQuarter ?? "定期面談"}</h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground print:text-[11px]">
            <PrintMetaItem label="面談日" value={formatDate(interview.interviewDate)} />
            <PrintMetaItem label="方法" value={interview.interviewMethod} />
            <PrintMetaItem label="支援担当" value={interview.supportStaffName} />
            <PrintMetaItem label="時間" value={interview.startTime && interview.endTime ? `${interview.startTime} - ${interview.endTime}` : undefined} />
            <PrintMetaItem label="所要時間" value={interview.interviewDuration ? `${interview.interviewDuration}分` : undefined} />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-muted/30 p-4 text-sm leading-7 whitespace-pre-wrap print:mt-3 print:bg-transparent print:px-1 print:py-0 print:text-[11px] print:leading-5">
        {interview.companyReport || "定期面談レポートはありません"}
      </div>
    </article>
  )
}

function InterviewPrintSheet({
  interview,
  breakAfter,
}: {
  interview: RegularInterview
  breakAfter: boolean
}) {
  return (
    <section className={breakAfter ? "interview-print-sheet space-y-3" : "space-y-3"}>
      <div className="rounded-lg border-l-4 border-primary bg-muted/30 p-4 print:border-gray-500 print:bg-transparent print:py-0 print:pl-3 print:pr-0">
        <h2 className="text-xl font-bold print:text-base">
          {interview.personName}{interview.nickName ? ` (${interview.nickName})` : ""}
        </h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground print:text-[11px]">
          {interview.companyName && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5 print:h-3 print:w-3" />{interview.companyName}</span>}
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 print:h-3 print:w-3" />{formatDate(interview.interviewDate)}</span>
        </div>
      </div>
      <InterviewPrintCard interview={interview} />
    </section>
  )
}

export default function MeetingsPrintPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [interviews, setInterviews] = useState<RegularInterview[]>([])
  const [loading, setLoading] = useState(true)

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "")
  const [quarterFilter, setQuarterFilter] = useState<string[]>(() => getQueryMultiValues(new URLSearchParams(searchParams.toString()), "quarter"))
  const [companyFilter, setCompanyFilter] = useState<string[]>(() => getQueryMultiValues(new URLSearchParams(searchParams.toString()), "company"))
  const [staffFilter, setStaffFilter] = useState<string[]>(() => getQueryMultiValues(new URLSearchParams(searchParams.toString()), "staff"))
  const [methodFilter, setMethodFilter] = useState<string[]>(() => getQueryMultiValues(new URLSearchParams(searchParams.toString()), "method"))
  const [quarterInput, setQuarterInput] = useState(() => getQueryCsv(getQueryMultiValues(new URLSearchParams(searchParams.toString()), "quarter")))
  const [companyInput, setCompanyInput] = useState(() => getQueryCsv(getQueryMultiValues(new URLSearchParams(searchParams.toString()), "company")))
  const [staffInput, setStaffInput] = useState(() => getQueryCsv(getQueryMultiValues(new URLSearchParams(searchParams.toString()), "staff")))
  const [methodInput, setMethodInput] = useState(() => getQueryCsv(getQueryMultiValues(new URLSearchParams(searchParams.toString()), "method")))
  const [dateFilter, setDateFilter] = useState<string>(() => getQuerySingleValue(new URLSearchParams(searchParams.toString()), "date"))
  const [fromDate, setFromDate] = useState(() => searchParams.get("from") ?? "")
  const [toDate, setToDate] = useState(() => searchParams.get("to") ?? "")
  const [sortMode, setSortMode] = useState<InterviewPrintSortMode>(() =>
    searchParams.get("sort") === "timeline" ? "timeline" : "person"
  )
  const [pageBreakByPerson, setPageBreakByPerson] = useState(() => searchParams.get("break") !== "off")

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        setInterviews(await getRegularInterviews())
      } catch (error) {
        console.error("Error fetching printable interviews:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const updateUrl = (next: {
    search?: string
    quarter?: string[]
    company?: string[]
    staff?: string[]
    method?: string[]
    date?: string
    from?: string
    to?: string
    sort?: InterviewPrintSortMode
    pageBreak?: boolean
  }) => {
    const query = buildInterviewListQueryString({
      search: next.search ?? searchTerm,
      multi: {
        quarter: next.quarter ?? quarterFilter,
        company: next.company ?? companyFilter,
        staff: next.staff ?? staffFilter,
        method: next.method ?? methodFilter,
      },
      single: { date: next.date ?? dateFilter },
    })
    const params = new URLSearchParams(query)
    const nextFrom = next.from ?? fromDate
    const nextTo = next.to ?? toDate
    const nextSort = next.sort ?? sortMode
    const nextPageBreak = next.pageBreak ?? pageBreakByPerson

    if (nextFrom) params.set("from", nextFrom)
    if (nextTo) params.set("to", nextTo)
    if (nextSort !== "person") params.set("sort", nextSort)
    if (!nextPageBreak) params.set("break", "off")

    router.replace(`/meetings/print${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false })
  }

  const filteredInterviews = useMemo(
    () => filterPrintableInterviews(interviews, {
      search: searchTerm,
      quarter: quarterFilter,
      company: companyFilter,
      staff: staffFilter,
      method: methodFilter,
      date: dateFilter,
      from: fromDate,
      to: toDate,
    }),
    [interviews, searchTerm, quarterFilter, companyFilter, staffFilter, methodFilter, dateFilter, fromDate, toDate]
  )

  const sortedInterviews = useMemo(() => sortPrintableInterviews(filteredInterviews, sortMode), [filteredInterviews, sortMode])
  const groupedInterviews = useMemo(() => groupPrintableInterviewsByPerson(filteredInterviews), [filteredInterviews])
  const printedAt = useMemo(() => new Date().toLocaleDateString("ja-JP"), [])
  const meetingsListQuery = buildInterviewListQueryString({
    search: searchTerm,
    multi: {
      quarter: quarterFilter,
      company: companyFilter,
      staff: staffFilter,
      method: methodFilter,
    },
    single: { date: dateFilter },
  })

  return (
    <AuthGuard>
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          .interview-print-sheet {
            break-after: page;
            page-break-after: always;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .interview-print-sheet:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>
      <div className="min-h-screen bg-muted/20 p-6 print:bg-white print:p-0">
        <div className="mx-auto max-w-5xl space-y-6 print:max-w-none print:space-y-4">
          <div className="print:hidden">
            <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
              <Link href={`/meetings${meetingsListQuery ? `?${meetingsListQuery}` : ""}`}>
                <ArrowLeft className="h-4 w-4" />
                面談一覧へ戻る
              </Link>
            </Button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-foreground">面談記録 印刷</h1>
                <p className="mt-2 text-muted-foreground">条件を指定して、施設確認用に一括印刷できます</p>
              </div>
              <Button onClick={() => window.print()} disabled={loading || filteredInterviews.length === 0}>
                <Printer className="h-4 w-4" />
                一括印刷
              </Button>
            </div>
          </div>

          <Card className="print:hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FilterIcon className="h-4 w-4" />
                印刷条件
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="print-search">検索</Label>
                <Input
                  id="print-search"
                  value={searchTerm}
                  placeholder="人材名、法人名、ID..."
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    updateUrl({ search: event.target.value })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-quarter">対象四半期</Label>
                <Input
                  id="print-quarter"
                  value={quarterInput}
                  placeholder="複数はカンマ区切り"
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const values = parseCommaSeparatedValues(rawValue)
                    setQuarterInput(rawValue)
                    setQuarterFilter(values)
                    updateUrl({ quarter: values })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-company">法人</Label>
                <Input
                  id="print-company"
                  value={companyInput}
                  placeholder="複数はカンマ区切り"
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const values = parseCommaSeparatedValues(rawValue)
                    setCompanyInput(rawValue)
                    setCompanyFilter(values)
                    updateUrl({ company: values })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-staff">支援担当者</Label>
                <Input
                  id="print-staff"
                  value={staffInput}
                  placeholder="複数はカンマ区切り"
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const values = parseCommaSeparatedValues(rawValue)
                    setStaffInput(rawValue)
                    setStaffFilter(values)
                    updateUrl({ staff: values })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-method">面談方法</Label>
                <Input
                  id="print-method"
                  value={methodInput}
                  placeholder="複数はカンマ区切り"
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const values = parseCommaSeparatedValues(rawValue)
                    setMethodInput(rawValue)
                    setMethodFilter(values)
                    updateUrl({ method: values })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-period">期間</Label>
                <select
                  id="print-period"
                  value={dateFilter}
                  onChange={(event) => {
                    setDateFilter(event.target.value)
                    updateUrl({ date: event.target.value })
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {DATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-from">開始日</Label>
                <Input
                  id="print-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value)
                    updateUrl({ from: event.target.value })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-to">終了日</Label>
                <Input
                  id="print-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value)
                    updateUrl({ to: event.target.value })
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="print-sort">まとめ方</Label>
                <select
                  id="print-sort"
                  value={sortMode}
                  onChange={(event) => {
                    const value = event.target.value as InterviewPrintSortMode
                    setSortMode(value)
                    updateUrl({ sort: value })
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="person">人単位でまとめる</option>
                  <option value="timeline">時系列で並べる</option>
                </select>
              </div>

              <label className="flex items-center gap-2 self-end rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={pageBreakByPerson}
                  onChange={(event) => {
                    setPageBreakByPerson(event.target.checked)
                    updateUrl({ pageBreak: event.target.checked })
                  }}
                />
                1面談ごとに改ページ
              </label>
            </CardContent>
          </Card>

          {loading ? (
            <RecordListLoadingSkeleton />
          ) : (
            <div className="rounded-lg bg-white p-8 shadow-sm print:p-0 print:shadow-none">
              <header className="mb-6 border-b pb-4 print:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold">定期面談記録</h2>
                    <p className="mt-1 text-sm text-muted-foreground">印刷日: {printedAt}</p>
                  </div>
                  <Badge variant="secondary" className="print:border print:bg-white">{filteredInterviews.length}件</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <PrintMetaItem label="まとめ方" value={sortMode === "person" ? "人単位" : "時系列"} />
                  <PrintMetaItem label="検索" value={searchTerm} />
                  <PrintMetaItem label="対象四半期" value={getQueryCsv(quarterFilter)} />
                  <PrintMetaItem label="法人" value={getQueryCsv(companyFilter)} />
                  <PrintMetaItem label="支援担当" value={getQueryCsv(staffFilter)} />
                  <PrintMetaItem label="面談方法" value={getQueryCsv(methodFilter)} />
                  <PrintMetaItem label="期間" value={DATE_OPTIONS.find((option) => option.value === dateFilter)?.label} />
                  <PrintMetaItem label="開始日" value={fromDate} />
                  <PrintMetaItem label="終了日" value={toDate} />
                </div>
              </header>

              {filteredInterviews.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">該当する面談記録がありません</p>
              ) : sortMode === "person" ? (
                <div className="space-y-8 print:space-y-0">
                  {groupedInterviews.flatMap((group) =>
                    group.interviews.map((interview) => (
                      <InterviewPrintSheet
                        key={interview.id}
                        interview={interview}
                        breakAfter={pageBreakByPerson}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4 print:space-y-0">
                  {sortedInterviews.map((interview) => (
                    <InterviewPrintSheet key={interview.id} interview={interview} breakAfter={pageBreakByPerson} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
