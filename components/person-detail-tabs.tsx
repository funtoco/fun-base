"use client"

import { useState } from "react"
import Link from "next/link"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Timeline } from "@/components/ui/timeline"
import { getInterviewRecordDetailPath } from "@/lib/interview-record-links"
import { getCategoryColor } from "@/lib/interview-records"
import { formatDate } from "@/lib/utils"
import type { Visa, PersonDocument, RegularInterview, DailySupportRecord } from "@/lib/models"
import { PersonDocumentsTab } from "@/components/person-documents-tab"
import { ArrowUpRight, Calendar, Clock, MapPin, User, FileText, ChevronDown, ChevronUp } from "lucide-react"

interface PersonDetailTabsProps {
  personId: string
  personVisas: Visa[]
  personDocuments: PersonDocument[]
  regularInterviews?: RegularInterview[]
  dailySupportRecords?: DailySupportRecord[]
}

function getDailySupportTimelineTitle(record: DailySupportRecord): string {
  const categories = record.dailyEntries
    .map((entry) => entry.shou)
    .filter(Boolean)

  if (categories.length === 0) return "日々対応"

  const visibleCategories = categories.slice(0, 3).join(", ")
  return `日々対応: ${visibleCategories}${categories.length > 3 ? "..." : ""}`
}

// Regular Interview Card Component - displays 企業提出用レポート as main content
function RegularInterviewCard({ interview }: { interview: RegularInterview }) {
  const [expanded, setExpanded] = useState(false)
  const detailHref = getInterviewRecordDetailPath(interview.id)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">
                {interview.targetQuarter} 定期面談
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(interview.interviewDate)}
              </span>
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
            <Link href={detailHref} aria-label={`${interview.targetQuarter ?? "定期面談"}の詳細`}>
              詳細
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 企業提出用レポート - Main Content */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">企業提出用レポート</span>
          </div>
          <div className={`bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap ${!expanded ? "line-clamp-6" : ""}`}>
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

