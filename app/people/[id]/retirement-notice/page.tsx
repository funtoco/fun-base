import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  applyRetirementNoticeKintoneValues,
  getRetirementNoticeKintoneValues,
} from '@/lib/reports/retirement-notice-kintone-values'
import {
  getRetirementNoticeReportTemplate,
  getRetirementNoticeReportTemplates,
} from '@/lib/reports/retirement-notice-reports'
import { getPersonById } from '@/lib/supabase/people-server'

interface RetirementNoticePageProps {
  params: { id: string }
  searchParams?: { template?: string }
}

export default async function RetirementNoticePage({ params, searchParams }: RetirementNoticePageProps) {
  const person = await getPersonById(params.id)
  if (!person) notFound()

  const templates = getRetirementNoticeReportTemplates()
  const selectedTemplate =
    (searchParams?.template ? getRetirementNoticeReportTemplate(searchParams.template) : null) ?? templates[0]
  const kintoneValues = await getRetirementNoticeKintoneValues(person)
  const pdfPerson = applyRetirementNoticeKintoneValues(person, kintoneValues)
  const downloadHref = `/api/retirement-notice/templates/${encodeURIComponent(selectedTemplate.reportCode)}?personId=${encodeURIComponent(person.id)}`

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost" className="gap-2">
          <Link href={`/people/${encodeURIComponent(person.id)}`}>
            <ArrowLeft className="h-4 w-4" />
            人材詳細へ戻る
          </Link>
        </Button>
        <Badge variant={person.workingStatus === '退職' ? 'destructive' : 'outline'}>
          {person.workingStatus || '就労ステータス未設定'}
        </Badge>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold">退職届出PDFの作成</h1>
        <p className="text-sm text-muted-foreground">
          {person.name} さんの情報を反映した退職届出PDFを作成できます。必要な届出の種類を選んで出力してください。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">届出の種類</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {templates.map((template) => (
              <Button
                key={template.reportCode}
                asChild
                variant={template.reportCode === selectedTemplate.reportCode ? 'default' : 'outline'}
                className="w-full justify-start"
              >
                <Link
                  href={`/people/${encodeURIComponent(person.id)}/retirement-notice?template=${encodeURIComponent(template.reportCode)}`}
                >
                  {template.label}
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  {selectedTemplate.label}
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  既存の退職届様式に、FunBaseの人材情報を差し込んでPDFを作成します。
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="gap-2">
                  <a href={selectedTemplate.template.pdfPath} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    空の様式を確認
                  </a>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">対象者</div>
                <div className="text-sm font-medium">{person.name}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">所属先</div>
                <div className="text-sm font-medium">{person.company || person.tenantName || '未設定'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">就労ステータス</div>
                <div className="text-sm font-medium">{person.workingStatus || '未設定'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">出力する様式</div>
                <div className="text-sm font-medium">{selectedTemplate.label}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-base font-semibold">PDFに反映される情報</h2>
                <p className="text-sm text-muted-foreground">
                  kintoneの退職届・就労管理・法人/事業所マスタを参照してPDFへ反映します。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReadOnlyField label="氏名（ローマ字）" value={pdfPerson.name} />
                <ReadOnlyField label="生年月日" value={pdfPerson.dob} />
                <ReadOnlyField label="国籍・地域" value={pdfPerson.nationality} />
                <ReadOnlyField label="性別" value={pdfPerson.sex} />
                <ReadOnlyField label="在留カード番号" value={pdfPerson.residenceCardNo} />
                <ReadOnlyField label="特定産業分野" value={pdfPerson.specificSkillField} />
                <ReadOnlyField label="業務区分" value={pdfPerson.businessCategory} />
                <ReadOnlyField label="雇用契約終了年月日" value={pdfPerson.employmentContractEndDate || pdfPerson.retirementDate || pdfPerson.supportEndDate} />
                <ReadOnlyField label="機関の氏名又は名称" value={pdfPerson.company || pdfPerson.tenantName} />
                <ReadOnlyField label="法人番号" value={pdfPerson.companyCorporateNumber} />
                <ReadOnlyField label="機関の郵便番号" value={pdfPerson.companyPostalCode} />
                <ReadOnlyField label="機関の電話番号" value={pdfPerson.companyPhone} />
                <ReadOnlyField label="機関の住所" value={pdfPerson.companyAddress} />
              </div>
              <Button asChild className="gap-2">
                <a href={downloadHref}>
                  <Download className="h-4 w-4" />
                  PDFを作成してダウンロード
                </a>
              </Button>
            </div>

            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              PDFにはFunBaseの人材情報に加えて、kintone側で参照できる退職届・法人/事業所情報を反映します。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value || '未取得/未設定'}</div>
    </div>
  )
}
