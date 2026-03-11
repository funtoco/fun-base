"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/ui/status-badge"
import { Timeline } from "@/components/ui/timeline"
import { TreeNoteView } from "@/components/ui/tree-note-view"
import { formatDateTime } from "@/lib/utils"
import type { Meeting, SupportAction, Visa, PersonDocument } from "@/lib/models"
import { PersonDocumentsTab } from "@/components/person-documents-tab"

interface PersonDetailTabsProps {
  personId: string
  personMeetings: Meeting[]
  personSupportActions: SupportAction[]
  personVisas: Visa[]
  personDocuments: PersonDocument[]
}

export function PersonDetailTabs({ personId, personMeetings, personSupportActions, personVisas, personDocuments }: PersonDetailTabsProps) {
  const [activeTab, setActiveTab] = useState("timeline")

  const baseTimelineItems = [
    ...personMeetings.map((meeting) => ({
      id: meeting.id,
      type: "meeting" as const,
      title: meeting.title,
      datetime: meeting.datetime,
      status: meeting.kind,
    })),
    ...personSupportActions.map((action) => ({
      id: action.id,
      type: "support" as const,
      title: action.title,
      datetime: action.updatedAt,
      status: action.status,
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
                        const earliestDate = getVisaEarliestDate(visa)
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
          {personMeetings.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">面談記録がありません</p>
              </CardContent>
            </Card>
          ) : (
            personMeetings.map((meeting) => (
              <Card key={meeting.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{meeting.title}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {formatDateTime(meeting.datetime)}
                        </span>
                        <Badge variant="outline">{meeting.kind}</Badge>
                        {meeting.durationMin && <span>{meeting.durationMin}分</span>}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <TreeNoteView notes={meeting.notes} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </TabsContent>

      <TabsContent value="support" className="mt-6">
        <div className="space-y-4">
          {personSupportActions.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">サポート記録がありません</p>
              </CardContent>
            </Card>
          ) : (
            personSupportActions.map((action) => (
              <Card key={action.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{action.title}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline">{action.category}</Badge>
                        <StatusBadge status={action.status} type="support" />
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      {action.assignee && <div>担当: {action.assignee}</div>}
                      {action.due && <div>期日: {action.due}</div>}
                    </div>
                  </div>
                </CardHeader>
                {action.detail && (
                  <CardContent>
                    <p className="text-sm">{action.detail}</p>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      </TabsContent>

      <TabsContent value="documents" className="mt-6">
        <PersonDocumentsTab personId={personId} personDocuments={personDocuments} />
      </TabsContent>
    </Tabs>
  )
}
