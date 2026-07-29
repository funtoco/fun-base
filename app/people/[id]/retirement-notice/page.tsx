import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const formAction = `/api/retirement-notice/templates/${encodeURIComponent(selectedTemplate.reportCode)}`

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

            <form action={formAction} method="post" className="space-y-4">
              <input type="hidden" name="personId" value={person.id} />
              <div className="space-y-2">
                <h2 className="text-base font-semibold">PDFに反映する追加項目</h2>
                <p className="text-sm text-muted-foreground">
                  FunBaseに未登録の項目は、ここで入力してからPDFを作成できます。
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sex">性別</Label>
                  <Input id="sex" name="sex" defaultValue={person.sex || ''} placeholder="例: 男" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="specificSkillField">特定産業分野</Label>
                  <Input
                    id="specificSkillField"
                    name="specificSkillField"
                    defaultValue={person.specificSkillField || ''}
                    placeholder="例: 介護"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessCategory">業務区分</Label>
                  <Input
                    id="businessCategory"
                    name="businessCategory"
                    defaultValue={person.businessCategory || ''}
                    placeholder="例: 介護業務全般"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employmentContractEndDate">雇用契約終了年月日</Label>
                  <Input
                    id="employmentContractEndDate"
                    name="employmentContractEndDate"
                    type="date"
                    defaultValue={person.employmentContractEndDate || person.retirementDate || person.supportEndDate || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employmentContractDate">再雇用・支援開始日</Label>
                  <Input
                    id="employmentContractDate"
                    name="employmentContractDate"
                    type="date"
                    defaultValue={person.employmentContractDate || person.joiningDate || ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyCorporateNumber">法人番号</Label>
                  <Input
                    id="companyCorporateNumber"
                    name="companyCorporateNumber"
                    defaultValue={person.companyCorporateNumber || ''}
                    placeholder="13桁の法人番号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPostalCode">機関の郵便番号</Label>
                  <Input
                    id="companyPostalCode"
                    name="companyPostalCode"
                    defaultValue={person.companyPostalCode || ''}
                    placeholder="例: 556-0004"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">機関の電話番号</Label>
                  <Input
                    id="companyPhone"
                    name="companyPhone"
                    defaultValue={person.companyPhone || ''}
                    placeholder="例: 06-0000-0000"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="companyAddress">機関の住所</Label>
                  <Input
                    id="companyAddress"
                    name="companyAddress"
                    defaultValue={person.companyAddress || ''}
                    placeholder="所在地を入力"
                  />
                </div>
              </div>
              <Button type="submit" className="gap-2">
                <Download className="h-4 w-4" />
                入力内容を反映してPDFを作成
              </Button>
            </form>

            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              人材名・生年月日・国籍・在留カード番号・分野・所属先など、FunBaseにある情報とこの画面で入力した内容をPDFへ反映します。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
