import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ContactCard } from '@/components/portal/guidance/contact-card'
import { FlowSummary } from '@/components/portal/guidance/flow-summary'
import { GuideEntryCards } from '@/components/portal/guidance/guide-entry-cards'
import { SubmissionRules } from '@/components/portal/guidance/submission-rules'
import { listCases } from '@/lib/portal/applications'
import {
  guidanceDefaultsFromCases,
  selectGuidance,
  type GuidanceCondition,
} from '@/lib/portal/guidance'
import {
  APPLICATION_CATEGORY_LABELS,
  CASE_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  FIELD_LABELS,
} from '@/lib/portal/types'

export const dynamic = 'force-dynamic'

function buildGuideHref(condition: GuidanceCondition): string {
  const params = new URLSearchParams({
    entity: condition.entityType,
    category: condition.category,
  })
  if (condition.field) {
    params.set('field', condition.field)
  }
  return `/applications/guide?${params.toString()}`
}

export default async function ApplicationsPage() {
  const cases = await listCases()
  const condition = guidanceDefaultsFromCases(cases)
  const guidance = selectGuidance(condition)
  const guideHref = buildGuideHref(condition)

  return (
    <div className="p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">申請ポータル</h1>
            <p className="mt-2 text-muted-foreground">
              在留資格申請の手続きをご案内します。申請の流れと必要書類をご確認のうえ、案件ごとにチェックリストを進めてください。
            </p>
          </div>

          <FlowSummary steps={guidance.flow.company} guideHref={guideHref} />

          <GuideEntryCards guideHref={guideHref} />

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">案件一覧</h2>
            {cases.length === 0 ? (
              <div className="rounded-xl border border-border bg-card shadow-sm">
                <EmptyState
                  icon={<ClipboardList className="h-10 w-10" />}
                  title="案件がまだありません"
                  description="案件は担当者が用意します。準備ができると、ここに必要書類のチェックリストが表示されます。"
                />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>タイトル / 事業所</TableHead>
                      <TableHead className="w-[140px]">分野</TableHead>
                      <TableHead className="w-[120px]">種別</TableHead>
                      <TableHead className="w-[100px]">初回/更新</TableHead>
                      <TableHead className="w-[130px]">ステータス</TableHead>
                      <TableHead className="w-[120px]">管理番号</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cases.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/applications/${c.id}`}
                            className="block font-medium text-foreground hover:underline"
                          >
                            {c.title || c.officeName || '無題の案件'}
                          </Link>
                          {c.officeName && (
                            <span className="text-xs text-muted-foreground">
                              {c.officeName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{FIELD_LABELS[c.field]}</TableCell>
                        <TableCell className="text-sm">
                          {ENTITY_TYPE_LABELS[c.entityType]}
                        </TableCell>
                        <TableCell className="text-sm">
                          {APPLICATION_CATEGORY_LABELS[c.applicationCategory]}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CASE_STATUS_LABELS[c.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.managementNumber || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <SubmissionRules />
          <ContactCard />
        </aside>
      </div>
    </div>
  )
}
