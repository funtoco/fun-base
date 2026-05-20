import Link from "next/link"
import { notFound } from "next/navigation"
import type { ComponentType } from "react"
import { ArrowLeft, Building2, Calendar, Clock, FileText, MapPin, User } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getInterviewRecordDetailById } from "@/lib/kintone-data-server"
import { getInterviewRecordListPath } from "@/lib/interview-record-links"
import { getCategoryColor } from "@/lib/interview-records"
import { formatDate, formatDateTime } from "@/lib/utils"

interface InterviewRecordDetailPageProps {
  params: { id: string }
}

type DetailItemProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  value?: string | number
}

function DetailItem({ icon: Icon, label, value }: DetailItemProps) {
  if (!value) return null

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

export default async function InterviewRecordDetailPage({ params }: InterviewRecordDetailPageProps) {
  const detail = await getInterviewRecordDetailById(params.id)

  if (!detail) {
    notFound()
  }

  const record = detail.record
  const regularRecord = detail.recordType === "regular_interview" ? detail.record : null
  const dailyRecord = detail.recordType === "daily_support" ? detail.record : null
  const isRegularInterview = Boolean(regularRecord)
  const listPath = getInterviewRecordListPath(detail.recordType)
  const title = regularRecord
    ? `${regularRecord.targetQuarter ?? "定期面談"}`
    : `${formatDate(dailyRecord!.supportDate)} の対応`
  const date = regularRecord ? regularRecord.interviewDate : dailyRecord!.supportDate
  const dateLabel = isRegularInterview ? "面談日" : "対応日"

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={listPath}>
              <ArrowLeft className="h-4 w-4" />
              {isRegularInterview ? "面談一覧へ戻る" : "サポート記録へ戻る"}
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{isRegularInterview ? "定期面談" : "日々対応"}</Badge>
              {record.kintoneStatus && <Badge variant="secondary">{record.kintoneStatus}</Badge>}
            </div>
            <h1 className="mt-3 text-2xl font-bold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {record.personName}
              {record.nickName ? ` (${record.nickName})` : ""}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/people/${record.personId}`}>
            <User className="h-4 w-4" />
            人材詳細
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem icon={Calendar} label={dateLabel} value={formatDate(date)} />
          <DetailItem icon={Building2} label="法人" value={record.companyName} />
          <DetailItem icon={User} label="支援担当" value={record.supportStaffName} />
          <DetailItem icon={Clock} label="時間" value={record.startTime && record.endTime ? `${record.startTime} - ${record.endTime}` : undefined} />
          {regularRecord && (
            <>
              <DetailItem icon={MapPin} label="方法" value={regularRecord.interviewMethod} />
              <DetailItem icon={Clock} label="所要時間" value={regularRecord.interviewDuration ? `${regularRecord.interviewDuration}分` : undefined} />
            </>
          )}
          <DetailItem icon={Calendar} label="同期日時" value={formatDateTime(record.updatedAt)} />
        </CardContent>
      </Card>

      {regularRecord ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">企業提出用レポート</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {regularRecord.companyReport ? (
              <div className="rounded-lg bg-muted/30 p-4 text-sm leading-7 whitespace-pre-wrap">
                {regularRecord.companyReport}
              </div>
            ) : (
              <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
                企業提出用レポートはありません
              </p>
            )}
          </CardContent>
        </Card>
      ) : dailyRecord ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">日々の対応報告</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyRecord.dailyEntries.length > 0 ? (
              <div className="space-y-3">
                {dailyRecord.dailyEntries.map((entry, index) => (
                  <div key={index} className="rounded-lg border bg-card p-4">
                    <div className="flex flex-wrap gap-2">
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
                      {entry.shou && <Badge variant="secondary">{entry.shou}</Badge>}
                    </div>
                    {entry.notes && (
                      <p className="mt-3 text-sm leading-7 whitespace-pre-wrap">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
                日々対応内容はありません
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