// Daily Support Card Component - displays tableStorageDaily entries as main content
function DailySupportCard({ record }: { record: DailySupportRecord }) {
  const detailHref = getInterviewRecordDetailPath(record.id)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">
                {formatDate(record.supportDate)} の対応
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              {record.startTime && record.endTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {record.startTime} - {record.endTime}
                </span>
              )}
              {record.supportStaffName && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {record.supportStaffName}
                </span>
              )}
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link href={detailHref} aria-label={`${formatDate(record.supportDate)}のサポート詳細`}>
              詳細
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* tableStorageDaily - Main Content (dai/chu/shou categories) */}
        <div className="space-y-3">
          {record.dailyEntries.map((entry, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
            >
              <div className="flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getCategoryColor(entry.dai)}`}>
                  {entry.dai}
                </span>
                <Badge variant="outline" className="text-xs">
                  {entry.chu}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {entry.shou}
                </Badge>
              </div>
              {entry.notes && (
                <p className="text-sm text-muted-foreground flex-1">
                  {entry.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function PersonDetailTabs({
  personId,
  personVisas,
  personDocuments,
  regularInterviews = [],
  dailySupportRecords = [],
}: PersonDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("timeline")

  // Build timeline items from interviews and support records
  const baseTimelineItems = [
    ...regularInterviews.map((interview) => ({
      id: interview.id,
      type: "meeting" as const,
      title: `${interview.targetQuarter} 定期面談`,
      datetime: interview.interviewDate,
      href: getInterviewRecordDetailPath(interview.id),
    })),
    ...dailySupportRecords.map((record) => ({
      id: record.id,
      type: "support" as const,
      title: getDailySupportTimelineTitle(record),
      datetime: record.supportDate,
      href: getInterviewRecordDetailPath(record.id),
    })),
  ].sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime())

  const visaStatusItems = (visa: Visa) => {
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

    return statusDates
      .filter(({ date }) => date)
      .map(({ date, status }) => ({
        id: `${visa.id}-${status}`,
        type: "visa" as const,
        title: `ビザ状況: ${status}`,
        datetime: date!,
        status,
      }))
      .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
  }

  const getVisaEarliestDate = (visa: Visa): string | null => {
    const candidates = [
      visa.documentPreparationDate,
      visa.documentCreationDate,
      visa.documentConfirmationDate,
      visa.applicationPreparationDate,
      visa.visaApplicationPreparationDate,
      visa.applicationDate,
      visa.additionalDocumentsDate,
      visa.visaAcquiredDate,
      visa.submittedAt,
    ].filter(Boolean) as string[]
    if (candidates.length === 0) return null
    return candidates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
  }

  const getVisaKintoneId = (visa: Visa): number | null => {
    const parsed = Number(visa.id)
    return Number.isNaN(parsed) ? null : parsed
  }

  const visaGroups = (() => {
    const byType = new Map<string, Visa[]>()
    const excludedVisaStatuses = new Set<string>(['内定[辞退•取消]•退職'])
    personVisas.filter((visa) => !excludedVisaStatuses.has(visa.status)).forEach((visa) => {
      const type = visa.type || "不明"
      const group = byType.get(type) || []
      group.push(visa)
      byType.set(type, group)
    })

    const groups = Array.from(byType.entries()).map(([type, visas]) => {
      const sortedVisas = visas
        .map((visa) => ({
          visa,
          earliestDate: getVisaEarliestDate(visa),
          kintoneId: getVisaKintoneId(visa),
        }))
        .sort((a, b) => {
          const aTime = a.earliestDate ? new Date(a.earliestDate).getTime() : Number.POSITIVE_INFINITY
          const bTime = b.earliestDate ? new Date(b.earliestDate).getTime() : Number.POSITIVE_INFINITY
          if (aTime !== bTime) return aTime - bTime
          const aId = a.kintoneId ?? Number.POSITIVE_INFINITY
          const bId = b.kintoneId ?? Number.POSITIVE_INFINITY
          return aId - bId
        })
        .map(({ visa }) => visa)

      return {
        type,
        visas: sortedVisas,
      }
    })

    return groups.sort((a, b) => {
      const aEarliest = a.visas[0] ? getVisaEarliestDate(a.visas[0]) : null
      const bEarliest = b.visas[0] ? getVisaEarliestDate(b.visas[0]) : null
      const aTime = aEarliest ? new Date(aEarliest).getTime() : Number.POSITIVE_INFINITY
      const bTime = bEarliest ? new Date(bEarliest).getTime() : Number.POSITIVE_INFINITY
      if (aTime !== bTime) return aTime - bTime
      const aId = a.visas[0] ? getVisaKintoneId(a.visas[0]) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY
      const bId = b.visas[0] ? getVisaKintoneId(b.visas[0]) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY
      return aId - bId
    })
  })()

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="timeline">タイムライン</TabsTrigger>
        <TabsTrigger value="meetings">面談記録</TabsTrigger>
        <TabsTrigger value="support">サポート記録</TabsTrigger>
        <TabsTrigger value="documents">書類</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>活動タイムライン</CardTitle>
          </CardHeader>
          <CardContent>
            {baseTimelineItems.length > 0 && <Timeline items={baseTimelineItems} />}
            {visaGroups.length === 0 && baseTimelineItems.length === 0 && <Timeline items={[]} />}

            {visaGroups.length > 0 && (
              <div className="mt-6 space-y-4">
                <div className="text-sm font-medium text-muted-foreground">ビザ履歴</div>
                {visaGroups.map((group) => {
                  const hasMultiple = group.visas.length > 1
                  return (
                    <div key={group.type} className="space-y-3">
                      {group.visas.map((visa, index) => {
                        const label = hasMultiple ? `${group.type}${index + 1}回目` : group.type
                        const items = visaStatusItems(visa)
                        return (
                          <details key={visa.id} className="group rounded-md border bg-card">
                            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{label}</span>
                                <Badge variant="secondary">{items.length}</Badge>
                              </div>
                              <span className="transition-transform group-open:rotate-180">▼</span>
                            </summary>
                            <div className="px-4 pb-4">
                              <Timeline items={items} />
                            </div>
                          </details>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="meetings" className="mt-6">
        <div className="space-y-4">
          {regularInterviews.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">定期面談の記録がありません</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                {regularInterviews.length}件の定期面談記録
              </div>
              {regularInterviews.map((interview) => (
                <RegularInterviewCard key={interview.id} interview={interview} />
              ))}
            </>
          )}
        </div>
      </TabsContent>

      <TabsContent value="support" className="mt-6">
        <div className="space-y-4">
          {dailySupportRecords.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">サポート記録がありません</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                {dailySupportRecords.length}件のサポート記録
              </div>
              {dailySupportRecords.map((record) => (
                <DailySupportCard key={record.id} record={record} />
              ))}
            </>
          )}
        </div>
      </TabsContent>

      <TabsContent value="documents" className="mt-6">
        <PersonDocumentsTab personId={personId} personDocuments={personDocuments} />
      </TabsContent>
    </Tabs>
  )
}
