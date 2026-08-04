import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, Info } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  applyRetirementNoticeKintoneValues,
  getRetirementNoticeKintoneValues,
} from '@/lib/reports/retirement-notice-kintone-values'
import {
  getRetirementNoticeReportTemplateForType,
} from '@/lib/reports/retirement-notice-reports'
import { getPersonById } from '@/lib/supabase/people-server'
import { cn } from '@/lib/utils'

interface RetirementNoticePageProps {
  params: { id: string }
}

export default async function RetirementNoticePage({ params }: RetirementNoticePageProps) {
  const person = await getPersonById(params.id)
  if (!person) notFound()

  const kintoneValues = await getRetirementNoticeKintoneValues(person)
  const selectedTemplate = getRetirementNoticeReportTemplateForType(kintoneValues.retirementNoticeType)
  const pdfPerson = applyRetirementNoticeKintoneValues(person, kintoneValues)
  const downloadHref = selectedTemplate
    ? `/api/retirement-notice/templates/${encodeURIComponent(selectedTemplate.reportCode)}?personId=${encodeURIComponent(person.id)}`
    : null

  return (
    <div className="w-full space-y-4 p-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 gap-2">
          <Link href={`/people/${encodeURIComponent(person.id)}`}>
            <ArrowLeft className="h-4 w-4" />
            人材詳細へ戻る
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-bold md:text-2xl">退職届出PDFの作成</h1>
        <p className="text-sm text-muted-foreground">
          {person.name} さんに設定された退職届種類のPDFを作成できます。
        </p>
      </div>

      {selectedTemplate && downloadHref ? (
        <Card className="gap-0 overflow-hidden rounded-lg py-0">
          <div className="grid grid-cols-2 gap-4 p-5 lg:grid-cols-[1fr_1.35fr_1fr_1fr_auto] lg:items-center lg:gap-0">
            <SummaryField label="対象者" value={person.name} className="lg:pr-4" />
            <SummaryField
              label="所属先"
              value={person.company || person.tenantName}
              className="lg:border-l lg:px-4"
            />
            <SummaryField label="退職届種類" value={selectedTemplate.label} className="lg:border-l lg:px-4" />
            <div className="lg:border-l lg:px-4">
              <div className="text-xs text-muted-foreground">就労ステータス</div>
              <Badge
                variant={person.workingStatus === '退職' ? 'destructive' : 'outline'}
                className={cn(
                  'mt-1',
                  person.workingStatus === '支援終了' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-700'
                )}
              >
                {person.workingStatus || '未設定'}
              </Badge>
            </div>
            <div className="col-span-2 flex flex-col gap-2 sm:flex-row lg:col-span-1 lg:ml-4">
              <Button asChild variant="outline" className="gap-2">
                <a href={selectedTemplate.template.pdfPath} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  空の様式を確認
                </a>
              </Button>
              <Button asChild className="gap-2">
                <a href={downloadHref}>
                  <Download className="h-4 w-4" />
                  PDFを作成
                </a>
              </Button>
            </div>
          </div>

          <CardContent className="space-y-5 border-t p-5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">PDFに反映される情報</h2>
              <p className="text-sm text-muted-foreground">
                登録されている人材・退職届・法人・事業所の情報をPDFへ反映します。
              </p>
            </div>

            <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
              <ReadOnlyField label="氏名（ローマ字）" value={pdfPerson.name} />
              <ReadOnlyField label="生年月日" value={pdfPerson.dob} />
              <ReadOnlyField label="性別" value={pdfPerson.sex} />
              <ReadOnlyField label="国籍・地域" value={pdfPerson.nationality} />
              <ReadOnlyField label="在留カード番号" value={pdfPerson.residenceCardNo} />
              <ReadOnlyField label="特定産業分野" value={pdfPerson.specificSkillField} />
              <ReadOnlyField label="業務区分" value={pdfPerson.businessCategory} />
              <ReadOnlyField
                label="雇用契約終了年月日"
                value={pdfPerson.employmentContractEndDate || pdfPerson.retirementDate || pdfPerson.supportEndDate}
                wideLabel
              />
              <ReadOnlyField
                label="機関の氏名又は名称"
                value={pdfPerson.company || pdfPerson.tenantName}
                className="xl:col-span-2"
                wideLabel
              />
              <ReadOnlyField label="法人番号" value={pdfPerson.companyCorporateNumber} />
              <ReadOnlyField label="機関の郵便番号" value={pdfPerson.companyPostalCode} />
              <ReadOnlyField label="機関の住所" value={pdfPerson.companyAddress} className="xl:col-span-3" />
              <ReadOnlyField label="機関の電話番号" value={pdfPerson.companyPhone} />
            </dl>

            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p>
                PDFには、人材・退職届・法人・事業所の情報を反映します。内容に不明点や修正が必要な箇所がある場合は、Funtocoの営業担当までお問い合わせください。
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">退職届種類を確認してください</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              退職届種類が未設定、または対応していない種類のため、PDFを作成できません。登録内容を確認し、必要に応じてFuntocoの営業担当までお問い合わせください。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryField({
  label,
  value,
  className,
}: {
  label: string
  value?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || '未設定'}</div>
    </div>
  )
}

function ReadOnlyField({
  label,
  value,
  className,
  wideLabel = false,
}: {
  label: string
  value?: string | null
  className?: string
  wideLabel?: boolean
}) {
  return (
    <div
      className={cn(
        'grid min-h-14 bg-background',
        wideLabel ? 'grid-cols-[8.5rem_minmax(0,1fr)]' : 'grid-cols-[7.5rem_minmax(0,1fr)]',
        className
      )}
    >
      <dt className="flex items-center bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center break-words px-3 py-2 text-sm font-medium">
        {value || '未取得/未設定'}
      </dd>
    </div>
  )
}
