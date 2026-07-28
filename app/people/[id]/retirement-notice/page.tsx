import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
        <h1 className="text-2xl font-bold">退職届出テンプレート</h1>
        <p className="text-sm text-muted-foreground">
          {person.name} の app92 公開テンプレートメタデータを確認できます。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">テンプレート選択</CardTitle>
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
                  app{selectedTemplate.sourceAppId} / {selectedTemplate.template.format} / PDF template metadata
                </p>
              </div>
              <Button asChild className="gap-2">
                <a href={downloadHref}>
                  <Download className="h-4 w-4" />
                  メタデータをダウンロード
                </a>
              </Button>
              <Button asChild variant="outline" className="gap-2">
                <a href={selectedTemplate.template.pdfPath} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                  PDFテンプレートを開く
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">帳票コード</div>
                <div className="break-all font-mono text-sm">{selectedTemplate.reportCode}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">PDFアセットID</div>
                <div className="break-all font-mono text-sm">{selectedTemplate.template.assetId}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">ファイル名テンプレート</div>
                <div className="text-sm">{selectedTemplate.template.filenameTemplate}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">対象者</div>
                <div className="text-sm">{person.name}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">差し込みフィールド</div>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.fields.map((field) => (
                  <Badge key={field} variant="secondary">
                    {field}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              添付された既存PDFテンプレートをそのまま同梱しています。この初期スライスではテンプレートPDFと差し込みメタデータを公開します。PDFへの実差し込みと保存は、PDFレンダラーと保存先の設計が入った後続スライスで実装します。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
